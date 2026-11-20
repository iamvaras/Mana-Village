import { normalizeIndianPhone, ok, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { run, validationError } from './errors';

export type StaffRoleKey = 'WORKER' | 'SECRETARY' | 'PRESIDENT' | 'VICE_PRESIDENT';

export interface InviteStaffInput {
  phone: string;
  fullName: string;
  villageId: string;
  roleKey: StaffRoleKey;
  departmentId?: string;
  reason?: string;
}

export interface AdminUserRow {
  id: string;
  fullName: string;
  displayName: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  createdAt: string;
  roles: ReadonlyArray<{
    user_role_id: string;
    role: string;
    department_id: string | null;
    granted_at: string;
  }>;
}

export interface AdminService {
  inviteStaff(input: InviteStaffInput): Promise<Result<{ userId: string; userRoleId: string }>>;
  grantRole(input: {
    userId: string;
    roleKey: string;
    villageId: string | null;
    departmentId?: string;
    reason?: string;
  }): Promise<Result<string | null>>;
  revokeRole(userRoleId: string, reason: string): Promise<Result<null>>;
  setUserStatus(
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    reason: string,
  ): Promise<Result<null>>;
  /** Reveals a phone number. Every call is recorded in the audit log. */
  revealContact(userId: string, issueId?: string): Promise<Result<string | null>>;
  listUsers(params: {
    villageId: string;
    search?: string;
    roleKey?: string;
    limit?: number;
    offset?: number;
  }): Promise<Result<AdminUserRow[]>>;
}

export function createAdminService(client: ManaClient): AdminService {
  return {
    async inviteStaff(input) {
      if (!normalizeIndianPhone(input.phone))
        return validationError({ phone: 'Enter a valid 10-digit mobile number.' });
      if (input.roleKey === 'WORKER' && !input.departmentId)
        return validationError({ departmentId: 'Choose a department.' });
      const res = await run(() =>
        client.functions.invoke<{ user_id: string; user_role_id: string }>('invite-staff', {
          method: 'POST',
          body: {
            phone: input.phone,
            full_name: input.fullName,
            village_id: input.villageId,
            role_key: input.roleKey,
            ...(input.departmentId ? { department_id: input.departmentId } : {}),
            ...(input.reason ? { reason: input.reason } : {}),
          },
        }),
      );
      if (!res.ok) return res;
      return ok({ userId: res.value?.user_id ?? '', userRoleId: res.value?.user_role_id ?? '' });
    },

    async grantRole(input) {
      return run(() =>
        client.rpc('grant_role', {
          p_user_id: input.userId,
          p_role_key: input.roleKey,
          ...(input.villageId ? { p_village_id: input.villageId } : {}),
          ...(input.departmentId ? { p_department_id: input.departmentId } : {}),
          ...(input.reason ? { p_reason: input.reason } : {}),
        }),
      );
    },

    async revokeRole(userRoleId, reason) {
      const res = await run(() =>
        client.rpc('revoke_role', { p_user_role_id: userRoleId, p_reason: reason }),
      );
      return res.ok ? ok(null) : res;
    },

    async setUserStatus(userId, status, reason) {
      const res = await run(() =>
        client.rpc('set_user_status', { p_user_id: userId, p_status: status, p_reason: reason }),
      );
      return res.ok ? ok(null) : res;
    },

    async revealContact(userId, issueId) {
      return run(() =>
        client.rpc('admin_get_user_contact', {
          p_user_id: userId,
          ...(issueId ? { p_issue_id: issueId } : {}),
        }),
      );
    },

    async listUsers(params) {
      const res = await run(() =>
        client.rpc('admin_list_users', {
          p_village_id: params.villageId,
          ...(params.search ? { p_search: params.search } : {}),
          ...(params.roleKey ? { p_role_key: params.roleKey } : {}),
          p_limit: params.limit ?? 50,
          p_offset: params.offset ?? 0,
        }),
      );
      if (!res.ok) return res;
      return ok(
        (res.value ?? []).map((u) => ({
          id: u.id,
          fullName: u.full_name,
          displayName: u.display_name,
          status: u.status,
          createdAt: u.created_at,
          roles: (u.roles as AdminUserRow['roles'] | null) ?? [],
        })),
      );
    },
  };
}
