import { ok, type IssuePriority, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { required, run, validationError } from './errors';

// ---------------------------------------------------------------------------
// Categories (shared by all villages; Super Admin edits them)
// ---------------------------------------------------------------------------

export interface CategoryAdminRow {
  id: string;
  key: string;
  name: string;
  nameLocal: string | null;
  icon: string | null;
  defaultPriority: IssuePriority | null;
  sortOrder: number;
  photoRequired: boolean;
  isActive: boolean;
}

export interface CategoryInput {
  key: string;
  name: string;
  nameLocal?: string | undefined;
  icon?: string | undefined;
  defaultPriority?: IssuePriority | null | undefined;
  sortOrder?: number | undefined;
  photoRequired?: boolean | undefined;
}

/** Same rules as public.upsert_category, so people see problems before sending. */
export function categoryProblems(
  input: CategoryInput,
  isNew: boolean,
): Record<string, string> | null {
  const p: Record<string, string> = {};
  if (isNew && !/^[A-Z_]{2,40}$/.test(input.key.trim().toUpperCase()))
    p['key'] = 'Use 2 to 40 letters or _ (for example STREET_LIGHT).';
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) p['name'] = 'Use 2 to 60 characters.';
  if ((input.nameLocal ?? '').trim().length > 60) p['nameLocal'] = 'Use at most 60 characters.';
  const icon = (input.icon ?? '').trim();
  if (icon && !/^[a-z0-9_-]{1,60}$/.test(icon))
    p['icon'] = 'Use a short lowercase name, like "water".';
  const order = input.sortOrder ?? 0;
  if (!Number.isInteger(order) || order < 0 || order > 10000)
    p['sortOrder'] = 'Use a whole number from 0 to 10000.';
  return Object.keys(p).length > 0 ? p : null;
}

// ---------------------------------------------------------------------------
// Village settings
// ---------------------------------------------------------------------------

export interface VillageSettings {
  autoCloseDays: number;
  reminderDays: number;
  defaultIssueVisibility: 'PUBLIC' | 'PRIVATE';
  maxIssuesPerUserPerDay: number;
  similarIssueRadiusM: number;
}

/** What the database uses when a village has not set a value. */
export const DEFAULT_VILLAGE_SETTINGS: VillageSettings = {
  autoCloseDays: 7,
  reminderDays: 3,
  defaultIssueVisibility: 'PUBLIC',
  maxIssuesPerUserPerDay: 10,
  similarIssueRadiusM: 200,
};

export const SETTING_LIMITS = {
  autoCloseDays: [3, 30],
  maxIssuesPerUserPerDay: [1, 50],
  similarIssueRadiusM: [50, 1000],
} as const;

const intIn = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) ? v : fallback;

/** Reads villages.settings (an open JSON object) into typed values with defaults. */
export function parseVillageSettings(json: unknown): VillageSettings {
  const o =
    typeof json === 'object' && json !== null && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  const d = DEFAULT_VILLAGE_SETTINGS;
  return {
    autoCloseDays: intIn(o['auto_close_days'], d.autoCloseDays),
    reminderDays: intIn(o['reminder_days'], d.reminderDays),
    defaultIssueVisibility: o['default_issue_visibility'] === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
    maxIssuesPerUserPerDay: intIn(o['max_issues_per_user_per_day'], d.maxIssuesPerUserPerDay),
    similarIssueRadiusM: intIn(o['similar_issue_radius_m'], d.similarIssueRadiusM),
  };
}

/** Same rules as public.update_village_settings. */
export function villageSettingsProblems(s: VillageSettings): Record<string, string> | null {
  const p: Record<string, string> = {};
  const within = (n: number, [lo, hi]: readonly [number, number]) =>
    Number.isInteger(n) && n >= lo && n <= hi;
  if (!within(s.autoCloseDays, SETTING_LIMITS.autoCloseDays))
    p['autoCloseDays'] = 'Use 3 to 30 days.';
  if (!Number.isInteger(s.reminderDays) || s.reminderDays < 1 || s.reminderDays >= s.autoCloseDays)
    p['reminderDays'] = 'Use at least 1 day, and fewer days than auto-close.';
  if (!within(s.maxIssuesPerUserPerDay, SETTING_LIMITS.maxIssuesPerUserPerDay))
    p['maxIssuesPerUserPerDay'] = 'Use 1 to 50.';
  if (!within(s.similarIssueRadiusM, SETTING_LIMITS.similarIssueRadiusM))
    p['similarIssueRadiusM'] = 'Use 50 to 1000 metres.';
  return Object.keys(p).length > 0 ? p : null;
}

// ---------------------------------------------------------------------------
// Role permissions (Super Admin)
// ---------------------------------------------------------------------------

export interface PermissionInfo {
  key: string;
  description: string;
  category: string;
  citizenGrantable: boolean;
}

export interface RoleInfo {
  key: string;
  name: string;
  scope: 'GLOBAL' | 'VILLAGE';
  permissions: string[];
}

export interface PermissionMatrix {
  roles: RoleInfo[];
  permissions: PermissionInfo[];
}

/** Whether the editor may offer this permission for this role (the database checks again). */
export function canOfferPermission(role: RoleInfo, perm: PermissionInfo): boolean {
  if (role.key === 'SUPER_ADMIN') return false;
  if (role.scope === 'VILLAGE' && perm.category === 'platform') return false;
  if (role.key === 'CITIZEN' && !perm.citizenGrantable) return false;
  return true;
}

// ---------------------------------------------------------------------------

export interface SettingsService {
  listCategories(): Promise<Result<CategoryAdminRow[]>>;
  saveCategory(input: CategoryInput, id?: string): Promise<Result<string>>;
  setCategoryActive(id: string, active: boolean): Promise<Result<null>>;
  getVillageSettings(villageId: string): Promise<Result<VillageSettings>>;
  saveVillageSettings(villageId: string, s: VillageSettings): Promise<Result<VillageSettings>>;
  getPermissionMatrix(): Promise<Result<PermissionMatrix>>;
  /** Replaces one role's permissions. Returns how many rows changed. */
  setRolePermissions(roleKey: string, permissionKeys: readonly string[]): Promise<Result<number>>;
}

const clean = (s: string | undefined) => {
  const t = (s ?? '').trim();
  return t === '' ? undefined : t;
};

export function createSettingsService(client: ManaClient): SettingsService {
  return {
    async listCategories() {
      // Hidden categories are visible here only with category.manage (RLS).
      const res = required(
        await run(() =>
          client
            .from('issue_categories')
            .select(
              'id, key, name, name_local, icon, default_priority, sort_order, photo_required, is_active',
            )
            .order('sort_order')
            .order('name'),
        ),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((c) => ({
          id: c.id,
          key: c.key,
          name: c.name,
          nameLocal: c.name_local,
          icon: c.icon,
          defaultPriority: c.default_priority,
          sortOrder: c.sort_order,
          photoRequired: c.photo_required,
          isActive: c.is_active,
        })),
      );
    },

    async saveCategory(input, id) {
      const problems = categoryProblems(input, !id);
      if (problems) return validationError(problems);
      const nameLocal = clean(input.nameLocal);
      const icon = clean(input.icon);
      return required(
        await run(() =>
          client.rpc('upsert_category', {
            p_key: input.key.trim().toUpperCase(),
            p_name: input.name.trim(),
            ...(nameLocal ? { p_name_local: nameLocal } : {}),
            ...(icon ? { p_icon: icon } : {}),
            ...(input.defaultPriority ? { p_default_priority: input.defaultPriority } : {}),
            p_sort_order: input.sortOrder ?? 0,
            p_photo_required: input.photoRequired ?? true,
            ...(id ? { p_id: id } : {}),
          }),
        ),
      );
    },

    async setCategoryActive(id, active) {
      const res = await run(() =>
        client.rpc('set_category_active', { p_id: id, p_active: active }),
      );
      return res.ok ? ok(null) : res;
    },

    async getVillageSettings(villageId) {
      const res = await run(() =>
        client.from('villages').select('settings').eq('id', villageId).maybeSingle(),
      );
      if (!res.ok) return res;
      return ok(parseVillageSettings(res.value?.settings ?? {}));
    },

    async saveVillageSettings(villageId, s) {
      const problems = villageSettingsProblems(s);
      if (problems) return validationError(problems);
      const res = required(
        await run(() =>
          client.rpc('update_village_settings', {
            p_village_id: villageId,
            p_settings: {
              auto_close_days: s.autoCloseDays,
              reminder_days: s.reminderDays,
              default_issue_visibility: s.defaultIssueVisibility,
              max_issues_per_user_per_day: s.maxIssuesPerUserPerDay,
              similar_issue_radius_m: s.similarIssueRadiusM,
            },
          }),
        ),
      );
      return res.ok ? ok(parseVillageSettings(res.value)) : res;
    },

    async getPermissionMatrix() {
      const [roles, perms, grants] = await Promise.all([
        run(() => client.from('roles').select('id, key, name, scope').order('name')),
        run(() =>
          client
            .from('permissions')
            .select('key, description, category, citizen_grantable')
            .order('category')
            .order('key'),
        ),
        run(() => client.from('role_permissions').select('role_id, permission_key')),
      ]);
      const r = required(roles);
      const p = required(perms);
      const g = required(grants);
      if (!r.ok) return r;
      if (!p.ok) return p;
      if (!g.ok) return g;
      return ok({
        roles: r.value.map((role) => ({
          key: role.key,
          name: role.name,
          scope: role.scope,
          permissions: g.value
            .filter((x) => x.role_id === role.id)
            .map((x) => x.permission_key)
            .sort(),
        })),
        permissions: p.value.map((x) => ({
          key: x.key,
          description: x.description,
          category: x.category,
          citizenGrantable: x.citizen_grantable,
        })),
      });
    },

    async setRolePermissions(roleKey, permissionKeys) {
      return required(
        await run(() =>
          client.rpc('set_role_permissions', {
            p_role_key: roleKey,
            p_permission_keys: [...permissionKeys],
          }),
        ),
      );
    },
  };
}
