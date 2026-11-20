'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX } from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { getBrowserServices } from '@/lib/supabase/browser';

export interface AnnouncementFormValues {
  id?: string;
  title: string;
  body: string;
  titleLocal: string;
  bodyLocal: string;
  isPinned: boolean;
  /** yyyy-mm-dd or empty. */
  expires: string;
}

const EMPTY: AnnouncementFormValues = {
  title: '',
  body: '',
  titleLocal: '',
  bodyLocal: '',
  isPinned: false,
  expires: '',
};

const areaClass =
  'w-full rounded-md border bg-white px-3 py-2 text-base focus:outline-2 focus:outline-brand-600';

function Area({
  id,
  label,
  value,
  onChange,
  error,
  rows = 5,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  rows?: number;
}): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-neutral-800">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={ANNOUNCEMENT_BODY_MAX}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${areaClass} ${error ? 'border-red-500' : 'border-neutral-300'}`}
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

/** End of the chosen day in the person's own time zone. */
function endOfDay(date: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const d = new Date(`${date}T23:59:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Write a draft, or edit one when `initial.id` is set. Both languages side by side. */
export function AnnouncementForm({
  villageId,
  initial,
  onDone,
}: {
  villageId: string;
  initial?: AnnouncementFormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState<AnnouncementFormValues>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const editing = Boolean(initial?.id);
  const p = initial?.id ? `ann-${initial.id}` : 'ann-new';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const res = await getBrowserServices().announcements.save(
      villageId,
      {
        title: v.title,
        body: v.body,
        titleLocal: v.titleLocal,
        bodyLocal: v.bodyLocal,
        isPinned: v.isPinned,
        expiresAt: endOfDay(v.expires),
      },
      initial?.id,
    );
    setBusy(false);
    if (!res.ok) {
      setFields(res.error.fields ?? {});
      setError(res.error.fields ? null : res.error.message);
      return;
    }
    if (!editing) setV(EMPTY);
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field
            id={`${p}-title`}
            label="Title (English)"
            value={v.title}
            maxLength={ANNOUNCEMENT_TITLE_MAX}
            required
            onChange={(e) => setV({ ...v, title: e.target.value })}
            error={fields['title']}
          />
          <Area
            id={`${p}-body`}
            label="Message (English)"
            value={v.body}
            onChange={(body) => setV({ ...v, body })}
            error={fields['body']}
          />
        </div>
        <div className="flex flex-col gap-3">
          <Field
            id={`${p}-title-te`}
            label="Title in Telugu (recommended)"
            value={v.titleLocal}
            maxLength={ANNOUNCEMENT_TITLE_MAX}
            lang="te"
            onChange={(e) => setV({ ...v, titleLocal: e.target.value })}
            error={fields['titleLocal']}
          />
          <Area
            id={`${p}-body-te`}
            label="Message in Telugu (recommended)"
            value={v.bodyLocal}
            onChange={(bodyLocal) => setV({ ...v, bodyLocal })}
            error={fields['bodyLocal']}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={v.isPinned}
            onChange={(e) => setV({ ...v, isPinned: e.target.checked })}
            className="h-4 w-4"
          />
          Pin to the top of the residents&apos; Home screen
        </label>
        <div className="w-56">
          <Field
            id={`${p}-expires`}
            type="date"
            label="Show until (optional)"
            value={v.expires}
            onChange={(e) => setV({ ...v, expires: e.target.value })}
            error={fields['expiresAt']}
          />
        </div>
      </div>
      <p className="text-sm text-neutral-600">
        Residents read it in their chosen language; if the Telugu text is empty they see the English
        one.
      </p>
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          {editing ? 'Save changes' : 'Save as draft'}
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
