import { useMemo } from 'react';
import { formatCedi } from '../lib/money';
import ChatPanel from './ChatPanel';

/**
 * Conversation list for the messaging sidebar.
 * Shows all conversations with unread counts and last message preview.
 */

const ROLE_COLORS = {
  buyer: '#087f78',
  seller: '#e96f52',
  driver: '#1f6feb',
  institution: '#7c5cff',
  ops: '#f0a202',
  admin: '#f0a202',
};

const ROLE_ICONS = {
  buyer: '⌂',
  seller: '↗',
  driver: '⇢',
  institution: '▦',
  ops: '◈',
  admin: '◈',
};

export default function ConversationList({
  conversations,
  activeConversationId,
  currentUser,
  currentRole,
  onSelect,
  onNewConversation,
  className = '',
  compact = false,
}) {
  const userId = currentUser?.identifier || currentUser?.phone || currentUser?.email;

  const sortedConversations = useMemo(() => 
    conversations
      .filter(c => c.participants.some(p => p.id === userId))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
  [conversations, userId]);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getOtherParticipant = (conv) => 
    conv.participants.find(p => p.id !== userId);

  const getLastMessage = (conv) => {
    if (!conv.lastMessage) return null;
    const isOwn = conv.lastMessage.senderId === userId;
    return {
      text: conv.lastMessage.metadata?.type === 'code' ? '🔐 Delivery code sent' :
            conv.lastMessage.metadata?.type === 'location' ? '📍 Location shared' :
            conv.lastMessage.metadata?.type === 'system' ? conv.lastMessage.text :
            conv.lastMessage.text,
      isOwn,
      time: conv.lastMessage.timestamp,
    };
  };

  return (
    <div className={`conversation-list ${className} ${compact ? 'compact' : ''}`}>
      <div className="conv-list-header">
        <h3>Messages</h3>
        {onNewConversation && (
          <button className="new-conv-btn" type="button" onClick={onNewConversation} aria-label="New message">
            +
          </button>
        )}
      </div>
      
      {sortedConversations.length === 0 ? (
        <div className="conv-empty">
          <span className="conv-empty-icon">💬</span>
          <p>No conversations yet</p>
          <small>Messages appear here when you chat with buyers, drivers, or sellers</small>
        </div>
      ) : (
        <div className="conv-items" role="list" aria-label="Conversations">
          {sortedConversations.map((conv) => {
            const other = getOtherParticipant(conv);
            const lastMsg = getLastMessage(conv);
            const isActive = activeConversationId === conv.id;
            const unread = conv.unreadCount || 0;
            
            return (
              <button
                key={conv.id}
                className={`conv-item ${isActive ? 'active' : ''} ${unread > 0 ? 'unread' : ''}`}
                type="button"
                role="listitem"
                aria-current={isActive ? 'true' : undefined}
                onClick={() => onSelect?.(conv)}
              >
                <div className="conv-avatar" style={{ backgroundColor: ROLE_COLORS[other?.role] || '#666' }}>
                  {(other?.name || '?')[0].toUpperCase()}
                </div>
                <div className="conv-content">
                  <div className="conv-main">
                    <strong>{other?.name || 'Unknown'}</strong>
                    {other?.role && (
                      <span className={`role-icon ${other.role}`} aria-hidden="true">{ROLE_ICONS[other.role] || ''}</span>
                    )}
                    {conv.orderId && <span className="conv-order-ref">#{conv.orderId.slice(-6)}</span>}
                  </div>
                  {lastMsg && (
                    <div className="conv-preview">
                      {lastMsg.isOwn && <span className="own-indicator" aria-hidden="true">✓</span>}
                      <span>{lastMsg.text}</span>
                    </div>
                  )}
                </div>
                <div className="conv-meta">
                  <span className="conv-time">{formatTime(conv.updatedAt)}</span>
                  {unread > 0 && (
                    <span className="unread-badge" aria-label={`${unread} unread messages`}>
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}