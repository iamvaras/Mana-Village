// Shared setup for the push Edge Functions (Deno).
import { createClient } from 'npm:@supabase/supabase-js@2';

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Service-role client. Used only inside these functions, never sent to a phone or browser. */
export function serviceClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

/** Only the database (pg_net, with the Vault secret) may call these functions. */
export function authorized(req: Request): boolean {
  const expected = Deno.env.get('PUSH_SECRET');
  const given = req.headers.get('x-push-secret');
  if (!expected || !given || expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export function expoHeaders(): Record<string, string> {
  const token = Deno.env.get('EXPO_ACCESS_TOKEN');
  return {
    accept: 'application/json',
    'accept-encoding': 'gzip, deflate',
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
