import { err, ok, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { required, run, toAppError } from './errors';

/** Dashboard numbers for one village (definitions in docs/api.md §2). */
export interface DashboardStats {
  total: number;
  open: number;
  submitted: number;
  underReview: number;
  verified: number;
  assigned: number;
  inProgress: number;
  resolved: number;
  closed: number;
  reopened: number;
  rejected: number;
  duplicate: number;
  criticalOpen: number;
  awaitingReview: number;
  awaitingCitizen: number;
  /** 0–1, or null when there is nothing to measure yet. */
  resolutionRate: number | null;
  /** Hours from report to resolution, closed issues only. */
  avgResolutionHours: number | null;
}

export interface CategoryCount {
  categoryId: string;
  categoryKey: string;
  categoryName: string;
  total: number;
  open: number;
  closed: number;
}

export interface DepartmentCount {
  departmentId: string;
  departmentName: string;
  total: number;
  open: number;
  closed: number;
  avgResolutionHours: number | null;
}

/** Optional reporting window: issues created at or after `from` and before `to`. */
export interface DateRange {
  from?: Date | undefined;
  to?: Date | undefined;
}

/** One period of the trend chart (definitions approved 2026-11-20, docs/api.md §2). */
export interface TrendPoint {
  periodStart: string;
  reported: number;
  closed: number;
}

export const FIX_TIME_GROUPS = [
  'under_1_day',
  'days_1_3',
  'days_3_7',
  'days_7_30',
  'over_30_days',
] as const;
export type FixTimeGroup = (typeof FIX_TIME_GROUPS)[number];

export interface AnalyticsReport {
  from: string;
  to: string;
  bucket: 'week' | 'month';
  trend: TrendPoint[];
  /** Closed issues by time from report to final fix. */
  fixTime: Record<FixTimeGroup, number>;
  reopened: { everResolved: number; reopened: number; rate: number | null };
}

const count = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
};
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Validates the JSON returned by analytics_report. Exported for tests. */
export function parseAnalyticsReport(json: unknown): AnalyticsReport | null {
  const o = obj(json);
  if (!o) return null;
  const bucket = o.bucket;
  if (bucket !== 'week' && bucket !== 'month') return null;
  if (typeof o.from !== 'string' || typeof o.to !== 'string' || !Array.isArray(o.trend))
    return null;

  const trend: TrendPoint[] = [];
  for (const raw of o.trend) {
    const p = obj(raw);
    const reported = count(p?.reported);
    const closed = count(p?.closed);
    if (!p || typeof p.period_start !== 'string' || reported === null || closed === null)
      return null;
    trend.push({ periodStart: p.period_start, reported, closed });
  }

  const f = obj(o.fix_time);
  if (!f) return null;
  const fixTime = {} as Record<FixTimeGroup, number>;
  for (const g of FIX_TIME_GROUPS) {
    const n = count(f[g]);
    if (n === null) return null;
    fixTime[g] = n;
  }

  const r = obj(o.reopened);
  const everResolved = count(r?.ever_resolved);
  const reopened = count(r?.reopened);
  if (!r || everResolved === null || reopened === null) return null;

  return {
    from: o.from,
    to: o.to,
    bucket,
    trend,
    fixTime,
    reopened: { everResolved, reopened, rate: num(r.rate) },
  };
}

export interface AnalyticsService {
  /** Trend, time-to-fix groups and reopened rate for the Analytics page. */
  report(villageId: string, range?: DateRange): Promise<Result<AnalyticsReport>>;
  dashboard(villageId: string, range?: DateRange): Promise<Result<DashboardStats>>;
  byCategory(villageId: string, range?: DateRange): Promise<Result<CategoryCount[]>>;
  byDepartment(villageId: string, range?: DateRange): Promise<Result<DepartmentCount[]>>;
}

const COUNT_KEYS = {
  total: 'total',
  open: 'open',
  submitted: 'submitted',
  underReview: 'under_review',
  verified: 'verified',
  assigned: 'assigned',
  inProgress: 'in_progress',
  resolved: 'resolved',
  closed: 'closed',
  reopened: 'reopened',
  rejected: 'rejected',
  duplicate: 'duplicate',
  criticalOpen: 'critical_open',
  awaitingReview: 'awaiting_review',
  awaitingCitizen: 'awaiting_citizen',
} as const satisfies Partial<Record<keyof DashboardStats, string>>;

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Validates the JSON returned by dashboard_stats. Exported for tests. */
export function parseDashboardStats(json: unknown): DashboardStats | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const counts = {} as Record<keyof typeof COUNT_KEYS, number>;
  for (const [field, key] of Object.entries(COUNT_KEYS) as [keyof typeof COUNT_KEYS, string][]) {
    const n = num(o[key]);
    if (n === null || !Number.isInteger(n) || n < 0) return null;
    counts[field] = n;
  }
  return {
    ...counts,
    resolutionRate: num(o.resolution_rate),
    avgResolutionHours: num(o.avg_resolution_hours),
  };
}

function rangeArgs(range: DateRange | undefined): { p_from?: string; p_to?: string } {
  const args: { p_from?: string; p_to?: string } = {};
  if (range?.from) args.p_from = range.from.toISOString();
  if (range?.to) args.p_to = range.to.toISOString();
  return args;
}

export function createAnalyticsService(client: ManaClient): AnalyticsService {
  return {
    async report(villageId, range) {
      const res = await run(() =>
        client.rpc('analytics_report', { p_village_id: villageId, ...rangeArgs(range) }),
      );
      if (!res.ok) return res;
      const report = parseAnalyticsReport(res.value);
      return report ? ok(report) : err(toAppError({ message: 'unexpected analytics response' }));
    },

    async dashboard(villageId, range) {
      const res = await run(() =>
        client.rpc('dashboard_stats', { p_village_id: villageId, ...rangeArgs(range) }),
      );
      if (!res.ok) return res;
      const stats = parseDashboardStats(res.value);
      return stats ? ok(stats) : err(toAppError({ message: 'unexpected dashboard response' }));
    },

    async byCategory(villageId, range) {
      const res = required(
        await run(() =>
          client.rpc('issues_by_category', { p_village_id: villageId, ...rangeArgs(range) }),
        ),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((r) => ({
          categoryId: r.category_id,
          categoryKey: r.category_key,
          categoryName: r.category_name,
          total: Number(r.total),
          open: Number(r.open),
          closed: Number(r.closed),
        })),
      );
    },

    async byDepartment(villageId, range) {
      const res = required(
        await run(() =>
          client.rpc('issues_by_department', { p_village_id: villageId, ...rangeArgs(range) }),
        ),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((r) => ({
          departmentId: r.department_id,
          departmentName: r.department_name,
          total: Number(r.total),
          open: Number(r.open),
          closed: Number(r.closed),
          avgResolutionHours: num(r.avg_resolution_hours),
        })),
      );
    },
  };
}
