import { err, ok, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { required, run, toAppError } from './errors';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  issueId: string | null;
  /** In-app route to open, e.g. "/issue/<id>". */
  route: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsService {
  list(limit?: number): Promise<Result<AppNotification[]>>;
  unreadCount(): Promise<Result<number>>;
  markRead(id: string): Promise<Result<null>>;
  markAllRead(): Promise<Result<null>>;
}

function route(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const r = (data as Record<string, unknown>)['route'];
  return typeof r === 'string' && r.startsWith('/') ? r : null;
}

export function createNotificationsService(client: ManaClient): NotificationsService {
  return {
    async list(limit = 50) {
      // Row-level security returns only the signed-in person's notifications.
      const res = required(
        await run(() =>
          client
            .from('notifications')
            .select('id, type, title, body, issue_id, data, read_at, created_at')
            .order('created_at', { ascending: false })
            .limit(Math.min(Math.max(limit, 1), 100)),
        ),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          issueId: n.issue_id,
          route: route(n.data),
          readAt: n.read_at,
          createdAt: n.created_at,
        })),
      );
    },

    async unreadCount() {
      try {
        const res = await client
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null);
        if (res.error) return err(toAppError(res.error));
        return ok(res.count ?? 0);
      } catch (e) {
        return err(toAppError(e));
      }
    },

    async markRead(id) {
      const res = await run(() =>
        client
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', id)
          .is('read_at', null),
      );
      return res.ok ? ok(null) : res;
    },

    async markAllRead() {
      const res = await run(() => client.rpc('mark_all_notifications_read'));
      return res.ok ? ok(null) : res;
    },
  };
}
