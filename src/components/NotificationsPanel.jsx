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

export default function NotificationsPanel({ notifications, unreadCount, onMarkAllRead, onMarkRead, onClose, onOrderClick, supportPhone }) {
  return (
    <section className="notifications-panel" aria-label="Notifications">
      <header>
        <div>
          <h2>Notifications</h2>
          <span className="unread-count">{unreadCount} unread</span>
        </div>
        <button type="button" className="modal-close" aria-label="Close notifications" onClick={onClose}>×</button>
      </header>

      <button type="button" className="text-button mark-all" onClick={onMarkAllRead} disabled={unreadCount === 0}>
        Mark all as read
      </button>

      {notifications.length === 0 && <p className="empty-feed">No notifications yet.</p>}

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
