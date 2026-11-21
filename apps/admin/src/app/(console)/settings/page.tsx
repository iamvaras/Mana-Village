import type { Metadata } from 'next';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requireStaff } from '@/features/auth/staff-context';
import { PermissionEditor } from '@/features/settings/permission-editor';
import { VillageSettingsForm } from '@/features/settings/village-settings-form';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const ctx = await requireStaff();
  const canSettings = ctx.permissions.has('settings.manage');
  const canPermissions = ctx.permissions.has('permission.manage');
  if (!canSettings && !canPermissions) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Settings</h1>
        <Alert>Your role does not include changing settings. The secretary manages them.</Alert>
      </div>
    );
  }
  const services = await getServerServices();
  const [settings, matrix] = await Promise.all([
    canSettings ? services.settings.getVillageSettings(ctx.village.id) : null,
    canPermissions ? services.settings.getPermissionMatrix() : null,
  ]);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-600">Every change is recorded in the audit log.</p>
      </div>

      {settings ? (
        <Card title={`${ctx.village.name} settings`}>
          {settings.ok ? (
            <VillageSettingsForm villageId={ctx.village.id} initial={settings.value} />
          ) : (
            <Alert tone="error">Could not load settings: {settings.error.message}</Alert>
          )}
        </Card>
      ) : null}

      {matrix ? (
        <Card title="Role permissions">
          {matrix.ok ? (
            <PermissionEditor matrix={matrix.value} />
          ) : (
            <Alert tone="error">Could not load roles: {matrix.error.message}</Alert>
          )}
        </Card>
      ) : null}
    </div>
  );
}
