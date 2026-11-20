import { LIMITS, ok, type IssuePriority, type IssueStatus, type Result } from '@mana/core';
import type { ManaClient } from './client';
import type { UploadedPhoto } from './issues';
import { required, run, validationError } from './errors';
import { reasonProblem } from './workflow';

export const PROGRESS_NOTE_MAX = 1000;

export type AssignmentStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'SUPERSEDED' | 'COMPLETED';

/** One item of the worker's Work list. */
export interface WorkItem {
  issueId: string;
  issueNumber: string;
  villageId: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  categoryName: string;
  categoryNameLocal: string | null;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  version: number;
  lastStatusChangeAt: string;
  assignmentId: string;
  assignmentStatus: AssignmentStatus;
  departmentName: string;
  /** false while the work is assigned to the whole department and nobody has taken it. */
  assignedToMe: boolean;
  note: string | null;
  assignedAt: string;
  dueAt: string | null;
}

export type WorkGroup = 'new' | 'in_progress' | 'reopened' | 'waiting';

/** Work tab sections (docs/ui-ux.md §2.3). */
export function workGroup(item: Pick<WorkItem, 'status'>): WorkGroup {
  switch (item.status) {
    case 'REOPENED':
      return 'reopened';
    case 'IN_PROGRESS':
      return 'in_progress';
    case 'RESOLVED':
      return 'waiting';
    default:
      return 'new';
  }
}

export const WORK_GROUP_ORDER: readonly WorkGroup[] = ['reopened', 'new', 'in_progress', 'waiting'];

/** Groups in Work-tab order, leaving out empty ones. Keeps the order the list came in. */
export function groupWork<T extends Pick<WorkItem, 'status'>>(
  items: readonly T[],
): { group: WorkGroup; items: T[] }[] {
  return WORK_GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((i) => workGroup(i) === group),
  })).filter((g) => g.items.length > 0);
}

/** Past its due date and not yet sent as done. */
export function isOverdue(item: Pick<WorkItem, 'status' | 'dueAt'>, now = new Date()): boolean {
  return item.dueAt !== null && item.status !== 'RESOLVED' && new Date(item.dueAt) < now;
}

export type WorkStep = 'accept' | 'decline' | 'start' | 'progress' | 'resolve';

/** Steps the worker can take now. Mirrors the database rules in the work functions. */
export function workSteps(item: Pick<WorkItem, 'status' | 'assignmentStatus'>): WorkStep[] {
  switch (item.status) {
    case 'ASSIGNED':
      return item.assignmentStatus === 'PENDING' ? ['accept', 'decline', 'start'] : ['start'];
    case 'REOPENED':
      return ['start'];
    case 'IN_PROGRESS':
      return ['progress', 'resolve'];
    default:
      return [];
  }
}

const photosPayload = (photos: readonly UploadedPhoto[]) =>
  photos.map((p) => ({
    id: p.id,
    path: p.path,
    ...(p.width ? { width: p.width } : {}),
    ...(p.height ? { height: p.height } : {}),
  }));

export interface WorkService {
  /** Only the signed-in worker's own active work. */
  listMyWork(): Promise<Result<WorkItem[]>>;
  accept(issueId: string): Promise<Result<null>>;
  decline(issueId: string, version: number, reason: string): Promise<Result<number>>;
  start(issueId: string, version: number): Promise<Result<number>>;
  /** A public progress note and/or work photos (already uploaded). */
  addProgress(
    issueId: string,
    note: string,
    photos: readonly UploadedPhoto[],
  ): Promise<Result<null>>;
  /** Needs at least one completion photo (already uploaded). */
  resolve(
    issueId: string,
    version: number,
    note: string,
    photos: readonly UploadedPhoto[],
  ): Promise<Result<number>>;
}

export function createWorkService(client: ManaClient): WorkService {
  return {
    async listMyWork() {
      const res = required(await run(() => client.rpc('list_my_work')));
      if (!res.ok) return res;
      return ok(
        res.value.map((r) => ({
          issueId: r.issue_id,
          issueNumber: r.issue_number,
          villageId: r.village_id,
          title: r.title,
          status: r.status,
          priority: r.priority,
          categoryName: r.category_name,
          categoryNameLocal: r.category_name_local,
          locationText: r.location_text,
          latitude: r.latitude,
          longitude: r.longitude,
          version: r.version,
          lastStatusChangeAt: r.last_status_change_at,
          assignmentId: r.assignment_id,
          assignmentStatus: r.assignment_status,
          departmentName: r.department_name,
          assignedToMe: r.assigned_to_me,
          note: r.assignment_note,
          assignedAt: r.assigned_at,
          dueAt: r.due_at,
        })),
      );
    },

    async accept(issueId) {
      const res = await run(() => client.rpc('accept_assignment', { p_issue_id: issueId }));
      return res.ok ? ok(null) : res;
    },

    async decline(issueId, version, reason) {
      const problem = reasonProblem(reason);
      if (problem) return validationError({ reason: problem });
      return required(
        await run(() =>
          client.rpc('decline_assignment', {
            p_issue_id: issueId,
            p_expected_version: version,
            p_reason: reason.trim(),
            p_source: 'MOBILE',
          }),
        ),
      );
    },

    async start(issueId, version) {
      return required(
        await run(() =>
          client.rpc('start_work', {
            p_issue_id: issueId,
            p_expected_version: version,
            p_source: 'MOBILE',
          }),
        ),
      );
    },

    async addProgress(issueId, note, photos) {
      const text = note.trim();
      if (!text && photos.length === 0) return validationError({ note: 'Add a note or a photo.' });
      if (text.length > PROGRESS_NOTE_MAX)
        return validationError({ note: `Please keep it under ${PROGRESS_NOTE_MAX} characters.` });
      if (photos.length > LIMITS.maxPhotosPerUpload)
        return validationError({ photos: `At most ${LIMITS.maxPhotosPerUpload} photos.` });
      const res = await run(() =>
        client.rpc('add_progress_update', {
          p_issue_id: issueId,
          ...(text ? { p_note: text } : {}),
          p_attachments: photosPayload(photos),
        }),
      );
      return res.ok ? ok(null) : res;
    },

    async resolve(issueId, version, note, photos) {
      if (photos.length === 0)
        return validationError({ photos: 'Add a photo of the finished work.' });
      if (photos.length > LIMITS.maxPhotosPerUpload)
        return validationError({ photos: `At most ${LIMITS.maxPhotosPerUpload} photos.` });
      const text = note.trim();
      if (text.length > PROGRESS_NOTE_MAX)
        return validationError({ note: `Please keep it under ${PROGRESS_NOTE_MAX} characters.` });
      return required(
        await run(() =>
          client.rpc('resolve_issue', {
            p_issue_id: issueId,
            p_expected_version: version,
            ...(text ? { p_note: text } : {}),
            p_attachments: photosPayload(photos),
            p_source: 'MOBILE',
          }),
        ),
      );
    },
  };
}
