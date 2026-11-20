'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminUserRow } from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ROLE_LABEL } from '@/features/issues/labels';
import { getBrowserServices } from '@/lib/supabase/browser';

type Mode =
  | { kind: 'idle' }
  | { kind: 'status' }
  | { kind: 'grant' }
  | { kind: 'revoke'; userRoleId: string; role: string };

const REASON_MIN = 5;

/**
 * Actions for one person. Which buttons show is a convenience only; the database
 * checks every permission again and refuses changes to your own account.
 */
export function UserActions({
  user,
  villageId,
  grantable,
  canManageStatus,
  departments,
}: {
  user: AdminUserRow;
  villageId: string;
  /** Role keys this staff member may grant or revoke. */
  grantable: readonly string[];
  canManageStatus: boolean;
  departments: ReadonlyArray<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [reason, setReason] = useState('');
  const [roleKey, setRoleKey] = useState(grantable[0] ?? '');
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const held = new Set(user.roles.map((r) => r.role));
  const canGrantAny = grantable.some((k) => !held.has(k));
  const revocable = user.roles.filter((r) => grantable.includes(r.role));
  const suspended = user.status === 'SUSPENDED';

  function open(next: Mode) {
    setMode(next);
    setReason('');
    setError(null);
    if (next.kind === 'grant') setRoleKey(grantable.find((k) => !held.has(k)) ?? '');
  }

  async function act(fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return setError(res.error?.message ?? 'Something went wrong.');
    setMode({ kind: 'idle' });
    router.refresh();
  }

  const services = () => getBrowserServices().admin;
  const reasonOk = reason.trim().length >= REASON_MIN;
  const reasonField = (label: string) => (
    <Field
      id={`reason-${user.id}`}
      label={label}
      hint={`At least ${REASON_MIN} letters. Kept in the audit log.`}
      value={reason}
      maxLength={500}
      onChange={(e) => setReason(e.target.value)}
    />
  );

  if (user.status === 'DELETED') return null;

  return (
    <div className="flex flex-col items-end gap-2">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {mode.kind === 'status' ? (
        <div className="flex w-full max-w-md flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm text-neutral-800">
            {suspended
              ? 'They will be able to sign in and report again.'
              : 'They will not be able to sign in or report until reactivated. Their issues stay.'}
          </p>
          {reasonField('Reason')}
          <div className="flex gap-2">
            <Button
              type="button"
              busy={busy}
              disabled={!reasonOk}
              onClick={() =>
                void act(() =>
                  services().setUserStatus(user.id, suspended ? 'ACTIVE' : 'SUSPENDED', reason),
                )
              }
            >
              {suspended ? 'Reactivate' : 'Suspend'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => open({ kind: 'idle' })}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : mode.kind === 'grant' ? (
        <div className="flex w-full max-w-md flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-800">Role</span>
            <select
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
              className="h-10 rounded-md border border-neutral-300 bg-white px-2"
            >
              {grantable
                .filter((k) => !held.has(k))
                .map((k) => (
                  <option key={k} value={k}>
                    {ROLE_LABEL[k] ?? k}
                  </option>
                ))}
            </select>
          </label>
          {roleKey === 'WORKER' ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-800">Department</span>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="h-10 rounded-md border border-neutral-300 bg-white px-2"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {reasonField('Reason (optional)')}
          <div className="flex gap-2">
            <Button
              type="button"
              busy={busy}
              disabled={!roleKey || (roleKey === 'WORKER' && !departmentId)}
              onClick={() =>
                void act(() =>
                  services().grantRole({
                    userId: user.id,
                    roleKey,
                    villageId,
                    ...(roleKey === 'WORKER' ? { departmentId } : {}),
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                  }),
                )
              }
            >
              Give role
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => open({ kind: 'idle' })}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : mode.kind === 'revoke' ? (
        <div className="flex w-full max-w-md flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm text-neutral-800">
            Remove the {ROLE_LABEL[mode.role] ?? mode.role} role. Their past actions stay in the
            record.
          </p>
          {reasonField('Reason')}
          <div className="flex gap-2">
            <Button
              type="button"
              busy={busy}
              disabled={!reasonOk}
              onClick={() => void act(() => services().revokeRole(mode.userRoleId, reason))}
            >
              Remove role
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => open({ kind: 'idle' })}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          {canGrantAny ? (
            <Button type="button" variant="secondary" onClick={() => open({ kind: 'grant' })}>
              Give a role
            </Button>
          ) : null}
          {revocable.map((r) => (
            <Button
              key={r.user_role_id}
              type="button"
              variant="ghost"
              onClick={() => open({ kind: 'revoke', userRoleId: r.user_role_id, role: r.role })}
            >
              Remove {ROLE_LABEL[r.role] ?? r.role}
            </Button>
          ))}
          {canManageStatus ? (
            <Button type="button" variant="ghost" onClick={() => open({ kind: 'status' })}>
              {suspended ? 'Reactivate' : 'Suspend'}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
