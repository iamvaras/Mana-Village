'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ISSUE_PRIORITIES,
  type IssuePriority,
  type IssueStatus,
  type IssueVisibility,
  type Result,
} from '@mana/core';
import { NOTE_MAX, REASON_MAX, type IssueSummary } from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getBrowserServices } from '@/lib/supabase/browser';
import { PRIORITY_LABEL, STATUS_LABEL } from './labels';
import type { PanelAction } from './panel-actions';

const ACTION_LABEL: Readonly<Record<PanelAction, string>> = {
  start_review: 'Start review',
  verify: 'Verify',
  reject: 'Reject',
  mark_duplicate: 'Mark as duplicate',
  assign: 'Assign',
  reassign: 'Reassign',
  reconsider: 'Review again',
};

export interface DepartmentOption {
  id: string;
  name: string;
  openIssueCount: number;
}
export interface WorkerOption {
  userId: string;
  name: string;
  departmentId: string;
  openAssignments: number;
}

export interface IssueActionsProps {
  issue: {
    id: string;
    villageId: string;
    version: number;
    status: IssueStatus;
    priority: IssuePriority;
    visibility: IssueVisibility;
    assignedDepartmentId: string | null;
    assignedUserId: string | null;
  };
  actions: readonly PanelAction[];
  canSetPriority: boolean;
  canSetVisibility: boolean;
  /** The signed-in staff member reported this issue themselves. */
  isOwnReport: boolean;
  departments: readonly DepartmentOption[];
  workers: readonly WorkerOption[];
}

const inputClass =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-brand-600';

function Labelled({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-neutral-800">
        {label}
      </label>
      {children}
    </div>
  );
}

/** End of the chosen day in the person's own time zone. */
function endOfDay(date: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const d = new Date(`${date}T23:59:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Shows only the next steps the database would allow for this issue and person.
 * The database checks everything again; this panel only avoids dead ends.
 */
export function IssueActions(props: IssueActionsProps) {
  const { issue } = props;
  const router = useRouter();
  const [open, setOpen] = useState<PanelAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  // Form state (shared by the forms; reset when another action is opened)
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<IssuePriority>(issue.priority);
  const [departmentId, setDepartmentId] = useState(issue.assignedDepartmentId ?? '');
  const [assigneeId, setAssigneeId] = useState(issue.assignedUserId ?? '');
  const [due, setDue] = useState('');
  const [originalNumber, setOriginalNumber] = useState('');
  const [original, setOriginal] = useState<IssueSummary | null>(null);

  // The newest version we know of: a successful action returns it before the
  // refreshed page arrives, so a quick second action does not look stale.
  const [knownVersion, setKnownVersion] = useState(issue.version);
  const version = Math.max(issue.version, knownVersion);

  const w = () => getBrowserServices().workflow;

  function openAction(a: PanelAction | null) {
    setOpen(a);
    setError(null);
    setFieldErrors({});
    setDone(null);
    setReason('');
    setNote('');
    setPriority(issue.priority);
    setDepartmentId(issue.assignedDepartmentId ?? '');
    setAssigneeId(issue.assignedUserId ?? '');
    setDue('');
    setOriginalNumber('');
    setOriginal(null);
  }

  async function finish(res: Result<number>, message: string) {
    setBusy(false);
    if (res.ok) {
      setKnownVersion(res.value);
      setOpen(null);
      setDone(message);
      router.refresh();
      return;
    }
    if (res.error.code === 'CONFLICT' || res.error.code === 'INVALID_TRANSITION') {
      setError(
        'Someone else changed this issue just now. The page has been updated; please check and try again.',
      );
      router.refresh();
      return;
    }
    setFieldErrors(res.error.fields ?? {});
    setError(res.error.fields ? null : res.error.message);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!open) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const v = version;
    switch (open) {
      case 'start_review':
        return finish(await w().startReview(issue.id, v), 'Review started.');
      case 'verify':
        return finish(
          await w().verify(issue.id, v, {
            priority: props.canSetPriority ? priority : undefined,
            note,
          }),
          'Issue verified.',
        );
      case 'reject':
        return finish(
          await w().reject(issue.id, v, reason),
          'Issue rejected. The resident has been told why.',
        );
      case 'reconsider':
        return finish(await w().reconsider(issue.id, v, reason), 'Issue is back under review.');
      case 'mark_duplicate': {
        if (!original) {
          setBusy(false);
          setFieldErrors({ original: 'Find the original issue first.' });
          return;
        }
        return finish(
          await w().markDuplicate(issue.id, v, original.id, note),
          `Marked as a duplicate of ${original.issueNumber}.`,
        );
      }
      case 'assign':
      case 'reassign': {
        if (!departmentId) {
          setBusy(false);
          setFieldErrors({ departmentId: 'Choose a department.' });
          return;
        }
        return finish(
          await w().assign(issue.id, v, {
            departmentId,
            assigneeUserId: assigneeId || undefined,
            note,
            dueAt: endOfDay(due),
            reason: open === 'reassign' ? reason : undefined,
          }),
          open === 'reassign' ? 'Issue reassigned.' : 'Issue assigned. The worker has been told.',
        );
      }
    }
  }

  async function findOriginal() {
    setFieldErrors({});
    setOriginal(null);
    const res = await getBrowserServices().issueReads.findByNumber(issue.villageId, originalNumber);
    if (!res.ok)
      return setFieldErrors({ original: res.error.fields?.['issueNumber'] ?? res.error.message });
    if (!res.value)
      return setFieldErrors({ original: 'No issue with this number in this village.' });
    if (res.value.id === issue.id)
      return setFieldErrors({ original: 'That is this issue. Choose the earlier report.' });
    if (res.value.status === 'REJECTED' || res.value.status === 'DUPLICATE')
      return setFieldErrors({ original: 'That issue is itself rejected or a duplicate.' });
    setOriginal(res.value);
  }

  async function savePriority(next: IssuePriority) {
    setBusy(true);
    setError(null);
    await finish(
      await w().setPriority(issue.id, version, next),
      `Priority set to ${PRIORITY_LABEL[next]}.`,
    );
  }

  async function saveVisibility(next: IssueVisibility) {
    setBusy(true);
    setError(null);
    await finish(
      await w().setVisibility(issue.id, version, next),
      next === 'PRIVATE'
        ? 'Issue is now private (only the reporter and staff can see it).'
        : 'Issue is now public.',
    );
  }

  const workersInDept = props.workers.filter((x) => x.departmentId === departmentId);
  const nothingToDo =
    props.actions.length === 0 && !props.canSetPriority && !props.canSetVisibility;

  return (
    <div className="flex flex-col gap-4">
      {done ? <Alert tone="success">{done}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {props.isOwnReport ? (
        <Alert>You reported this issue, so another staff member has to verify it.</Alert>
      ) : null}

      {props.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {props.actions.map((a) => (
            <Button
              key={a}
              type="button"
              variant={open === a ? 'primary' : 'secondary'}
              aria-expanded={open === a}
              onClick={() => openAction(open === a ? null : a)}
            >
              {ACTION_LABEL[a]}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-600">
          No review or assignment step is due while the issue is{' '}
          {STATUS_LABEL[issue.status].toLowerCase()}.
        </p>
      )}

      {open ? (
        <form
          onSubmit={submit}
          className="flex flex-col gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4"
        >
          <h3 className="text-sm font-semibold text-neutral-900">{ACTION_LABEL[open]}</h3>

          {open === 'start_review' ? (
            <p className="text-sm text-neutral-700">
              The resident will see that the issue is being reviewed.
            </p>
          ) : null}

          {open === 'verify' && props.canSetPriority ? (
            <Labelled id="verify-priority" label="Priority">
              <select
                id="verify-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as IssuePriority)}
                className={inputClass}
              >
                {ISSUE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </Labelled>
          ) : null}

          {open === 'mark_duplicate' ? (
            <Labelled id="original" label="Number of the earlier report">
              <div className="flex gap-2">
                <input
                  id="original"
                  value={originalNumber}
                  onChange={(e) => {
                    setOriginalNumber(e.target.value);
                    setOriginal(null);
                  }}
                  placeholder="RMP-2026-00012"
                  className={inputClass}
                  aria-invalid={fieldErrors['original'] ? true : undefined}
                />
                <Button type="button" variant="secondary" onClick={() => void findOriginal()}>
                  Find
                </Button>
              </div>
              {original ? (
                <p className="text-sm text-neutral-700">
                  {original.issueNumber}: {original.title} ({STATUS_LABEL[original.status]})
                </p>
              ) : null}
              {fieldErrors['original'] ? (
                <p className="text-sm text-red-700">{fieldErrors['original']}</p>
              ) : null}
            </Labelled>
          ) : null}

          {open === 'assign' || open === 'reassign' ? (
            <>
              <Labelled id="department" label="Department">
                <select
                  id="department"
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value);
                    setAssigneeId('');
                  }}
                  className={inputClass}
                >
                  <option value="">Choose…</option>
                  {props.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.openIssueCount} open)
                    </option>
                  ))}
                </select>
                {fieldErrors['departmentId'] ? (
                  <p className="text-sm text-red-700">{fieldErrors['departmentId']}</p>
                ) : null}
              </Labelled>
              <Labelled id="assignee" label="Worker (optional)">
                <select
                  id="assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  disabled={!departmentId}
                  className={inputClass}
                >
                  <option value="">Anyone in the department</option>
                  {workersInDept.map((x) => (
                    <option key={x.userId} value={x.userId}>
                      {x.name} ({x.openAssignments} open)
                    </option>
                  ))}
                </select>
                {departmentId && workersInDept.length === 0 ? (
                  <p className="text-sm text-amber-800">This department has no workers yet.</p>
                ) : null}
              </Labelled>
              <Labelled id="due" label="Due date (optional)">
                <input
                  id="due"
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className={inputClass}
                />
                {fieldErrors['dueAt'] ? (
                  <p className="text-sm text-red-700">{fieldErrors['dueAt']}</p>
                ) : null}
              </Labelled>
            </>
          ) : null}

          {open === 'reject' || open === 'reconsider' || open === 'reassign' ? (
            <Labelled
              id="reason"
              label={
                open === 'reject'
                  ? 'Reason (the resident will see this)'
                  : open === 'reassign'
                    ? 'Why is it being reassigned?'
                    : 'Why review it again?'
              }
            >
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={REASON_MAX}
                className={inputClass}
                aria-invalid={fieldErrors['reason'] ? true : undefined}
              />
              {fieldErrors['reason'] ? (
                <p className="text-sm text-red-700">{fieldErrors['reason']}</p>
              ) : null}
            </Labelled>
          ) : null}

          {open === 'verify' ||
          open === 'mark_duplicate' ||
          open === 'assign' ||
          open === 'reassign' ? (
            <Labelled id="note" label="Note (optional)">
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={NOTE_MAX}
                className={inputClass}
              />
              {fieldErrors['note'] ? (
                <p className="text-sm text-red-700">{fieldErrors['note']}</p>
              ) : null}
            </Labelled>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" busy={busy}>
              {ACTION_LABEL[open]}
            </Button>
            <Button type="button" variant="ghost" onClick={() => openAction(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {props.canSetPriority || props.canSetVisibility ? (
        <div className="flex flex-col gap-3 border-t border-neutral-200 pt-4">
          {props.canSetPriority ? (
            <Labelled id="priority" label="Priority">
              <select
                id="priority"
                value={issue.priority}
                disabled={busy}
                onChange={(e) => void savePriority(e.target.value as IssuePriority)}
                className={inputClass}
              >
                {ISSUE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </Labelled>
          ) : null}
          {props.canSetVisibility ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-800">
                {issue.visibility === 'PUBLIC'
                  ? 'Public: all residents can see it'
                  : 'Private: reporter and staff only'}
              </span>
              <Button
                type="button"
                variant="secondary"
                busy={busy}
                onClick={() =>
                  void saveVisibility(issue.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC')
                }
              >
                {issue.visibility === 'PUBLIC' ? 'Make private' : 'Make public'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {nothingToDo ? (
        <p className="text-sm text-neutral-600">Your role has no actions on this issue.</p>
      ) : null}
    </div>
  );
}
