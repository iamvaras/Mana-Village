import { ok, type Language, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { required, run, validationError } from './errors';

export type AnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Announcement {
  id: string;
  villageId: string;
  title: string;
  body: string;
  titleLocal: string | null;
  bodyLocal: string | null;
  status: AnnouncementStatus;
  isPinned: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  titleLocal?: string | undefined;
  bodyLocal?: string | undefined;
  isPinned?: boolean | undefined;
  expiresAt?: Date | undefined;
}

/** Same limits as public.upsert_announcement, so people see problems before sending. */
export const ANNOUNCEMENT_TITLE_MAX = 150;
export const ANNOUNCEMENT_BODY_MAX = 5000;

export function announcementProblems(input: AnnouncementInput): Record<string, string> | null {
  const p: Record<string, string> = {};
  const title = input.title.trim();
  if (title.length < 3 || title.length > ANNOUNCEMENT_TITLE_MAX)
    p['title'] = `Use 3 to ${ANNOUNCEMENT_TITLE_MAX} characters.`;
  const body = input.body.trim();
  if (body.length < 1 || body.length > ANNOUNCEMENT_BODY_MAX)
    p['body'] = `Write the message (at most ${ANNOUNCEMENT_BODY_MAX} characters).`;
  if ((input.titleLocal ?? '').trim().length > ANNOUNCEMENT_TITLE_MAX)
    p['titleLocal'] = `Use at most ${ANNOUNCEMENT_TITLE_MAX} characters.`;
  if ((input.bodyLocal ?? '').trim().length > ANNOUNCEMENT_BODY_MAX)
    p['bodyLocal'] = `Use at most ${ANNOUNCEMENT_BODY_MAX} characters.`;
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now())
    p['expiresAt'] = 'The end date must be in the future.';
  return Object.keys(p).length > 0 ? p : null;
}

/** The text in the reader's language, falling back to English. */
export function announcementText(a: Announcement, language: Language) {
  const local = language === 'te';
  return {
    title: local && a.titleLocal ? a.titleLocal : a.title,
    body: local && a.bodyLocal ? a.bodyLocal : a.body,
  };
}

/** Pinned first, then newest published first. */
export function sortForReaders(list: readonly Announcement[]): Announcement[] {
  return [...list].sort(
    (a, b) =>
      Number(b.isPinned) - Number(a.isPinned) ||
      (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  );
}

export interface AnnouncementsService {
  /** What residents see: published and not expired (the database decides). */
  listPublished(villageId: string): Promise<Result<Announcement[]>>;
  get(id: string): Promise<Result<Announcement | null>>;
  /** Staff list: every status, newest first. */
  listAll(villageId: string): Promise<Result<Announcement[]>>;
  /** Creates a draft, or edits it when `id` is given. Returns its id. */
  save(villageId: string, input: AnnouncementInput, id?: string): Promise<Result<string>>;
  /** Publishes a draft. Returns how many residents were alerted. */
  publish(id: string, notifyResidents: boolean): Promise<Result<number>>;
  archive(id: string): Promise<Result<null>>;
}

const COLUMNS =
  'id, village_id, title, body, title_local, body_local, status, is_pinned, published_at, expires_at, created_at, updated_at';

interface Row {
  id: string;
  village_id: string;
  title: string;
  body: string;
  title_local: string | null;
  body_local: string | null;
  status: AnnouncementStatus;
  is_pinned: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const toAnnouncement = (r: Row): Announcement => ({
  id: r.id,
  villageId: r.village_id,
  title: r.title,
  body: r.body,
  titleLocal: r.title_local,
  bodyLocal: r.body_local,
  status: r.status,
  isPinned: r.is_pinned,
  publishedAt: r.published_at,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const clean = (s: string | undefined) => {
  const t = (s ?? '').trim();
  return t === '' ? undefined : t;
};

export function createAnnouncementsService(client: ManaClient): AnnouncementsService {
  return {
    async listPublished(villageId) {
      const res = required(
        await run(() =>
          client
            .from('announcements')
            .select(COLUMNS)
            .eq('village_id', villageId)
            .eq('status', 'PUBLISHED')
            .order('published_at', { ascending: false })
            .limit(50),
        ),
      );
      return res.ok ? ok(sortForReaders(res.value.map(toAnnouncement))) : res;
    },

    async get(id) {
      const res = await run(() =>
        client.from('announcements').select(COLUMNS).eq('id', id).maybeSingle(),
      );
      return res.ok ? ok(res.value ? toAnnouncement(res.value) : null) : res;
    },

    async listAll(villageId) {
      const res = required(
        await run(() =>
          client
            .from('announcements')
            .select(COLUMNS)
            .eq('village_id', villageId)
            .order('created_at', { ascending: false })
            .limit(200),
        ),
      );
      return res.ok ? ok(res.value.map(toAnnouncement)) : res;
    },

    async save(villageId, input, id) {
      const problems = announcementProblems(input);
      if (problems) return validationError(problems);
      const titleLocal = clean(input.titleLocal);
      const bodyLocal = clean(input.bodyLocal);
      return required(
        await run(() =>
          client.rpc('upsert_announcement', {
            p_village_id: villageId,
            p_title: input.title.trim(),
            p_body: input.body.trim(),
            ...(titleLocal ? { p_title_local: titleLocal } : {}),
            ...(bodyLocal ? { p_body_local: bodyLocal } : {}),
            p_is_pinned: input.isPinned ?? false,
            ...(input.expiresAt ? { p_expires_at: input.expiresAt.toISOString() } : {}),
            ...(id ? { p_id: id } : {}),
          }),
        ),
      );
    },

    async publish(id, notifyResidents) {
      return required(
        await run(() =>
          client.rpc('publish_announcement', { p_id: id, p_notify: notifyResidents }),
        ),
      );
    },

    async archive(id) {
      const res = await run(() => client.rpc('archive_announcement', { p_id: id }));
      return res.ok ? ok(null) : res;
    },
  };
}
