import type { PermissionKey, PermissionSet } from '@mana/core';

export interface NavItem {
  label: string;
  href: string;
  /** Shown when the user holds any of these permissions. UI only; pages re-check. */
  anyOf: readonly PermissionKey[];
  /** Phase in which the screen is built. Items for later phases are shown disabled. */
  availableFrom: number;
}

export const CURRENT_PHASE = 10;

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', href: '/', anyOf: ['analytics.view', 'issue.view_all'], availableFrom: 3 },
  { label: 'All Issues', href: '/issues', anyOf: ['issue.view_all'], availableFrom: 6 },
  { label: 'Departments', href: '/departments', anyOf: ['department.manage'], availableFrom: 7 },
  { label: 'Workers', href: '/workers', anyOf: ['role.assign_worker'], availableFrom: 7 },
  {
    label: 'Users',
    href: '/users',
    anyOf: ['user.manage', 'role.assign_admin'],
    availableFrom: 11,
  },
  { label: 'Categories', href: '/categories', anyOf: ['category.manage'], availableFrom: 11 },
  {
    label: 'Announcements',
    href: '/announcements',
    anyOf: ['announcement.manage'],
    availableFrom: 11,
  },
  { label: 'Analytics', href: '/analytics', anyOf: ['analytics.view'], availableFrom: 11 },
  { label: 'Audit Logs', href: '/audit-logs', anyOf: ['audit.view'], availableFrom: 11 },
  {
    label: 'Settings',
    href: '/settings',
    anyOf: ['settings.manage', 'permission.manage', 'village.manage'],
    availableFrom: 11,
  },
];

export function visibleNavItems(permissions: PermissionSet): NavItem[] {
  return NAV_ITEMS.filter((item) => permissions.hasAny(...item.anyOf));
}
