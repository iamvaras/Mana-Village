import { describe, expect, it } from 'vitest';
import { pushTarget } from '@/features/push/push-route';

const id = '6f1c2a5e-1234-4abc-9def-0123456789ab';

describe('tapped phone notification', () => {
  it('opens the issue', () => {
    expect(pushTarget({ route: `/issue/${id}` })).toEqual({ screen: 'issue', id });
  });
  it('opens "Was it fixed?" for confirmation alerts', () => {
    expect(pushTarget({ route: `/issue/${id}/confirm` })).toEqual({ screen: 'confirm', id });
  });
  it('sends old worker links to the issue screen', () => {
    expect(pushTarget({ route: `/work/${id}` })).toEqual({ screen: 'issue', id });
  });
  it('falls back to the Alerts list for anything else', () => {
    expect(pushTarget({ route: '/admin/users' })).toEqual({ screen: 'alerts' });
    expect(pushTarget({ route: `/issue/${id}/../../x` })).toEqual({ screen: 'alerts' });
    expect(pushTarget({ route: 'https://evil.example' })).toEqual({ screen: 'alerts' });
    expect(pushTarget(null)).toEqual({ screen: 'alerts' });
    expect(pushTarget({})).toEqual({ screen: 'alerts' });
  });
});
