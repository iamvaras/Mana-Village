import type { IssueStatus } from '../enums/index';
import type { PermissionKey } from '../permissions/index';

/**
 * Issue workflow actions and their allowed status transitions.
 *
 * This table MIRRORS the authoritative rules in the database function
 * `private.apply_transition` (supabase/migrations). The client uses it only
 * to decide which action buttons to show. If the two ever disagree, the
 * database wins and the client receives an INVALID_TRANSITION error.
 * A unit test and a pgTAP test check the same transitions.
 */
export const WORKFLOW_ACTIONS = [
  'start_review',
  'verify',
  'reject',
  'mark_duplicate',
  'assign',
  'reassign',
  'decline_assignment',
  'start_work',
  'resolve',
  'confirm_solved',
  'confirm_not_solved',
  'close',
  'reopen',
  'reconsider',
] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

/** Who may perform the action, beyond holding a permission. */
export type ActorRule =
  | { kind: 'permission'; anyOf: readonly PermissionKey[] }
  | { kind: 'reporter' }
  | { kind: 'assignee_or_permission'; anyOf: readonly PermissionKey[] };

export interface TransitionRule {
  readonly action: WorkflowAction;
  readonly from: readonly IssueStatus[];
  readonly to: IssueStatus;
  readonly actor: ActorRule;
  readonly reasonRequired: boolean;
}

export const TRANSITIONS: readonly TransitionRule[] = [
  {
    action: 'start_review',
    from: ['SUBMITTED'],
    to: 'UNDER_REVIEW',
    actor: { kind: 'permission', anyOf: ['issue.review'] },
    reasonRequired: false,
  },
  {
    action: 'verify',
    from: ['UNDER_REVIEW'],
    to: 'VERIFIED',
    actor: { kind: 'permission', anyOf: ['issue.verify'] },
    reasonRequired: false,
  },
  {
    action: 'reject',
    from: ['SUBMITTED', 'UNDER_REVIEW'],
    to: 'REJECTED',
    actor: { kind: 'permission', anyOf: ['issue.reject'] },
    reasonRequired: true,
  },
  {
    action: 'mark_duplicate',
    from: ['SUBMITTED', 'UNDER_REVIEW'],
    to: 'DUPLICATE',
    actor: { kind: 'permission', anyOf: ['issue.mark_duplicate'] },
    reasonRequired: false,
  },
  {
    action: 'assign',
    from: ['VERIFIED', 'REOPENED'],
    to: 'ASSIGNED',
    actor: { kind: 'permission', anyOf: ['issue.assign'] },
    reasonRequired: false,
  },
  {
    action: 'reassign',
    from: ['ASSIGNED', 'IN_PROGRESS'],
    to: 'ASSIGNED',
    actor: { kind: 'permission', anyOf: ['issue.assign'] },
    reasonRequired: true,
  },
  {
    action: 'decline_assignment',
    from: ['ASSIGNED'],
    to: 'VERIFIED',
    actor: { kind: 'assignee_or_permission', anyOf: [] },
    reasonRequired: true,
  },
  {
    action: 'start_work',
    from: ['ASSIGNED', 'REOPENED'],
    to: 'IN_PROGRESS',
    actor: { kind: 'assignee_or_permission', anyOf: ['issue.assign'] },
    reasonRequired: false,
  },
  {
    action: 'resolve',
    from: ['IN_PROGRESS'],
    to: 'RESOLVED',
    actor: { kind: 'assignee_or_permission', anyOf: ['issue.resolve_any'] },
    reasonRequired: false,
  },
  {
    action: 'confirm_solved',
    from: ['RESOLVED'],
    to: 'CLOSED',
    actor: { kind: 'reporter' },
    reasonRequired: false,
  },
  {
    action: 'confirm_not_solved',
    from: ['RESOLVED'],
    to: 'REOPENED',
    actor: { kind: 'reporter' },
    reasonRequired: true,
  },
  {
    action: 'close',
    from: ['RESOLVED'],
    to: 'CLOSED',
    actor: { kind: 'permission', anyOf: ['issue.close'] },
    reasonRequired: true,
  },
  {
    action: 'reopen',
    from: ['RESOLVED', 'CLOSED'],
    to: 'REOPENED',
    actor: { kind: 'permission', anyOf: ['issue.reopen'] },
    reasonRequired: true,
  },
  {
    action: 'reconsider',
    from: ['REJECTED', 'DUPLICATE'],
    to: 'UNDER_REVIEW',
    actor: { kind: 'permission', anyOf: ['issue.review'] },
    reasonRequired: true,
  },
];

export function getTransition(action: WorkflowAction): TransitionRule {
  const rule = TRANSITIONS.find((t) => t.action === action);
  if (!rule) throw new Error(`Unknown workflow action: ${action}`);
  return rule;
}

export function canTransitionFrom(action: WorkflowAction, status: IssueStatus): boolean {
  return getTransition(action).from.includes(status);
}

/** Every (from, to) status pair the workflow allows. Used by tests. */
export function allowedStatusPairs(): ReadonlyArray<readonly [IssueStatus, IssueStatus]> {
  const pairs = new Map<string, readonly [IssueStatus, IssueStatus]>();
  for (const t of TRANSITIONS) {
    for (const from of t.from) pairs.set(`${from}>${t.to}`, [from, t.to]);
  }
  return [...pairs.values()];
}

export interface ActorContext {
  readonly has: (key: PermissionKey) => boolean;
  readonly isReporter: boolean;
  readonly isAssignee: boolean;
}

/** UI helper: actions to show for an issue in a given status. */
export function availableActions(status: IssueStatus, ctx: ActorContext): WorkflowAction[] {
  return TRANSITIONS.filter((t) => {
    if (!t.from.includes(status)) return false;
    switch (t.actor.kind) {
      case 'reporter':
        return ctx.isReporter;
      case 'permission':
        return t.actor.anyOf.some(ctx.has);
      case 'assignee_or_permission':
        return ctx.isAssignee || t.actor.anyOf.some(ctx.has);
    }
  }).map((t) => t.action);
}
