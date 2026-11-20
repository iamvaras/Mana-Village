import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requireStaff } from '@/features/auth/staff-context';
import { AddWorkerForm, RemoveWorkerButton } from '@/features/workers/worker-forms';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Workers' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireStaff();
  if (!ctx.permissions.has('role.assign_worker')) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Workers</h1>
        <Alert>Your role does not include managing workers. The secretary manages them.</Alert>
      </div>
    );
  }
  const raw = (await searchParams).department;
  const departmentId = typeof raw === 'string' && UUID.test(raw) ? raw.toLowerCase() : undefined;
  const services = await getServerServices();
  const [departments, workers] = await Promise.all([
    services.departments.list(ctx.village.id),
    services.departments.listWorkers(ctx.village.id, departmentId),
  ]);
  const active = departments.ok ? departments.value.filter((d) => d.isActive) : [];
  const chosen = departments.ok ? departments.value.find((d) => d.id === departmentId) : undefined;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Workers</h1>
        <p className="text-sm text-neutral-600">
          {ctx.village.name}. Workers use the mobile app to accept and complete their issues. Phone
          numbers are not shown here.
        </p>
      </div>

      <Card title="Add a worker">
        {!departments.ok ? (
          <Alert tone="error">Could not load departments: {departments.error.message}</Alert>
        ) : (
          <AddWorkerForm
            villageId={ctx.village.id}
            departments={active.map((d) => ({ id: d.id, name: d.name }))}
            defaultDepartmentId={chosen?.isActive ? chosen.id : undefined}
          />
        )}
      </Card>

      <Card title={chosen ? `Workers in ${chosen.name}` : 'All workers'}>
        {departments.ok && departments.value.length > 0 ? (
          <nav aria-label="Department" className="mb-4 flex flex-wrap gap-2">
            {[{ id: undefined, name: 'All' }, ...departments.value].map((d) => (
              <Link
                key={d.id ?? 'all'}
                href={d.id ? `/workers?department=${d.id}` : '/workers'}
                aria-current={d.id === departmentId ? 'page' : undefined}
                className={`rounded-full border px-3 py-1 text-sm ${
                  d.id === departmentId
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                {d.name}
              </Link>
            ))}
          </nav>
        ) : null}
        {!workers.ok ? (
          <Alert tone="error">Could not load workers: {workers.error.message}</Alert>
        ) : workers.value.length === 0 ? (
          <p className="text-sm text-neutral-600">No workers yet. Add one above.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {workers.value.map((w) => (
              <li
                key={w.userRoleId}
                className="flex flex-wrap items-start justify-between gap-4 py-3"
              >
                <div>
                  <p className="font-medium text-neutral-900">
                    {w.fullName}
                    {w.status !== 'ACTIVE' ? (
                      <span className="ml-2 rounded bg-neutral-100 px-1.5 text-xs font-normal text-neutral-600">
                        {w.status === 'SUSPENDED' ? 'Suspended' : 'Account removed'}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-neutral-600">
                    {w.departmentName} · {w.openAssignments} open · {w.completedAssignments}{' '}
                    completed
                  </p>
                </div>
                <RemoveWorkerButton
                  userRoleId={w.userRoleId}
                  name={w.displayName ?? w.fullName}
                  openAssignments={w.openAssignments}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
