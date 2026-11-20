// Prepares a staff account for authenticator-app (TOTP) enrolment.
//
// Supabase Auth labels a TOTP factor with the account's email address and refuses
// to enrol accounts that only have a phone number. Staff in Mana Village sign in
// by phone, so for staff roles that require MFA we attach a placeholder,
// non-deliverable address (<user-id>@staff.mana-village.invalid). It is never
// used to sign in (no password, `.invalid` cannot receive mail) and is not shown
// to anyone. Citizens are never given one.
import { createClient } from 'npm:@supabase/supabase-js@2';

/** Reads a required environment variable; the Edge runtime always provides these. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ADMIN_WEB_ORIGIN') ?? 'http://localhost:3000',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { code: 'VALIDATION', message: 'POST only' });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer '))
    return json(401, { code: 'AUTH_REQUIRED', message: 'sign in required' });

  const url = requireEnv('SUPABASE_URL');
  const asCaller = createClient(url, requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await asCaller.auth.getUser(authHeader.slice(7));
  if (userErr || !userData.user)
    return json(401, { code: 'AUTH_REQUIRED', message: 'session invalid' });

  const { data: roles, error: rolesErr } = await asCaller.rpc('get_my_roles');
  if (rolesErr) return json(500, { code: 'UNKNOWN', message: 'could not read roles' });
  const needsMfa =
    Array.isArray(roles) && roles.some((r: { requires_mfa: boolean }) => r.requires_mfa);
  if (!needsMfa)
    return json(403, { code: 'FORBIDDEN', message: 'no staff role requires a security code' });

  if (!userData.user.email) {
    const admin = createClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    const { error } = await admin.auth.admin.updateUserById(userData.user.id, {
      email: `${userData.user.id}@staff.mana-village.invalid`,
      email_confirm: true,
    });
    if (error) return json(500, { code: 'UNKNOWN', message: 'could not prepare account' });
  }
  return json(200, { ready: true });
});
