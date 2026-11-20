import { describe, expect, it } from 'vitest';
import type { TimelineRow } from '@mana/core';
import { resolutionSummary, type IssuePhoto } from '../src/index';

const row = (toStatus: TimelineRow['toStatus'], occurredAt: string, reason: string | null = null) =>
  ({
    eventType: 'STATUS_CHANGED',
    occurredAt,
    sourceId: occurredAt,
    fromStatus: null,
    toStatus,
    reason,
    visibility: 'PUBLIC',
    actorName: 'Suresh',
    actorRoleKey: 'WORKER',
    isMine: false,
    isSystem: false,
    attachmentId: null,
    attachmentKind: null,
    commentId: null,
  }) satisfies TimelineRow;

const photo = (id: string, kind: IssuePhoto['kind'], createdAt: string): IssuePhoto => ({
  id,
  kind,
  visibility: 'PUBLIC',
  width: null,
  height: null,
  createdAt,
  uploadedByName: null,
  uploadedByRoleKey: null,
  url: null,
});

describe('resolution summary', () => {
  it('uses the latest round of work only', () => {
    const timeline = [
      row('IN_PROGRESS', '2026-11-01T10:00:00Z'),
      row('RESOLVED', '2026-11-02T10:00:00Z', 'First try'),
      row('REOPENED', '2026-11-03T10:00:00Z', 'Still leaking'),
      row('IN_PROGRESS', '2026-11-04T10:00:00Z'),
      row('RESOLVED', '2026-11-05T10:00:00.000+00:00', 'Pipe replaced'),
    ];
    const photos = [
      photo('old', 'COMPLETION', '2026-11-02T09:59:00Z'),
      photo('report', 'INITIAL_EVIDENCE', '2026-10-30T10:00:00Z'),
      photo('new', 'COMPLETION', '2026-11-05T09:59:00Z'),
    ];
    const s = resolutionSummary(timeline, photos);
    expect(s.note).toBe('Pipe replaced');
    expect(s.resolvedByName).toBe('Suresh');
    expect(s.photos.map((p) => p.id)).toEqual(['new']);
  });

  it('copes with an issue that was never resolved', () => {
    const s = resolutionSummary([row('SUBMITTED', '2026-11-01T10:00:00Z')], []);
    expect(s).toEqual({ note: null, resolvedAt: null, resolvedByName: null, photos: [] });
  });
});
