import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import useMessaging from '../hooks/useMessaging';
import ConversationList from './ConversationList';
import ChatPanel from './ChatPanel';

/**
 * Complete messaging panel with conversation list and chat view.
 * Responsive: side-by-side on desktop, stacked with navigation on mobile.
 */

export default function MessagingPanel({
  currentUser,
  currentRole,
  orders,
  fleetDrivers,
  onNotice,
  className = '',
  embedded = false,
}) {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    loading,
    sending,
    totalUnread,
    sendMessage,
    markAsRead,
    getOrCreateConversation,
    startDriverChat,
    startBuyerChat,
    startSellerChat,
    sendTemplate,
} = useMessaging({ currentUser, currentRole, onNotice });

  const [showList, setShowList] = useState(true);
  const [newConvRole, setNewConvRole] = useState(null);
  const [newConvSearch, setNewConvSearch] = useState('');
  const listRef = useRef(null);
  const chatRef = useRef(null);
  const searchInputRef = useRef(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeMessages = activeConversationId
    ? messages.filter(m => m.conversationId === activeConversationId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    : [];

  // Focus management for mobile view transitions
  useEffect(() => {
    if (isMobile && !showList && chatRef.current) {
      const input = chatRef.current.querySelector('textarea[aria-label="Message"]');
      if (input) input.focus();
    }
  }, [showList, isMobile]);

  useEffect(() => {
    if (newConvRole !== null && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [newConvRole]);

  // On mobile, show list by default, switch to chat when conversation selected
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  
  useEffect(() => {
    const handleResize = () => setShowList(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-switch to chat on mobile when conversation selected
  useEffect(() => {
    if (isMobile && activeConversationId) {
      setShowList(false);
    }
  }, [activeConversationId, isMobile]);

  // Handle new conversation creation
  const handleNewConversation = useCallback((role) => {
    setNewConvRole(role);
    setNewConvSearch('');
  }, []);

  const handleSearchContact = useCallback(async (query) => {
    setNewConvSearch(query);
    // In real app, would search server for contacts
  }, []);

  const handleStartChat = useCallback((contact) => {
    if (!contact) return;
    
    let conv;
    if (currentRole === 'buyer') {
      conv = startDriverChat(contact.id, contact.name, contact.orderId);
    } else if (currentRole === 'driver') {
      conv = startBuyerChat(contact.id, contact.name, contact.orderId);
    } else if (currentRole === 'seller') {
      conv = startBuyerChat(contact.id, contact.name, contact.orderId);
    } else {
      conv = getOrCreateConversation(contact.id, contact.name, contact.role, contact.orderId);
    }
    
    if (conv) {
      setActiveConversationId(conv.id);
      setShowList(false);
      setNewConvRole(null);
    }
  }, [currentRole, startDriverChat, startBuyerChat, startSellerChat, getOrCreateConversation]);

  // Get available contacts based on role and orders
  const availableContacts = useMemo(() => {
    const contacts = [];
    
    if (currentRole === 'buyer') {
      // Buyers can message their assigned drivers
      orders.forEach(order => {
        if (order.driverId && order.driverName && ['Assigned', 'Picked Up', 'En Route'].includes(order.status)) {
          contacts.push({
            id: order.driverId,
            name: order.driverName,
            role: 'driver',
            phone: order.driverPhone,
            orderId: order.id,
            avatar: order.driverName[0],
          });
        }
        if (order.sellerId && order.sellerName) {
          contacts.push({
            id: order.sellerId,
            name: order.sellerName,
            role: 'seller',
            phone: order.sellerPhone,
            orderId: order.id,
            avatar: order.sellerName[0],
          });
        }
      });
    } else if (currentRole === 'driver') {
      // Drivers can message their assigned buyers
      orders.forEach(order => {
        if (order.driverId === (currentUser?.phone || currentUser?.identifier) && order.buyerName) {
          contacts.push({
            id: order.buyerPhone || order.email,
            name: order.buyerName,
            role: 'buyer',
            phone: order.buyerPhone,
            orderId: order.id,
            avatar: order.buyerName[0],
          });
        }
      });
    } else if (currentRole === 'seller') {
      // Sellers can message drivers and buyers for their orders
      orders.forEach(order => {
        if (order.sellerName === currentUser?.displayName) {
          if (order.driverId && order.driverName) {
            contacts.push({
              id: order.driverId,
              name: order.driverName,
              role: 'driver',
              phone: order.driverPhone,
              orderId: order.id,
              avatar: order.driverName[0],
            });
          }
          if (order.buyerName) {
            contacts.push({
              id: order.buyerPhone || order.email,
              name: order.buyerName,
              role: 'buyer',
              phone: order.buyerPhone,
              orderId: order.id,
              avatar: order.buyerName[0],
            });
          }
        }
      });
    } else if (currentRole === 'ops') {
      // Admins can message anyone
      orders.forEach(order => {
        if (order.driverId && order.driverName) {
          contacts.push({
            id: order.driverId,
            name: order.driverName,
            role: 'driver',
            phone: order.driverPhone,
            orderId: order.id,
            avatar: order.driverName[0],
          });
        }
        if (order.buyerName) {
          contacts.push({
            id: order.buyerPhone || order.email,
            name: order.buyerName,
            role: 'buyer',
            phone: order.buyerPhone,
            orderId: order.id,
            avatar: order.buyerName[0],
          });
        }
        if (order.sellerName) {
          contacts.push({
            id: order.sellerId,
            name: order.sellerName,
            role: 'seller',
            phone: order.sellerPhone,
            orderId: order.id,
            avatar: order.sellerName[0],
          });
        }
      });
    }

    // Deduplicate by ID
    const seen = new Set();
    return contacts.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [orders, currentUser, currentRole]);

  // Filter contacts by search
  const filteredContacts = newConvRole 
    ? availableContacts.filter(c => c.role === newConvRole)
    : availableContacts;

  if (loading) {
    return (
      <div className={`messaging-panel ${className} loading`}>
        <div className="loading-state"><div className="loading-spinner" /></div>
      </div>
    );
  }

  // New conversation modal
  if (newConvRole !== null) {
    return (
      <div className={`messaging-panel ${className} new-conv-mode`}>
        <header className="msg-header">
          <button className="back-btn" onClick={() => setNewConvRole(null)}>←</button>
          <h3>New Message</h3>
          <div className="role-filter">
            {['buyer', 'seller', 'driver', 'ops'].map(r => (
              <button
                key={r}
                className={`role-filter-btn ${newConvRole === r ? 'active' : ''}`}
                onClick={() => setNewConvRole(r === newConvRole ? null : r)}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        </header>
        <div className="contact-search">
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search contacts…"
            value={newConvSearch}
            onChange={(e) => handleSearchContact(e.target.value)}
            autoFocus
          />
        </div>
        <div className="contact-list">
          {filteredContacts.length === 0 ? (
            <div className="empty-contacts">No contacts found</div>
          ) : (
            filteredContacts.map(contact => (
              <button
                key={contact.id}
                className="contact-item"
                onClick={() => handleStartChat(contact)}
              >
                <div className="contact-avatar" style={{ backgroundColor: ROLE_COLORS[contact.role] }}>
                  {contact.avatar}
                </div>
                <div className="contact-info">
                  <strong>{contact.name}</strong>
                  <small>
                    <span className={`role-badge ${contact.role}`}>{contact.role}</span>
                    {contact.orderId && <span>Order #{contact.orderId.slice(-6)}</span>}
                  </small>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`messaging-panel ${className} ${isMobile ? 'mobile' : ''} ${embedded ? 'embedded' : ''}`} role="region" aria-label="Messages">
      {/* Conversation List */}
      {(isMobile || embedded) && showList && (
        <div className="msg-list-pane" ref={listRef}>
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            currentUser={currentUser}
            currentRole={currentRole}
            onSelect={(conv) => {
              setActiveConversationId(conv.id);
              setShowList(false);
            }}
            onNewConversation={handleNewConversation}
            compact={embedded}
          />
        </div>
      )}

      {/* Chat View */}
      {(!isMobile && !embedded) || activeConversationId ? (
        <div className="msg-chat-pane" ref={chatRef}>
          {!isMobile && !embedded && (
            <ConversationList
              conversations={conversations}
              activeConversationId={activeConversationId}
              currentUser={currentUser}
              currentRole={currentRole}
              onSelect={(conv) => setActiveConversationId(conv.id)}
              onNewConversation={handleNewConversation}
            />
          )}
          <ChatPanel
            conversation={activeConversation}
            messages={activeMessages}
            currentUser={currentUser}
            currentRole={currentRole}
            onSend={sendMessage}
            onTemplate={sendTemplate}
            onClose={() => setActiveConversationId(null)}
            onBack={() => setShowList(true)}
            compact={embedded}
          />
        </div>
      ) : null}

      {/* Mobile back button */}
      {isMobile && !showList && (
        <button className="mobile-chat-back" onClick={() => { setShowList(true); setActiveConversationId(null); }}>
          ← Back
        </button>
      )}
    </div>
  );
}

const ROLE_COLORS = {
  buyer: '#087f78',
  seller: '#e96f52',
  driver: '#1f6feb',
  institution: '#7c5cff',
  ops: '#f0a202',
  admin: '#f0a202',
};