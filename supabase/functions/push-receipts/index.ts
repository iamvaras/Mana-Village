// Asks Expo what happened to recently sent pushes (pg_cron every 15 minutes) and
// revokes phone tokens Expo reports as DeviceNotRegistered.
import {
  chunk,
  EXPO_RECEIPTS_URL,
  RECEIPTS_CHUNK,
  receiptResults,
  type ExpoReceipt,
  type TicketToCheck,
} from '../_shared/expo-push.ts';
import { authorized, expoHeaders, json, serviceClient } from '../_shared/push-env.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!authorized(req)) return json(401, { error: 'unauthorized' });

  const db = serviceClient();
  const { data, error } = await db.rpc('push_tickets_to_check', { p_limit: 300 });
  if (error) return json(500, { error: error.message });
  const toCheck = (data ?? []) as TicketToCheck[];
  if (toCheck.length === 0) return json(200, { checked: 0 });

  const receipts: Record<string, ExpoReceipt> = {};
  for (const part of chunk(toCheck, RECEIPTS_CHUNK)) {
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: expoHeaders(),
      body: JSON.stringify({ ids: part.map((t) => t.ticket_id) }),
    });
    // Try again on the next run; nothing is lost.
    if (!res.ok) return json(502, { error: `Expo returned ${res.status}` });
    const body = (await res.json()) as { data?: Record<string, ExpoReceipt> };
    Object.assign(receipts, body.data ?? {});
  }

  const results = receiptResults(toCheck, receipts);
  const recorded = await db.rpc('push_record_receipts', { p_results: results });
  if (recorded.error) return json(500, { error: recorded.error.message });
  return json(200, { checked: results.checked.length, revoked: results.dead_tokens.length });
});
