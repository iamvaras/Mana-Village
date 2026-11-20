import { Button, CenteredState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';

export default function SuspendedScreen() {
  const { s } = useI18n();
  return (
    <Screen scroll={false}>
      <CenteredState
        title={s.suspended.title}
        body={s.suspended.body}
        action={
          <Button
            variant="secondary"
            label={s.profile.signOut}
            onPress={() => void services?.auth.signOut()}
          />
        }
      />
    </Screen>
  );
}
