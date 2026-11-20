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

export interface AnalyticsService {
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
