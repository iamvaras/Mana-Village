/**
 * Permission keys. Mirrors the `permissions` table seeded by migrations.
 *
 * IMPORTANT: these are used by the UI only to decide which buttons to show.
 * Every permission is enforced again in the database (RLS + workflow functions).
 */
export const PERMISSION_KEYS = [
  'issue.create',
  'issue.view_public',
  'issue.view_own',
  'issue.view_all',
  'issue.view_internal',
  'issue.support',
  'issue.comment_public',
  'issue.comment_internal',
  'issue.review',
  'issue.verify',
  'issue.reject',
  'issue.mark_duplicate',
  'issue.set_priority',
  'issue.set_visibility',
  'issue.assign',
  'issue.work',
  'issue.resolve_any',
  'issue.confirm_resolution',
  'issue.close',
  'issue.reopen',
  'attachment.upload_evidence',
  'attachment.upload_work',
  'content.moderate',
  'user.view_contact',
  'user.manage',
  'role.assign_worker',
  'role.assign_admin',
  'department.manage',
  'announcement.manage',
  'analytics.view',
  'audit.view',
  'village.manage',
  'category.manage',
  'permission.manage',
  'settings.manage',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

/** Immutable set of permissions the current user holds in one village. */
export class PermissionSet {
  private readonly keys: ReadonlySet<PermissionKey>;

  constructor(keys: Iterable<string>) {
    const valid = new Set<PermissionKey>();
    for (const key of keys) {
      if (isPermissionKey(key)) valid.add(key);
    }
    this.keys = valid;
  }

  has(key: PermissionKey): boolean {
    return this.keys.has(key);
  }

  hasAny(...keys: PermissionKey[]): boolean {
    return keys.some((k) => this.keys.has(k));
  }

  get size(): number {
    return this.keys.size;
  }
}
