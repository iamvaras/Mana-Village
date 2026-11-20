// Delivers pending in-app notifications to phones through the Expo Push Service.
// Woken by the database (statement trigger on notifications, and pg_cron every
// minute as a safety net). Each run claims up to 3 batches of 100 alerts.
import {
  buildMessages,
  chunk,
  EXPO_SEND_URL,
  isRetryableStatus,
  SEND_CHUNK,
  sendResults,
  type ClaimedRow,
  type ExpoTicket,
  type Outgoing,
} from '../_shared/expo-push.ts';
import { authorized, expoHeaders, json, serviceClient } from '../_shared/push-env.ts';

const MAX_BATCHES = 3;

async function deliver(outgoing: Outgoing[]) {
  const answered: { outgoing: Outgoing; ticket: ExpoTicket }[] = [];
  const failed: { outgoing: Outgoing; error: string }[] = [];
  for (const part of chunk(outgoing, SEND_CHUNK)) {
    try {
      const res = await fetch(EXPO_SEND_URL, {
        method: 'POST',
        headers: expoHeaders(),
        body: JSON.stringify(part.map((o) => o.message)),
      });
      if (!res.ok) {
        const error = `Expo returned ${res.status}`;
        if (isRetryableStatus(res.status)) part.forEach((o) => failed.push({ outgoing: o, error }));
        else
          part.forEach((o) =>
            answered.push({ outgoing: o, ticket: { status: 'error', message: error } }),
          );
        continue;
      }
      const body = (await res.json()) as { data?: ExpoTicket[] };
      part.forEach((o, i) => {
        const ticket = body.data?.[i];
        if (ticket) answered.push({ outgoing: o, ticket });
        else failed.push({ outgoing: o, error: 'no ticket in answer' });
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'network error';
      part.forEach((o) => failed.push({ outgoing: o, error }));
    }
  }
  return { answered, failed };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!authorized(req)) return json(401, { error: 'unauthorized' });

  const db = serviceClient();
  let sent = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await db.rpc('push_claim_batch', { p_limit: 100 });
    if (error) return json(500, { error: error.message });
    const rows = (data ?? []) as ClaimedRow[];
    if (rows.length === 0) break;

    const { answered, failed } = await deliver(buildMessages(rows));
    const results = sendResults(rows, answered, failed);
    const recorded = await db.rpc('push_record_send', { p_results: results });
    if (recorded.error) return json(500, { error: recorded.error.message });
    sent += results.filter((r) => r.outcome === 'SENT').length;
    if (rows.length < 100) break;
  }
  return json(200, { sent });
});
