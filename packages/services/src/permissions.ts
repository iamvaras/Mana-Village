import { PermissionSet, ok, type Result, type RoleKey } from '@mana/core';
import type { ManaClient } from './client';
import { run } from './errors';

export interface MyRole {
  roleKey: RoleKey | string;
  villageId: string | null;
  villageName: string | null;
  departmentId: string | null;
  requiresMfa: boolean;
  /** false when the role needs the security code and this session has not provided it. */
  activeNow: boolean;
}

export interface PermissionsService {
  /** For showing/hiding UI only. The database enforces every permission. */
  getMyPermissions(villageId: string): Promise<Result<PermissionSet>>;
  getMyRoles(): Promise<Result<MyRole[]>>;
}

export function createPermissionsService(client: ManaClient): PermissionsService {
  return {
    async getMyPermissions(villageId) {
      const res = await run(() => client.rpc('get_my_permissions', { p_village_id: villageId }));
      return res.ok ? ok(new PermissionSet(res.value ?? [])) : res;
    },
    async getMyRoles() {
      const res = await run(() => client.rpc('get_my_roles'));
      if (!res.ok) return res;
      return ok(
        (res.value ?? []).map((r) => ({
          roleKey: r.role_key,
          villageId: r.village_id,
          villageName: r.village_name,
          departmentId: r.department_id,
          requiresMfa: r.requires_mfa,
          activeNow: r.active_now,
        })),
      );
    },
  };
}
