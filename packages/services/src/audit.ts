import { ok, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { required, run } from './errors';

/** Filter groups offered on the audit log screen (same names as list_audit_logs). */
export const AUDIT_AREAS = ['issue', 'user', 'content', 'config'] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

export const isAuditArea = (v: unknown): v is AuditArea =>
  typeof v === 'string' && (AUDIT_AREAS as readonly string[]).includes(v);

/** Same shape as the generated database Json type. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

export interface AuditEntry {
  id: number;
  occurredAt: string;
  actorUserId: string | null;
  /** Null for system actions and deleted accounts. */
  actorName: string | null;
  actorRoleKey: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  issueNumber: string | null;
  before: Json;
  after: Json;
  metadata: Json;
}

export interface AuditFilter {
  area?: AuditArea | undefined;
  actorId?: string | undefined;
  entityId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  /** Paging: rows older than this id. */
  beforeId?: number | undefined;
  limit?: number | undefined;
}

export interface AuditChange {
  field: string;
  before: Json | undefined;
  after: Json | undefined;
}

/** Bookkeeping columns that change on every write and say nothing to a reader. */
const NOISE = new Set(['updated_at', 'updated_by', 'version']);

const isObject = (v: Json | undefined): v is { [key: string]: Json | undefined } =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The fields that differ between `before` and `after`, in a stable order.
 * A created row lists all its fields; a deleted row lists what it held.
 */
export function auditChanges(before: Json, after: Json): AuditChange[] {
  const b = isObject(before) ? before : {};
  const a = isObject(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  const out: AuditChange[] = [];
  for (const field of keys) {
    if (NOISE.has(field)) continue;
    const was = b[field];
    const now = a[field];
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    out.push({ field, before: was, after: now });
  }
  return out;
}

/** "issue.priority_changed" -> "Issue: priority changed". */
export function auditActionLabel(action: string): string {
  const [entity = '', verb = ''] = action.split('.');
  const words = (s: string) => s.replace(/_/g, ' ');
  const e = words(entity);
  return `${e.charAt(0).toUpperCase()}${e.slice(1)}: ${words(verb)}`;
}

export interface AuditService {
  list(villageId: string, filter?: AuditFilter): Promise<Result<AuditEntry[]>>;
}

export function createAuditService(client: ManaClient): AuditService {
  return {
    async list(villageId, filter = {}) {
      const res = required(
        await run(() =>
          client.rpc('list_audit_logs', {
            p_village_id: villageId,
            ...(filter.area ? { p_area: filter.area } : {}),
            ...(filter.actorId ? { p_actor_id: filter.actorId } : {}),
            ...(filter.entityId ? { p_entity_id: filter.entityId } : {}),
            ...(filter.from ? { p_from: filter.from.toISOString() } : {}),
            ...(filter.to ? { p_to: filter.to.toISOString() } : {}),
            ...(filter.beforeId ? { p_before_id: filter.beforeId } : {}),
            ...(filter.limit ? { p_limit: filter.limit } : {}),
          }),
        ),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((r) => ({
          id: Number(r.id),
          occurredAt: r.occurred_at,
          actorUserId: r.actor_user_id,
          actorName: r.actor_name,
          actorRoleKey: r.actor_role_key,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          issueNumber: r.issue_number,
          before: r.before,
          after: r.after,
          metadata: r.metadata,
        })),
      );
    },
  };
}
