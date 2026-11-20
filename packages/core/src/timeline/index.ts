import type { AttachmentKind, IssueStatus } from '../enums/index';

/** One row of public.issue_timeline_view, as returned by the services layer. */
export interface TimelineRow {
  eventType: 'STATUS_CHANGED' | 'ASSIGNMENT_ACCEPTED' | 'ATTACHMENT_ADDED' | 'COMMENT_ADDED';
  occurredAt: string;
  sourceId: string;
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus | null;
  reason: string | null;
  visibility: 'PUBLIC' | 'INTERNAL';
  actorName: string | null;
  actorRoleKey: string | null;
  isMine: boolean;
  isSystem: boolean;
  attachmentId: string | null;
  attachmentKind: AttachmentKind | null;
  commentId: string | null;
}

export type TimelineEntry =
  | (TimelineRow & { kind: 'status'; photoCount: number })
  | (TimelineRow & { kind: 'accepted' })
  | (TimelineRow & { kind: 'photo' })
  | (TimelineRow & { kind: 'comment' });

/** Photos registered within this window before the SUBMITTED row came with the report itself. */
const SUBMISSION_WINDOW_MS = 60_000;

const ORDER: Readonly<Record<TimelineRow['eventType'], number>> = {
  STATUS_CHANGED: 0,
  ASSIGNMENT_ACCEPTED: 1,
  ATTACHMENT_ADDED: 2,
  COMMENT_ADDED: 3,
};

/**
 * Turns raw timeline rows into what people see: oldest first, with the photos
 * sent together with the report folded into the "reported" entry
 * ("Reported with 2 photos") instead of appearing as separate events before it.
 */
export function buildTimeline(rows: readonly TimelineRow[]): TimelineEntry[] {
  const sorted = [...rows].sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      ORDER[a.eventType] - ORDER[b.eventType] ||
      a.sourceId.localeCompare(b.sourceId),
  );
  const submitted = sorted.find(
    (r) => r.eventType === 'STATUS_CHANGED' && r.toStatus === 'SUBMITTED',
  );
  const submittedAt = submitted ? Date.parse(submitted.occurredAt) : null;

  const folded = new Set<string>();
  if (submittedAt !== null) {
    for (const r of sorted) {
      const t = Date.parse(r.occurredAt);
      if (
        r.eventType === 'ATTACHMENT_ADDED' &&
        r.attachmentKind === 'INITIAL_EVIDENCE' &&
        r.isMine === submitted?.isMine &&
        t <= submittedAt &&
        submittedAt - t <= SUBMISSION_WINDOW_MS
      ) {
        folded.add(r.sourceId);
      }
    }
  }

  const entries: TimelineEntry[] = [];
  for (const r of sorted) {
    if (folded.has(r.sourceId)) continue;
    switch (r.eventType) {
      case 'STATUS_CHANGED':
        entries.push({ ...r, kind: 'status', photoCount: r === submitted ? folded.size : 0 });
        break;
      case 'ASSIGNMENT_ACCEPTED':
        entries.push({ ...r, kind: 'accepted' });
        break;
      case 'ATTACHMENT_ADDED':
        entries.push({ ...r, kind: 'photo' });
        break;
      case 'COMMENT_ADDED':
        entries.push({ ...r, kind: 'comment' });
        break;
    }
  }
  return entries;
}

/** Simple progress buckets used by status chips and My Issues filters. */
export type StatusGroup = 'open' | 'solved' | 'closed_other';

export function statusGroup(status: IssueStatus): StatusGroup {
  switch (status) {
    case 'RESOLVED':
    case 'CLOSED':
      return 'solved';
    case 'REJECTED':
    case 'DUPLICATE':
      return 'closed_other';
    default:
      return 'open';
  }
}
