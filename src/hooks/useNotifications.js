import { useCallback, useEffect, useRef, useState } from 'react';
import { list, insert, update, replaceAll } from '../lib/collections';
import { supabase, supabaseUrl, anonKey } from '../lib/supabase';

const USE_SERVER = typeof window !== 'undefined' && !!supabaseUrl && !!anonKey;

/** How often the app re-reads the notification table looking for changes. */
export const NOTIFICATION_POLL_MS = 15000;

/**
 * Notification feed with unread tracking and real-time sync.
 *
 * When Supabase is configured, the feed subscribes to Realtime changes on the
 * `notifications` table. A push from another device or browser is mirrored
 * into localStorage immediately, so the unread badge updates without a poll.
 *
 * When Supabase is unavailable (local dev, offline), the feed falls back to
 * a localStorage poll, and a cross-tab `storage` event listener catches same-
 * browser changes in other tabs.
 */
export default function useNotifications() {
  const [items, setItems] = useState(() => list('notifications'));
  const lastChecked = useRef(Date.now());
  const lastFingerprint = useRef('');

  const refresh = useCallback(() => {
    const rows = list('notifications');
    lastChecked.current = Date.now();
    const fingerprint = `${rows.length}:${rows.at(-1)?.id ?? ''}:${rows.filter((r) => !r.read).length}`;
    if (lastFingerprint.current === fingerprint) return;
    lastFingerprint.current = fingerprint;
    setItems(rows);
  }, []);

  useEffect(() => {
    if (!USE_SERVER || !supabase) {
      const timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        refresh();
      }, NOTIFICATION_POLL_MS);
      return () => clearInterval(timer);
    }

    const fallbackRef = { current: null };

    const channel = supabase
      .channel('notifications:all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        const current = list('notifications');
        const exists = current.some((r) => r.id === row.id);
        const next = exists
          ? current.map((r) => (r.id === row.id ? { ...r, ...row, at: row.created_at } : r))
          : [{ ...row, at: row.created_at }, ...current];
        replaceAll('notifications', next);
        refresh();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          fallbackRef.current = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            refresh();
          }, NOTIFICATION_POLL_MS);
        }
      });

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    }, NOTIFICATION_POLL_MS);

    return () => {
      clearInterval(timer);
      if (fallbackRef.current) clearInterval(fallbackRef.current);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    if (!USE_SERVER) {
      const handler = (event) => {
        if (event.key === 'db.notifications') {
          refresh();
        }
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    }
  }, [refresh]);

  /**
   * Record a notification for a role. Writes to Supabase when available so other
   * devices see it instantly; always mirrors into localStorage for the offline cache.
   */
  const notify = useCallback(async ({ role = 'buyer', title, body, orderId = null, kind = 'update' }) => {
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

    if (USE_SERVER && supabase) {
      try {
        await supabase.from('notifications').insert({
          role,
          title,
          body: body ?? '',
          order_id: orderId,
          kind,
          read: false,
        });
      } catch {
        // Offline write will sync when the connection returns.
      }
    }
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
