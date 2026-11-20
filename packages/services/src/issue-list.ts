import {
  ISSUE_LIST_PAGE_SIZE,
  err,
  ok,
  viewPriority,
  viewStatuses,
  type IssueListQuery,
  type IssuePriority,
  type IssueStatus,
  type Result,
} from '@mana/core';
import type { ManaClient } from './client';
import { required, run, toAppError } from './errors';

/** One row of the staff All Issues table. */
export interface StaffIssueRow {
  id: string;
  issueNumber: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  visibility: 'PUBLIC' | 'PRIVATE';
  categoryName: string;
  departmentName: string | null;
  assigneeName: string | null;
  supporterCount: number;
  reopenCount: number;
  createdAt: string;
  lastStatusChangeAt: string;
}

export interface StaffIssuePage {
  rows: StaffIssueRow[];
  /** Matching issues across all pages. */
  total: number;
  page: number;
  pageSize: number;
}

export interface Department {
  id: string;
  name: string;
  nameLocal: string | null;
}

/** A live-update connection. Call `close()` when the page goes away. */
export interface LiveSubscription {
  close(): Promise<void>;
}

export type LiveStatus = 'connecting' | 'live' | 'offline';

export interface IssueListService {
  /**
   * Issues of one village for staff, filtered, sorted and paged. The database only
   * returns issues the signed-in person may see (issues_view).
   */
  list(villageId: string, query: IssueListQuery, now?: Date): Promise<Result<StaffIssuePage>>;
  listDepartments(villageId: string): Promise<Result<Department[]>>;
  /**
   * Calls `onChange` whenever an issue in the village is created or changes.
   * Only staff who may see all village issues receive these signals (checked by
   * the database). The signal carries no issue content; refetch to see it.
   */
  subscribeToChanges(
    villageId: string,
    onChange: (issueId: string) => void,
    onStatus?: (status: LiveStatus) => void,
  ): Promise<LiveSubscription>;
}

const COLUMNS =
  'id, issue_number, title, status, priority, visibility, category_name, assigned_department_name, assigned_user_name, supporter_count, reopen_count, created_at, last_status_change_at';

/** Topic name shared with supabase/migrations/20261120001700_admin_issue_list_live.sql. */
export function issueChangesTopic(villageId: string): string {
  return `village:${villageId}:issues`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createIssueListService(client: ManaClient): IssueListService {
  return {
    async list(villageId, query, now = new Date()) {
      const pageSize = ISSUE_LIST_PAGE_SIZE;
      const fromRow = (query.page - 1) * pageSize;

      let q = client
        .from('issues_view')
        .select(COLUMNS, { count: 'exact' })
        .eq('village_id', villageId);

      const statuses = viewStatuses(query.view);
      if (statuses) q = q.in('status', [...statuses]);
      if (query.status) q = q.eq('status', query.status);
      const priority = viewPriority(query.view) ?? query.priority;
      if (priority) q = q.eq('priority', priority);
      if (query.view === 'critical' && query.priority && query.priority !== 'CRITICAL') {
        // "Critical" view plus another priority can never match.
        return ok({ rows: [], total: 0, page: query.page, pageSize });
      }
      if (query.categoryId) q = q.eq('category_id', query.categoryId);
      if (query.departmentId) q = q.eq('assigned_department_id', query.departmentId);
      if (query.hasSupporters) q = q.gt('supporter_count', 0);
      if (query.withinDays) {
        q = q.gte('created_at', new Date(now.getTime() - query.withinDays * DAY_MS).toISOString());
      }
      if (query.search) {
        // `search` is already limited to letters, digits, spaces and hyphens
        // (cleanSearch), so it cannot break out of the quoted filter value.
        const pattern = `"*${query.search}*"`;
        q = q.or(`title.ilike.${pattern},issue_number.ilike.${pattern}`);
      }

      switch (query.sort) {
        case 'newest':
          q = q.order('created_at', { ascending: false });
          break;
        case 'oldest':
          q = q.order('created_at', { ascending: true });
          break;
        case 'updated':
          q = q.order('last_status_change_at', { ascending: false });
          break;
        case 'priority':
          // Postgres orders the enum LOW < MEDIUM < HIGH < CRITICAL.
          q = q.order('priority', { ascending: false }).order('created_at', { ascending: true });
          break;
        case 'affected':
          q = q
            .order('supporter_count', { ascending: false })
            .order('created_at', { ascending: false });
          break;
      }
      q = q.order('id').range(fromRow, fromRow + pageSize - 1);

      try {
        const res = await q;
        if (res.error) {
          // Asking for a page past the end is not an error: show it as empty.
          if (res.error.code === 'PGRST103') {
            return ok({ rows: [], total: res.count ?? 0, page: query.page, pageSize });
          }
          return err(toAppError(res.error));
        }
        return ok({
          rows: res.data.map((r) => ({
            id: r.id,
            issueNumber: r.issue_number,
            title: r.title,
            status: r.status,
            priority: r.priority,
            visibility: r.visibility,
            categoryName: r.category_name,
            departmentName: r.assigned_department_name,
            assigneeName: r.assigned_user_name,
            supporterCount: r.supporter_count,
            reopenCount: r.reopen_count,
            createdAt: r.created_at,
            lastStatusChangeAt: r.last_status_change_at,
          })),
          total: res.count ?? res.data.length,
          page: query.page,
          pageSize,
        });
      } catch (e) {
        return err(toAppError(e));
      }
    },

    async listDepartments(villageId) {
      const res = required(
        await run(() =>
          client
            .from('departments')
            .select('id, name, name_local')
            .eq('village_id', villageId)
            .eq('is_active', true)
            .order('name'),
        ),
      );
      if (!res.ok) return res;
      return ok(res.value.map((d) => ({ id: d.id, name: d.name, nameLocal: d.name_local })));
    },

    async subscribeToChanges(villageId, onChange, onStatus) {
      onStatus?.('connecting');
      // Private channels are authorised with the signed-in user's token.
      await client.realtime.setAuth();
      const channel = client
        .channel(issueChangesTopic(villageId), { config: { private: true } })
        .on('broadcast', { event: 'issue_changed' }, (msg) => {
          const payload: unknown = msg.payload;
          const id =
            typeof payload === 'object' && payload !== null && 'id' in payload
              ? (payload as { id: unknown }).id
              : null;
          if (typeof id === 'string') onChange(id);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onStatus?.('live');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            onStatus?.('offline');
          }
        });
      return {
        async close() {
          await client.removeChannel(channel);
        },
      };
    },
  };
}
