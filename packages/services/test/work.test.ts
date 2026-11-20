import { describe, expect, it } from 'vitest';
import { groupWork, isOverdue, workGroup, workSteps } from '../src/index';

describe('work steps', () => {
  it('new work can be accepted, declined or started', () => {
    expect(workSteps({ status: 'ASSIGNED', assignmentStatus: 'PENDING' })).toEqual([
      'accept',
      'decline',
      'start',
    ]);
  });
  it('accepted work can only be started', () => {
    expect(workSteps({ status: 'ASSIGNED', assignmentStatus: 'ACCEPTED' })).toEqual(['start']);
  });
  it('reopened work is started again', () => {
    expect(workSteps({ status: 'REOPENED', assignmentStatus: 'ACCEPTED' })).toEqual(['start']);
  });
  it('work in progress gets updates and is resolved', () => {
    expect(workSteps({ status: 'IN_PROGRESS', assignmentStatus: 'ACCEPTED' })).toEqual([
      'progress',
      'resolve',
    ]);
  });
  it('resolved work waits for the resident', () => {
    expect(workSteps({ status: 'RESOLVED', assignmentStatus: 'ACCEPTED' })).toEqual([]);
    expect(workGroup({ status: 'RESOLVED' })).toBe('waiting');
  });
  it('groups', () => {
    expect(workGroup({ status: 'ASSIGNED' })).toBe('new');
    expect(workGroup({ status: 'IN_PROGRESS' })).toBe('in_progress');
    expect(workGroup({ status: 'REOPENED' })).toBe('reopened');
  });
});

describe('work list grouping', () => {
  it('orders groups reopened, new, in progress, waiting and drops empty ones', () => {
    const items = [
      { id: 'a', status: 'IN_PROGRESS' as const },
      { id: 'b', status: 'REOPENED' as const },
      { id: 'c', status: 'IN_PROGRESS' as const },
      { id: 'd', status: 'RESOLVED' as const },
    ];
    expect(groupWork(items).map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ['reopened', ['b']],
      ['in_progress', ['a', 'c']],
      ['waiting', ['d']],
    ]);
  });
  it('overdue only before it is sent as done', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    const past = '2026-11-19T10:00:00Z';
    expect(isOverdue({ status: 'IN_PROGRESS', dueAt: past }, now)).toBe(true);
    expect(isOverdue({ status: 'RESOLVED', dueAt: past }, now)).toBe(false);
    expect(isOverdue({ status: 'ASSIGNED', dueAt: null }, now)).toBe(false);
    expect(isOverdue({ status: 'ASSIGNED', dueAt: '2026-11-21T10:00:00Z' }, now)).toBe(false);
  });
});
