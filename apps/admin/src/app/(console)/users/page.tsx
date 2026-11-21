import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requireStaff } from '@/features/auth/staff-context';
import { ROLE_LABEL } from '@/features/issues/labels';
import { UserActions } from '@/features/users/user-actions';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Users' };

const PAGE_SIZE = 50;
const ROLE_FILTERS = ['CITIZEN', 'WORKER', 'SECRETARY', 'PRESIDENT', 'VICE_PRESIDENT'] as const;
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const STATUS_CLASS = {
  ACTIVE: 'bg-green-50 text-green-800',
  SUSPENDED: 'bg-amber-50 text-amber-800',
  DELETED: 'bg-neutral-100 text-neutral-600',
} as const;
const STATUS_LABEL = { ACTIVE: 'Active', SUSPENDED: 'Suspended', DELETED: 'Deleted' } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await requireStaff();
  const canStatus = ctx.permissions.has('user.manage');
  const canWorker = ctx.permissions.has('role.assign_worker');
  const canAdmin = ctx.permissions.has('role.assign_admin');
  if (!canStatus && !canWorker && !canAdmin) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Users</h1>
        <Alert>Your role does not include managing people. The secretary manages them.</Alert>
      </div>
    );
  }

  const p = await searchParams;
  const search = one(p.q).trim().slice(0, 100);
  const roleRaw = one(p.role);
  const role = (ROLE_FILTERS as readonly string[]).includes(roleRaw) ? roleRaw : '';
  const page = Math.max(0, Math.min(1000, Math.floor(Number(one(p.page)) || 0)));
  const grantable = [
    ...(canWorker ? ['WORKER'] : []),
    ...(canAdmin ? ['SECRETARY', 'PRESIDENT', 'VICE_PRESIDENT'] : []),
  ];

  const services = await getServerServices();
  const [users, departments] = await Promise.all([
    services.admin.listUsers({
      villageId: ctx.village.id,
      ...(search ? { search } : {}),
      ...(role ? { roleKey: role } : {}),
      limit: PAGE_SIZE + 1,
      offset: page * PAGE_SIZE,
    }),
    canWorker ? services.departments.list(ctx.village.id) : null,
  ]);
  const activeDepartments =
    departments?.ok === true
      ? departments.value.filter((d) => d.isActive).map((d) => ({ id: d.id, name: d.name }))
      : [];
  const rows = users.ok ? users.value.slice(0, PAGE_SIZE) : [];
  const hasMore = users.ok && users.value.length > PAGE_SIZE;
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    if (search) q.set('q', search);
    if (role) q.set('role', role);
    if (n > 0) q.set('page', String(n));
    const s = q.toString();
    return s ? `/users?${s}` : '/users';
  };

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Users</h1>
        <p className="text-sm text-neutral-600">
          {ctx.village.name}. Residents and staff of this village. Phone numbers are not shown here.
          Every change needs a reason and is kept in the audit log.
        </p>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-800">Name</span>
            <input
              type="search"
              name="q"
              defaultValue={search}
              maxLength={100}
              placeholder="Search by name"
              className="h-9 w-64 rounded-md border border-neutral-300 px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-800">Role</span>
            <select
              name="role"
              defaultValue={role}
              className="h-9 rounded-md border border-neutral-300 bg-white px-2"
            >
              <option value="">Everyone</option>
              {ROLE_FILTERS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-9 rounded-md bg-brand-600 px-3 font-medium text-white hover:bg-brand-700"
          >
            Search
          </button>
          {search || role ? (
            <Link href="/users" className="py-2 text-brand-700 hover:underline">
              Clear
            </Link>
          ) : null}
        </form>
      </Card>

      {!users.ok ? (
        <Alert tone="error">Could not load people: {users.error.message}</Alert>
      ) : rows.length === 0 ? (
        <Alert>{search || role ? 'Nobody matches this search.' : 'Nobody has joined yet.'}</Alert>
      ) : (
        <Card>
          <ul className="flex flex-col divide-y divide-neutral-100">
            {rows.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 py-4 md:flex-row md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">
                    {u.fullName}
                    {u.id === ctx.userId ? (
                      <span className="ml-2 text-sm font-normal text-neutral-600">(you)</span>
                    ) : null}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[u.status]}`}
                    >
                      {STATUS_LABEL[u.status]}
                    </span>
                  </p>
                  <p className="text-sm text-neutral-600">
                    {u.roles.map((r) => ROLE_LABEL[r.role] ?? r.role).join(', ') || 'No role'}
                  </p>
                  <p className="text-xs text-neutral-600">
                    Joined{' '}
                    {new Date(u.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                {u.id === ctx.userId ? null : (
                  <UserActions
                    user={u}
                    villageId={ctx.village.id}
                    grantable={grantable}
                    canManageStatus={canStatus}
                    departments={activeDepartments}
                  />
                )}
              </li>
            ))}
          </ul>
          {page > 0 || hasMore ? (
            <div className="mt-4 flex justify-between">
              {page > 0 ? (
                <Link href={pageHref(page - 1)} className="text-sm text-brand-700 hover:underline">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              {hasMore ? (
                <Link href={pageHref(page + 1)} className="text-sm text-brand-700 hover:underline">
                  Next
                </Link>
              ) : null}
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
