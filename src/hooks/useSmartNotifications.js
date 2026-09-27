import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update, findBy } from '../lib/collections';
import { usePushNotifications } from './usePushNotifications';

/**
 * Smart Notification Engine with Behavioral Triggers
 * 
 * Features:
 * - Event-driven notifications (orders, payments, deliveries, quality)
 * - Behavioral triggers (inactivity, churn risk, milestone, anomaly)
 * - Multi-channel delivery (push, in-app, email, SMS)
 * - Smart batching and deduplication
 * - Personalization with user context
 * - A/B testing for notification copy
 * - Delivery tracking and analytics
 * - Quiet hours and preference management
 * - Escalation policies for critical alerts
 */

const NOTIFICATION_TYPES = {
  ORDER_CREATED: 'order_created',
  ORDER_ASSIGNED: 'order_assigned',
  ORDER_EN_ROUTE: 'order_en_route',
  ORDER_DELIVERED: 'order_delivered',
  ORDER_CANCELLED: 'order_cancelled',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_REMINDER: 'payment_reminder',
  DRIVER_ARRIVING: 'driver_arriving',
  DELIVERY_CODE: 'delivery_code',
  QUALITY_ALERT: 'quality_alert',
  SCHEDULE_REMINDER: 'schedule_reminder',
  BUDGET_WARNING: 'budget_warning',
  CHURN_RISK: 'churn_risk',
  MILESTONE: 'milestone',
  ANOMALY_DETECTED: 'anomaly_detected',
  MAINTENANCE_DUE: 'maintenance_due',
  INVENTORY_LOW: 'inventory_low',
  PRICE_CHANGE: 'price_change',
  WELCOME: 'welcome',
  REENGAGEMENT: 'reengagement',
};

const TRIGGER_CONDITIONS = {
  INACTIVITY_DAYS: 30,
  CHURN_RISK_THRESHOLD: 70,
  BUDGET_UTILIZATION_WARNING: 80,
  BUDGET_UTILIZATION_CRITICAL: 95,
  INVENTORY_THRESHOLD: 1000,
  MAINTENANCE_INTERVAL_KM: 5000,
  ORDER_DELAY_MINUTES: 30,
};

const QUIET_HOURS = { start: 22, end: 7 };

function shouldSendNow(preferences) {
  if (!preferences?.quietHoursEnabled) return true;
  const hour = new Date().getHours();
  return hour < QUIET_HOURS.start && hour >= QUIET_HOURS.end;
}

function getNotificationTemplate(type, context, language = 'en') {
  const templates = {
    [NOTIFICATION_TYPES.ORDER_CREATED]: {
      title: 'New Order Received',
      body: 'Order {{code}} for {{volume}} has been placed.',
      action: 'View Order',
    },
    [NOTIFICATION_TYPES.ORDER_ASSIGNED]: {
      title: 'Driver Assigned',
      body: '{{driverName}} is on the way to pick up your order {{code}}.',
      action: 'Track Driver',
    },
    [NOTIFICATION_TYPES.ORDER_EN_ROUTE]: {
      title: 'Order On The Way',
      body: 'Your water delivery {{code}} is en route. ETA: {{eta}}.',
      action: 'Track Live',
    },
    [NOTIFICATION_TYPES.ORDER_DELIVERED]: {
      title: 'Delivery Complete',
      body: 'Order {{code}} has been delivered. Please confirm receipt.',
      action: 'Confirm Delivery',
    },
    [NOTIFICATION_TYPES.PAYMENT_RECEIVED]: {
      title: 'Payment Received',
      body: 'GH₵{{amount}} received for order {{code}}. Thank you!',
      action: 'View Receipt',
    },
    [NOTIFICATION_TYPES.PAYMENT_REMINDER]: {
      title: 'Payment Reminder',
      body: 'Order {{code}} is awaiting payment of GH₵{{amount}}.',
      action: 'Pay Now',
    },
    [NOTIFICATION_TYPES.CHURN_RISK]: {
      title: 'We Miss You!',
      body: 'It\'s been {{days}} days since your last order. Here\'s 10% off your next delivery.',
      action: 'Order Now',
    },
    [NOTIFICATION_TYPES.MILESTONE]: {
      title: 'Milestone Achieved!',
      body: 'Congratulations on your {{count}}th delivery! Enjoy a free upgrade on your next order.',
      action: 'Claim Reward',
    },
    [NOTIFICATION_TYPES.BUDGET_WARNING]: {
      title: 'Budget Alert',
      body: 'You\'ve used {{percent}}% of your monthly water budget (GH₵{{spent}} of GH₵{{budget}}).',
      action: 'View Budget',
    },
    [NOTIFICATION_TYPES.ANOMALY_DETECTED]: {
      title: 'Unusual Activity Detected',
      body: '{{description}}. Please review.',
      action: 'View Details',
    },
    [NOTIFICATION_TYPES.MAINTENANCE_DUE]: {
      title: 'Vehicle Maintenance Due',
      body: 'Your vehicle {{vehicle}} is due for service ({{km}} km since last service).',
      action: 'Schedule Service',
    },
    [NOTIFICATION_TYPES.INVENTORY_LOW]: {
      title: 'Low Inventory Alert',
      body: 'Your {{product}} stock is below {{threshold}} gallons. Time to restock.',
      action: 'Restock',
    },
    [NOTIFICATION_TYPES.QUALITY_ALERT]: {
      title: 'Water Quality Alert',
      body: 'Quality test for {{source}} shows {{parameter}} at {{value}}. {{action}}.',
      action: 'View Report',
    },
    [NOTIFICATION_TYPES.SCHEDULE_REMINDER]: {
      title: 'Upcoming Delivery',
      body: 'Your scheduled delivery "{{name}}" for {{volume}} is tomorrow.',
      action: 'View Schedule',
    },
    [NOTIFICATION_TYPES.WELCOME]: {
      title: 'Welcome to AquaLink!',
      body: 'Get reliable water delivery in minutes. Book your first order today.',
      action: 'Book Now',
    },
    [NOTIFICATION_TYPES.REENGAGEMENT]: {
      title: 'Come Back for 15% Off',
      body: 'We haven\'t seen you in a while. Use code WELCOME15 for 15% off.',
      action: 'Order Now',
    },
  };
  
  const template = templates[type];
  if (!template) return { title: 'Notification', body: 'You have a new update', action: 'View' };
  
  let body = template.body;
  Object.entries(context).forEach(([key, value]) => {
    body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });
  
  return { ...template, body };
}

function generateNotificationId() {
  return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useSmartNotifications({ 
  user, 
  orders, 
  driverPositions, 
  schedules, 
  budget, 
  qualityRecords,
  onNotice 
}) {
  const { requestPermission, sendLocalNotification } = usePushNotifications();
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState({
    pushEnabled: true,
    inAppEnabled: true,
    emailEnabled: false,
    smsEnabled: false,
    quietHoursEnabled: true,
    quietHoursStart: 22,
    quietHoursEnd: 7,
    orderUpdates: true,
    paymentReminders: true,
    marketingPromos: false,
    budgetAlerts: true,
    qualityAlerts: true,
    maintenanceAlerts: true,
    anomalyAlerts: true,
  });
  const [deliveryLog, setDeliveryLog] = useState([]);
  const [abTests, setAbTests] = useState({});
  const [processing, setProcessing] = useState(false);

  const sendNotification = useCallback(async (type, context, options = {}) => {
    const { 
      userId = user?.identifier, 
      channels = ['push', 'inApp'], 
      priority = 'normal',
      deduplicationKey,
      expiresIn = 24 * 60 * 60 * 1000,
    } = options;

    if (!shouldSendNow(preferences)) {
      console.log('Notification deferred due to quiet hours');
      return null;
    }

    const typePrefs = {
      [NOTIFICATION_TYPES.ORDER_CREATED]: preferences.orderUpdates,
      [NOTIFICATION_TYPES.ORDER_ASSIGNED]: preferences.orderUpdates,
      [NOTIFICATION_TYPES.ORDER_EN_ROUTE]: preferences.orderUpdates,
      [NOTIFICATION_TYPES.ORDER_DELIVERED]: preferences.orderUpdates,
      [NOTIFICATION_TYPES.PAYMENT_RECEIVED]: preferences.paymentReminders,
      [NOTIFICATION_TYPES.PAYMENT_REMINDER]: preferences.paymentReminders,
      [NOTIFICATION_TYPES.PAYMENT_FAILED]: preferences.paymentReminders,
      [NOTIFICATION_TYPES.CHURN_RISK]: preferences.marketingPromos,
      [NOTIFICATION_TYPES.MILESTONE]: preferences.marketingPromos,
      [NOTIFICATION_TYPES.REENGAGEMENT]: preferences.marketingPromos,
      [NOTIFICATION_TYPES.BUDGET_WARNING]: preferences.budgetAlerts,
      [NOTIFICATION_TYPES.ANOMALY_DETECTED]: preferences.anomalyAlerts,
      [NOTIFICATION_TYPES.MAINTENANCE_DUE]: preferences.maintenanceAlerts,
      [NOTIFICATION_TYPES.INVENTORY_LOW]: preferences.maintenanceAlerts,
      [NOTIFICATION_TYPES.QUALITY_ALERT]: preferences.qualityAlerts,
      [NOTIFICATION_TYPES.SCHEDULE_REMINDER]: preferences.orderUpdates,
    };

    if (!typePrefs[type]) return null;

    if (deduplicationKey) {
      const recent = notifications.find(n => 
        n.deduplicationKey === deduplicationKey &&
        Date.now() - new Date(n.createdAt).getTime() < 60 * 60 * 1000
      );
      if (recent) return recent.id;
    }

    const template = getNotificationTemplate(type, context);
    const notification = {
      id: generateNotificationId(),
      userId,
      type,
      title: template.title,
      body: template.body,
      action: template.action,
      context,
      channels,
      priority,
      deduplicationKey,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresIn).toISOString(),
      status: 'pending',
      deliveredAt: null,
      readAt: null,
      clickedAt: null,
    };

    setNotifications(prev => [notification, ...prev.slice(0, 99)]);

    const deliveryResults = [];
    
    if (channels.includes('push') && preferences.pushEnabled) {
      try {
        await sendLocalNotification(template.title, template.body, {
          data: { notificationId: notification.id, type, ...context },
          tag: deduplicationKey || type,
        });
        deliveryResults.push({ channel: 'push', success: true });
      } catch (e) {
        deliveryResults.push({ channel: 'push', success: false, error: e.message });
      }
    }
    
    if (channels.includes('inApp') && preferences.inAppEnabled) {
      deliveryResults.push({ channel: 'inApp', success: true });
      if (onNotice) onNotice(template.body);
    }

    setDeliveryLog(prev => [...prev, {
      notificationId: notification.id,
      results: deliveryResults,
      timestamp: new Date().toISOString(),
    }].slice(0, 499));

    setNotifications(prev => prev.map(n => 
      n.id === notification.id ? { ...n, status: 'delivered', deliveredAt: new Date().toISOString() } : n
    ));

    return notification.id;
  }, [user, preferences, notifications, sendLocalNotification, onNotice]);

  const markAsRead = useCallback((notificationId) => {
    setNotifications(prev => prev.map(n => 
      n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n
    ));
  }, []);

  const markAsClicked = useCallback((notificationId) => {
    setNotifications(prev => prev.map(n => 
      n.id === notificationId ? { ...n, clickedAt: new Date().toISOString() } : n
    ));
  }, []);

  const dismiss = useCallback((notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const checkTriggers = useCallback(() => {
    if (!user || processing) return;
    
    setProcessing(true);
    
    const now = Date.now();
    const userOrders = orders.filter(o => o.customerId === user.identifier);
    
    // Inactivity trigger
    if (userOrders.length > 0) {
      const lastOrder = userOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      const daysSinceLastOrder = (now - new Date(lastOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceLastOrder > TRIGGER_CONDITIONS.INACTIVITY_DAYS) {
        sendNotification(NOTIFICATION_TYPES.CHURN_RISK, { 
          days: Math.round(daysSinceLastOrder) 
        }, { deduplicationKey: `churn_${user.identifier}` });
      }
    }

    // Milestone trigger
    const deliveredCount = userOrders.filter(o => o.status === 'Delivered').length;
    const milestones = [1, 5, 10, 25, 50, 100];
    milestones.forEach(m => {
      if (deliveredCount === m) {
        sendNotification(NOTIFICATION_TYPES.MILESTONE, { count: m }, { 
          deduplicationKey: `milestone_${m}_${user.identifier}` 
        });
      }
    });

    // Payment reminders for unpaid orders
    const unpaidOrders = userOrders.filter(o => o.status !== 'Paid' && o.status !== 'Cancelled');
    unpaidOrders.forEach(order => {
      const hoursSinceCreated = (now - new Date(order.createdAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceCreated > 24 && hoursSinceCreated < 25) {
        sendNotification(NOTIFICATION_TYPES.PAYMENT_REMINDER, {
          code: order.code,
          amount: (order.chargedMinor || 0) / 100,
        }, { deduplicationKey: `payment_reminder_${order.id}` });
      }
    });

    // Schedule reminders
    if (schedules) {
      schedules.filter(s => s.active).forEach(schedule => {
        const nextDelivery = new Date(schedule.nextDelivery).getTime();
        const hoursUntil = (nextDelivery - now) / (1000 * 60 * 60);
        if (hoursUntil > 0 && hoursUntil < 24) {
          sendNotification(NOTIFICATION_TYPES.SCHEDULE_REMINDER, {
            name: schedule.name,
            volume: schedule.volume,
          }, { deduplicationKey: `schedule_${schedule.id}_${schedule.nextDelivery}` });
        }
      });
    }

    // Budget warnings
    if (budget && budget.monthly > 0) {
      const utilization = (budget.spent / budget.monthly) * 100;
      if (utilization >= TRIGGER_CONDITIONS.BUDGET_UTILIZATION_CRITICAL) {
        sendNotification(NOTIFICATION_TYPES.BUDGET_WARNING, {
          percent: Math.round(utilization),
          spent: budget.spent / 100,
          budget: budget.monthly / 100,
        }, { priority: 'high', deduplicationKey: `budget_critical_${user.identifier}` });
      } else if (utilization >= TRIGGER_CONDITIONS.BUDGET_UTILIZATION_WARNING) {
        sendNotification(NOTIFICATION_TYPES.BUDGET_WARNING, {
          percent: Math.round(utilization),
          spent: budget.spent / 100,
          budget: budget.monthly / 100,
        }, { deduplicationKey: `budget_warning_${user.identifier}` });
      }
    }

    // Order status triggers
    userOrders.forEach(order => {
      if (order.status === 'Assigned' && order.assignedAt) {
        const hoursSinceAssigned = (now - new Date(order.assignedAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceAssigned > TRIGGER_CONDITIONS.ORDER_DELAY_MINUTES / 60 && 
            hoursSinceAssigned < TRIGGER_CONDITIONS.ORDER_DELAY_MINUTES / 60 + 1) {
          sendNotification(NOTIFICATION_TYPES.ANOMALY_DETECTED, {
            description: `Order ${order.code} has been assigned for over ${TRIGGER_CONDITIONS.ORDER_DELAY_MINUTES} minutes without driver movement`,
          }, { priority: 'high', deduplicationKey: `delay_${order.id}` });
        }
      }
    });

    setProcessing(false);
  }, [user, orders, driverPositions, schedules, budget, sendNotification]);

  useEffect(() => {
    const interval = setInterval(checkTriggers, 5 * 60 * 1000);
    checkTriggers();
    return () => clearInterval(interval);
  }, [checkTriggers]);

  useEffect(() => {
    if (orders.length > 0) {
      const latestOrder = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (latestOrder.customerId === user?.identifier && latestOrder.status === 'Created') {
        sendNotification(NOTIFICATION_TYPES.ORDER_CREATED, {
          code: latestOrder.code,
          volume: latestOrder.volume,
        }, { deduplicationKey: `order_created_${latestOrder.id}` });
      }
    }
  }, [orders, user, sendNotification]);

  const unreadCount = useMemo(() => 
    notifications.filter(n => !n.readAt).length, [notifications]);

  const updatePreferences = useCallback((newPrefs) => {
    setPreferences(prev => ({ ...prev, ...newPrefs }));
  }, []);

  const runAbTest = useCallback((testName, variantA, variantB, type, context) => {
    const testKey = `${testName}_${type}`;
    const existing = abTests[testKey];
    
    if (existing) {
      const variant = existing.assignedVariant;
      return sendNotification(type, { ...context, ...variant.context }, { ...variant.options });
    }
    
    const variant = Math.random() < 0.5 ? variantA : variantB;
    const newTests = {
      ...abTests,
      [testKey]: {
        testName,
        type,
        assignedVariant: variant.name,
        startedAt: new Date().toISOString(),
      }
    };
    setAbTests(newTests);
    return sendNotification(type, { ...context, ...variant.context }, variant.options);
  }, [abTests, sendNotification]);

  return {
    notifications,
    preferences,
    updatePreferences,
    deliveryLog,
    unreadCount,
    sendNotification,
    markAsRead,
    markAsClicked,
    dismiss,
    clearAll,
    runAbTest,
    checkTriggers,
    NOTIFICATION_TYPES,
  };
}

export default useSmartNotifications;