import { useQuery } from '@tanstack/react-query';
import type { AppError } from '@mana/core';
import type { MyRole, WorkItem } from '@mana/services';
import { useSession } from '@/features/auth/session-provider';
import { unwrap } from '@/features/issues/hooks';

export const workKeys = {
  roles: (userId: string | undefined) => ['my-roles', userId] as const,
  mine: ['my-work'] as const,
};

/** The signed-in person's roles. For showing or hiding screens only: the database decides. */
export const useMyRoles = () => {
  const { session, stage } = useSession();
  const userId = session?.user.id;
  return useQuery<MyRole[], AppError>({
    queryKey: workKeys.roles(userId),
    enabled: Boolean(userId) && stage.kind === 'ready',
    staleTime: 5 * 60_000,
    queryFn: () => unwrap((s) => s.permissions.getMyRoles()),
  });
};

export const isWorker = (roles: readonly MyRole[] | undefined): boolean =>
  (roles ?? []).some((r) => r.roleKey === 'WORKER' && r.activeNow);

export const useIsWorker = (): boolean => isWorker(useMyRoles().data);

export const useMyWork = (enabled = true) =>
  useQuery<WorkItem[], AppError>({
    queryKey: workKeys.mine,
    enabled,
    queryFn: () => unwrap((s) => s.work.listMyWork()),
  });
