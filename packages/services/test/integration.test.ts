/**
 * Runs against the local Supabase stack (seed data) when MANA_SUPABASE_URL and
 * MANA_SUPABASE_ANON_KEY are set (CI database job). Skipped otherwise.
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '@mana/core';
import { createServices } from '../src/index';

const url = process.env.MANA_SUPABASE_URL;
const anonKey = process.env.MANA_SUPABASE_ANON_KEY;
const enabled = Boolean(url && anonKey);
const RMP = 'a0000000-0000-4000-8000-000000000001';

function services() {
  const client = createClient<Database>(url ?? '', anonKey ?? '', {
    auth: { persistSession: false },
  });
  return createServices(client);
}

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
});
