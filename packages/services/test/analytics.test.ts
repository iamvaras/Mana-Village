import { describe, expect, it } from 'vitest';
import { parseDashboardStats } from '../src/index';

const RAW = {
  total: 13,
  open: 9,
  submitted: 2,
  under_review: 1,
  verified: 1,
  assigned: 1,
  in_progress: 2,
  resolved: 1,
  closed: 2,
  reopened: 1,
  rejected: 1,
  duplicate: 1,
  critical_open: 2,
  awaiting_review: 3,
  awaiting_citizen: 1,
  resolution_rate: 0.1818,
  avg_resolution_hours: 0.5,
};

describe('parseDashboardStats', () => {
  it('maps the database JSON', () => {
    const s = parseDashboardStats(RAW);
    expect(s?.underReview).toBe(1);
    expect(s?.criticalOpen).toBe(2);
    expect(s?.resolutionRate).toBe(0.1818);
    expect(s?.avgResolutionHours).toBe(0.5);
  });
  it('allows empty rates', () => {
    const s = parseDashboardStats({ ...RAW, resolution_rate: null, avg_resolution_hours: null });
    expect(s?.resolutionRate).toBeNull();
    expect(s?.avgResolutionHours).toBeNull();
  });
  it('rejects malformed responses', () => {
    expect(parseDashboardStats(null)).toBeNull();
    expect(parseDashboardStats([])).toBeNull();
    expect(parseDashboardStats({ ...RAW, open: undefined })).toBeNull();
    expect(parseDashboardStats({ ...RAW, total: -1 })).toBeNull();
    expect(parseDashboardStats({ ...RAW, total: 'many' })).toBeNull();
  });
});
