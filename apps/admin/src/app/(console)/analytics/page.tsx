import type { Metadata } from 'next';
import Link from 'next/link';
import { FIX_TIME_GROUPS, type AnalyticsReport, type FixTimeGroup } from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { FixTimeChart, TrendChart } from '@/features/analytics/charts';
import { requireStaff } from '@/features/auth/staff-context';
import { BreakdownTable, StatTile } from '@/features/dashboard/parts';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Analytics' };

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [30, 90, 365] as const;
type RangeDays = (typeof RANGES)[number];

function parseRange(v: string | string[] | undefined): RangeDays | null {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : null;
}

const FIX_LABEL: Record<FixTimeGroup, string> = {
  under_1_day: 'Under 1 day',
  days_1_3: '1–3 days',
  days_3_7: '3–7 days',
  days_7_30: '7–30 days',
  over_30_days: 'Over 30 days',
};

const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}%`);

function periodLabel(iso: string, bucket: AnalyticsReport['bucket']) {
  const d = new Date(iso);
  return bucket === 'month'
    ? d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function hoursText(hours: number | null): string {
  if (hours === null) return '–';
  if (hours < 48) return `${Math.max(1, Math.round(hours))} h`;
  return `${Math.round(hours / 24)} d`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireStaff();
  if (!ctx.permissions.has('analytics.view')) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Analytics</h1>
        <Alert>Your role does not include analytics.</Alert>
      </div>
    );
  }
  const days = parseRange((await searchParams).range);
  const range = days ? { from: new Date(Date.now() - days * DAY_MS) } : undefined;
  const services = await getServerServices();
  const [report, byCategory, byDepartment] = await Promise.all([
    services.analytics.report(ctx.village.id, range),
    services.analytics.byCategory(ctx.village.id, range),
    services.analytics.byDepartment(ctx.village.id, range),
  ]);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Analytics</h1>
          <p className="text-sm text-neutral-600">
            {ctx.village.name} · {days ? `issues reported in the last ${days} days` : 'all time'}
          </p>
        </div>
        <nav aria-label="Date range" className="flex rounded-md border border-neutral-300 bg-white">
          {[...RANGES, null].map((d) => (
            <Link
              key={d ?? 'all'}
              href={d ? `/analytics?range=${d}` : '/analytics'}
              aria-current={d === days ? 'page' : undefined}
              className={`px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md ${
                d === days ? 'bg-brand-600 text-white' : 'text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {d ? (d === 365 ? '1 year' : `${d} days`) : 'All time'}
            </Link>
          ))}
        </nav>
      </div>

      {!report.ok ? (
        <Alert tone="error">Could not load analytics: {report.error.message}</Alert>
      ) : (
        <ReportSections report={report.value} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By category">
          {byCategory.ok ? (
            <BreakdownTable
              caption="Issues by category"
              emptyText="No categories yet."
              rows={byCategory.value.map((c) => ({
                key: c.categoryId,
                label: c.categoryName,
                total: c.total,
                open: c.open,
                closed: c.closed,
              }))}
            />
          ) : (
            <Alert tone="error">{byCategory.error.message}</Alert>
          )}
        </Card>
        <Card title="By department">
          {byDepartment.ok ? (
            <BreakdownTable
              caption="Issues by department"
              emptyText="No departments yet."
              extraHeading="Avg. time to fix"
              rows={byDepartment.value.map((d) => ({
                key: d.departmentId,
                label: d.departmentName,
                total: d.total,
                open: d.open,
                closed: d.closed,
                extra: hoursText(d.avgResolutionHours),
              }))}
            />
          ) : (
            <Alert tone="error">{byDepartment.error.message}</Alert>
          )}
        </Card>
      </div>

      <p className="text-xs text-neutral-600">
        How these are counted: every figure covers issues reported in the chosen range. Trend
        &quot;closed&quot; counts closings in each period. Time to fix runs from the report until it
        was finally marked solved, for closed issues. Reopened rate is the share of issues ever
        marked solved that were reopened at least once.
      </p>
    </div>
  );
}

function ReportSections({ report }: { report: AnalyticsReport }) {
  const trend = report.trend.map((p) => ({
    label: periodLabel(p.periodStart, report.bucket),
    reported: p.reported,
    closed: p.closed,
  }));
  const fix = FIX_TIME_GROUPS.map((g) => ({ label: FIX_LABEL[g], count: report.fixTime[g] }));
  const totalReported = trend.reduce((n, p) => n + p.reported, 0);
  const totalClosed = trend.reduce((n, p) => n + p.closed, 0);
  const totalFixed = fix.reduce((n, f) => n + f.count, 0);
  const per = report.bucket === 'month' ? 'month' : 'week';

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Reported" value={String(totalReported)} />
        <StatTile label="Closed" value={String(totalClosed)} />
        <StatTile
          label="Reopened rate"
          value={percent(report.reopened.rate)}
          hint={`${report.reopened.reopened} of ${report.reopened.everResolved} solved issues`}
        />
      </div>

      <Card title={`Reported and closed, per ${per}`}>
        {totalReported + totalClosed === 0 ? (
          <p className="text-sm text-neutral-600">No issues in this range.</p>
        ) : (
          <>
            <TrendChart data={trend} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-neutral-700">Show as a table</summary>
              <table className="mt-2 w-full max-w-md">
                <caption className="sr-only">Reported and closed per {per}</caption>
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs text-neutral-600">
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {per === 'month' ? 'Month' : 'Week of'}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      Reported
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Closed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((p) => (
                    <tr key={p.label} className="border-b border-neutral-100 last:border-0">
                      <th scope="row" className="py-1 pr-3 text-left font-normal">
                        {p.label}
                      </th>
                      <td className="py-1 pr-3 text-right tabular-nums">{p.reported}</td>
                      <td className="py-1 text-right tabular-nums">{p.closed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </Card>

      <Card title="Time to fix (closed issues)">
        {totalFixed === 0 ? (
          <p className="text-sm text-neutral-600">No closed issues in this range yet.</p>
        ) : (
          <>
            <FixTimeChart data={fix} />
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-700">
              {fix.map((f) => (
                <li key={f.label}>
                  {f.label}: <span className="tabular-nums text-neutral-900">{f.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
