import { describe, expect, it } from 'vitest';
import { friendlyMessage, run, toAppError } from '../src/index';

describe('toAppError', () => {
  it('maps database MV_ codes', () => {
    expect(
      toAppError({ message: 'MV_FORBIDDEN: missing permission issue.verify', code: '42501' }).code,
    ).toBe('FORBIDDEN');
    expect(
      toAppError({ message: 'MV_INVALID_TRANSITION: cannot verify', code: 'P0001' }).code,
    ).toBe('INVALID_TRANSITION');
    expect(toAppError({ message: 'MV_RATE_LIMIT: daily report limit reached' }).code).toBe(
      'RATE_LIMITED',
    );
  });
  it('maps network failures', () => {
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('NETWORK');
    expect(toAppError({ message: 'Network request failed' }).code).toBe('NETWORK');
  });
  it('maps auth failures', () => {
    expect(toAppError({ message: 'JWT expired', code: 'PGRST301' }).code).toBe('AUTH_REQUIRED');
    expect(toAppError({ message: 'x', status: 401 }).code).toBe('AUTH_REQUIRED');
  });
  it('maps permission and constraint errors', () => {
    expect(toAppError({ message: 'permission denied for table issues', code: '42501' }).code).toBe(
      'FORBIDDEN',
    );
    expect(toAppError({ message: 'violates check constraint', code: '23514' }).code).toBe(
      'VALIDATION',
    );
  });
  it('maps wrong OTP to a field error', () => {
    const e = toAppError({
      message: 'Token has expired or is invalid',
      code: 'otp_expired',
      status: 403,
    });
    expect(e.code).toBe('VALIDATION');
    expect(e.fields?.code).toBeDefined();
  });
  it('falls back to UNKNOWN', () => {
    expect(toAppError(null).code).toBe('UNKNOWN');
    expect(friendlyMessage('UNKNOWN')).toMatch(/went wrong/);
  });
});

describe('run', () => {
  it('wraps success', async () => {
    expect(await run(async () => ({ data: 5, error: null }))).toEqual({ ok: true, value: 5 });
  });
  it('wraps errors and thrown exceptions without throwing', async () => {
    const a = await run(async () => ({ data: null, error: { message: 'MV_CONFLICT: changed' } }));
    expect(a.ok).toBe(false);
    const b = await run(async (): Promise<{ data: null; error: null }> => {
      throw new TypeError('Failed to fetch');
    });
    expect(b.ok ? null : b.error.code).toBe('NETWORK');
  });
});
