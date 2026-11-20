import type { TimelineEntry } from '@mana/core';
import type { Strings } from '@/i18n/en';
import { interpolate } from '@/i18n/translate';

export interface TimelineText {
  /** Who did it: a name, "You", a role, "A resident" or the system. */
  actor: string;
  /** What happened, e.g. "Started work". */
  action: string;
  /** Reason or note given with a status change, if any. */
  detail: string | null;
}

const ROLE_KEYS = [
  'CITIZEN',
  'WORKER',
  'SECRETARY',
  'PRESIDENT',
  'VICE_PRESIDENT',
  'SUPER_ADMIN',
] as const;
type RoleKey = (typeof ROLE_KEYS)[number];
const isRole = (v: string | null): v is RoleKey =>
  v !== null && (ROLE_KEYS as readonly string[]).includes(v);

export function actorLabel(
  e: { isMine: boolean; isSystem: boolean; actorName: string | null; actorRoleKey: string | null },
  s: Strings,
): string {
  if (e.isSystem) return s.issue.system;
  if (e.isMine) return s.issue.you;
  const role =
    isRole(e.actorRoleKey) && e.actorRoleKey !== 'CITIZEN' ? s.roles[e.actorRoleKey] : null;
  if (e.actorName) return role ? `${e.actorName} (${role})` : e.actorName;
  return role ?? s.issue.aResident;
}

/** Plain-language text for one timeline entry, in the current language. */
export function timelineText(e: TimelineEntry, s: Strings): TimelineText {
  const actor = actorLabel(e, s);
  const ev = s.issue.event;
  switch (e.kind) {
    case 'status': {
      let action: string;
      if (e.toStatus === 'SUBMITTED') {
        action =
          e.photoCount > 0
            ? interpolate(ev.SUBMITTED_PHOTOS, { n: String(e.photoCount) })
            : ev.SUBMITTED;
      } else if (
        e.toStatus === 'VERIFIED' &&
        (e.fromStatus === 'REJECTED' || e.fromStatus === 'DUPLICATE')
      ) {
        action = ev.VERIFIED_AGAIN;
      } else if (
        e.toStatus === 'UNDER_REVIEW' &&
        (e.fromStatus === 'REJECTED' || e.fromStatus === 'DUPLICATE')
      ) {
        action = ev.VERIFIED_AGAIN;
      } else {
        action = e.toStatus ? ev[e.toStatus] : ev.comment;
      }
      return {
        actor,
        action,
        detail: e.reason?.trim() ? interpolate(s.issue.reason, { reason: e.reason.trim() }) : null,
      };
    }
    case 'accepted':
      return { actor, action: ev.accepted, detail: e.reason?.trim() || null };
    case 'photo':
      return {
        actor,
        action:
          e.attachmentKind === 'COMPLETION'
            ? ev.photoCompletion
            : e.attachmentKind === 'PROGRESS'
              ? ev.photoProgress
              : ev.photo,
        detail: null,
      };
    case 'comment':
      return { actor, action: ev.comment, detail: null };
  }
}
