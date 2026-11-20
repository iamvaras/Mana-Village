import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/session-provider';
import { issueKeys } from '@/features/issues/hooks';
import { registerForPush } from './push';
import { pushTarget } from './push-route';

/** Opens the screen a notification points to (also used by the Alerts list). */
export function openPushTarget(data: unknown) {
  const target = pushTarget(data);
  if (target.screen === 'announcement')
    router.push({ pathname: '/announcements/[id]', params: { id: target.id } });
  else if (target.screen === 'confirm')
    router.push({ pathname: '/issue/[id]/confirm', params: { id: target.id } });
  else if (target.screen === 'issue')
    router.push({ pathname: '/issue/[id]', params: { id: target.id } });
  else router.push('/notifications');
}

/**
 * Mounted once the person is signed in: links the phone for push (asking for
 * permission once), opens the right screen when a notification is tapped, and
 * refreshes alerts when one arrives while the app is open.
 */
export function usePush() {
  const { stage } = useSession();
  const queryClient = useQueryClient();
  const ready = stage.kind === 'ready';
  const enabled = ready && stage.profile.push_enabled;
  const userId = ready ? stage.profile.id : undefined;

  useEffect(() => {
    if (enabled && userId) void registerForPush('once');
  }, [enabled, userId]);

  // Tapped while the app was closed or in the background.
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!ready || !last) return;
    if (last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    openPushTarget(last.notification.request.content.data);
    void Notifications.clearLastNotificationResponseAsync();
  }, [ready, last]);

  useEffect(() => {
    if (!ready) return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.notifications });
      const target = pushTarget(n.request.content.data);
      if (target.screen === 'issue' || target.screen === 'confirm')
        void queryClient.invalidateQueries({ queryKey: issueKeys.detail(target.id) });
      if (target.screen === 'announcement')
        void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    });
    return () => sub.remove();
  }, [ready, queryClient]);
}
