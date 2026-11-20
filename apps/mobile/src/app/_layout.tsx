import { useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CenteredState, Button, Screen } from '@/components/ui';
import { SessionProvider, useSession } from '@/features/auth/session-provider';
import { I18nProvider, useI18n } from '@/i18n/i18n-provider';
import { env } from '@/lib/env';

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          {env ? (
            <SessionProvider>
              <RootNavigator />
            </SessionProvider>
          ) : (
            <NotConfigured />
          )}
        </I18nProvider>
      </QueryClientProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

/** Screens are reachable only in the matching sign-in stage. */
function RootNavigator() {
  const { stage, retryProfile } = useSession();
  const { s, errorText } = useI18n();

  if (stage.kind === 'starting' || stage.kind === 'loading_profile') {
    return (
      <Screen scroll={false}>
        <CenteredState loading title={s.common.appName} />
      </Screen>
    );
  }
  if (stage.kind === 'profile_error') {
    return (
      <Screen scroll={false}>
        <CenteredState
          title={s.common.appName}
          body={errorText(stage.error)}
          action={<Button label={s.common.retry} onPress={retryProfile} />}
        />
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={stage.kind === 'signed_out'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={stage.kind === 'needs_profile'}>
        <Stack.Screen name="profile-setup" />
      </Stack.Protected>
      <Stack.Protected guard={stage.kind === 'suspended'}>
        <Stack.Screen name="suspended" />
      </Stack.Protected>
      <Stack.Protected guard={stage.kind === 'ready'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="report" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="report-sent" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="issue/[id]/index"
          options={{ headerShown: true, headerBackTitle: '' }}
        />
        <Stack.Screen
          name="issue/[id]/confirm"
          options={{ headerShown: true, headerBackTitle: '' }}
        />
      </Stack.Protected>
    </Stack>
  );
}

function NotConfigured() {
  const { s } = useI18n();
  return (
    <Screen scroll={false}>
      <CenteredState title={s.config.title} body={s.config.body} />
    </Screen>
  );
}
