import { useQuery } from '@tanstack/react-query';
import type { AppError } from '@mana/core';
import type { Announcement } from '@mana/services';
import { unwrap } from '@/features/issues/hooks';

export const announcementKeys = {
  list: (villageId: string) => ['announcements', villageId] as const,
  detail: (id: string) => ['announcements', 'one', id] as const,
};

/** Published, unexpired announcements of the village (pinned first). */
export const useAnnouncements = (villageId: string | null) =>
  useQuery<Announcement[], AppError>({
    queryKey: announcementKeys.list(villageId ?? ''),
    enabled: Boolean(villageId),
    queryFn: () => unwrap((s) => s.announcements.listPublished(villageId ?? '')),
  });

export const useAnnouncement = (id: string) =>
  useQuery<Announcement | null, AppError>({
    queryKey: announcementKeys.detail(id),
    queryFn: () => unwrap((s) => s.announcements.get(id)),
  });
