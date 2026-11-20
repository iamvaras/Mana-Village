import { describe, expect, it } from 'vitest';
import { buildTimeline, statusGroup, type TimelineRow } from '../src/timeline/index';

const row = (over: Partial<TimelineRow>): TimelineRow => ({
  eventType: 'STATUS_CHANGED',
  occurredAt: '2026-11-20T10:00:00.000Z',
  sourceId: 'x',
  fromStatus: null,
  toStatus: null,
  reason: null,
  visibility: 'PUBLIC',
  actorName: null,
  actorRoleKey: null,
  isMine: false,
  isSystem: false,
  attachmentId: null,
  attachmentKind: null,
  commentId: null,
  ...over,
});

describe('buildTimeline', () => {
  const photo1 = row({
    eventType: 'ATTACHMENT_ADDED',
    sourceId: 'p1',
    attachmentKind: 'INITIAL_EVIDENCE',
    isMine: true,
    occurredAt: '2026-11-20T10:00:00.010Z',
  });
  const photo2 = row({
    eventType: 'ATTACHMENT_ADDED',
    sourceId: 'p2',
    attachmentKind: 'INITIAL_EVIDENCE',
    isMine: true,
    occurredAt: '2026-11-20T10:00:00.020Z',
  });
  const submitted = row({
    sourceId: 'h1',
    toStatus: 'SUBMITTED',
    isMine: true,
    actorRoleKey: 'CITIZEN',
    occurredAt: '2026-11-20T10:00:00.030Z',
  });
  const review = row({
    sourceId: 'h2',
    fromStatus: 'SUBMITTED',
    toStatus: 'UNDER_REVIEW',
    actorName: 'Kiran',
    occurredAt: '2026-11-21T09:00:00.000Z',
  });
  const comment = row({
    eventType: 'COMMENT_ADDED',
    sourceId: 'c1',
    commentId: 'c1',
    occurredAt: '2026-11-21T09:05:00.000Z',
  });
  const laterPhoto = row({
    eventType: 'ATTACHMENT_ADDED',
    sourceId: 'p3',
    attachmentKind: 'INITIAL_EVIDENCE',
    isMine: true,
    occurredAt: '2026-11-21T08:00:00.000Z',
  });

  it('folds photos sent with the report into the "reported" entry and sorts oldest first', () => {
    const out = buildTimeline([comment, review, photo2, submitted, photo1]);
    expect(out.map((e) => e.kind)).toEqual(['status', 'status', 'comment']);
    expect(out[0]).toMatchObject({ toStatus: 'SUBMITTED', photoCount: 2 });
    expect(out[1]).toMatchObject({ toStatus: 'UNDER_REVIEW', photoCount: 0 });
  });

  it('keeps photos added later as their own entries', () => {
    const out = buildTimeline([submitted, photo1, laterPhoto, review]);
    expect(out.map((e) => e.sourceId)).toEqual(['h1', 'p3', 'h2']);
  });

  it('orders events with the same time by kind, then id', () => {
    const t = '2026-11-21T10:00:00.000Z';
    const out = buildTimeline([
      row({ eventType: 'COMMENT_ADDED', sourceId: 'c', occurredAt: t }),
      row({ eventType: 'ASSIGNMENT_ACCEPTED', sourceId: 'a', occurredAt: t }),
      row({ sourceId: 's', toStatus: 'IN_PROGRESS', occurredAt: t }),
    ]);
    expect(out.map((e) => e.kind)).toEqual(['status', 'accepted', 'comment']);
  });

  it('works without a SUBMITTED row (e.g. empty or partial data)', () => {
    expect(buildTimeline([])).toEqual([]);
    expect(buildTimeline([photo1]).map((e) => e.kind)).toEqual(['photo']);
  });
});

describe('statusGroup', () => {
  it('groups statuses for filters', () => {
    expect(statusGroup('IN_PROGRESS')).toBe('open');
    expect(statusGroup('REOPENED')).toBe('open');
    expect(statusGroup('RESOLVED')).toBe('solved');
    expect(statusGroup('CLOSED')).toBe('solved');
    expect(statusGroup('REJECTED')).toBe('closed_other');
  });
});
