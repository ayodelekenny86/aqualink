import { useCallback, useEffect, useRef, useState } from 'react';
import { list, insert, update, replaceAll } from '../lib/collections';

/** How often the app re-reads the notification table looking for changes. */
export const NOTIFICATION_POLL_MS = 15000;

/**
 * Notification feed with unread tracking and a background poll.
 *
 * Because the data layer is localStorage, a "real-time" push is simulated by
 * re-reading the table on an interval: when another role in the same browser
 * changes an order, this hook picks that up within one poll window. The poll
 * is paused while the tab is hidden so a backgrounded tab does no work.
 */
export default function useNotifications() {
  const [items, setItems] = useState(() => list('notifications'));
  const lastChecked = useRef(Date.now());
  const lastFingerprint = useRef('');

  const refresh = useCallback(() => {
    const rows = list('notifications');
    lastChecked.current = Date.now();
    // `list` returns a fresh array each call, so identity never matches. Compare
    // a cheap fingerprint instead to avoid re-rendering on every empty poll.
    const fingerprint = `${rows.length}:${rows.at(-1)?.id ?? ''}:${rows.filter((r) => !r.read).length}`;
    if (lastFingerprint.current === fingerprint) return;
    lastFingerprint.current = fingerprint;
    setItems(rows);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    }, NOTIFICATION_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  /**
   * Record a notification for a role. Deliberately does not touch the notice
   * banner: background events would otherwise overwrite the message the user
   * just triggered (for example "Booking confirmed"). The unread badge is the
   * surface for these.
   */
  const notify = useCallback(({ role = 'buyer', title, body, orderId = null, kind = 'update' }) => {
    if (!title) return null;
    const row = insert('notifications', {
      role,
      title,
      body: body ?? '',
      orderId,
      kind,
      read: false,
      at: new Date().toISOString(),
    });
    refresh();
    return row;
  }, [refresh]);

  const markRead = useCallback((id) => {
    update('notifications', id, { read: true });
    refresh();
  }, [refresh]);

  /** Mark one role's notifications read, or every notification when role is omitted. */
  const markAllRead = useCallback((role) => {
    const rows = list('notifications').map((row) => (role && row.role !== role ? row : { ...row, read: true }));
    replaceAll('notifications', rows);
    refresh();
  }, [refresh]);

  const forRole = useCallback((role) => items.filter((row) => row.role === role), [items]);
  const unreadCount = useCallback((role) => items.filter((row) => row.role === role && !row.read).length, [items]);

  return { items, forRole, unreadCount, notify, markRead, markAllRead, refresh, lastChecked };
}
