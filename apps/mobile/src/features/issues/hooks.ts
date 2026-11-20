import { useQuery } from '@tanstack/react-query';
import type { AppError, TimelineRow } from '@mana/core';
import type {
  AppNotification,
  IssueComment,
  IssueDetail,
  IssuePhoto,
  IssueSummary,
  MyIssuesFilter,
  Services,
} from '@mana/services';
import type { Result } from '@mana/core';
import { services } from '@/lib/supabase';

/** Runs a service call for react-query: resolves with the value or rejects with the AppError. */
async function unwrap<T>(call: (s: Services) => Promise<Result<T>>): Promise<T> {
  if (!services) throw { code: 'UNKNOWN', message: 'not configured' } satisfies AppError;
  const res = await call(services);
  if (!res.ok) throw res.error;
  return res.value;
}

export const issueKeys = {
  mine: (filter: MyIssuesFilter) => ['my-issues', filter] as const,
  detail: (id: string) => ['issue', id] as const,
  timeline: (id: string) => ['issue', id, 'timeline'] as const,
  comments: (id: string) => ['issue', id, 'comments'] as const,
  photos: (id: string) => ['issue', id, 'photos'] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
};

export const useMyIssues = (filter: MyIssuesFilter) =>
  useQuery<IssueSummary[], AppError>({
    queryKey: issueKeys.mine(filter),
    queryFn: () => unwrap((s) => s.issueReads.listMine(filter)),
  });

export const useIssue = (id: string) =>
  useQuery<IssueDetail | null, AppError>({
    queryKey: issueKeys.detail(id),
    queryFn: () => unwrap((s) => s.issueReads.getIssue(id)),
  });

export const useTimeline = (id: string) =>
  useQuery<TimelineRow[], AppError>({
    queryKey: issueKeys.timeline(id),
    queryFn: () => unwrap((s) => s.issueReads.getTimeline(id)),
  });

export const useComments = (id: string) =>
  useQuery<IssueComment[], AppError>({
    queryKey: issueKeys.comments(id),
    queryFn: () => unwrap((s) => s.issueReads.listComments(id)),
  });

export const usePhotos = (id: string) =>
  useQuery<IssuePhoto[], AppError>({
    queryKey: issueKeys.photos(id),
    // Private links last an hour; refresh well before they expire.
    staleTime: 30 * 60_000,
    queryFn: () => unwrap((s) => s.issueReads.listPhotos(id)),
  });

export const useNotifications = () =>
  useQuery<AppNotification[], AppError>({
    queryKey: issueKeys.notifications,
    queryFn: () => unwrap((s) => s.notifications.list()),
  });

export const useUnreadCount = () =>
  useQuery<number, AppError>({
    queryKey: issueKeys.unread,
    refetchInterval: 60_000,
    queryFn: () => unwrap((s) => s.notifications.unreadCount()),
  });

export { unwrap };
