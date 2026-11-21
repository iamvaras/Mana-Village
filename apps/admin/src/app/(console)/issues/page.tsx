import type { Metadata } from 'next';
import Link from 'next/link';
import {
  DEFAULT_ISSUE_LIST_QUERY,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  REPORTED_WITHIN_DAYS,
  hasExtraFilters,
  issueListQueryToSearch,
  pageCount,
  parseIssueListQuery,
  type IssueListSort,
  type IssueListView,
} from '@mana/core';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requireStaff } from '@/features/auth/staff-context';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  ageText,
  priorityClass,
  statusClass,
} from '@/features/issues/labels';
import { LiveRefresh } from '@/features/issues/live-refresh';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'All Issues' };

const VIEWS: readonly { view: IssueListView; label: string }[] = [
  { view: 'all', label: 'All' },
  { view: 'open', label: 'Open' },
  { view: 'needs_review', label: 'Needs review' },
  { view: 'critical', label: 'Critical' },
  { view: 'reopened', label: 'Reopened' },
  { view: 'awaiting_citizen', label: 'Waiting for resident' },
];

const SORTS: readonly { sort: IssueListSort; label: string }[] = [
  { sort: 'newest', label: 'Newest first' },
  { sort: 'oldest', label: 'Oldest first' },
  { sort: 'updated', label: 'Recently updated' },
  { sort: 'priority', label: 'Highest priority' },
  { sort: 'affected', label: 'Most affected' },
];

const selectClass = 'h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm';

export default async function AllIssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireStaff();
  if (!ctx.permissions.has('issue.view_all')) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">All Issues</h1>
        <Alert>Your role does not include the full issue list for {ctx.village.name}.</Alert>
      </div>
    );
  }

  const query = parseIssueListQuery(await searchParams);
  const services = await getServerServices();
  const [page, categories, departments] = await Promise.all([
    services.issueList.list(ctx.village.id, query),
    services.issues.listCategories(),
    services.issueList.listDepartments(ctx.village.id),
  ]);
  const now = new Date();
  const pages = page.ok ? pageCount(page.value.total, page.value.pageSize) : 1;
  const filtered = hasExtraFilters(query);

  return (
    <div className="flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">All Issues</h1>
          <p className="text-sm text-neutral-600">{ctx.village.name}</p>
        </div>
        <LiveRefresh villageId={ctx.village.id} />
      </div>

      <nav aria-label="Saved views" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.view}
            href={`/issues${issueListQueryToSearch(DEFAULT_ISSUE_LIST_QUERY, { view: v.view })}`}
            aria-current={query.view === v.view ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              query.view === v.view
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <Card>
        <form
          method="get"
          action="/issues"
          className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8"
        >
          {query.view !== 'all' ? <input type="hidden" name="view" value={query.view} /> : null}
          <div className="col-span-2">
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-neutral-600">
              Search title or number
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query.search}
              maxLength={80}
              placeholder="e.g. street light or RMP-2026-00005"
              className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="status" className="mb-1 block text-xs font-medium text-neutral-600">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={query.status ?? ''}
              className={selectClass}
            >
              <option value="">Any</option>
              {ISSUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="priority" className="mb-1 block text-xs font-medium text-neutral-600">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              defaultValue={query.priority ?? ''}
              className={selectClass}
            >
              <option value="">Any</option>
              {ISSUE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="category" className="mb-1 block text-xs font-medium text-neutral-600">
              Category
            </label>
            <select
              id="category"
              name="category"
              defaultValue={query.categoryId ?? ''}
              className={selectClass}
            >
              <option value="">Any</option>
              {categories.ok
                ? categories.value.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                : null}
            </select>
          </div>
          <div>
            <label htmlFor="department" className="mb-1 block text-xs font-medium text-neutral-600">
              Department
            </label>
            <select
              id="department"
              name="department"
              defaultValue={query.departmentId ?? ''}
              className={selectClass}
            >
              <option value="">Any</option>
              {departments.ok
                ? departments.value.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))
                : null}
            </select>
          </div>
          <div>
            <label htmlFor="within" className="mb-1 block text-xs font-medium text-neutral-600">
              Reported
            </label>
            <select
              id="within"
              name="within"
              defaultValue={query.withinDays ?? ''}
              className={selectClass}
            >
              <option value="">Any time</option>
              {REPORTED_WITHIN_DAYS.map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="mb-1 block text-xs font-medium text-neutral-600">
              Sort
            </label>
            <select id="sort" name="sort" defaultValue={query.sort} className={selectClass}>
              {SORTS.map((s) => (
                <option key={s.sort} value={s.sort}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-4 md:col-span-4 xl:col-span-8">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                name="supported"
                value="1"
                defaultChecked={query.hasSupporters}
              />
              Only issues other residents also reported
            </label>
            <span className="flex-1" />
            {filtered ? (
              <Link
                href={`/issues${issueListQueryToSearch(DEFAULT_ISSUE_LIST_QUERY, { view: query.view })}`}
                className="text-sm text-neutral-600 hover:underline"
              >
                Clear filters
              </Link>
            ) : null}
            <button
              type="submit"
              className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              Apply
            </button>
          </div>
        </form>
        {!categories.ok || !departments.ok ? (
          <p className="mt-3 text-xs text-red-700">
            Some filter choices could not be loaded. Reload the page to try again.
          </p>
        ) : null}
      </Card>

      {!page.ok ? (
        <Alert tone="error">Could not load issues: {page.error.message}</Alert>
      ) : page.value.rows.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">
            {page.value.total > 0
              ? 'There are no issues on this page.'
              : filtered || query.view !== 'all'
                ? 'No issues match these filters.'
                : `No issues have been reported in ${ctx.village.name} yet.`}
          </p>
        </Card>
      ) : (
        <>
          <p className="text-sm text-neutral-600" aria-live="polite">
            {page.value.total} {page.value.total === 1 ? 'issue' : 'issues'}
            {pages > 1 ? ` · page ${page.value.page} of ${pages}` : ''}
          </p>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
            <table className="w-full min-w-[960px] text-sm">
              <caption className="sr-only">Issues in {ctx.village.name}</caption>
              <thead className="bg-neutral-50">
                <tr className="text-left text-xs text-neutral-600">
                  {[
                    'Number',
                    'Title',
                    'Category',
                    'Status',
                    'Priority',
                    'Department',
                    'Assignee',
                    'Affected',
                    'Age',
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={`px-3 py-2 font-medium ${h === 'Affected' || h === 'Age' ? 'text-right' : ''}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.value.rows.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-neutral-600">
                      {r.issueNumber}
                    </td>
                    <td className="max-w-xs px-3 py-2">
                      <Link
                        href={`/issues/${r.id}`}
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        {r.title}
                      </Link>
                      {r.visibility === 'PRIVATE' ? (
                        <span className="ml-2 rounded bg-neutral-100 px-1.5 text-xs text-neutral-600">
                          Private
                        </span>
                      ) : null}
                      {r.reopenCount > 0 ? (
                        <span className="ml-2 text-xs text-orange-800">
                          Reopened ×{r.reopenCount}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-neutral-700">{r.categoryName}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(r.status)}`}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className={`px-3 py-2 ${priorityClass(r.priority)}`}>
                      {PRIORITY_LABEL[r.priority]}
                    </td>
                    <td className="px-3 py-2 text-neutral-700">{r.departmentName ?? '–'}</td>
                    <td className="px-3 py-2 text-neutral-700">{r.assigneeName ?? '–'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {r.supporterCount + 1}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-600"
                      title={new Date(r.createdAt).toLocaleString()}
                    >
                      {ageText(r.createdAt, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center justify-between text-sm">
              {query.page > 1 ? (
                <Link
                  href={`/issues${issueListQueryToSearch(query, { page: query.page - 1 })}`}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-50"
                >
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              {query.page < pages ? (
                <Link
                  href={`/issues${issueListQueryToSearch(query, { page: query.page + 1 })}`}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-50"
                >
                  Next →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
      <p className="text-xs text-neutral-600">
        “Affected” counts the reporter plus residents who said they have the same problem.
      </p>
    </div>
  );
}
