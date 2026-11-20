import { ok, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { required, run, validationError } from './errors';

export interface DepartmentSummary {
  id: string;
  name: string;
  nameLocal: string | null;
  description: string | null;
  isActive: boolean;
  workerCount: number;
  openIssueCount: number;
}

export interface WorkerSummary {
  /** The WORKER role grant; revoke this to remove someone from a department. */
  userRoleId: string;
  userId: string;
  fullName: string;
  displayName: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  departmentId: string;
  departmentName: string;
  grantedAt: string;
  openAssignments: number;
  completedAssignments: number;
}

export interface DepartmentInput {
  name: string;
  nameLocal?: string | undefined;
  description?: string | undefined;
}

export interface DepartmentsService {
  /** Departments with worker and open-issue counts (staff only). */
  list(villageId: string): Promise<Result<DepartmentSummary[]>>;
  /** Creates a department, or edits it when `id` is given. Returns its id. */
  save(villageId: string, input: DepartmentInput, id?: string): Promise<Result<string>>;
  setActive(departmentId: string, active: boolean): Promise<Result<null>>;
  /** Workers with their workload. Never includes phone numbers. */
  listWorkers(villageId: string, departmentId?: string): Promise<Result<WorkerSummary[]>>;
}

/** Client-side checks matching public.upsert_department. */
export function departmentProblems(input: DepartmentInput): Record<string, string> | null {
  const problems: Record<string, string> = {};
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) problems['name'] = 'Use 2 to 100 characters.';
  if ((input.nameLocal ?? '').trim().length > 100)
    problems['nameLocal'] = 'Use at most 100 characters.';
  if ((input.description ?? '').trim().length > 500)
    problems['description'] = 'Use at most 500 characters.';
  return Object.keys(problems).length > 0 ? problems : null;
}

export function createDepartmentsService(client: ManaClient): DepartmentsService {
  return {
    async list(villageId) {
      const res = required(
        await run(() => client.rpc('admin_list_departments', { p_village_id: villageId })),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((d) => ({
          id: d.id,
          name: d.name,
          nameLocal: d.name_local,
          description: d.description,
          isActive: d.is_active,
          workerCount: Number(d.worker_count),
          openIssueCount: Number(d.open_issue_count),
        })),
      );
    },

    async save(villageId, input, id) {
      const problems = departmentProblems(input);
      if (problems) return validationError(problems);
      const nameLocal = input.nameLocal?.trim();
      const description = input.description?.trim();
      return required(
        await run(() =>
          client.rpc('upsert_department', {
            p_village_id: villageId,
            p_name: input.name.trim(),
            ...(nameLocal ? { p_name_local: nameLocal } : {}),
            ...(description ? { p_description: description } : {}),
            ...(id ? { p_id: id } : {}),
          }),
        ),
      );
    },

    async setActive(departmentId, active) {
      const res = await run(() =>
        client.rpc('set_department_active', { p_department_id: departmentId, p_active: active }),
      );
      return res.ok ? ok(null) : res;
    },

    async listWorkers(villageId, departmentId) {
      const res = required(
        await run(() =>
          client.rpc('admin_list_workers', {
            p_village_id: villageId,
            ...(departmentId ? { p_department_id: departmentId } : {}),
          }),
        ),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((w) => ({
          userRoleId: w.user_role_id,
          userId: w.user_id,
          fullName: w.full_name,
          displayName: w.display_name,
          status: w.user_status,
          departmentId: w.department_id,
          departmentName: w.department_name,
          grantedAt: w.granted_at,
          openAssignments: Number(w.open_assignments),
          completedAssignments: Number(w.completed_assignments),
        })),
      );
    },
  };
}
