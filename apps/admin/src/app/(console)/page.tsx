import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { formatTimelineTime } from '@mana/core';
import { Alert } from '@/components/ui/alert';
import { requireStaff } from '@/features/auth/staff-context';
import { STATUS_LABEL, statusClass } from '@/features/issues/labels';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const ctx = await requireStaff();
  const recent = await (await getServerServices()).issueReads.listRecent(ctx.village.id, 10);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
      <Card title={`Welcome, ${ctx.fullName}`}>
        <p className="text-sm text-neutral-700">
          You are signed in to <strong>{ctx.village.name}</strong> as {ctx.roleLabels.join(', ')}.
          Issue counts and charts will appear here once the issue screens are built.
        </p>
        <p className="mt-3 text-sm text-neutral-500">
          You have {ctx.permissions.size} permissions in this village.
        </p>
      </Card>
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
