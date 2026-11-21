import {
  LIMITS,
  ok,
  statusGroup,
  type AttachmentKind,
  type IssuePriority,
  type IssueStatus,
  type Result,
  type TimelineRow,
} from '@mana/core';
import type { ManaClient } from './client';
import { ATTACHMENTS_BUCKET } from './issues';
import { required, run, validationError } from './errors';

export interface IssueSummary {
  id: string;
  issueNumber: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  categoryName: string;
  categoryNameLocal: string | null;
  locationText: string | null;
  supporterCount: number;
  isMine: boolean;
  iSupport: boolean;
  createdAt: string;
  lastStatusChangeAt: string;
}

export interface IssueDetail extends IssueSummary {
  villageId: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  version: number;
  /** null when the viewer may not see who reported it ("A resident"). */
  reporterName: string | null;
  /** Only staff receive the reporter id (for the audited "reveal phone" action). */
  reporterId: string | null;
  assignedDepartmentId: string | null;
  assignedDepartmentName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  /** Set when the issue was marked as a duplicate of another one. */
  duplicateOfIssueId: string | null;
  iAmAssignee: boolean;
  reopenCount: number;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface IssueComment {
  id: string;
  body: string | null;
  visibility: 'PUBLIC' | 'INTERNAL';
  isHidden: boolean;
  createdAt: string;
  isMine: boolean;
  authorName: string | null;
  authorRoleKey: string | null;
}

export interface IssuePhoto {
  id: string;
  kind: AttachmentKind;
  visibility: 'PUBLIC' | 'INTERNAL';
  width: number | null;
  height: number | null;
  createdAt: string;
  uploadedByName: string | null;
  uploadedByRoleKey: string | null;
  /** Short-lived private link; null if it could not be created. */
  url: string | null;
}

export type MyIssuesFilter = 'open' | 'solved' | 'all';

/** Private photo links expire after this many seconds. */
export const SIGNED_URL_SECONDS = 60 * 60;

export interface IssueReadsService {
  /** Issues I reported or support. */
  listMine(filter: MyIssuesFilter): Promise<Result<IssueSummary[]>>;
  /** Most recent issues in a village (staff dashboard). */
  listRecent(villageId: string, limit?: number): Promise<Result<IssueSummary[]>>;
  /** Finds an issue in a village by its number (e.g. RMP-2026-00012). */
  findByNumber(villageId: string, issueNumber: string): Promise<Result<IssueSummary | null>>;
  /** `null` when the issue does not exist or the viewer may not see it. */
  getIssue(issueId: string): Promise<Result<IssueDetail | null>>;
  getTimeline(issueId: string): Promise<Result<TimelineRow[]>>;
  listComments(issueId: string): Promise<Result<IssueComment[]>>;
  listPhotos(issueId: string): Promise<Result<IssuePhoto[]>>;
  addComment(
    issueId: string,
    body: string,
    visibility?: 'PUBLIC' | 'INTERNAL',
  ): Promise<Result<string>>;
}

const SUMMARY_COLUMNS =
  'id, issue_number, title, status, priority, category_name, category_name_local, location_text, supporter_count, is_mine, i_support, created_at, last_status_change_at';

interface SummaryRow {
  id: string;
  issue_number: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  category_name: string;
  category_name_local: string | null;
  location_text: string | null;
  supporter_count: number;
  is_mine: boolean | null;
  i_support: boolean | null;
  created_at: string;
  last_status_change_at: string;
}

function toSummary(r: SummaryRow): IssueSummary {
  return {
    id: r.id,
    issueNumber: r.issue_number,
    title: r.title,
    status: r.status,
    priority: r.priority,
    categoryName: r.category_name,
    categoryNameLocal: r.category_name_local,
    locationText: r.location_text,
    supporterCount: r.supporter_count,
    isMine: r.is_mine === true,
    iSupport: r.i_support === true,
    createdAt: r.created_at,
    lastStatusChangeAt: r.last_status_change_at,
  };
}

const EVENT_TYPES = [
  'STATUS_CHANGED',
  'ASSIGNMENT_ACCEPTED',
  'ATTACHMENT_ADDED',
  'COMMENT_ADDED',
] as const;
const isEventType = (v: string | null): v is TimelineRow['eventType'] =>
  v !== null && (EVENT_TYPES as readonly string[]).includes(v);

function metaString(meta: unknown, key: string): string | null {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

export function createIssueReadsService(client: ManaClient): IssueReadsService {
  return {
    async listMine(filter) {
      const res = required(
        await run(() =>
          // list_my_issues starts from my own rows; filtering issues_view by
          // is_mine/i_support scanned every issue (Phase 12 load test).
          client
            .rpc('list_my_issues', { p_limit: 200 })
            .select(SUMMARY_COLUMNS)
            .order('last_status_change_at', { ascending: false }),
        ),
      );
      if (!res.ok) return res;
      const all = res.value.map(toSummary);
      if (filter === 'all') return ok(all);
      return ok(
        all.filter((i) =>
          filter === 'open' ? statusGroup(i.status) === 'open' : statusGroup(i.status) !== 'open',
        ),
      );
    },

    async listRecent(villageId, limit = 10) {
      const res = required(
        await run(() =>
          client
            .from('issues_view')
            .select(SUMMARY_COLUMNS)
            .eq('village_id', villageId)
            .order('created_at', { ascending: false })
            .limit(Math.min(Math.max(limit, 1), 50)),
        ),
      );
      return res.ok ? ok(res.value.map(toSummary)) : res;
    },

    async findByNumber(villageId, issueNumber) {
      const number = issueNumber.trim().toUpperCase();
      if (!/^[A-Z0-9]{2,10}-\d{4}-\d{5}$/.test(number)) {
        return validationError({ issueNumber: 'Use the full number, like RMP-2026-00012.' });
      }
      const res = await run(() =>
        client
          .from('issues_view')
          .select(SUMMARY_COLUMNS)
          .eq('village_id', villageId)
          .eq('issue_number', number)
          .maybeSingle(),
      );
      if (!res.ok) return res;
      return ok(res.value ? toSummary(res.value) : null);
    },

    async getIssue(issueId) {
      const res = await run(() =>
        client.from('issues_view').select('*').eq('id', issueId).maybeSingle(),
      );
      if (!res.ok) return res;
      const r = res.value;
      if (!r) return ok(null);
      return ok({
        ...toSummary(r),
        villageId: r.village_id,
        description: r.description,
        latitude: r.latitude,
        longitude: r.longitude,
        visibility: r.visibility,
        version: r.version,
        reporterName: r.reporter_name,
        reporterId: r.reporter_id,
        assignedDepartmentId: r.assigned_department_id,
        assignedDepartmentName: r.assigned_department_name,
        assignedUserId: r.assigned_user_id,
        assignedUserName: r.assigned_user_name,
        duplicateOfIssueId: r.duplicate_of_issue_id,
        iAmAssignee: r.i_am_assignee === true,
        reopenCount: r.reopen_count,
        resolvedAt: r.resolved_at,
        closedAt: r.closed_at,
      });
    },

    async getTimeline(issueId) {
      const res = required(
        await run(() =>
          client
            .from('issue_timeline_view')
            .select('*')
            .eq('issue_id', issueId)
            .order('occurred_at')
            .limit(500),
        ),
      );
      if (!res.ok) return res;
      const rows: TimelineRow[] = [];
      for (const r of res.value) {
        if (!isEventType(r.event_type) || !r.occurred_at || !r.source_id) continue;
        const kind = metaString(r.metadata, 'kind');
        rows.push({
          eventType: r.event_type,
          occurredAt: r.occurred_at,
          sourceId: r.source_id,
          fromStatus: r.from_status,
          toStatus: r.to_status,
          reason: r.reason,
          visibility: r.visibility ?? 'PUBLIC',
          actorName: r.actor_name,
          actorRoleKey: r.actor_role_key,
          isMine: r.is_mine === true,
          isSystem: r.is_system === true,
          attachmentId: metaString(r.metadata, 'attachment_id'),
          attachmentKind:
            kind === 'INITIAL_EVIDENCE' ||
            kind === 'PROGRESS' ||
            kind === 'COMPLETION' ||
            kind === 'OTHER'
              ? kind
              : null,
          commentId: metaString(r.metadata, 'comment_id'),
        });
      }
      return ok(rows);
    },

    async listComments(issueId) {
      const res = required(
        await run(() =>
          client
            .from('issue_comments_view')
            .select('*')
            .eq('issue_id', issueId)
            .order('created_at')
            .limit(500),
        ),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((c) => ({
          id: c.id,
          body: c.body,
          visibility: c.visibility,
          isHidden: c.is_hidden,
          createdAt: c.created_at,
          isMine: c.is_mine === true,
          authorName: c.author_name,
          authorRoleKey: c.author_role_key,
        })),
      );
    },

    async listPhotos(issueId) {
      const res = required(
        await run(() =>
          client
            .from('issue_attachments_view')
            .select('*')
            .eq('issue_id', issueId)
            .eq('is_hidden', false)
            .order('created_at'),
        ),
      );
      if (!res.ok) return res;
      const rows = res.value;
      const urls = new Map<string, string>();
      if (rows.length > 0) {
        // Storage checks the viewer may see each photo before signing it.
        const signed = await run(() =>
          client.storage.from(ATTACHMENTS_BUCKET).createSignedUrls(
            rows.map((r) => r.storage_path),
            SIGNED_URL_SECONDS,
          ),
        );
        if (signed.ok && signed.value) {
          for (const s of signed.value) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
        }
      }
      return ok(
        rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          visibility: r.visibility,
          width: r.width,
          height: r.height,
          createdAt: r.created_at,
          uploadedByName: r.uploaded_by_name,
          uploadedByRoleKey: r.uploaded_by_role_key,
          url: urls.get(r.storage_path) ?? null,
        })),
      );
    },

    async addComment(issueId, body, visibility = 'PUBLIC') {
      const text = body.trim();
      if (text.length === 0) return validationError({ body: 'Write a comment first.' });
      if (text.length > LIMITS.commentMax)
        return validationError({ body: `At most ${LIMITS.commentMax} characters.` });
      return required(
        await run(() =>
          client.rpc('add_comment', {
            p_issue_id: issueId,
            p_body: text,
            p_visibility: visibility,
          }),
        ),
      );
    },
  };
}
