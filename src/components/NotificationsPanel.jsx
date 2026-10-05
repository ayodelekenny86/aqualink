import ContactButtons from './ContactButtons';

/**
 * Notification feed shown from the top bar.
 *
 * Entries are grouped newest-first and scoped to the active role, so a driver
 * never sees buyer-only messages. "Mark all as read" only clears the visible
 * role, leaving other roles' unread state intact.
 */

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * What to say when this device cannot hear about anything another device does.
 *
 * The panel used to show an empty feed and nothing else, and an empty feed reads as
 * "nothing has happened" — not as "this deployment cannot deliver notifications
 * between devices". On this server that was literally true: `notifications` was not
 * in the Realtime publication, so the server refused the subscription, and no event
 * could ever arrive. A driver waiting on a delivery status on their phone was told
 * nothing, by a panel that looked like it was listening.
 */
function syncNotice(sync) {
  if (sync === 'blocked') {
    return 'Notifications from other devices are not reaching this one. The server refused the live connection, so this list only shows what happened on this device.';
  }
  if (sync === 'unconfigured') {
    return 'No notification server is configured for this deployment, so this list only shows what happened on this device.';
  }
  return null;
}

export default function NotificationsPanel({ notifications, unreadCount, onMarkAllRead, onMarkRead, onClose, onOrderClick, supportPhone, sync }) {
  const notice = syncNotice(sync);
  return (
    <section className="notifications-panel" aria-label="Notifications">
      <header>
        <div>
          <h2>Notifications</h2>
          <span className="unread-count">{unreadCount} unread</span>
        </div>
        <button type="button" className="modal-close" aria-label="Close notifications" onClick={onClose}>×</button>
      </header>

      {notice && <p className="notifications-sync-note" role="status">{notice}</p>}

      <button type="button" className="text-button mark-all" onClick={onMarkAllRead} disabled={unreadCount === 0}>
        Mark all as read
      </button>

      {notifications.length === 0 && <p className="empty-feed">{notice ? 'Nothing has happened on this device yet.' : 'No notifications yet.'}</p>}

      <ul>
        {notifications.map((item) => (
          <li key={item.id} className={item.read ? 'read' : 'unread'}>
            <button
              type="button"
              className="notification-row"
              onClick={() => {
                onMarkRead(item.id);
                if (item.orderId) onOrderClick?.(item.orderId);
              }}
            >
              <span className="notification-title">{item.title}</span>
              {item.body && <span className="notification-body">{item.body}</span>}
              <span className="notification-time">{relativeTime(item.at ?? item.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>

      <footer>
        <ContactButtons phone={supportPhone} label="Contact support" />
      </footer>
    </section>
  );
}
