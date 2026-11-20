import { router, useLocalSearchParams } from 'expo-router';
import { Button, CenteredState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/i18n-provider';

export default function ReportSentScreen() {
  const { s, f } = useI18n();
  const { number } = useLocalSearchParams<{ number?: string }>();
  return (
    <Screen scroll={false}>
      <CenteredState
        title={s.report.submittedTitle}
        body={f(s.report.submittedBody, { number: number ?? '' })}
        action={<Button label={s.report.submittedDone} onPress={() => router.replace('/')} />}
      />
    </Screen>
  );
}
