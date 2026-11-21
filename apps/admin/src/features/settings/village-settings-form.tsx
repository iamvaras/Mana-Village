'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_VILLAGE_SETTINGS, type VillageSettings } from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { getBrowserServices } from '@/lib/supabase/browser';

type Text = Record<Exclude<keyof VillageSettings, 'defaultIssueVisibility'>, string>;

const toText = (s: VillageSettings): Text => ({
  autoCloseDays: String(s.autoCloseDays),
  reminderDays: String(s.reminderDays),
  maxIssuesPerUserPerDay: String(s.maxIssuesPerUserPerDay),
  similarIssueRadiusM: String(s.similarIssueRadiusM),
});

const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : Number.NaN);

export function VillageSettingsForm({
  villageId,
  initial,
}: {
  villageId: string;
  initial: VillageSettings;
}) {
  const router = useRouter();
  const [text, setText] = useState<Text>(toText(initial));
  const [visibility, setVisibility] = useState(initial.defaultIssueVisibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    setFields({});
    const res = await getBrowserServices().settings.saveVillageSettings(villageId, {
      autoCloseDays: whole(text.autoCloseDays),
      reminderDays: whole(text.reminderDays),
      maxIssuesPerUserPerDay: whole(text.maxIssuesPerUserPerDay),
      similarIssueRadiusM: whole(text.similarIssueRadiusM),
      defaultIssueVisibility: visibility,
    });
    setBusy(false);
    if (!res.ok) {
      setFields(res.error.fields ?? {});
      setError(res.error.fields ? null : res.error.message);
      return;
    }
    setText(toText(res.value));
    setSaved(true);
    router.refresh();
  }

  const d = DEFAULT_VILLAGE_SETTINGS;
  const field = (key: keyof Text, label: string, hint: string, max: number) => (
    <Field
      id={`settings-${key}`}
      label={label}
      hint={hint}
      type="number"
      min={1}
      max={max}
      required
      value={text[key]}
      onChange={(e) => setText({ ...text, [key]: e.target.value })}
      error={fields[key]}
    />
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">Settings saved.</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {field(
          'autoCloseDays',
          'Close solved issues automatically after (days)',
          `If the resident does not answer "Was it fixed?". 3 to 30; usual ${d.autoCloseDays}.`,
          30,
        )}
        {field(
          'reminderDays',
          'Remind the resident after (days)',
          `Must be before auto-close; usual ${d.reminderDays}.`,
          29,
        )}
        {field(
          'maxIssuesPerUserPerDay',
          'Reports one person can send per day',
          `Stops spam. 1 to 50; usual ${d.maxIssuesPerUserPerDay}.`,
          50,
        )}
        {field(
          'similarIssueRadiusM',
          'Show "similar issue nearby" within (metres)',
          `50 to 1000; usual ${d.similarIssueRadiusM}.`,
          1000,
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-800">New reports are</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC')}
            className="h-10 rounded-md border border-neutral-300 bg-white px-2"
          >
            <option value="PUBLIC">Public (other residents can see them)</option>
            <option value="PRIVATE">Private (only the reporter and staff)</option>
          </select>
          <span className="text-xs text-neutral-500">
            Used when the resident does not mark the report private themselves.
          </span>
        </label>
      </div>
      <div>
        <Button type="submit" busy={busy}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
