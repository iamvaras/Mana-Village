import type { Session } from '@supabase/supabase-js';
import { err, normalizeIndianPhone, ok, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { run, toAppError, validationError } from './errors';

export interface AuthService {
  /** Sends a 6-digit OTP by SMS. `phone` may be typed in any common format. */
  sendOtp(phone: string): Promise<Result<{ phone: string }>>;
  verifyOtp(phone: string, code: string): Promise<Result<Session>>;
  getSession(): Promise<Result<Session | null>>;
  signOut(): Promise<Result<null>>;
}

export function createAuthService(client: ManaClient): AuthService {
  return {
    async sendOtp(input) {
      const phone = normalizeIndianPhone(input);
      if (!phone) return validationError({ phone: 'Enter a valid 10-digit mobile number.' });
      const res = await run(() => client.auth.signInWithOtp({ phone }));
      return res.ok ? ok({ phone }) : res;
    },

    async verifyOtp(input, code) {
      const phone = normalizeIndianPhone(input);
      if (!phone) return validationError({ phone: 'Enter a valid 10-digit mobile number.' });
      if (!/^\d{6}$/.test(code)) return validationError({ code: 'Enter the 6-digit code.' });
      const res = await run(() => client.auth.verifyOtp({ phone, token: code, type: 'sms' }));
      if (!res.ok) return res;
      if (!res.value.session)
        return err(toAppError({ message: 'MV_AUTH_REQUIRED: no session returned' }));
      return ok(res.value.session);
    },

    async getSession() {
      const res = await run(() => client.auth.getSession());
      return res.ok ? ok(res.value.session) : res;
    },

    async signOut() {
      const res = await run(() => client.auth.signOut());
      return res.ok ? ok(null) : res;
    },
  };
}
