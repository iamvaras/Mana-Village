'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ISSUE_PRIORITIES, type IssuePriority } from '@mana/core';
import type { CategoryAdminRow } from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PRIORITY_LABEL } from '@/features/issues/labels';
import { getBrowserServices } from '@/lib/supabase/browser';

interface Values {
  key: string;
  name: string;
  nameLocal: string;
  icon: string;
  defaultPriority: IssuePriority | '';
  sortOrder: string;
  photoRequired: boolean;
}

const EMPTY: Values = {
  key: '',
  name: '',
  nameLocal: '',
  icon: '',
  defaultPriority: '',
  sortOrder: '100',
  photoRequired: true,
};

const fromRow = (c: CategoryAdminRow): Values => ({
  key: c.key,
  name: c.name,
  nameLocal: c.nameLocal ?? '',
  icon: c.icon ?? '',
  defaultPriority: c.defaultPriority ?? '',
  sortOrder: String(c.sortOrder),
  photoRequired: c.photoRequired,
});

/** Add a category, or edit one when `initial` is given (its code cannot change). */
export function CategoryForm({
  initial,
  onDone,
}: {
  initial?: CategoryAdminRow;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial ? fromRow(initial) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const p = initial ? `cat-${initial.id}` : 'cat-new';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const order = Number(v.sortOrder);
    const res = await getBrowserServices().settings.saveCategory(
      {
        key: v.key,
        name: v.name,
        nameLocal: v.nameLocal,
        icon: v.icon,
        defaultPriority: v.defaultPriority || null,
        sortOrder: Number.isFinite(order) ? order : -1,
        photoRequired: v.photoRequired,
      },
      initial?.id,
    );
    setBusy(false);
    if (!res.ok) {
      setFields(res.error.fields ?? {});
      setError(res.error.fields ? null : res.error.message);
      return;
    }
    if (!initial) setV(EMPTY);
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          id={`${p}-name`}
          label="Name"
          value={v.name}
          maxLength={60}
          required
          onChange={(e) => setV({ ...v, name: e.target.value })}
          error={fields['name']}
        />
        <Field
          id={`${p}-local`}
          label="Name in Telugu (recommended)"
          value={v.nameLocal}
          maxLength={60}
          onChange={(e) => setV({ ...v, nameLocal: e.target.value })}
          error={fields['nameLocal']}
        />
        {initial ? null : (
          <Field
            id={`${p}-key`}
            label="Code"
            hint="Capital letters and _, for example STREET_LIGHT. Cannot be changed later."
            value={v.key}
            maxLength={40}
            required
            onChange={(e) => setV({ ...v, key: e.target.value.toUpperCase() })}
            error={fields['key']}
          />
        )}
        <Field
          id={`${p}-icon`}
          label="Icon name (optional)"
          hint="A short lowercase name, like water or road."
          value={v.icon}
          maxLength={60}
          onChange={(e) => setV({ ...v, icon: e.target.value })}
          error={fields['icon']}
        />
        <Field
          id={`${p}-order`}
          label="Order in lists"
          hint="Lower numbers come first."
          type="number"
          min={0}
          max={10000}
          value={v.sortOrder}
          onChange={(e) => setV({ ...v, sortOrder: e.target.value })}
          error={fields['sortOrder']}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-800">Starting priority (optional)</span>
          <select
            value={v.defaultPriority}
            onChange={(e) =>
              setV({ ...v, defaultPriority: e.target.value as Values['defaultPriority'] })
            }
            className="h-10 rounded-md border border-neutral-300 bg-white px-2"
          >
            <option value="">Decided by staff</option>
            {ISSUE_PRIORITIES.map((pr) => (
              <option key={pr} value={pr}>
                {PRIORITY_LABEL[pr]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-neutral-800">
        <input
          type="checkbox"
          checked={v.photoRequired}
          onChange={(e) => setV({ ...v, photoRequired: e.target.checked })}
        />
        Residents must add a photo when reporting
      </label>
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          {initial ? 'Save changes' : 'Add category'}
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

/** Edit and hide/show controls for one category row. */
export function CategoryRowActions({ category }: { category: CategoryAdminRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await getBrowserServices().settings.setCategoryActive(
      category.id,
      !category.isActive,
    );
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <CategoryForm initial={category} onDone={() => setEditing(false)} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button type="button" variant="ghost" busy={busy} onClick={() => void toggle()}>
          {category.isActive ? 'Hide' : 'Show again'}
        </Button>
      </div>
    </div>
  );
}
