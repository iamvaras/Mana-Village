import type { IssuePriority, IssueStatus, TimelineEntry } from '@mana/core';

export const STATUS_LABEL: Readonly<Record<IssueStatus, string>> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  VERIFIED: 'Verified',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
  REOPENED: 'Reopened',
  DUPLICATE: 'Duplicate',
};

export const ROLE_LABEL: Readonly<Record<string, string>> = {
  CITIZEN: 'Resident',
  WORKER: 'Worker',
  SECRETARY: 'EO / Secretary',
  PRESIDENT: 'President',
  VICE_PRESIDENT: 'Vice-President',
  SUPER_ADMIN: 'Super Admin',
};

export function actorText(e: {
  isMine: boolean;
  isSystem: boolean;
  actorName: string | null;
  actorRoleKey: string | null;
}): string {
  if (e.isSystem) return 'System';
  const role = e.actorRoleKey ? ROLE_LABEL[e.actorRoleKey] : undefined;
  const name = e.isMine ? 'You' : e.actorName;
  if (name && role && e.actorRoleKey !== 'CITIZEN') return `${name} (${role})`;
  return name ?? role ?? 'Resident';
}

export function eventText(e: TimelineEntry): string {
  switch (e.kind) {
    case 'status':
      if (e.toStatus === 'SUBMITTED')
        return e.photoCount > 0 ? `Reported with ${e.photoCount} photo(s)` : 'Reported';
      return e.fromStatus && e.toStatus
        ? `${STATUS_LABEL[e.fromStatus]} → ${STATUS_LABEL[e.toStatus]}`
        : e.toStatus
          ? STATUS_LABEL[e.toStatus]
          : 'Status changed';
    case 'accepted':
      return 'Accepted the work';
    case 'photo':
      return e.attachmentKind === 'COMPLETION'
        ? 'Added a completion photo'
        : e.attachmentKind === 'PROGRESS'
          ? 'Added a work photo'
          : 'Added a photo';
    case 'comment':
      return e.visibility === 'INTERNAL' ? 'Added an internal note' : 'Commented';
  }
}

const STATUS_TONE: Readonly<Record<IssueStatus, string>> = {
  SUBMITTED: 'bg-amber-50 text-amber-800',
  UNDER_REVIEW: 'bg-amber-50 text-amber-800',
  VERIFIED: 'bg-sky-50 text-sky-800',
  ASSIGNED: 'bg-sky-50 text-sky-800',
  IN_PROGRESS: 'bg-sky-50 text-sky-800',
  REOPENED: 'bg-orange-50 text-orange-800',
  RESOLVED: 'bg-green-50 text-green-800',
  CLOSED: 'bg-green-50 text-green-800',
  REJECTED: 'bg-neutral-100 text-neutral-700',
  DUPLICATE: 'bg-neutral-100 text-neutral-700',
};

export function statusClass(status: IssueStatus): string {
  return STATUS_TONE[status];
}

export const PRIORITY_LABEL: Readonly<Record<IssuePriority, string>> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

const PRIORITY_TONE: Readonly<Record<IssuePriority, string>> = {
  LOW: 'text-neutral-600',
  MEDIUM: 'text-neutral-700',
  HIGH: 'font-medium text-amber-800',
  CRITICAL: 'font-semibold text-red-700',
};

export function priorityClass(priority: IssuePriority): string {
  return PRIORITY_TONE[priority];
}

/** Short age such as "45 min", "5 h" or "12 d". */
export function ageText(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
