import { CenteredState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/i18n-provider';

export default function MyIssuesScreen() {
  const { s } = useI18n();
  return (
    <Screen scroll={false}>
      <CenteredState title={s.myIssues.emptyTitle} body={s.myIssues.emptyBody} />
    </Screen>
  );
}
