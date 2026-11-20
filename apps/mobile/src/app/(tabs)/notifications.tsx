import { CenteredState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/i18n-provider';

export default function NotificationsScreen() {
  const { s } = useI18n();
  return (
    <Screen scroll={false}>
      <CenteredState title={s.notifications.emptyTitle} body={s.notifications.emptyBody} />
    </Screen>
  );
}
