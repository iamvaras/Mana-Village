import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { services } from '@/lib/supabase';

const TOKEN_KEY = 'mana.push.token';
const ASKED_KEY = 'mana.push.asked';

/** Alerts that arrive while the app is open still show as a banner. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type RegisterOutcome =
  'registered' | 'denied' | 'not_asked' | 'unsupported' | 'not_configured' | 'failed';

/** The Expo project id from app.json (extra.eas.projectId), set by `eas init`. */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Links this phone to the signed-in person. Asks for permission at most once by
 * itself (`ask: 'once'`); the Settings switch asks again (`ask: 'always'`).
 * Emulators and builds without an Expo project id cannot get a push token.
 */
export async function registerForPush(ask: 'never' | 'once' | 'always'): Promise<RegisterOutcome> {
  if (!services || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return 'unsupported';
  if (!Device.isDevice) return 'unsupported';
  const id = projectId();
  if (!id) return 'not_configured';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Mana Village',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    const canAskAgain = current.canAskAgain;
    if (status !== 'granted') {
      const askedBefore = (await SecureStore.getItemAsync(ASKED_KEY)) === '1';
      const mayAsk = ask === 'always' || (ask === 'once' && !askedBefore);
      if (!mayAsk || !canAskAgain) return askedBefore || !canAskAgain ? 'denied' : 'not_asked';
      await SecureStore.setItemAsync(ASKED_KEY, '1');
      ({ status } = await Notifications.requestPermissionsAsync());
      if (status !== 'granted') return 'denied';
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    const res = await services.push.register(
      token,
      Platform.OS,
      Constants.expoConfig?.version ?? undefined,
    );
    if (!res.ok) return 'failed';
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return 'registered';
  } catch {
    return 'failed';
  }
}

/** Unlinks this phone (before signing out), so the next person does not get these alerts. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token && services) await services.push.unregister(token);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Signing out must still work offline; the server drops dead tokens later.
  }
}

/** Sign out, unlinking this phone first. */
export async function signOutAndUnlinkPhone(): Promise<void> {
  await unregisterPush();
  await services?.auth.signOut();
}
