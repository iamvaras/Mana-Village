import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PermissionSet } from '@mana/core';
import type { MyRole } from '@mana/services';
import { getServerServices } from '@/lib/supabase/server';

/** Roles that may use the admin website. Workers use the mobile app. */
export const ADMIN_ROLE_KEYS = ['PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'SUPER_ADMIN'] as const;
export const VILLAGE_COOKIE = 'mv_village';

export interface VillageOption {
  id: string;
  name: string;
}

export interface StaffContext {
  userId: string;
  fullName: string;
  roles: MyRole[];
  village: VillageOption;
  villages: VillageOption[];
  permissions: PermissionSet;
  /** Role names held in the selected village, for display. */
  roleLabels: string[];
}

export type StaffState =
  | { kind: 'signed_out' }
  | { kind: 'not_staff' }
  | { kind: 'needs_security_code' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; ctx: StaffContext };

const isAdminRole = (r: MyRole) => (ADMIN_ROLE_KEYS as readonly string[]).includes(r.roleKey);

/** Resolves who the visitor is and what they may do. Cached per request. */
export const getStaffState = cache(async (): Promise<StaffState> => {
  const services = await getServerServices();
  // proxy.ts has already validated the session with the auth server; this only
  // avoids database calls for visitors who are not signed in.
  const session = await services.auth.getSession();
  if (!session.ok) return { kind: 'error', message: session.error.message };
  if (!session.value) return { kind: 'signed_out' };

  const profile = await services.profile.getMyProfile();
  if (!profile.ok) {
    return profile.error.code === 'AUTH_REQUIRED'
      ? { kind: 'signed_out' }
      : { kind: 'error', message: profile.error.message };
  }
  if (!profile.value) return { kind: 'not_staff' };
  if (profile.value.status !== 'ACTIVE') return { kind: 'not_staff' };

  const roles = await services.permissions.getMyRoles();
  if (!roles.ok) return { kind: 'error', message: roles.error.message };
  const adminRoles = roles.value.filter(isAdminRole);
  if (adminRoles.length === 0) return { kind: 'not_staff' };
  if (adminRoles.every((r) => !r.activeNow)) return { kind: 'needs_security_code' };

  // Villages the person administers. Super Admin (global) may choose any village.
  let villages: VillageOption[];
  if (adminRoles.some((r) => r.roleKey === 'SUPER_ADMIN' && r.activeNow)) {
    const all = await services.villages.listActive();
    if (!all.ok) return { kind: 'error', message: all.error.message };
    villages = all.value.map((v) => ({ id: v.id, name: v.name }));
  } else {
    const seen = new Map<string, VillageOption>();
    for (const r of adminRoles) {
      if (r.activeNow && r.villageId)
        seen.set(r.villageId, { id: r.villageId, name: r.villageName ?? 'Village' });
    }
    villages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const chosenId = (await cookies()).get(VILLAGE_COOKIE)?.value;
  const village = villages.find((v) => v.id === chosenId) ?? villages[0];
  if (!village) return { kind: 'not_staff' };

  const permissions = await services.permissions.getMyPermissions(village.id);
  if (!permissions.ok) return { kind: 'error', message: permissions.error.message };

  return {
    kind: 'ready',
    ctx: {
      userId: profile.value.id,
      fullName: profile.value.full_name,
      roles: roles.value,
      village,
      villages,
      permissions: permissions.value,
      roleLabels: adminRoles
        .filter((r) => r.activeNow && (r.villageId === village.id || r.roleKey === 'SUPER_ADMIN'))
        .map((r) => ROLE_LABELS[r.roleKey] ?? r.roleKey),
    },
  };
});

const ROLE_LABELS: Readonly<Record<string, string>> = {
  PRESIDENT: 'President',
  VICE_PRESIDENT: 'Vice-President',
  SECRETARY: 'EO / Secretary',
  SUPER_ADMIN: 'Super Admin',
};

/** Use in console layouts/pages: returns the context or redirects. */
export async function requireStaff(): Promise<StaffContext> {
  const state = await getStaffState();
  switch (state.kind) {
    case 'ready':
      return state.ctx;
    case 'signed_out':
      redirect('/login');
    case 'needs_security_code':
      redirect('/login/security-code');
    case 'not_staff':
      redirect('/no-access');
    case 'error':
      throw new Error(state.message);
  }
}
