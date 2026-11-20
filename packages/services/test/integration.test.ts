/**
 * Runs against the local Supabase stack (seed data) when MANA_SUPABASE_URL and
 * MANA_SUPABASE_ANON_KEY are set (CI database job). Skipped otherwise.
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '@mana/core';
import { createServices } from '../src/index';

const url = process.env.MANA_SUPABASE_URL;
const anonKey = process.env.MANA_SUPABASE_ANON_KEY;
const enabled = Boolean(url && anonKey);
const RMP = 'a0000000-0000-4000-8000-000000000001';

function services() {
  const client = createClient<Database>(url ?? '', anonKey ?? '', {
    auth: { persistSession: false },
  });
  return createServices(client);
}

describe.skipIf(!enabled)('services against local Supabase', () => {
  it('signs a citizen in with phone OTP and loads profile + permissions', async () => {
    const s = services();
    expect((await s.auth.sendOtp('90000 00015')).ok).toBe(true);
    const session = await s.auth.verifyOtp('9000000015', '123456');
    expect(session.ok).toBe(true);

    const profile = await s.profile.getMyProfile();
    expect(profile.ok && profile.value?.full_name).toBe('Lakshmi Narayana');

    const perms = await s.permissions.getMyPermissions(RMP);
    expect(perms.ok && perms.value.has('issue.create')).toBe(true);
    expect(perms.ok && perms.value.has('issue.verify')).toBe(false);

    const villages = await s.villages.listActive();
    expect(villages.ok && villages.value.map((v) => v.code)).toEqual(['KDP', 'RMP']);
  });

  it('rejects a wrong OTP with a clear error', async () => {
    const s = services();
    const res = await s.auth.verifyOtp('9000000016', '000000');
    expect(res.ok ? 'ok' : res.error.code).toBe('VALIDATION');
  });

  it('a secretary without the security code only has citizen powers', async () => {
    const s = services();
    await s.auth.verifyOtp('9000000012', '123456');
    const roles = await s.permissions.getMyRoles();
    expect(roles.ok && roles.value.find((r) => r.roleKey === 'SECRETARY')?.activeNow).toBe(false);
    const res = await s.admin.listUsers({ villageId: RMP });
    expect(res.ok ? 'ok' : res.error.code).toBe('FORBIDDEN');
  });
});
