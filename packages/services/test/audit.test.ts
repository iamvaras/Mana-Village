import { describe, expect, it } from 'vitest';
import { auditActionLabel, auditChanges, isAuditArea, parseAnalyticsReport } from '../src/index';

describe('auditChanges', () => {
  it('lists only fields that changed, without bookkeeping columns', () => {
    expect(
      auditChanges(
        { title: 'Old', is_pinned: false, updated_at: '1', body: 'Same' },
        { title: 'New', is_pinned: true, updated_at: '2', body: 'Same' },
      ),
    ).toEqual([
      { field: 'is_pinned', before: false, after: true },
      { field: 'title', before: 'Old', after: 'New' },
    ]);
  });

  it('treats a created row as all new fields', () => {
    expect(auditChanges(null, { name: 'Water' })).toEqual([
      { field: 'name', before: undefined, after: 'Water' },
    ]);
  });

  it('compares nested values by content', () => {
    expect(auditChanges({ s: { a: 1 } }, { s: { a: 1 } })).toEqual([]);
  });
});

describe('audit labels and areas', () => {
  it('turns an action key into words', () => {
    expect(auditActionLabel('issue.priority_changed')).toBe('Issue: priority changed');
  });
  it('accepts only known areas', () => {
    expect(isAuditArea('config')).toBe(true);
    expect(isAuditArea('secrets')).toBe(false);
  });
});

describe('parseAnalyticsReport', () => {
  const good = {
    from: '2026-10-01T00:00:00Z',
    to: '2026-11-20T00:00:00Z',
    bucket: 'week',
    trend: [{ period_start: '2026-10-01T00:00:00Z', reported: 3, closed: 1 }],
    fix_time: { under_1_day: 1, days_1_3: 0, days_3_7: 2, days_7_30: 0, over_30_days: 0 },
    reopened: { ever_resolved: 4, reopened: 1, rate: 0.25 },
  };
  it('reads a valid report', () => {
    const r = parseAnalyticsReport(good);
    expect(r?.trend[0]).toEqual({ periodStart: '2026-10-01T00:00:00Z', reported: 3, closed: 1 });
    expect(r?.fixTime.days_3_7).toBe(2);
    expect(r?.reopened).toEqual({ everResolved: 4, reopened: 1, rate: 0.25 });
  });
  it('allows no rate when nothing was ever solved', () => {
    expect(
      parseAnalyticsReport({ ...good, reopened: { ever_resolved: 0, reopened: 0, rate: null } })
        ?.reopened.rate,
    ).toBeNull();
  });
  it('rejects a broken report', () => {
    expect(parseAnalyticsReport({ ...good, bucket: 'day' })).toBeNull();
    expect(parseAnalyticsReport({ ...good, fix_time: { under_1_day: -1 } })).toBeNull();
    expect(parseAnalyticsReport(null)).toBeNull();
  });
});
