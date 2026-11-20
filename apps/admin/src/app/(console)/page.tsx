import type { Metadata } from 'next';
import Link from 'next/link';
import {
  DEFAULT_ISSUE_LIST_QUERY,
  REPORTED_WITHIN_DAYS,
  formatTimelineTime,
  issueListQueryToSearch,
  type IssueListQuery,
  type ReportedWithinDays,
} from '@mana/core';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requireStaff } from '@/features/auth/staff-context';
import { BreakdownTable, StatTile } from '@/features/dashboard/parts';
import { STATUS_LABEL, statusClass } from '@/features/issues/labels';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dashboard' };

const DAY_MS = 24 * 60 * 60 * 1000;

function parseWithin(v: string | string[] | undefined): ReportedWithinDays | null {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (REPORTED_WITHIN_DAYS as readonly number[]).includes(n) ? (n as ReportedWithinDays) : null;
}

const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}%`);

function hoursText(hours: number | null): string {
  if (hours === null) return '–';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireStaff();
  const within = parseWithin((await searchParams).within);
  const services = await getServerServices();
  const canSeeNumbers = ctx.permissions.has('analytics.view');
  const canListAll = ctx.permissions.has('issue.view_all');

  // The database checks analytics.view again; this only avoids a call that would fail.
  const range = within ? { from: new Date(Date.now() - within * DAY_MS) } : undefined;
  const [stats, byCategory, byDepartment, recent] = await Promise.all([
    canSeeNumbers ? services.analytics.dashboard(ctx.village.id, range) : null,
    canSeeNumbers ? services.analytics.byCategory(ctx.village.id, range) : null,
    canSeeNumbers ? services.analytics.byDepartment(ctx.village.id, range) : null,
    services.issueReads.listRecent(ctx.village.id, 10),
  ]);

  const issuesLink = (changes: Partial<IssueListQuery>) =>
    canListAll
      ? `/issues${issueListQueryToSearch(DEFAULT_ISSUE_LIST_QUERY, { withinDays: within, ...changes })}`
      : undefined;
  const rangeLabel = within ? `Reported in the last ${within} days` : 'All time';

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
          <p className="text-sm text-neutral-600">
            {ctx.village.name} · signed in as {ctx.roleLabels.join(', ')}
          </p>
        </div>
        {canSeeNumbers ? (
          <nav
            aria-label="Date range"
            className="flex rounded-md border border-neutral-300 bg-white"
          >
            {[null, ...REPORTED_WITHIN_DAYS].map((d) => (
              <Link
                key={d ?? 'all'}
                href={d ? `/?within=${d}` : '/'}
                aria-current={d === within ? 'page' : undefined}
                className={`px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md ${
                  d === within ? 'bg-brand-600 text-white' : 'text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                {d ? `${d} days` : 'All time'}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {!canSeeNumbers ? (
        <Alert>
          Your role does not include the dashboard numbers. Ask the secretary if you need them.
        </Alert>
      ) : !stats?.ok ? (
        <Alert tone="error">
          Could not load the dashboard numbers: {stats?.error.message ?? 'unknown error'}
        </Alert>
      ) : (
        <>
          <section aria-label="Issue counts">
            <h2 className="sr-only">Issue counts ({rangeLabel})</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <StatTile label="Total" value={String(stats.value.total)} href={issuesLink({})} />
              <StatTile
                label="Open"
                value={String(stats.value.open)}
                href={issuesLink({ view: 'open' })}
              />
              <StatTile
                label="Needs review"
                value={String(stats.value.awaitingReview)}
                hint={`${stats.value.submitted} new, ${stats.value.underReview} in review`}
                href={issuesLink({ view: 'needs_review' })}
              />
              <StatTile
                label="In progress"
                value={String(stats.value.inProgress)}
                hint={`${stats.value.verified + stats.value.assigned} waiting to start`}
                href={issuesLink({ status: 'IN_PROGRESS' })}
              />
              <StatTile
                label="Resolved"
                value={String(stats.value.resolved)}
                hint="Waiting for the resident"
                href={issuesLink({ view: 'awaiting_citizen' })}
              />
              <StatTile
                label="Closed"
                value={String(stats.value.closed)}
                href={issuesLink({ status: 'CLOSED' })}
              />
              <StatTile
                label="Critical"
                value={String(stats.value.criticalOpen)}
                hint="Open and critical"
                emphasis={stats.value.criticalOpen > 0}
                href={issuesLink({ view: 'critical' })}
              />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Pending">
              <dl className="flex flex-col gap-3 text-sm">
                {[
                  [
                    'Waiting for review',
                    stats.value.awaitingReview,
                    issuesLink({ view: 'needs_review' }),
                  ],
                  [
                    'Waiting for resident confirmation',
                    stats.value.awaitingCitizen,
                    issuesLink({ view: 'awaiting_citizen' }),
                  ],
                  ['Reopened by residents', stats.value.reopened, issuesLink({ view: 'reopened' })],
                ].map(([label, value, href]) => (
                  <div key={String(label)} className="flex items-center justify-between gap-3">
                    <dt className="text-neutral-700">
                      {href ? (
                        <Link href={String(href)} className="hover:underline">
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                    </dt>
                    <dd className="font-semibold tabular-nums text-neutral-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="Results">
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-neutral-700">Resolution rate</dt>
                  <dd className="font-semibold tabular-nums text-neutral-900">
                    {percent(stats.value.resolutionRate)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-neutral-700">Average time to resolve</dt>
                  <dd className="font-semibold tabular-nums text-neutral-900">
                    {hoursText(stats.value.avgResolutionHours)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-neutral-700">Rejected or duplicate</dt>
                  <dd className="font-semibold tabular-nums text-neutral-900">
                    {stats.value.rejected + stats.value.duplicate}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-neutral-500">
                Resolution rate counts issues closed out of all issues, leaving out rejected and
                duplicate reports. Time to resolve uses closed issues only.
              </p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="By department">
              {!byDepartment?.ok ? (
                <Alert tone="error">Could not load departments.</Alert>
              ) : (
                <BreakdownTable
                  caption="Issues by department"
                  emptyText="No departments yet."
                  extraHeading="Avg time"
                  rows={byDepartment.value.map((d) => ({
                    key: d.departmentId,
                    label: d.departmentName,
                    total: d.total,
                    open: d.open,
                    closed: d.closed,
                    extra: hoursText(d.avgResolutionHours),
                    ...(canListAll ? { href: issuesLink({ departmentId: d.departmentId }) } : {}),
                  }))}
                />
              )}
            </Card>
            <Card title="By category">
              {!byCategory?.ok ? (
                <Alert tone="error">Could not load categories.</Alert>
              ) : (
                <BreakdownTable
                  caption="Issues by category"
                  emptyText="No categories yet."
                  rows={byCategory.value
                    .filter((c) => c.total > 0)
                    .map((c) => ({
                      key: c.categoryId,
                      label: c.categoryName,
                      total: c.total,
                      open: c.open,
                      closed: c.closed,
                      ...(canListAll ? { href: issuesLink({ categoryId: c.categoryId }) } : {}),
                    }))}
                />
              )}
            </Card>
          </div>
        </>
      )}

      <Card title="Latest reports">
        {!recent.ok ? (
          <Alert tone="error">Could not load reports: {recent.error.message}</Alert>
        ) : recent.value.length === 0 ? (
          <p className="text-sm text-neutral-500">No reports in this village yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {recent.value.map((i) => (
              <li key={i.id}>
                <Link
                  href={`/issues/${i.id}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-neutral-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {i.title}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {i.issueNumber} · {i.categoryName} · {formatTimelineTime(i.createdAt)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(i.status)}`}
                  >
                    {STATUS_LABEL[i.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
