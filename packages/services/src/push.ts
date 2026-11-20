import { ok, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { run, validationError } from './errors';

export type PushPlatform = 'ios' | 'android';

const TOKEN_RE = /^(Exponent|Expo)PushToken\[.+\]$/;

/** Links this phone to the signed-in person so alerts also arrive as phone notifications. */
export interface PushService {
  register(token: string, platform: PushPlatform, appVersion?: string): Promise<Result<null>>;
  /** On sign-out, so the next person on this phone does not get the previous person's alerts. */
  unregister(token: string): Promise<Result<null>>;
  /** Phone notifications on or off. The in-app Alerts list is not affected. */
  setEnabled(enabled: boolean): Promise<Result<null>>;
}

export function createPushService(client: ManaClient): PushService {
  return {
    async register(token, platform, appVersion) {
      if (!TOKEN_RE.test(token)) return validationError({ token: 'Not a push token.' });
      const res = await run(() =>
        client.rpc('register_push_token', {
          p_token: token,
          p_platform: platform,
          ...(appVersion ? { p_app_version: appVersion.slice(0, 40) } : {}),
        }),
      );
      return res.ok ? ok(null) : res;
    },

    async unregister(token) {
      const res = await run(() => client.rpc('revoke_push_token', { p_token: token }));
      return res.ok ? ok(null) : res;
    },

    async setEnabled(enabled) {
      const res = await run(() => client.rpc('set_push_enabled', { p_enabled: enabled }));
      return res.ok ? ok(null) : res;
    },
  };
}
