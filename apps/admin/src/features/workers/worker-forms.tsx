'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { REASON_MAX, REASON_MIN, reasonProblem } from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { getBrowserServices } from '@/lib/supabase/browser';

/**
 * Adds a worker by mobile number. The invite-staff function creates the login if
 * needed; the database decides whether you may grant the WORKER role.
 */
export function AddWorkerForm({
  villageId,
  departments,
  defaultDepartmentId,
}: {
  villageId: string;
  departments: readonly { id: string; name: string }[];
  defaultDepartmentId?: string | undefined;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    setDone(null);
    const problems: Record<string, string> = {};
    if (fullName.trim().length < 2) problems['fullName'] = 'Enter the worker’s name.';
    if (!departmentId) problems['departmentId'] = 'Choose a department.';
    if (Object.keys(problems).length > 0) return setFields(problems);

    setBusy(true);
    const res = await getBrowserServices().admin.inviteStaff({
      phone,
      fullName: fullName.trim(),
      villageId,
      roleKey: 'WORKER',
      departmentId,
    });
    setBusy(false);
    if (!res.ok) {
      setFields(res.error.fields ?? {});
      setError(
        res.error.fields
          ? null
          : res.error.code === 'NETWORK' || res.error.code === 'UNKNOWN'
            ? 'Could not add the worker right now. Please try again in a minute.'
            : res.error.message,
      );
      return;
    }
    setDone(`${fullName.trim()} was added. They can sign in to the app with this number.`);
    setPhone('');
    setFullName('');
    router.refresh();
  }

  if (departments.length === 0) {
    return (
      <p className="text-sm text-neutral-600">Add a department first, then add workers to it.</p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {done ? <Alert tone="success">{done}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field
          id="worker-phone"
          label="Mobile number"
          prefix="+91"
          inputMode="numeric"
          autoComplete="off"
          value={phone}
          maxLength={14}
          onChange={(e) => setPhone(e.target.value)}
          error={fields['phone']}
        />
        <Field
          id="worker-name"
          label="Full name"
          value={fullName}
          maxLength={80}
          onChange={(e) => setFullName(e.target.value)}
          error={fields['fullName']}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="worker-department" className="text-sm font-medium text-neutral-800">
            Department
          </label>
          <select
            id="worker-department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="h-11 rounded-md border border-neutral-300 bg-white px-3 text-base"
          >
            <option value="">Choose…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {fields['departmentId'] ? (
            <p className="text-sm text-red-700">{fields['departmentId']}</p>
          ) : null}
        </div>
      </div>
      <div>
        <Button type="submit" busy={busy}>
          Add worker
        </Button>
      </div>
    </form>
  );
}

/** Removes someone from a department (revokes the WORKER role, with a reason). */
export function RemoveWorkerButton({
  userRoleId,
  name,
  openAssignments,
}: {
  userRoleId: string;
  name: string;
  openAssignments: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = reasonProblem(reason);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const res = await getBrowserServices().admin.revokeRole(userRoleId, reason.trim());
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Remove
      </Button>
    );
  }
  const id = `remove-${userRoleId}`;
  return (
    <form
      onSubmit={submit}
      className="flex w-full max-w-md flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3"
    >
      {openAssignments > 0 ? (
        <p className="text-sm text-amber-800">
          {name} still has {openAssignments} open {openAssignments === 1 ? 'issue' : 'issues'}.
          Reassign {openAssignments === 1 ? 'it' : 'them'} from the issue page so nothing is
          forgotten.
        </p>
      ) : null}
      <label htmlFor={id} className="text-sm font-medium text-neutral-800">
        Why is {name} being removed? (kept in the audit log)
      </label>
      <textarea
        id={id}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        minLength={REASON_MIN}
        maxLength={REASON_MAX}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
      />
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          Remove from department
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
