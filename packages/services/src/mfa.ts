import { err, ok, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { required, run, toAppError, validationError } from './errors';

import type { AuthenticatorAssuranceLevels } from '@supabase/supabase-js';

export type AssuranceLevel = AuthenticatorAssuranceLevels;

export interface MfaStatus {
  current: AssuranceLevel | null;
  /** Level the user can reach with their enrolled factors. */
  next: AssuranceLevel | null;
  verifiedTotpFactorId: string | null;
}

export interface TotpEnrollment {
  factorId: string;
  /** SVG data for the QR code shown during setup. */
  qrCode: string;
  /** Secret for manual entry in the authenticator app. */
  secret: string;
}

export interface MfaService {
  getStatus(): Promise<Result<MfaStatus>>;
  /** Starts authenticator-app setup for a staff member. */
  enrollTotp(): Promise<Result<TotpEnrollment>>;
  /** Verifies a 6-digit code; on success the session becomes aal2. */
  verifyTotp(factorId: string, code: string): Promise<Result<null>>;
}

export function createMfaService(client: ManaClient): MfaService {
  return {
    async getStatus() {
      const aal = required(await run(() => client.auth.mfa.getAuthenticatorAssuranceLevel()));
      if (!aal.ok) return aal;
      const factors = required(await run(() => client.auth.mfa.listFactors()));
      if (!factors.ok) return factors;
      const totp = factors.value.totp.find((f) => f.status === 'verified');
      return ok({
        current: aal.value.currentLevel,
        next: aal.value.nextLevel,
        verifiedTotpFactorId: totp?.id ?? null,
      });
    },

    async enrollTotp() {
      // Staff sign in by phone; Supabase needs an account label to create a TOTP
      // factor, which the prepare-mfa Edge Function provides (staff only).
      const prepared = await run(() => client.functions.invoke('prepare-mfa', { method: 'POST' }));
      if (!prepared.ok) return prepared;

      // Remove unfinished earlier attempts so setup can be restarted.
      const factors = required(await run(() => client.auth.mfa.listFactors()));
      if (factors.ok) {
        for (const f of factors.value.all) {
          if (f.factor_type === 'totp' && f.status === 'unverified') {
            await client.auth.mfa.unenroll({ factorId: f.id });
          }
        }
      }
      const res = required(
        await run(() =>
          client.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'Mana Village admin',
            issuer: 'Mana Village',
          }),
        ),
      );
      if (!res.ok) return res;
      if (res.value.type !== 'totp') return err(toAppError({ message: 'unexpected factor type' }));
      return ok({
        factorId: res.value.id,
        qrCode: res.value.totp.qr_code,
        secret: res.value.totp.secret,
      });
    },

    async verifyTotp(factorId, code) {
      if (!/^\d{6}$/.test(code))
        return validationError({ code: 'Enter the 6-digit code from your app.' });
      const res = await run(() => client.auth.mfa.challengeAndVerify({ factorId, code }));
      return res.ok ? ok(null) : res;
    },
  };
}
