import { type IssuePriority, type IssueVisibility, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { required, run, validationError } from './errors';

/** Same limits the database applies (private.check_reason). */
export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const NOTE_MAX = 500;

export interface AssignInput {
  departmentId: string;
  /** Leave out to let any worker of the department take it. */
  assigneeUserId?: string | undefined;
  note?: string | undefined;
  dueAt?: Date | undefined;
  /** Required when the issue is already assigned (reassignment). */
  reason?: string | undefined;
}

/**
 * Staff actions on an issue. Every call passes the version the person was looking
 * at; if someone else changed the issue meanwhile the database answers CONFLICT.
 * Each returns the issue's new version. Permissions and allowed statuses are
 * decided by the database, not here.
 */
export interface WorkflowService {
  startReview(issueId: string, version: number): Promise<Result<number>>;
  verify(
    issueId: string,
    version: number,
    input?: { priority?: IssuePriority | undefined; note?: string | undefined },
  ): Promise<Result<number>>;
  reject(issueId: string, version: number, reason: string): Promise<Result<number>>;
  markDuplicate(
    issueId: string,
    version: number,
    originalIssueId: string,
    note?: string,
  ): Promise<Result<number>>;
  reconsider(issueId: string, version: number, reason: string): Promise<Result<number>>;
  assign(issueId: string, version: number, input: AssignInput): Promise<Result<number>>;
  /** Close a solved issue without the resident's answer. */
  close(issueId: string, version: number, reason: string): Promise<Result<number>>;
  /** Reopen a solved or closed issue. */
  reopen(issueId: string, version: number, reason: string): Promise<Result<number>>;
  setPriority(issueId: string, version: number, priority: IssuePriority): Promise<Result<number>>;
  setVisibility(
    issueId: string,
    version: number,
    visibility: IssueVisibility,
  ): Promise<Result<number>>;
}

/** Client-side check matching the database, so people see the problem before sending. */
export function reasonProblem(reason: string | undefined): string | null {
  const n = (reason ?? '').trim().length;
  if (n < REASON_MIN) return `Please write at least ${REASON_MIN} characters.`;
  if (n > REASON_MAX) return `Please keep it under ${REASON_MAX} characters.`;
  return null;
}

const clean = (s: string | undefined) => {
  const t = (s ?? '').trim();
  return t === '' ? undefined : t;
};

export function createWorkflowService(client: ManaClient): WorkflowService {
  const withReason = async (
    reason: string,
    call: (reason: string) => Promise<Result<number>>,
  ): Promise<Result<number>> => {
    const problem = reasonProblem(reason);
    return problem ? validationError({ reason: problem }) : call(reason.trim());
  };

  return {
    async startReview(issueId, version) {
      return required(
        await run(() =>
          client.rpc('start_review', { p_issue_id: issueId, p_expected_version: version }),
        ),
      );
    },

    async verify(issueId, version, input = {}) {
      const note = clean(input.note);
      if (note && note.length > NOTE_MAX)
        return validationError({ note: `Please keep it under ${NOTE_MAX} characters.` });
      return required(
        await run(() =>
          client.rpc('verify_issue', {
            p_issue_id: issueId,
            p_expected_version: version,
            ...(input.priority ? { p_priority: input.priority } : {}),
            ...(note ? { p_note: note } : {}),
          }),
        ),
      );
    },

    reject(issueId, version, reason) {
      return withReason(reason, async (r) =>
        required(
          await run(() =>
            client.rpc('reject_issue', {
              p_issue_id: issueId,
              p_expected_version: version,
              p_reason: r,
            }),
          ),
        ),
      );
    },

    async markDuplicate(issueId, version, originalIssueId, note) {
      if (originalIssueId === issueId)
        return validationError({ original: 'Choose a different issue.' });
      const n = clean(note);
      return required(
        await run(() =>
          client.rpc('mark_duplicate', {
            p_issue_id: issueId,
            p_expected_version: version,
            p_duplicate_of: originalIssueId,
            ...(n ? { p_note: n } : {}),
          }),
        ),
      );
    },

    reconsider(issueId, version, reason) {
      return withReason(reason, async (r) =>
        required(
          await run(() =>
            client.rpc('reconsider_issue', {
              p_issue_id: issueId,
              p_expected_version: version,
              p_reason: r,
            }),
          ),
        ),
      );
    },

    async assign(issueId, version, input) {
      const note = clean(input.note);
      if (note && note.length > NOTE_MAX)
        return validationError({ note: `Please keep it under ${NOTE_MAX} characters.` });
      const reason = clean(input.reason);
      if (input.reason !== undefined) {
        const problem = reasonProblem(reason);
        if (problem) return validationError({ reason: problem });
      }
      if (input.dueAt && input.dueAt.getTime() < Date.now() - 60_000)
        return validationError({ dueAt: 'The due date is in the past.' });
      return required(
        await run(() =>
          client.rpc('assign_issue', {
            p_issue_id: issueId,
            p_expected_version: version,
            p_department_id: input.departmentId,
            ...(input.assigneeUserId ? { p_assignee_user_id: input.assigneeUserId } : {}),
            ...(note ? { p_note: note } : {}),
            ...(input.dueAt ? { p_due_at: input.dueAt.toISOString() } : {}),
            ...(reason ? { p_reason: reason } : {}),
          }),
        ),
      );
    },

    close(issueId, version, reason) {
      return withReason(reason, async (r) =>
        required(
          await run(() =>
            client.rpc('close_issue', {
              p_issue_id: issueId,
              p_expected_version: version,
              p_reason: r,
            }),
          ),
        ),
      );
    },

    reopen(issueId, version, reason) {
      return withReason(reason, async (r) =>
        required(
          await run(() =>
            client.rpc('reopen_issue', {
              p_issue_id: issueId,
              p_expected_version: version,
              p_reason: r,
            }),
          ),
        ),
      );
    },

    async setPriority(issueId, version, priority) {
      return required(
        await run(() =>
          client.rpc('set_issue_priority', {
            p_issue_id: issueId,
            p_expected_version: version,
            p_priority: priority,
          }),
        ),
      );
    },

    async setVisibility(issueId, version, visibility) {
      return required(
        await run(() =>
          client.rpc('set_issue_visibility', {
            p_issue_id: issueId,
            p_expected_version: version,
            p_visibility: visibility,
          }),
        ),
      );
    },
  };
}
