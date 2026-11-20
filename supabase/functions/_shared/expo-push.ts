// Pure helpers for talking to the Expo Push Service. No Deno or network APIs here,
// so the same file is unit-tested from packages/services (vitest).
// Expo docs: https://docs.expo.dev/push-notifications/sending-notifications/

export const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo accepts at most 100 messages per send request and 1000 ids per receipts request. */
export const SEND_CHUNK = 100;
export const RECEIPTS_CHUNK = 1000;

/** A row from public.push_claim_batch. */
export interface ClaimedRow {
  notification_id: string;
  title: string;
  body: string;
  route: string | null;
  issue_id: string | null;
  tokens: string[];
}

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: 'default';
  data: { notificationId: string; route: string | null; issueId: string | null };
}

/** One message per phone, remembering which alert and phone it belongs to. */
export interface Outgoing {
  notificationId: string;
  token: string;
  message: ExpoMessage;
}

export type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export type ExpoReceipt =
  { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } };

/** What public.push_record_send expects for one alert. */
export interface SendResult {
  notification_id: string;
  outcome: 'SENT' | 'RETRY' | 'FAILED';
  tickets: { id: string; token: string }[];
  dead_tokens: string[];
  error?: string;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const VALID_TOKEN = /^(Exponent|Expo)PushToken\[.+\]$/;

export function buildMessages(rows: readonly ClaimedRow[]): Outgoing[] {
  return rows.flatMap((row) =>
    row.tokens
      .filter((token) => VALID_TOKEN.test(token))
      .map((token) => ({
        notificationId: row.notification_id,
        token,
        message: {
          to: token,
          title: row.title,
          body: row.body,
          sound: 'default' as const,
          priority: 'high' as const,
          channelId: 'default' as const,
          data: { notificationId: row.notification_id, route: row.route, issueId: row.issue_id },
        },
      })),
  );
}

/**
 * Turns Expo's answer into one result per alert.
 * - tickets: Expo's per-message tickets, in the order sent, for the messages that got an answer.
 * - failed: messages whose request failed as a whole (network, 429, 5xx): worth retrying.
 * An alert counts as SENT if at least one phone took it. DeviceNotRegistered phones are dead.
 */
export function sendResults(
  rows: readonly ClaimedRow[],
  answered: readonly { outgoing: Outgoing; ticket: ExpoTicket }[],
  failed: readonly { outgoing: Outgoing; error: string }[],
): SendResult[] {
  return rows.map((row) => {
    const mine = answered.filter((a) => a.outgoing.notificationId === row.notification_id);
    const myFailures = failed.filter((f) => f.outgoing.notificationId === row.notification_id);
    const tickets = mine.flatMap((a) =>
      a.ticket.status === 'ok' ? [{ id: a.ticket.id, token: a.outgoing.token }] : [],
    );
    const dead = mine
      .filter(
        (a) => a.ticket.status === 'error' && a.ticket.details?.error === 'DeviceNotRegistered',
      )
      .map((a) => a.outgoing.token);
    const errors = [
      ...mine.flatMap((a) =>
        a.ticket.status === 'error' ? [a.ticket.details?.error ?? a.ticket.message ?? 'error'] : [],
      ),
      ...myFailures.map((f) => f.error),
    ];
    const error = errors.length ? [...new Set(errors)].join('; ') : undefined;
    const base = { notification_id: row.notification_id, tickets, dead_tokens: dead };
    if (tickets.length > 0) return { ...base, outcome: 'SENT', ...(error ? { error } : {}) };
    if (myFailures.length > 0) return { ...base, outcome: 'RETRY', error: error ?? 'send failed' };
    return { ...base, outcome: 'FAILED', error: error ?? 'no valid phone' };
  });
}

/** A row from public.push_tickets_to_check. */
export interface TicketToCheck {
  notification_id: string;
  ticket_id: string;
  token: string;
}

/** What public.push_record_receipts expects. Tickets Expo has no receipt for yet stay unchecked. */
export function receiptResults(
  toCheck: readonly TicketToCheck[],
  receipts: Readonly<Record<string, ExpoReceipt>>,
): {
  checked: string[];
  dead_tokens: string[];
  errors: { notification_id: string; error: string }[];
} {
  const pendingByAlert = new Set(
    toCheck.filter((t) => !(t.ticket_id in receipts)).map((t) => t.notification_id),
  );
  const checked = [...new Set(toCheck.map((t) => t.notification_id))].filter(
    (id) => !pendingByAlert.has(id),
  );
  const dead: string[] = [];
  const errors: { notification_id: string; error: string }[] = [];
  for (const t of toCheck) {
    const r = receipts[t.ticket_id];
    if (!r || r.status === 'ok') continue;
    const code = r.details?.error ?? r.message ?? 'error';
    if (code === 'DeviceNotRegistered') dead.push(t.token);
    errors.push({ notification_id: t.notification_id, error: code });
  }
  return { checked, dead_tokens: [...new Set(dead)], errors };
}

/** Network errors, rate limits and server errors are worth another try; other 4xx are not. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
