/**
 * Runs against the local Supabase stack (seed data) when MANA_SUPABASE_URL and
 * MANA_SUPABASE_ANON_KEY are set (CI database job). Skipped otherwise.
 */
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ISSUE_LIST_QUERY, buildTimeline, type Database } from '@mana/core';
import { createServices, resolutionSummary } from '../src/index';

const url = process.env.MANA_SUPABASE_URL;
const anonKey = process.env.MANA_SUPABASE_ANON_KEY;
const serviceKey = process.env.MANA_SUPABASE_SERVICE_KEY;
const enabled = Boolean(url && anonKey);
const RMP = 'a0000000-0000-4000-8000-000000000001';

function services() {
  const client = createClient<Database>(url ?? '', anonKey ?? '', {
    auth: { persistSession: false },
  });
  return createServices(client);
}

/** RFC 6238 code for a base32 secret (what an authenticator app shows). */
function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, ''))
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = (h[h.length - 1] ?? 0) & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/**
 * Signs a seeded staff member in with phone OTP and a fresh authenticator factor,
 * the way the admin website does (prepare-mfa sets the placeholder email first).
 */
async function staffServices(phone: string, userId: string) {
  const admin = createClient<Database>(url ?? '', serviceKey ?? '', {
    auth: { persistSession: false },
  });
  await admin.auth.admin.updateUserById(userId, {
    email: `${userId}@staff.mana-village.invalid`,
    email_confirm: true,
  });
  const existing = await admin.auth.admin.mfa.listFactors({ userId });
  for (const f of existing.data?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  }

  const client = createClient<Database>(url ?? '', anonKey ?? '', {
    auth: { persistSession: false },
  });
  const s = createServices(client);
  const login = await s.auth.verifyOtp(phone, '123456');
  if (!login.ok) throw new Error(login.error.message);
  const enrolled = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'test' });
  if (enrolled.error) throw new Error(enrolled.error.message);
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: totp(enrolled.data.totp.secret),
  });
  if (verified.error) throw new Error(verified.error.message);
  return s;
}

const until = async (check: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
  return check();
};

describe.skipIf(!enabled)('services against local Supabase', () => {
  it('signs a citizen in with phone OTP and loads profile + permissions', async () => {
    const s = services();
    expect((await s.auth.sendOtp('90000 00015')).ok).toBe(true);
    const session = await s.auth.verifyOtp('9000000015', '123456');
    expect(session.ok).toBe(true);

    const profile = await s.profile.getMyProfile();
    expect(profile.ok && profile.value?.full_name).toBe('Lakshmi Narayana');

    const perms = await s.permissions.getMyPermissions(RMP);
    expect(perms.ok && perms.value.has('issue.create')).toBe(true);
    expect(perms.ok && perms.value.has('issue.verify')).toBe(false);

    const villages = await s.villages.listActive();
    expect(villages.ok && villages.value.map((v) => v.code)).toEqual(['KDP', 'RMP']);
  });

  it('rejects a wrong OTP with a clear error', async () => {
    const s = services();
    const res = await s.auth.verifyOtp('9000000016', '000000');
    expect(res.ok ? 'ok' : res.error.code).toBe('VALIDATION');
  });

  it('a secretary without the security code only has citizen powers', async () => {
    const s = services();
    await s.auth.verifyOtp('9000000012', '123456');
    const roles = await s.permissions.getMyRoles();
    expect(roles.ok && roles.value.find((r) => r.roleKey === 'SECRETARY')?.activeNow).toBe(false);
    const res = await s.admin.listUsers({ villageId: RMP });
    expect(res.ok ? 'ok' : res.error.code).toBe('FORBIDDEN');
  });

  it('reports an issue with a photo, survives retries, and lets a neighbour support it', async () => {
    const reporter = services();
    const login = await reporter.auth.verifyOtp('9000000015', '123456');
    if (!login.ok) throw new Error('login failed');
    const userId = login.value.user.id;

    const categories = await reporter.issues.listCategories();
    if (!categories.ok) throw new Error(categories.error.message);
    const garbage = categories.value.find((c) => c.key === 'GARBAGE');
    expect(garbage?.photoRequired).toBe(true);
    if (!garbage) return;

    const photoId = crypto.randomUUID();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
    const first = await reporter.issues.uploadPhoto({
      id: photoId,
      userId,
      mimeType: 'image/jpeg',
      body: bytes,
    });
    expect(first.ok).toBe(true);
    // A retry after a lost response must not fail.
    const again = await reporter.issues.uploadPhoto({
      id: photoId,
      userId,
      mimeType: 'image/jpeg',
      body: bytes,
    });
    expect(again.ok).toBe(true);
    if (!first.ok) return;

    const lat = 16.5 + Math.random() / 1000;
    const input = {
      villageId: RMP,
      categoryId: garbage.id,
      title: 'Garbage not cleared near school',
      locationText: 'Behind the school',
      latitude: lat,
      longitude: 80.6,
      clientRequestId: crypto.randomUUID(),
    };
    const created = await reporter.issues.createIssue(input, [first.value]);
    if (!created.ok) throw new Error(created.error.message);
    expect(created.value.created).toBe(true);
    expect(created.value.issueNumber).toMatch(/^RMP-\d{4}-\d{5}$/);

    // Same request again (e.g. the first response was lost): same issue, nothing new.
    const retried = await reporter.issues.createIssue(input, [first.value]);
    expect(retried.ok && retried.value).toEqual({ ...created.value, created: false });

    // Without a photo the database refuses this category.
    const noPhoto = await reporter.issues.createIssue(
      { ...input, clientRequestId: crypto.randomUUID() },
      [],
    );
    expect(noPhoto.ok ? 'ok' : noPhoto.error.code).toBe('VALIDATION');

    const neighbour = services();
    await neighbour.auth.verifyOtp('9000000016', '123456');
    const similar = await neighbour.issues.findSimilar({
      villageId: RMP,
      categoryId: garbage.id,
      latitude: lat,
      longitude: 80.6,
    });
    if (!similar.ok) throw new Error(similar.error.message);
    const match = similar.value.find((i) => i.id === created.value.id);
    expect(match?.iSupport).toBe(false);
    expect(await neighbour.issues.support(created.value.id)).toEqual({ ok: true, value: 1 });
    expect(await neighbour.issues.unsupport(created.value.id)).toEqual({ ok: true, value: 0 });

    // The reporter cannot support their own issue.
    const own = await reporter.issues.support(created.value.id);
    expect(own.ok ? 'ok' : own.error.code).toBe('VALIDATION');
  });

  it('shows the issue, its timeline, photos and comments, and notifies the reporter', async () => {
    const reporter = services();
    const login = await reporter.auth.verifyOtp('9000000015', '123456');
    if (!login.ok) throw new Error('login failed');
    const userId = login.value.user.id;
    const cats = await reporter.issues.listCategories();
    const road = cats.ok ? cats.value.find((c) => c.key === 'ROAD') : undefined;
    if (!road) throw new Error('no ROAD category');
    const photo = await reporter.issues.uploadPhoto({
      id: crypto.randomUUID(),
      userId,
      mimeType: 'image/jpeg',
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 0xff, 0xd9]),
    });
    if (!photo.ok) throw new Error(photo.error.message);
    const created = await reporter.issues.createIssue(
      {
        villageId: RMP,
        categoryId: road.id,
        title: 'Pothole near the bus stop',
        locationText: 'Bus stop',
        clientRequestId: crypto.randomUUID(),
      },
      [photo.value],
    );
    if (!created.ok) throw new Error(created.error.message);
    const issueId = created.value.id;

    const mine = await reporter.issueReads.listMine('open');
    expect(mine.ok && mine.value.some((i) => i.id === issueId && i.isMine)).toBe(true);

    const detail = await reporter.issueReads.getIssue(issueId);
    expect(detail.ok && detail.value?.reporterName).toBe('Lakshmi');

    const timeline = await reporter.issueReads.getTimeline(issueId);
    if (!timeline.ok) throw new Error(timeline.error.message);
    const entries = buildTimeline(timeline.value);
    expect(entries[0]).toMatchObject({
      kind: 'status',
      toStatus: 'SUBMITTED',
      photoCount: 1,
      isMine: true,
    });

    const photos = await reporter.issueReads.listPhotos(issueId);
    if (!photos.ok) throw new Error(photos.error.message);
    expect(photos.value).toHaveLength(1);
    const url = photos.value[0]?.url;
    expect(url).toBeTruthy();
    const fetched = await fetch(url ?? '');
    expect(fetched.status).toBe(200);

    // A neighbour supports it and comments; the reporter gets an in-app notification.
    const neighbour = services();
    await neighbour.auth.verifyOtp('9000000016', '123456');
    const seen = await neighbour.issueReads.getIssue(issueId);
    expect(seen.ok && seen.value?.reporterName).toBeNull();
    expect((await neighbour.issueReads.addComment(issueId, 'Same here')).ok).toBe(false);
    await neighbour.issues.support(issueId);
    expect(
      (await neighbour.issueReads.addComment(issueId, 'Same problem, my scooter fell here')).ok,
    ).toBe(true);
    const internal = await neighbour.issueReads.addComment(issueId, 'secret', 'INTERNAL');
    expect(internal.ok ? 'ok' : internal.error.code).toBe('FORBIDDEN');

    const comments = await reporter.issueReads.listComments(issueId);
    expect(comments.ok && comments.value.map((c) => [c.body, c.authorName])).toEqual([
      ['Same problem, my scooter fell here', null],
    ]);

    const before = await reporter.notifications.unreadCount();
    const list = await reporter.notifications.list();
    if (!list.ok || !before.ok) throw new Error('notifications failed');
    const note = list.value.find((n) => n.issueId === issueId && n.type === 'NEW_COMMENT');
    expect(note?.route).toBe(`/issue/${issueId}`);
    if (!note) return;
    expect((await reporter.notifications.markRead(note.id)).ok).toBe(true);
    const after = await reporter.notifications.unreadCount();
    expect(after.ok && after.value).toBe(before.value - 1);

    // Someone from another village cannot see it at all.
    const outsider = services();
    await outsider.auth.verifyOtp('9000000021', '123456');
    expect(await outsider.issueReads.getIssue(issueId)).toEqual({ ok: true, value: null });
    const outsiderPhotos = await outsider.issueReads.listPhotos(issueId);
    expect(outsiderPhotos.ok && outsiderPhotos.value).toEqual([]);
  });

  it.skipIf(!serviceKey)(
    'staff dashboard numbers agree with the All Issues list, and changes arrive live',
    async () => {
      const president = await staffServices('9000000010', 'b0000000-0000-4000-8000-000000000010');
      const stats = await president.analytics.dashboard(RMP);
      if (!stats.ok) throw new Error(stats.error.message);
      expect(stats.value.total).toBeGreaterThanOrEqual(13);

      const count = async (changes: Partial<typeof DEFAULT_ISSUE_LIST_QUERY>) => {
        const res = await president.issueList.list(RMP, {
          ...DEFAULT_ISSUE_LIST_QUERY,
          ...changes,
        });
        if (!res.ok) throw new Error(res.error.message);
        return res.value.total;
      };
      expect(await count({})).toBe(stats.value.total);
      expect(await count({ view: 'open' })).toBe(stats.value.open);
      expect(await count({ view: 'needs_review' })).toBe(stats.value.awaitingReview);
      expect(await count({ view: 'critical' })).toBe(stats.value.criticalOpen);
      expect(await count({ view: 'reopened' })).toBe(stats.value.reopened);
      expect(await count({ status: 'CLOSED' })).toBe(stats.value.closed);
      expect(await count({ search: 'bus stand' })).toBe(2);
      expect(await count({ search: 'RMP-2026-00005' })).toBe(1);

      const byCategory = await president.analytics.byCategory(RMP);
      expect(byCategory.ok && byCategory.value.reduce((n, c) => n + c.total, 0)).toBe(
        stats.value.total,
      );
      const departments = await president.issueList.listDepartments(RMP);
      expect(departments.ok && departments.value.map((d) => d.name)).toEqual([
        'Electrical',
        'Sanitation',
      ]);

      const page2 = await president.issueList.list(RMP, { ...DEFAULT_ISSUE_LIST_QUERY, page: 99 });
      expect(page2.ok && page2.value.rows).toEqual([]);

      // Live signals: the president hears about a new report; a citizen hears nothing.
      const heard: string[] = [];
      let status = '';
      const live = await president.issueList.subscribeToChanges(
        RMP,
        (id) => heard.push(id),
        (s) => (status = s),
      );
      const citizenHeard: string[] = [];
      let citizenStatus = '';
      const citizen = services();
      await citizen.auth.verifyOtp('9000000016', '123456');
      const citizenLive = await citizen.issueList.subscribeToChanges(
        RMP,
        (id) => citizenHeard.push(id),
        (s) => (citizenStatus = s),
      );
      expect(await until(() => status === 'live')).toBe(true);
      expect(await until(() => citizenStatus === 'offline')).toBe(true);

      const reporter = services();
      await reporter.auth.verifyOtp('9000000016', '123456');
      const categories = await reporter.issues.listCategories();
      const other = categories.ok ? categories.value.find((c) => c.key === 'OTHER') : undefined;
      if (!other) throw new Error('no OTHER category');
      const created = await reporter.issues.createIssue(
        {
          villageId: RMP,
          categoryId: other.id,
          title: 'Stray dogs near the school',
          locationText: 'School road',
          clientRequestId: crypto.randomUUID(),
        },
        [],
      );
      if (!created.ok) throw new Error(created.error.message);
      expect(await until(() => heard.includes(created.value.id))).toBe(true);
      expect(citizenHeard).toEqual([]);
      await live.close();
      await citizenLive.close();
    },
    30_000,
  );

  it.skipIf(!serviceKey)(
    'staff review, verify, assign and reprioritise an issue; versions protect against stale screens',
    async () => {
      const reporter = services();
      await reporter.auth.verifyOtp('9000000016', '123456');
      const categories = await reporter.issues.listCategories();
      const other = categories.ok ? categories.value.find((c) => c.key === 'OTHER') : undefined;
      if (!other) throw new Error('no OTHER category');
      const created = await reporter.issues.createIssue(
        {
          villageId: RMP,
          categoryId: other.id,
          title: 'Fallen tree branch on the road',
          locationText: 'Near the old well',
          clientRequestId: crypto.randomUUID(),
        },
        [],
      );
      if (!created.ok) throw new Error(created.error.message);
      const id = created.value.id;

      const staff = await staffServices('9000000010', 'b0000000-0000-4000-8000-000000000010');
      const w = staff.workflow;
      expect(await w.startReview(id, 1)).toEqual({ ok: true, value: 2 });
      const stale = await w.verify(id, 1);
      expect(stale.ok ? 'ok' : stale.error.code).toBe('CONFLICT');
      const tooShort = await w.reject(id, 2, 'no');
      expect(tooShort.ok ? 'ok' : tooShort.error.fields?.['reason']).toMatch(/at least 10/);
      expect((await w.verify(id, 2, { priority: 'HIGH', note: 'Seen on site' })).ok).toBe(true);

      const departments = await staff.departments.list(RMP);
      if (!departments.ok) throw new Error(departments.error.message);
      const elec = departments.value.find((d) => d.name === 'Electrical');
      if (!elec) throw new Error('no Electrical');
      const workers = await staff.departments.listWorkers(RMP, elec.id);
      if (!workers.ok) throw new Error(workers.error.message);
      const ramesh = workers.value.find((x) => x.displayName === 'Ramesh');
      expect(ramesh?.departmentName).toBe('Electrical');
      expect(Object.keys(ramesh ?? {})).not.toContain('phone');

      const detail = await staff.issueReads.getIssue(id);
      if (!detail.ok || !detail.value) throw new Error('issue not visible');
      const assigned = await w.assign(id, detail.value.version, {
        departmentId: elec.id,
        assigneeUserId: ramesh?.userId,
        note: 'Please clear it today',
        dueAt: new Date(Date.now() + 86_400_000),
      });
      if (!assigned.ok) throw new Error(assigned.error.message);
      const noReason = await w.assign(id, assigned.value, { departmentId: elec.id, reason: '' });
      expect(noReason.ok ? 'ok' : noReason.error.code).toBe('VALIDATION');
      expect((await w.setPriority(id, assigned.value, 'CRITICAL')).ok).toBe(true);

      const after = await staff.issueReads.getIssue(id);
      expect(after.ok && after.value).toMatchObject({
        status: 'ASSIGNED',
        priority: 'CRITICAL',
        assignedDepartmentId: elec.id,
        assignedUserName: 'Ramesh',
      });

      // The president may assign work but department management belongs to the secretary.
      const save = await staff.departments.save(RMP, { name: 'Parks' });
      expect(save.ok ? 'ok' : save.error.code).toBe('FORBIDDEN');
      // A citizen cannot act at all.
      const citizen = await reporter.workflow.setPriority(id, 1, 'LOW');
      expect(citizen.ok ? 'ok' : citizen.error.code).toBe('FORBIDDEN');
    },
    30_000,
  );

  it('a worker sees only their work, restarts reopened work, posts a photo update and resolves', async () => {
    const worker = services();
    const login = await worker.auth.verifyOtp('9000000014', '123456');
    if (!login.ok) throw new Error(login.error.message);
    const userId = login.value.user.id;

    const work = await worker.work.listMyWork();
    if (!work.ok) throw new Error(work.error.message);
    expect(work.value.every((w) => w.departmentName === 'Sanitation')).toBe(true);
    // Fresh seed: a reopened issue to restart. On a re-run against the same database
    // it may already be resolved, so fall back to work that is in progress.
    const reopened =
      work.value.find((w) => w.status === 'REOPENED') ??
      work.value.find((w) => w.status === 'IN_PROGRESS');
    if (!reopened) throw new Error('no Sanitation work left; reset the local database');
    expect(reopened.assignedToMe).toBe(true);

    let version = reopened.version;
    if (reopened.status === 'REOPENED') {
      const started = await worker.work.start(reopened.issueId, reopened.version);
      if (!started.ok) throw new Error(started.error.message);
      version = started.value;
    }
    const started = { value: version };

    const upload = async () => {
      const res = await worker.issues.uploadPhoto({
        id: crypto.randomUUID(),
        userId,
        mimeType: 'image/jpeg',
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 0xff, 0xd9]),
      });
      if (!res.ok) throw new Error(res.error.message);
      return res.value;
    };
    expect(
      (await worker.work.addProgress(reopened.issueId, 'Bringing more gravel', [await upload()]))
        .ok,
    ).toBe(true);
    const empty = await worker.work.resolve(reopened.issueId, started.value, 'Done', []);
    expect(empty.ok ? 'ok' : empty.error.code).toBe('VALIDATION');
    const resolved = await worker.work.resolve(
      reopened.issueId,
      started.value,
      'Edge rebuilt with stones',
      [await upload()],
    );
    expect(resolved.ok).toBe(true);

    const photos = await worker.issueReads.listPhotos(reopened.issueId);
    if (!photos.ok) throw new Error(photos.error.message);
    // Earlier work cycles may already have completion photos; this run added one of each.
    expect(photos.value.some((p) => p.kind === 'PROGRESS')).toBe(true);
    expect(photos.value.filter((p) => p.kind === 'COMPLETION').length).toBeGreaterThanOrEqual(1);

    // The citizen has no work list.
    const citizen = services();
    await citizen.auth.verifyOtp('9000000015', '123456');
    expect(await citizen.work.listMyWork()).toEqual({ ok: true, value: [] });
  });

  it('the reporter sees the finished work and says it is not solved, which reopens it', async () => {
    // Runs after the worker test above, which solved Sita's reopened road issue.
    const sita = services();
    const login = await sita.auth.verifyOtp('9000000017', '123456');
    if (!login.ok) throw new Error(login.error.message);
    const mine = await sita.issueReads.listMine('all');
    if (!mine.ok) throw new Error(mine.error.message);
    const waiting = mine.value.find((i) => i.status === 'RESOLVED');
    if (!waiting) throw new Error('no solved issue waiting for Sita; reset the local database');

    const [timeline, photos, detail] = await Promise.all([
      sita.issueReads.getTimeline(waiting.id),
      sita.issueReads.listPhotos(waiting.id),
      sita.issueReads.getIssue(waiting.id),
    ]);
    if (!timeline.ok || !photos.ok || !detail.ok || !detail.value) throw new Error('read failed');
    const summary = resolutionSummary(timeline.value, photos.value);
    expect(summary.note).toBe('Edge rebuilt with stones');
    expect(summary.photos.length).toBe(1);
    expect(summary.photos.every((p) => p.kind === 'COMPLETION')).toBe(true);

    // Someone else cannot answer for her.
    const lakshmi = services();
    await lakshmi.auth.verifyOtp('9000000015', '123456');
    const other = await lakshmi.resolution.confirmSolved(waiting.id, detail.value.version);
    expect(other.ok ? 'ok' : other.error.code).toBe('FORBIDDEN');

    const short = await sita.resolution.reportNotSolved(waiting.id, detail.value.version, 'No', []);
    expect(short.ok ? 'ok' : short.error.code).toBe('VALIDATION');
    const stale = await sita.resolution.reportNotSolved(
      waiting.id,
      detail.value.version - 1,
      'The edge is cracking again',
      [],
    );
    expect(stale.ok ? 'ok' : stale.error.code).toBe('CONFLICT');

    const photo = await sita.issues.uploadPhoto({
      id: crypto.randomUUID(),
      userId: login.value.user.id,
      mimeType: 'image/jpeg',
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]),
    });
    if (!photo.ok) throw new Error(photo.error.message);
    const answered = await sita.resolution.reportNotSolved(
      waiting.id,
      detail.value.version,
      'The edge is cracking again',
      [photo.value],
    );
    expect(answered.ok).toBe(true);
    const after = await sita.issueReads.getIssue(waiting.id);
    expect(after.ok && after.value?.status).toBe('REOPENED');
    // Answering twice is refused.
    const again = await sita.resolution.confirmSolved(waiting.id, answered.ok ? answered.value : 0);
    expect(again.ok ? 'ok' : again.error.code).toBe('INVALID_TRANSITION');
  });

  it('links a phone for push, turns phone notifications off and on, and unlinks on sign-out', async () => {
    const client = createClient<Database>(url ?? '', anonKey ?? '', {
      auth: { persistSession: false },
    });
    const ravi = createServices(client);
    const login = await ravi.auth.verifyOtp('9000000016', '123456');
    if (!login.ok) throw new Error(login.error.message);
    const token = `ExponentPushToken[test-${crypto.randomUUID()}]`;

    expect((await ravi.push.register('not-a-token', 'android')).ok).toBe(false);
    expect(await ravi.push.register(token, 'android', '0.1.0')).toEqual({ ok: true, value: null });

    expect(await ravi.push.setEnabled(false)).toEqual({ ok: true, value: null });
    const off = await ravi.profile.getMyProfile();
    expect(off.ok && off.value?.push_enabled).toBe(false);
    await ravi.push.setEnabled(true);
    const on = await ravi.profile.getMyProfile();
    expect(on.ok && on.value?.push_enabled).toBe(true);

    expect(await ravi.push.unregister(token)).toEqual({ ok: true, value: null });

    // The delivery functions are for the server only.
    const { error } = await client.rpc('push_claim_batch', { p_limit: 1 });
    expect(error?.message ?? '').toMatch(/permission denied/i);
  });

  it('the secretary writes, publishes and archives an announcement that residents read', async () => {
    const secretary = await staffServices('9000000012', 'b0000000-0000-4000-8000-000000000012');
    const bad = await secretary.announcements.save(RMP, { title: 'Hi', body: '' });
    expect(bad.ok ? 'ok' : bad.error.code).toBe('VALIDATION');
    const saved = await secretary.announcements.save(RMP, {
      title: 'Gram Sabha on Monday',
      body: 'Meeting at the Panchayat office at 10am.',
      titleLocal: 'సోమవారం గ్రామసభ',
      isPinned: true,
    });
    if (!saved.ok) throw new Error(saved.error.message);

    const resident = services();
    await resident.auth.verifyOtp('9000000015', '123456');
    const before = await resident.announcements.listPublished(RMP);
    expect(before.ok && before.value.some((a) => a.id === saved.value)).toBe(false);

    const published = await secretary.announcements.publish(saved.value, false);
    expect(published).toEqual({ ok: true, value: 0 });
    const after = await resident.announcements.listPublished(RMP);
    if (!after.ok) throw new Error(after.error.message);
    expect(after.value[0]?.isPinned).toBe(true);
    expect(after.value.some((a) => a.id === saved.value)).toBe(true);
    const forbidden = await resident.announcements.archive(saved.value);
    expect(forbidden.ok ? 'ok' : forbidden.error.code).toBe('FORBIDDEN');

    expect((await secretary.announcements.archive(saved.value)).ok).toBe(true);
    const gone = await resident.announcements.get(saved.value);
    expect(gone).toEqual({ ok: true, value: null });
  });
  it('the secretary reads the audit log and the analytics report; a resident cannot', async () => {
    const secretary = await staffServices('9000000012', 'b0000000-0000-4000-8000-000000000012');
    const log = await secretary.audit.list(RMP, { area: 'config', limit: 5 });
    if (!log.ok) throw new Error(log.error.message);
    expect(log.value.length).toBeGreaterThan(0);
    expect(
      log.value.every((e) =>
        /^(village|department|category|role_permission|announcement)\./.test(e.action),
      ),
    ).toBe(true);
    const first = log.value[0];
    if (!first) throw new Error('no rows');
    const older = await secretary.audit.list(RMP, { beforeId: first.id, limit: 5 });
    expect(older.ok && older.value.every((e) => e.id < first.id)).toBe(true);

    const report = await secretary.analytics.report(RMP);
    if (!report.ok) throw new Error(report.error.message);
    expect(report.value.trend.length).toBeGreaterThan(0);

    const resident = services();
    await resident.auth.verifyOtp('9000000015', '123456');
    const denied = await resident.audit.list(RMP);
    expect(denied.ok ? 'ok' : denied.error.code).toBe('FORBIDDEN');
    const deniedReport = await resident.analytics.report(RMP);
    expect(deniedReport.ok ? 'ok' : deniedReport.error.code).toBe('FORBIDDEN');
  });
});
