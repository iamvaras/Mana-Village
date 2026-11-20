/**
 * Where a tapped phone notification should go. The route comes from the
 * notification data, so only known screens with a real id are accepted;
 * anything else opens the Alerts list.
 */
export type PushTarget =
  | { screen: 'issue'; id: string }
  | { screen: 'confirm'; id: string }
  | { screen: 'announcement'; id: string }
  | { screen: 'alerts' };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ISSUE = new RegExp(`^/issue/(${UUID})$`, 'i');
const CONFIRM = new RegExp(`^/issue/(${UUID})/confirm$`, 'i');
// Alerts created before Phase 10 pointed workers to /work/<id>; that work is on the issue screen.
const ANNOUNCEMENT = new RegExp(`^/announcements/(${UUID})$`, 'i');
const LEGACY_WORK = new RegExp(`^/work/(${UUID})$`, 'i');

export function pushTarget(data: unknown): PushTarget {
  const route =
    typeof data === 'object' && data !== null && 'route' in data
      ? (data as { route: unknown }).route
      : null;
  if (typeof route !== 'string') return { screen: 'alerts' };
  const confirm = CONFIRM.exec(route);
  if (confirm?.[1]) return { screen: 'confirm', id: confirm[1] };
  const announcement = ANNOUNCEMENT.exec(route);
  if (announcement?.[1]) return { screen: 'announcement', id: announcement[1] };
  const issue = ISSUE.exec(route) ?? LEGACY_WORK.exec(route);
  if (issue?.[1]) return { screen: 'issue', id: issue[1] };
  return { screen: 'alerts' };
}
