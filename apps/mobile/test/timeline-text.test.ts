import { describe, expect, it } from 'vitest';
import { buildTimeline, type TimelineRow } from '@mana/core';
import { en } from '../src/i18n/en';
import { te } from '../src/i18n/te';
import { actorLabel, timelineText } from '../src/features/issues/timeline-text';

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

describe('timeline text', () => {
  it("describes a report with photos from the reporter's point of view", () => {
    const [entry] = buildTimeline([
      row({
        eventType: 'ATTACHMENT_ADDED',
        sourceId: 'p',
        attachmentKind: 'INITIAL_EVIDENCE',
        isMine: true,
      }),
      row({
        sourceId: 'h',
        toStatus: 'SUBMITTED',
        isMine: true,
        occurredAt: '2026-11-20T10:00:00.100Z',
      }),
    ]);
    if (!entry) throw new Error('no entry');
    expect(timelineText(entry, en)).toEqual({
      actor: 'You',
      action: 'Reported the problem with 1 photo(s)',
      detail: null,
    });
    expect(timelineText(entry, te).action).toBe('1 ఫోటో(ల)తో సమస్యను నివేదించారు');
  });

  it('names staff with their role and keeps residents anonymous', () => {
    expect(
      actorLabel(
        { isMine: false, isSystem: false, actorName: 'Kiran', actorRoleKey: 'SECRETARY' },
        en,
      ),
    ).toBe('Kiran (EO / Secretary)');
    expect(
      actorLabel({ isMine: false, isSystem: false, actorName: null, actorRoleKey: 'CITIZEN' }, en),
    ).toBe('A resident');
    expect(
      actorLabel({ isMine: false, isSystem: false, actorName: null, actorRoleKey: null }, te),
    ).toBe('ఒక నివాసి');
    expect(
      actorLabel({ isMine: false, isSystem: true, actorName: null, actorRoleKey: null }, en),
    ).toBe('Mana Village');
  });

  it('shows the reason given for a rejection', () => {
    const [entry] = buildTimeline([
      row({
        toStatus: 'REJECTED',
        fromStatus: 'UNDER_REVIEW',
        reason: 'Private land, not Panchayat work',
        actorName: 'Kiran',
        actorRoleKey: 'SECRETARY',
      }),
    ]);
    if (!entry) throw new Error('no entry');
    expect(timelineText(entry, en)).toEqual({
      actor: 'Kiran (EO / Secretary)',
      action: 'Rejected the report',
      detail: 'Reason: Private land, not Panchayat work',
    });
  });

  it('labels work photos', () => {
    const [entry] = buildTimeline([
      row({
        eventType: 'ATTACHMENT_ADDED',
        attachmentKind: 'COMPLETION',
        actorName: 'Ramesh',
        actorRoleKey: 'WORKER',
      }),
    ]);
    if (!entry) throw new Error('no entry');
    expect(timelineText(entry, en).action).toBe('Added a completion photo');
  });
});
