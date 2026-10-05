import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotificationsPanel from './NotificationsPanel';
import { NOTIFICATION_SYNC } from '../hooks/useNotifications';

/**
 * A notification feed that cannot hear anything, telling the user so.
 *
 * `notifications` was never added to the `supabase_realtime` publication, so the
 * server refused the subscription outright:
 *
 *   -> "Unable to subscribe to changes with given parameters. Please check Realtime
 *      is enabled for the given connect parameters: [event: *, schema: public,
 *      table: notifications]"
 *
 * The client had no server-side fallback — the only fallback re-reads localStorage
 * on the same device — and the panel rendered an empty feed with no comment. An
 * empty feed is indistinguishable from a quiet day, so a driver waiting on a
 * delivery status update on their phone was looking at a panel that had never been
 * able to receive one.
 */

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPanel(props = {}) {
  return render(
    <NotificationsPanel
      notifications={[]}
      unreadCount={0}
      onMarkAllRead={() => {}}
      onMarkRead={() => {}}
      onClose={() => {}}
      sync={NOTIFICATION_SYNC.blocked}
      {...props}
    />,
  );
}

test('a refused subscription says the feed is deaf, not empty', () => {
  renderPanel();

  const note = screen.getByRole('status');
  expect(note).toHaveTextContent(/not reaching this one/i);
  expect(note).toHaveTextContent(/only shows what happened on this device/i);
});

test('an empty feed does not claim nothing has happened when it cannot know', () => {
  renderPanel();

  // The dangerous sentence is "No notifications yet" — it asserts absence from a
  // panel that cannot observe anything.
  expect(screen.queryByText('No notifications yet.')).not.toBeInTheDocument();
  expect(screen.getByText(/Nothing has happened on this device yet/)).toBeInTheDocument();
});

test('a deployment with no notification server says that instead of blaming the network', () => {
  renderPanel({ sync: NOTIFICATION_SYNC.unconfigured });

  expect(screen.getByRole('status')).toHaveTextContent(/no notification server is configured/i);
});

test('a live subscription shows no warning at all', () => {
  // A notice on a healthy deployment is noise that trains people to ignore it.
  renderPanel({ sync: NOTIFICATION_SYNC.live, notifications: [{ id: '1', title: 'Order is en route', at: new Date().toISOString() }] });

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('Order is en route')).toBeInTheDocument();
});

test('a live and genuinely empty feed may say it is empty', () => {
  renderPanel({ sync: NOTIFICATION_SYNC.live });

  expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});