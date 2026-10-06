import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update, findBy } from '../lib/collections';

/**
 * In-app messaging system for AquaLink.
 * 
 * Supports conversations between:
 * - Buyer ↔ Driver (for active deliveries)
 * - Buyer ↔ Seller (for order issues)
 * - Driver ↔ Seller (for dispatch coordination)
 * - Admin ↔ Anyone (for support/ops)
 * 
 * Messages are stored locally with optional server sync.
 * Real-time updates via localStorage events for multi-tab support.
 */

const MESSAGE_STORE_KEY = 'aq_messages';
const CONVERSATION_STORE_KEY = 'aq_conversations';

export function useMessaging({ currentUser, currentRole, onNotice }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Load from localStorage on init
  useEffect(() => {
    const loadData = () => {
      try {
        const storedConvs = localStorage.getItem(CONVERSATION_STORE_KEY);
        const storedMsgs = localStorage.getItem(MESSAGE_STORE_KEY);
        if (storedConvs) setConversations(JSON.parse(storedConvs));
        if (storedMsgs) setMessages(JSON.parse(storedMsgs));
      } catch (e) {
        console.warn('Failed to load messages:', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();

    // Listen for storage changes from other tabs
    const handleStorage = (e) => {
      if (e.key === CONVERSATION_STORE_KEY && e.newValue) {
        setConversations(JSON.parse(e.newValue));
      }
      if (e.key === MESSAGE_STORE_KEY && e.newValue) {
        setMessages(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Persist conversations
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(CONVERSATION_STORE_KEY, JSON.stringify(conversations));
    }
  }, [conversations, loading]);

  // Persist messages
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(MESSAGE_STORE_KEY, JSON.stringify(messages));
    }
  }, [messages, loading]);

  // Get or create conversation between two parties
  const getOrCreateConversation = useCallback((participantId, participantName, participantRole, orderId = null) => {
    const userId = currentUser?.identifier || currentUser?.phone || currentUser?.email;
    if (!userId) return null;

    const participantIds = [userId, participantId].sort();
    const conversationId = `conv_${participantIds.join('_')}${orderId ? `_${orderId}` : ''}`;

    let conv = conversations.find(c => c.id === conversationId);
    if (!conv) {
      conv = {
        id: conversationId,
        participants: [
          { id: userId, name: currentUser?.displayName || userId, role: currentRole },
          { id: participantId, name: participantName, role: participantRole },
        ],
        orderId,
        lastMessage: null,
        unreadCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setConversations(prev => [conv, ...prev.filter(c => c.id !== conversationId)]);
    }
    return conv;
  }, [conversations, currentUser, currentRole]);

  // Send a message
  const sendMessage = useCallback(async (conversationId, text, metadata = {}) => {
    if (!text.trim() || !currentUser) return null;

    setSending(true);
    const userId = currentUser.identifier || currentUser.phone || currentUser.email;
    
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      senderId: userId,
      senderName: currentUser.displayName || userId,
      senderRole: currentRole,
      text: text.trim(),
      metadata, // { orderId, type: 'text' | 'system' | 'location' | 'code' }
      timestamp: new Date().toISOString(),
      read: false,
    };

    setMessages(prev => [...prev, message]);
    
    // Update conversation
    setConversations(prev => prev.map(conv => 
      conv.id === conversationId 
        ? { ...conv, lastMessage: message, updatedAt: message.timestamp, unreadCount: conv.unreadCount + 1 }
        : conv
    ));

    // In a real app, would also sync to server here
    // await apiRequest('/messages', { method: 'POST', body: message });

    setSending(false);
    return message;
  }, [currentUser, currentRole]);

  // Mark messages as read
  const markAsRead = useCallback((conversationId) => {
    setMessages(prev => prev.map(msg => 
      msg.conversationId === conversationId && !msg.read ? { ...msg, read: true } : msg
    ));
    setConversations(prev => prev.map(conv => 
      conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
    ));
  }, []);

  // Get messages for a conversation
  const getMessages = useCallback((conversationId) => {
    return messages
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [messages]);

  // Get conversations for current user
  const userConversations = useMemo(() => {
    const userId = currentUser?.identifier || currentUser?.phone || currentUser?.email;
    if (!userId) return [];
    
    return conversations
      .filter(c => c.participants.some(p => p.id === userId))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [conversations, currentUser]);

  // Get unread count
  const totalUnread = useMemo(() => 
    userConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
  [userConversations]);

  // Start conversation with driver (from buyer/seller)
  const startDriverChat = useCallback((driverId, driverName, orderId) => {
    const conv = getOrCreateConversation(driverId, driverName, 'driver', orderId);
    if (conv) setActiveConversationId(conv.id);
    return conv;
  }, [getOrCreateConversation]);

  // Start conversation with buyer (from driver/seller)
  const startBuyerChat = useCallback((buyerId, buyerName, orderId) => {
    const conv = getOrCreateConversation(buyerId, buyerName, 'buyer', orderId);
    if (conv) setActiveConversationId(conv.id);
    return conv;
  }, [getOrCreateConversation]);

  // Start conversation with seller (from buyer)
  const startSellerChat = useCallback((sellerId, sellerName, orderId) => {
    const conv = getOrCreateConversation(sellerId, sellerName, 'seller', orderId);
    if (conv) setActiveConversationId(conv.id);
    return conv;
  }, [getOrCreateConversation]);

  // Send quick template messages
  const sendTemplate = useCallback((conversationId, template, order) => {
    const templates = {
      'on_my_way': `I'm on my way to deliver your order ${order?.code || ''}. ETA: ${order?.eta || 'calculating...'}`,
      'arrived': `I've arrived at ${order?.location || 'the delivery location'}. Please come out with your delivery code.`,
      'need_code': `Please provide your delivery code to complete the delivery for order ${order?.code || ''}.`,
      'delayed': `Your delivery ${order?.code || ''} is delayed due to ${metadata?.reason || 'traffic'}. New ETA: ${order?.eta || 'TBD'}`,
      'confirm_delivery': `Please confirm receipt of order ${order?.code || ''}. Your delivery code is required.`,
    };
    const text = templates[template] || template;
    return sendMessage(conversationId, text, { orderId: order?.id, type: 'template', template });
  }, [sendMessage]);

  return {
    conversations: userConversations,
    activeConversationId,
    setActiveConversationId,
    messages: activeConversationId ? getMessages(activeConversationId) : [],
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
  };
}

export default useMessaging;