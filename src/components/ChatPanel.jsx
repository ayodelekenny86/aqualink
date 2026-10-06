import { useEffect, useRef, useState } from 'react';
import { formatPhoneForDisplay } from '../lib/accounts';

/**
 * In-app chat panel component.
 * Can be used as a floating panel, sidebar, or full-screen on mobile.
 */

const TEMPLATES = [
  { id: 'on_my_way', label: 'On my way', icon: '🚛' },
  { id: 'arrived', label: 'Arrived', icon: '📍' },
  { id: 'need_code', label: 'Need code', icon: '🔐' },
  { id: 'delayed', label: 'Delayed', icon: '⏱️' },
];

export default function ChatPanel({
  conversation,
  messages,
  currentUser,
  currentRole,
  onSend,
  onTemplate,
  onClose,
  onBack,
  showTemplates = true,
  compact = false,
  className = '',
}) {
  const [newMessage, setNewMessage] = useState('');
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const otherParticipant = conversation?.participants?.find(
    p => p.id !== (currentUser?.identifier || currentUser?.phone || currentUser?.email)
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    onSend?.(conversation.id, newMessage.trim());
    setNewMessage('');
    setShowTemplateMenu(false);
  };

  const handleTemplateClick = (templateId) => {
    onTemplate?.(conversation.id, templateId);
    setShowTemplateMenu(false);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = new Date(now - 24*60*60*1000).toDateString() === date.toDateString();
    
    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    return date.toLocaleDateString();
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups = {};
    messages.forEach(msg => {
      const date = formatDate(msg.timestamp);
      if (!groups[date]) groups[date] = [];
      groups[date].push(msg);
    });
    return groups;
  }, [messages]);

  const isOwnMessage = (msg) => msg.senderId === (currentUser?.identifier || currentUser?.phone || currentUser?.email);

  if (!conversation) {
    return (
      <div className={`chat-panel ${className} ${compact ? 'compact' : ''}`}>
        <div className="chat-empty">
          <span className="chat-empty-icon">💬</span>
          <p>Select a conversation to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-panel ${className} ${compact ? 'compact' : ''}`}>
      {/* Header */}
      <header className="chat-header">
        {onBack && (
          <button className="chat-back" type="button" onClick={onBack} aria-label="Back to conversations">
            ←
          </button>
        )}
        <div className="chat-header-info">
          <div className="chat-avatar" style={{ backgroundColor: getRoleColor(otherParticipant?.role) }}>
            {(otherParticipant?.name || '?')[0].toUpperCase()}
          </div>
          <div className="chat-header-text">
            <strong>{otherParticipant?.name || 'Unknown'}</strong>
            <small>
              {otherParticipant?.role && (
                <span className={`role-badge ${otherParticipant.role}`}>{otherParticipant.role}</span>
              )}
              {conversation.orderId && (
                <span className="order-ref">Order: {conversation.orderId}</span>
              )}
            </small>
          </div>
        </div>
        <div className="chat-header-actions">
          <button className="icon-btn" type="button" aria-label="Call" onClick={() => otherParticipant?.phone && window.open(`tel:+${formatPhoneForDisplay(otherParticipant.phone)}`)}>
            ☏
          </button>
          <button className="icon-btn" type="button" aria-label="WhatsApp" onClick={() => otherParticipant?.phone && window.open(`https://wa.me/233${formatPhoneForDisplay(otherParticipant.phone).replace(/\D/g, '')}`, '_blank')}>
            ✆
          </button>
          {onClose && (
            <button className="icon-btn" type="button" aria-label="Close" onClick={onClose}>
              ×
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date} className="message-group">
            <div className="message-date">{date}</div>
            {msgs.map((msg) => (
              <div
                key={msg.id}
                className={`message ${isOwnMessage(msg) ? 'own' : ''} ${msg.metadata?.type || ''}`}
                data-testid={`message-${msg.id}`}
              >
                {!isOwnMessage(msg) && (
                  <div className="message-sender">
                    <span className="sender-avatar" style={{ backgroundColor: getRoleColor(msg.senderRole) }}>
                      {(msg.senderName || '?')[0].toUpperCase()}
                    </span>
                    <span className="sender-name">{msg.senderName}</span>
                  </div>
                )}
                <div className="message-bubble">
                  {msg.metadata?.type === 'system' && (
                    <span className="system-message">{msg.text}</span>
                  )}
                  {msg.metadata?.type === 'location' && (
                    <div className="location-message">
                      <span className="location-icon">📍</span>
                      <a href={`https://maps.google.com/?q=${msg.metadata.lat},${msg.metadata.lng}`} target="_blank" rel="noopener noreferrer">
                        View location
                      </a>
                    </div>
                  )}
                  {msg.metadata?.type === 'code' && (
                    <div className="code-message">
                      <span className="code-label">Delivery Code</span>
                      <strong className="code-value">{msg.text}</strong>
                    </div>
                  )}
                  {!msg.metadata?.type && <span className="message-text">{msg.text}</span>}
                </div>
                <span className="message-time">{formatTime(msg.timestamp)}</span>
                {!isOwnMessage(msg) && !msg.read && <span className="unread-indicator" aria-hidden="true">•</span>}
              </div>
            ))}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick templates */}
      {showTemplates && !compact && (
        <div className="chat-templates">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              type="button"
              className="template-btn"
              onClick={() => handleTemplateClick(t.id)}
            >
              <span className="template-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form className="chat-input-area" onSubmit={handleSend}>
        <div className="input-wrapper">
          {showTemplates && (
            <button
              type="button"
              className="template-toggle"
              onClick={() => setShowTemplateMenu(!showTemplateMenu)}
              aria-expanded={showTemplateMenu}
              aria-label="Quick replies"
            >
              ⚡
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message…"
            className="chat-input"
            aria-label="Message"
            disabled={!conversation}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!newMessage.trim() || !conversation}
            aria-label="Send message"
          >
            ➤
          </button>
        </div>
      </form>
    </div>
  );
}

function getRoleColor(role) {
  const colors = {
    buyer: '#087f78',
    seller: '#e96f52',
    driver: '#1f6feb',
    institution: '#7c5cff',
    ops: '#f0a202',
    admin: '#f0a202',
  };
  return colors[role] || '#666';
}

function useMemo(fn, deps) {
  // Simple inline memo for this component
  const cache = useRef({ deps: null, value: null });
  if (!cache.current.deps || deps.some((d, i) => d !== cache.current.deps[i])) {
    cache.current.value = fn();
    cache.current.deps = deps;
  }
  return cache.current.value;
}