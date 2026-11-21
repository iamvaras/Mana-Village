'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { canOfferPermission, type PermissionMatrix } from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getBrowserServices } from '@/lib/supabase/browser';

/**
 * Super Admin: choose a role, tick its permissions, save. Roles are shared by
 * every village. The database refuses unsafe changes even if this screen allowed them.
 */
export function PermissionEditor({ matrix }: { matrix: PermissionMatrix }) {
  const router = useRouter();
  const editable = matrix.roles.filter((r) => r.key !== 'SUPER_ADMIN');
  const [roleKey, setRoleKey] = useState(editable[0]?.key ?? '');
  const role = editable.find((r) => r.key === roleKey);
  const [chosen, setChosen] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, PermissionMatrix['permissions']>();
    for (const p of matrix.permissions) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return [...m.entries()];
  }, [matrix.permissions]);

  const original = new Set(role?.permissions ?? []);
  const changed = chosen.size !== original.size || [...chosen].some((k) => !original.has(k));

  function pick(key: string) {
    const r = editable.find((x) => x.key === key);
    setRoleKey(key);
    setChosen(new Set(r?.permissions ?? []));
    setError(null);
    setMessage(null);
  }

  async function save() {
    if (!role) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await getBrowserServices().settings.setRolePermissions(role.key, [...chosen]);
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setMessage(
      `Saved. ${res.value} change${res.value === 1 ? '' : 's'} recorded in the audit log.`,
    );
    router.refresh();
  }

  if (!role) return <p className="text-sm text-neutral-600">No roles to edit.</p>;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-800">Role</span>
        <select
          value={roleKey}
          onChange={(e) => pick(e.target.value)}
          disabled={busy}
          className="h-10 rounded-md border border-neutral-300 bg-white px-2"
        >
          {editable.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-neutral-600">
        Changes apply to everyone with this role in every village. The Super Admin role cannot be
        edited, so the platform can never be locked out.
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map(([category, perms]) => (
          <fieldset key={category} className="rounded-md border border-neutral-200 p-3">
            <legend className="px-1 text-sm font-medium capitalize text-neutral-800">
              {category}
            </legend>
            <ul className="flex flex-col gap-1">
              {perms.map((p) => {
                const allowed = canOfferPermission(role, p);
                return (
                  <li key={p.key}>
                    <label
                      className={`flex items-start gap-2 text-sm ${allowed ? 'text-neutral-800' : 'text-neutral-400'}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={chosen.has(p.key)}
                        disabled={busy || (!allowed && !chosen.has(p.key))}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(p.key);
                          else next.delete(p.key);
                          setChosen(next);
                          setMessage(null);
                        }}
                      />
                      <span>
                        {p.description}
                        <span className="block text-xs text-neutral-600">{p.key}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" busy={busy} disabled={!changed} onClick={() => void save()}>
          Save permissions for {role.name}
        </Button>
        {changed ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => pick(role.key)}>
            Undo changes
          </Button>
        ) : null}
      </div>
    </div>
  );
}
