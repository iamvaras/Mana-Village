import { describe, expect, it } from 'vitest';
// The push Edge Functions' pure logic (Deno code without Deno APIs).
import {
  buildMessages,
  chunk,
  isRetryableStatus,
  receiptResults,
  sendResults,
  type ClaimedRow,
} from '../../../supabase/functions/_shared/expo-push.ts';

const row = (id: string, tokens: string[]): ClaimedRow => ({
  notification_id: id,
  title: 'Issue closed',
  body: 'RMP-2026-00002 · Pothole',
  route: `/issue/${id}`,
  issue_id: 'issue-1',
  tokens,
});

describe('expo push: sending', () => {
  it('sends one message per valid phone, carrying the screen to open', () => {
    const out = buildMessages([row('a', ['ExponentPushToken[1]', 'junk', 'ExpoPushToken[2]'])]);
    expect(out.map((o) => o.token)).toEqual(['ExponentPushToken[1]', 'ExpoPushToken[2]']);
    expect(out[0]?.message).toMatchObject({
      to: 'ExponentPushToken[1]',
      channelId: 'default',
      data: { notificationId: 'a', route: '/issue/a' },
    });
  });

  it('splits into Expo-sized requests', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('one phone taking it is enough; dead phones are reported', () => {
    const rows = [row('a', ['ExponentPushToken[1]', 'ExponentPushToken[2]'])];
    const [o1, o2] = buildMessages(rows);
    if (!o1 || !o2) throw new Error('setup');
    const [r] = sendResults(
      rows,
      [
        { outgoing: o1, ticket: { status: 'ok', id: 't1' } },
        {
          outgoing: o2,
          ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } },
        },
      ],
      [],
    );
    expect(r).toEqual({
      notification_id: 'a',
      outcome: 'SENT',
      tickets: [{ id: 't1', token: 'ExponentPushToken[1]' }],
      dead_tokens: ['ExponentPushToken[2]'],
      error: 'DeviceNotRegistered',
    });
  });

  it('a request that failed as a whole is retried; a refused one is not', () => {
    const rows = [row('a', ['ExponentPushToken[1]']), row('b', ['ExponentPushToken[2]'])];
    const [oa, ob] = buildMessages(rows);
    if (!oa || !ob) throw new Error('setup');
    const results = sendResults(
      rows,
      [{ outgoing: ob, ticket: { status: 'error', message: 'Expo returned 400' } }],
      [{ outgoing: oa, error: 'Expo returned 503' }],
    );
    expect(results.map((r) => [r.notification_id, r.outcome])).toEqual([
      ['a', 'RETRY'],
      ['b', 'FAILED'],
    ]);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
  });
});

describe('expo push: receipts', () => {
  it('records answered alerts, waits for missing receipts, and revokes dead phones', () => {
    const res = receiptResults(
      [
        { notification_id: 'a', ticket_id: 't1', token: 'ExponentPushToken[1]' },
        { notification_id: 'b', ticket_id: 't2', token: 'ExponentPushToken[2]' },
        { notification_id: 'c', ticket_id: 't3', token: 'ExponentPushToken[3]' },
      ],
      {
        t1: { status: 'ok' },
        t2: { status: 'error', details: { error: 'DeviceNotRegistered' } },
      },
    );
    expect(res).toEqual({
      checked: ['a', 'b'],
      dead_tokens: ['ExponentPushToken[2]'],
      errors: [{ notification_id: 'b', error: 'DeviceNotRegistered' }],
    });
  });
});
