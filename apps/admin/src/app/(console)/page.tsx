import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { requireStaff } from '@/features/auth/staff-context';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const ctx = await requireStaff();
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
    </div>
  );
}
