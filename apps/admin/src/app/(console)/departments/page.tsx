import type { Metadata } from 'next';
import Link from 'next/link';
import { DEFAULT_ISSUE_LIST_QUERY, issueListQueryToSearch } from '@mana/core';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requireStaff } from '@/features/auth/staff-context';
import { DepartmentForm } from '@/features/departments/department-form';
import { DepartmentRowActions } from '@/features/departments/department-row-actions';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Departments' };

export default async function DepartmentsPage() {
  const ctx = await requireStaff();
  if (!ctx.permissions.has('department.manage')) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Departments</h1>
        <Alert>Your role does not include managing departments. The secretary manages them.</Alert>
      </div>
    );
  }
  const list = await (await getServerServices()).departments.list(ctx.village.id);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Departments</h1>
        <p className="text-sm text-neutral-600">
          {ctx.village.name}. Issues are assigned to a department, and optionally to one of its
          workers.
        </p>
      </div>

      <Card title="Add a department">
        <DepartmentForm villageId={ctx.village.id} />
      </Card>

      <Card title="All departments">
        {!list.ok ? (
          <Alert tone="error">Could not load departments: {list.error.message}</Alert>
        ) : list.value.length === 0 ? (
          <p className="text-sm text-neutral-600">No departments yet. Add the first one above.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {list.value.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">
                    {d.name}
                    {d.nameLocal ? (
                      <span className="ml-2 font-normal text-neutral-500">{d.nameLocal}</span>
                    ) : null}
                    {!d.isActive ? (
                      <span className="ml-2 rounded bg-neutral-100 px-1.5 text-xs font-normal text-neutral-600">
                        Inactive
                      </span>
                    ) : null}
                  </p>
                  {d.description ? (
                    <p className="text-sm text-neutral-600">{d.description}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-neutral-600">
                    <Link href={`/workers?department=${d.id}`} className="hover:underline">
                      {d.workerCount} {d.workerCount === 1 ? 'worker' : 'workers'}
                    </Link>
                    {' · '}
                    <Link
                      href={`/issues${issueListQueryToSearch(DEFAULT_ISSUE_LIST_QUERY, { view: 'open', departmentId: d.id })}`}
                      className="hover:underline"
                    >
                      {d.openIssueCount} open {d.openIssueCount === 1 ? 'issue' : 'issues'}
                    </Link>
                  </p>
                </div>
                <DepartmentRowActions villageId={ctx.village.id} department={d} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
