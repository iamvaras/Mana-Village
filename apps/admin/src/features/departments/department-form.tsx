'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { getBrowserServices } from '@/lib/supabase/browser';

export interface DepartmentFormValues {
  id?: string;
  name: string;
  nameLocal: string;
  description: string;
}

/** Create a department, or edit one when `initial.id` is set. */
export function DepartmentForm({
  villageId,
  initial,
  onDone,
}: {
  villageId: string;
  initial?: DepartmentFormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<DepartmentFormValues>(
    initial ?? { name: '', nameLocal: '', description: '' },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const editing = Boolean(initial?.id);
  const prefix = initial?.id ? `dept-${initial.id}` : 'dept-new';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const res = await getBrowserServices().departments.save(
      villageId,
      { name: values.name, nameLocal: values.nameLocal, description: values.description },
      initial?.id,
    );
    setBusy(false);
    if (!res.ok) {
      setFields(res.error.fields ?? {});
      setError(res.error.fields ? null : res.error.message);
      return;
    }
    if (!editing) setValues({ name: '', nameLocal: '', description: '' });
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          id={`${prefix}-name`}
          label="Name"
          value={values.name}
          maxLength={100}
          required
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          error={fields['name']}
        />
        <Field
          id={`${prefix}-local`}
          label="Name in Telugu (optional)"
          value={values.nameLocal}
          maxLength={100}
          onChange={(e) => setValues({ ...values, nameLocal: e.target.value })}
          error={fields['nameLocal']}
        />
      </div>
      <Field
        id={`${prefix}-desc`}
        label="What it handles (optional)"
        value={values.description}
        maxLength={500}
        onChange={(e) => setValues({ ...values, description: e.target.value })}
        error={fields['description']}
      />
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          {editing ? 'Save changes' : 'Add department'}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
