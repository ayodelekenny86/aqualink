import { useCallback, useEffect, useRef, useState } from 'react';
import { list, insert, update, replaceAll } from '../lib/collections';
import { supabase, supabaseUrl, anonKey, writeResult } from '../lib/supabase';

const USE_SERVER = typeof window !== 'undefined' && !!supabaseUrl && !!anonKey;
const SYNC_RETRY_MS = 5000;
const SYNC_STORAGE_KEY = 'notifications-outbox';

function enqueueOutbox(notification) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ ...notification, queuedAt: Date.now() });
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    localStorage.removeItem(SYNC_STORAGE_KEY);
  }
}

function readPendingCount() {
  if (typeof window === 'undefined') return 0;
  try { return (JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY) || '[]')).length; } catch { return 0; }
}

function drainOutbox() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (!raw) return [];
    const queue = JSON.parse(raw);
    localStorage.removeItem(SYNC_STORAGE_KEY);
    return queue;
  } catch {
    localStorage.removeItem(SYNC_STORAGE_KEY);
    return [];
  }
}

/** How often the app re-reads the notification table looking for changes. */
export const NOTIFICATION_POLL_MS = 15000;

/**
 * Whether notifications from another device can reach this one.
 *
 * `live` is the only state in which cross-device delivery works. `blocked` means the
 * server refused the Realtime subscription, and `unconfigured` means there is no
 * server to subscribe to. Both used to be indistinguishable from a quiet day: the
 * feed was simply empty, and an empty feed reads as "nothing has happened" rather
 * than as "this app cannot see anything".
 */
export const NOTIFICATION_SYNC = {
  live: 'live',
  blocked: 'blocked',
  unconfigured: 'unconfigured',
};

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
  const [sync, setSync] = useState(USE_SERVER ? NOTIFICATION_SYNC.blocked : NOTIFICATION_SYNC.unconfigured);
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
        // Every one of these means this device will not hear about anything another
        // device does. `CHANNEL_ERROR` is what a table missing from the
        // `supabase_realtime` publication produces — the server accepts the join and
        // then refuses it — so it is the common case here, not an edge one.
        if (status === 'SUBSCRIBED') {
          setSync(NOTIFICATION_SYNC.live);
          return;
        }
        setSync(NOTIFICATION_SYNC.blocked);
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

  useEffect(() => {
    if (!USE_SERVER || !supabase) return;
    let ticking = false;
    const flush = async () => {
      const queue = drainOutbox();
      if (!queue.length) { ticking = false; return; }
      for (const item of queue) {
        try {
          const written = writeResult(await supabase.from('notifications').insert({
            role: item.role,
            title: item.title,
            body: item.body,
            order_id: item.orderId,
            kind: item.kind,
            read: false,
          }));
          if (!written.ok) {
            // re-enqueue and stop — will retry on next online event
            enqueueOutbox(item);
            return;
          }
        } catch {
          enqueueOutbox(item);
          return;
        }
      }
      ticking = false;
    };
    const tick = () => { if (!ticking) { ticking = true; flush(); } };
    const handleOnline = () => tick();
    window.addEventListener('online', handleOnline);
    const interval = setInterval(tick, SYNC_RETRY_MS);
    // attempt on mount in case the app started while online
    tick();
    return () => { clearInterval(interval); window.removeEventListener('online', handleOnline); };
  }, []);

  /**
   * Record a notification for a role. Writes to Supabase when available so other
   * devices see it instantly; always mirrors into localStorage for the offline cache.
   *
   * When the server write fails (offline, network error, missing table), the
   * notification is queued in localStorage and retried on the next connectivity
   * window instead of being silently lost.
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
        const written = writeResult(await supabase.from('notifications').insert({
          role,
          title,
          body: body ?? '',
          order_id: orderId,
          kind,
          read: false,
        }));
        if (!written.ok) {
          console.warn('Failed to publish notification, queued for retry:', written.error);
        enqueueOutbox({ role, title, body, orderId, kind });
        setPendingCount(readPendingCount());
        return { ...row, delivered: false, error: written.error, queued: true };
        }
      } catch (err) {
        console.warn('Failed to publish notification, queued for retry:', err);
        enqueueOutbox({ role, title, body, orderId, kind });
        setPendingCount(readPendingCount());
        return { ...row, delivered: false, error: { message: String(err.message || err) }, queued: true };
      }
      return { ...row, delivered: true };
    }
    return { ...row, delivered: false, error: { message: 'No notification server is configured for this deployment.' } };
  }, [refresh, setPendingCount]);

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

  const [pendingCount, setPendingCount] = useState(() => readPendingCount());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      setPendingCount(readPendingCount());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return { items, forRole, unreadCount, notify, markRead, markAllRead, refresh, lastChecked, sync, pendingCount };
}