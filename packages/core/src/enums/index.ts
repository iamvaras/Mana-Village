/**
 * Domain enums. These mirror the Postgres enums in supabase/migrations.
 * Keep both in sync: add values only, never remove or rename.
 */
export const ISSUE_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
  'REOPENED',
  'DUPLICATE',
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/** Statuses after which no further work is expected (unless reopened/reconsidered). */
export const TERMINAL_STATUSES: readonly IssueStatus[] = ['CLOSED', 'REJECTED', 'DUPLICATE'];

/** "Open" for dashboards and similar-issue search. */
export function isOpenStatus(status: IssueStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

export const ISSUE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const ISSUE_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export type IssueVisibility = (typeof ISSUE_VISIBILITIES)[number];

export const CONTENT_VISIBILITIES = ['PUBLIC', 'INTERNAL'] as const;
export type ContentVisibility = (typeof CONTENT_VISIBILITIES)[number];

export const ATTACHMENT_KINDS = ['INITIAL_EVIDENCE', 'PROGRESS', 'COMPLETION', 'OTHER'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ASSIGNMENT_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'SUPERSEDED',
  'COMPLETED',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ACTION_SOURCES = ['MOBILE', 'ADMIN_WEB', 'SYSTEM'] as const;
export type ActionSource = (typeof ACTION_SOURCES)[number];

export const ROLE_KEYS = [
  'CITIZEN',
  'PRESIDENT',
  'VICE_PRESIDENT',
  'SECRETARY',
  'WORKER',
  'SUPER_ADMIN',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const LANGUAGES = ['te', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
