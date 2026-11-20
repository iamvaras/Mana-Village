'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DepartmentSummary } from '@mana/services';
import { Button } from '@/components/ui/button';
import { getBrowserServices } from '@/lib/supabase/browser';
import { DepartmentForm } from './department-form';

/** Edit and deactivate/reactivate controls for one department row. */
export function DepartmentRowActions({
  villageId,
  department,
}: {
  villageId: string;
  department: DepartmentSummary;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await getBrowserServices().departments.setActive(
      department.id,
      !department.isActive,
    );
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <DepartmentForm
          villageId={villageId}
          initial={{
            id: department.id,
            name: department.name,
            nameLocal: department.nameLocal ?? '',
            description: department.description ?? '',
          }}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button type="button" variant="ghost" busy={busy} onClick={() => void toggle()}>
          {department.isActive ? 'Deactivate' : 'Reactivate'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="max-w-xs text-right text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
