// Invite a staff member (worker, secretary, ...) by phone number.
//
// Security model:
//   * The caller's own JWT is used for the role grant (public.grant_role), so the
//     database decides whether the caller may grant that role in that village.
//   * The service role is used only to create the login account and profile for a
//     person who has never signed in. It is never exposed to clients.
import { createClient } from 'npm:@supabase/supabase-js@2';

/** Reads a required environment variable; the Edge runtime always provides these. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

type InviteBody = {
  phone: string;
  full_name: string;
  village_id: string;
  role_key: 'WORKER' | 'SECRETARY' | 'PRESIDENT' | 'VICE_PRESIDENT';
  department_id?: string;
  reason?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_KEYS = ['WORKER', 'SECRETARY', 'PRESIDENT', 'VICE_PRESIDENT'];

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

/** Normalize Indian mobile numbers to E.164 without "+" (Supabase Auth format). */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `91${local}` : null;
}

function parseBody(raw: unknown): InviteBody | string {
  if (typeof raw !== 'object' || raw === null) return 'invalid body';
  const b = raw as Record<string, unknown>;
  if (typeof b.phone !== 'string') return 'phone is required';
  if (
    typeof b.full_name !== 'string' ||
    b.full_name.trim().length < 2 ||
    b.full_name.trim().length > 80
  )
    return 'full_name must be 2-80 characters';
  if (typeof b.village_id !== 'string' || !UUID_RE.test(b.village_id))
    return 'village_id is invalid';
  if (typeof b.role_key !== 'string' || !ROLE_KEYS.includes(b.role_key))
    return 'role_key is invalid';
  if (
    b.department_id !== undefined &&
    (typeof b.department_id !== 'string' || !UUID_RE.test(b.department_id))
  )
    return 'department_id is invalid';
  if (b.reason !== undefined && (typeof b.reason !== 'string' || b.reason.length > 500))
    return 'reason is invalid';
  return b as unknown as InviteBody;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { code: 'VALIDATION', message: 'POST only' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer '))
    return json(401, { code: 'AUTH_REQUIRED', message: 'sign in required' });

  const url = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const body = parseBody(await req.json().catch(() => null));
  if (typeof body === 'string') return json(400, { code: 'VALIDATION', message: body });
  const phone = normalizeIndianPhone(body.phone);
  if (!phone)
    return json(400, { code: 'VALIDATION', message: 'enter a valid Indian mobile number' });

  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  // Pre-check so we never create accounts for callers who cannot grant the role.
  // grant_role re-checks everything in the database.
  const needed = body.role_key === 'WORKER' ? 'role.assign_worker' : 'role.assign_admin';
  const { data: perms, error: permErr } = await asCaller.rpc('get_my_permissions', {
    p_village_id: body.village_id,
  });
  if (permErr) return json(401, { code: 'AUTH_REQUIRED', message: 'session invalid' });
  if (!Array.isArray(perms) || !perms.includes(needed)) {
    return json(403, { code: 'FORBIDDEN', message: `missing permission ${needed}` });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: existingId, error: findErr } = await admin.rpc('service_find_user_by_phone', {
    p_phone: phone,
  });
  if (findErr) return json(500, { code: 'UNKNOWN', message: 'lookup failed' });

  let userId = typeof existingId === 'string' ? existingId : null;
  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
    });
    if (createErr || !created.user)
      return json(500, { code: 'UNKNOWN', message: 'could not create account' });
    userId = created.user.id;
  }

  const { error: profileErr } = await admin.rpc('service_ensure_profile', {
    p_user_id: userId,
    p_full_name: body.full_name.trim(),
    p_village_id: body.village_id,
  });
  if (profileErr) return json(500, { code: 'UNKNOWN', message: 'could not create profile' });

  const { data: grantId, error: grantErr } = await asCaller.rpc('grant_role', {
    p_user_id: userId,
    p_role_key: body.role_key,
    p_village_id: body.village_id,
    p_department_id: body.department_id ?? null,
    p_reason: body.reason ?? null,
  });
  if (grantErr) {
    const forbidden = grantErr.message.startsWith('MV_FORBIDDEN');
    return json(forbidden ? 403 : 400, {
      code: forbidden ? 'FORBIDDEN' : 'VALIDATION',
      message: grantErr.message,
    });
  }

  return json(200, { user_id: userId, user_role_id: grantId });
});
