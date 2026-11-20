import type { Metadata } from 'next';
import Link from 'next/link';
import {
  auditActionLabel,
  auditChanges,
  isAuditArea,
  type AuditArea,
  type AuditEntry,
  type AuditFilter,
  type Json,
} from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requireStaff } from '@/features/auth/staff-context';
import { ROLE_LABEL } from '@/features/issues/labels';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Audit Logs' };

const PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const AREA_LABEL: Record<AuditArea, string> = {
  issue: 'Issue actions',
  user: 'People and roles',
  content: 'Hidden comments and photos',
  config: 'Village set-up (departments, categories, announcements)',
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Dates are picked as India calendar days; `to` includes the whole day. */
function readFilter(p: Params) {
  const area = one(p.area);
  const actor = one(p.actor);
  const entity = one(p.entity);
  const from = one(p.from);
  const to = one(p.to);
  const before = Number(one(p.before));
  const filter: AuditFilter = { limit: PAGE_SIZE };
  if (isAuditArea(area)) filter.area = area;
  if (UUID.test(actor)) filter.actorId = actor;
  if (UUID.test(entity)) filter.entityId = entity;
  if (DATE.test(from)) filter.from = new Date(`${from}T00:00:00+05:30`);
  if (DATE.test(to)) filter.to = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + DAY_MS);
  if (Number.isInteger(before) && before > 0) filter.beforeId = before;
  return {
    filter,
    form: {
      area: filter.area ?? '',
      actor: filter.actorId ?? '',
      entity: filter.entityId ?? '',
      from: DATE.test(from) ? from : '',
      to: DATE.test(to) ? to : '',
    },
  };
}

function href(form: Record<string, string>, changes: Record<string, string>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...form, ...changes })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/audit-logs?${s}` : '/audit-logs';
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

function valueText(v: Json | undefined): string {
  if (v === undefined || v === null) return '–';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await requireStaff();
  if (!ctx.permissions.has('audit.view')) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Audit Logs</h1>
        <Alert>Your role does not include the audit log.</Alert>
      </div>
    );
  }
  const { filter, form } = readFilter(await searchParams);
  const list = await (await getServerServices()).audit.list(ctx.village.id, filter);
  const filtered = Object.values(form).some(Boolean) || filter.beforeId !== undefined;
  const last = list.ok ? list.value[list.value.length - 1] : undefined;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Audit Logs</h1>
        <p className="text-sm text-neutral-600">
          {ctx.village.name}. Every important action by staff and the system, newest first. This
          record cannot be changed or deleted.
        </p>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-800">What</span>
            <select
              name="area"
              defaultValue={form.area}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1.5"
            >
              <option value="">Everything</option>
              {(Object.keys(AREA_LABEL) as AuditArea[]).map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-800">From</span>
            <input
              type="date"
              name="from"
              defaultValue={form.from}
              className="rounded-md border border-neutral-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-800">To</span>
            <input
              type="date"
              name="to"
              defaultValue={form.to}
              className="rounded-md border border-neutral-300 px-2 py-1"
            />
          </label>
          {form.actor ? <input type="hidden" name="actor" value={form.actor} /> : null}
          {form.entity ? <input type="hidden" name="entity" value={form.entity} /> : null}
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700"
          >
            Show
          </button>
          {filtered ? (
            <Link href="/audit-logs" className="py-1.5 text-brand-700 hover:underline">
              Clear filters
            </Link>
          ) : null}
        </form>
        {form.actor || form.entity ? (
          <p className="mt-3 text-sm text-neutral-700">
            {form.actor ? 'Showing one person’s actions. ' : ''}
            {form.entity ? 'Showing one item’s history. ' : ''}
            <Link
              href={href(form, { actor: '', entity: '' })}
              className="text-brand-700 hover:underline"
            >
              Show everyone
            </Link>
          </p>
        ) : null}
      </Card>

      {!list.ok ? (
        <Alert tone="error">Could not load the audit log: {list.error.message}</Alert>
      ) : list.value.length === 0 ? (
        <Alert>
          {filtered ? 'Nothing matches these filters.' : 'Nothing has been recorded yet.'}
        </Alert>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <caption className="sr-only">Audit log entries, newest first</caption>
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th scope="col" className="py-2 pr-3 font-medium">
                  When
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Who
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Action
                </th>
                <th scope="col" className="py-2 font-medium">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {list.value.map((e) => (
                <Row key={e.id} e={e} form={form} />
              ))}
            </tbody>
          </table>
          {last && list.value.length === PAGE_SIZE ? (
            <div className="mt-4 flex justify-end">
              <Link
                href={href(form, { before: String(last.id) })}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
              >
                Older entries
              </Link>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}

function Row({ e, form }: { e: AuditEntry; form: Record<string, string> }) {
  const changes = auditChanges(e.before, e.after);
  const reason =
    typeof e.metadata === 'object' && e.metadata !== null && !Array.isArray(e.metadata)
      ? e.metadata['reason']
      : undefined;
  const role = e.actorRoleKey ? (ROLE_LABEL[e.actorRoleKey] ?? e.actorRoleKey) : null;

  return (
    <tr className="border-b border-neutral-100 align-top last:border-0">
      <td className="whitespace-nowrap py-2 pr-3 text-neutral-700">{when(e.occurredAt)}</td>
      <td className="py-2 pr-3">
        {e.actorUserId ? (
          <Link
            href={href(form, { actor: e.actorUserId, before: '' })}
            className="text-neutral-900 hover:underline"
          >
            {e.actorName ?? 'Deleted account'}
          </Link>
        ) : (
          <span className="text-neutral-700">System</span>
        )}
        {role ? <span className="block text-xs text-neutral-500">{role}</span> : null}
      </td>
      <td className="py-2 pr-3 text-neutral-900">
        {auditActionLabel(e.action)}
        {e.entityId ? (
          <span className="block text-xs">
            {e.entityType === 'issue' ? (
              <Link href={`/issues/${e.entityId}`} className="text-brand-700 hover:underline">
                {e.issueNumber ?? 'Open issue'}
              </Link>
            ) : null}
            {UUID.test(e.entityId) ? (
              <Link
                href={href(form, { entity: e.entityId, before: '' })}
                className="ml-2 text-neutral-500 hover:underline"
              >
                history
              </Link>
            ) : null}
          </span>
        ) : null}
      </td>
      <td className="py-2">
        {typeof reason === 'string' && reason ? (
          <p className="text-neutral-700">Reason: {reason}</p>
        ) : null}
        {changes.length === 0 ? (
          reason ? null : (
            <span className="text-neutral-400">–</span>
          )
        ) : (
          <details>
            <summary className="cursor-pointer text-neutral-700">
              {changes.length === 1 ? '1 change' : `${changes.length} changes`}
            </summary>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th scope="col" className="pr-2 font-medium">
                    Field
                  </th>
                  <th scope="col" className="pr-2 font-medium">
                    Before
                  </th>
                  <th scope="col" className="font-medium">
                    After
                  </th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.field} className="align-top">
                    <th scope="row" className="pr-2 text-left font-normal text-neutral-600">
                      {c.field.replace(/_/g, ' ')}
                    </th>
                    <td className="max-w-xs break-words pr-2 text-red-800">
                      {valueText(c.before)}
                    </td>
                    <td className="max-w-xs break-words text-green-800">{valueText(c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </td>
    </tr>
  );
}
