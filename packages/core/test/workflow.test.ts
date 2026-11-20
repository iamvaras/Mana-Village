import { describe, expect, it } from 'vitest';
import {
  ISSUE_STATUSES,
  TRANSITIONS,
  allowedStatusPairs,
  availableActions,
  canTransitionFrom,
  type IssueStatus,
} from '../src/index.js';

/**
 * Mirror of the transitions enforced by the database workflow functions
 * (supabase/migrations/*_workflow_functions.sql). If you change one, change both;
 * supabase/tests/database/*.test.sql covers the database side.
 */
const EXPECTED_PAIRS: ReadonlyArray<readonly [IssueStatus, IssueStatus]> = [
  ['SUBMITTED', 'UNDER_REVIEW'],
  ['UNDER_REVIEW', 'VERIFIED'],
  ['SUBMITTED', 'REJECTED'],
  ['UNDER_REVIEW', 'REJECTED'],
  ['SUBMITTED', 'DUPLICATE'],
  ['UNDER_REVIEW', 'DUPLICATE'],
  ['VERIFIED', 'ASSIGNED'],
  ['REOPENED', 'ASSIGNED'],
  ['ASSIGNED', 'ASSIGNED'],
  ['IN_PROGRESS', 'ASSIGNED'],
  ['ASSIGNED', 'VERIFIED'],
  ['ASSIGNED', 'IN_PROGRESS'],
  ['REOPENED', 'IN_PROGRESS'],
  ['IN_PROGRESS', 'RESOLVED'],
  ['RESOLVED', 'CLOSED'],
  ['RESOLVED', 'REOPENED'],
  ['CLOSED', 'REOPENED'],
  ['REJECTED', 'UNDER_REVIEW'],
  ['DUPLICATE', 'UNDER_REVIEW'],
];

const key = ([a, b]: readonly [IssueStatus, IssueStatus]) => `${a}>${b}`;

describe('workflow transitions', () => {
  it('matches the database transition table exactly', () => {
    expect(allowedStatusPairs().map(key).sort()).toEqual(EXPECTED_PAIRS.map(key).sort());
  });

  it('never allows a transition out of CLOSED except reopen', () => {
    const fromClosed = TRANSITIONS.filter((t) => t.from.includes('CLOSED')).map((t) => t.action);
    expect(fromClosed).toEqual(['reopen']);
  });

  it('requires a reason for reject, reopen, close and not-solved', () => {
    for (const action of [
      'reject',
      'reopen',
      'close',
      'confirm_not_solved',
      'reconsider',
    ] as const) {
      expect(TRANSITIONS.find((t) => t.action === action)?.reasonRequired).toBe(true);
    }
  });

  it('every status is reachable', () => {
    const reachable = new Set<IssueStatus>(['SUBMITTED', ...TRANSITIONS.map((t) => t.to)]);
    expect([...reachable].sort()).toEqual([...ISSUE_STATUSES].sort());
  });
});

describe('availableActions (UI hints only)', () => {
  const none = { has: () => false, isReporter: false, isAssignee: false };

  it('shows confirmation buttons only to the reporter of a RESOLVED issue', () => {
    expect(availableActions('RESOLVED', { ...none, isReporter: true })).toEqual([
      'confirm_solved',
      'confirm_not_solved',
    ]);
    expect(availableActions('RESOLVED', none)).toEqual([]);
  });

  it('shows review actions to holders of the permission', () => {
    const reviewer = { ...none, has: (k: string) => ['issue.review', 'issue.reject'].includes(k) };
    expect(availableActions('SUBMITTED', reviewer)).toEqual(['start_review', 'reject']);
  });

  it('lets the assignee start and resolve work', () => {
    expect(availableActions('ASSIGNED', { ...none, isAssignee: true })).toEqual([
      'decline_assignment',
      'start_work',
    ]);
    expect(canTransitionFrom('resolve', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionFrom('resolve', 'ASSIGNED')).toBe(false);
  });
});
