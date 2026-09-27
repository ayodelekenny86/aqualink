/**
 * Firebase Cloud Messaging utilities for server-side push notifications.
 *
 * Uses the Firebase Admin SDK to send messages to client tokens stored in Firestore.
 * Tokens are stored per-user in a 'fcmTokens' collection.
 */

import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
const messaging = getMessaging();

/**
 * Send a push notification to a specific user's devices.
 * @param {string} userId - The user identifier (email or phone)
 * @param {Object} payload - Notification payload
 * @returns {Promise<Object>} - FCM send response
 */
export async function sendPushToUser(userId, payload) {
  try {
    const tokensSnapshot = await db.collection('fcmTokens')
      .where('userId', '==', userId)
      .where('active', '==', true)
      .get();

    if (tokensSnapshot.empty) {
      console.log(`No active FCM tokens for user ${userId}`);
      return { success: false, reason: 'no_tokens' };
    }

    const tokens = tokensSnapshot.docs.map(doc => doc.data().token);

    if (tokens.length === 1) {
      const response = await messaging.send({
        token: tokens[0],
        ...payload,
      });
      return { success: true, response };
    } else {
      const response = await messaging.sendEachForMulticast({
        tokens,
        ...payload,
      });
      // Clean up failed tokens
      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const error = resp.error;
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
              failedTokens.push(tokens[idx]);
            }
          }
        });
        if (failedTokens.length > 0) {
          const batch = db.batch();
          for (const token of failedTokens) {
            const tokenDocs = await db.collection('fcmTokens')
              .where('token', '==', token)
              .where('userId', '==', userId)
              .limit(1)
              .get();
            tokenDocs.docs.forEach(doc => batch.delete(doc.ref));
          }
          await batch.commit();
        }
      }
      return { success: true, response };
    }
  } catch (error) {
    console.error('FCM send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send order status update notification to buyer.
 */
export async function notifyOrderStatusChange(order, oldStatus) {
  const statusMessages = {
    'Awaiting payment': 'Your order is awaiting payment.',
    'Paid': 'Payment confirmed! Your order is being prepared.',
    'Assigned': 'A seller has been assigned to your delivery.',
    'En Route': 'Your water is on the way!',
    'Delivered': 'Your delivery has been completed. Please confirm receipt.',
    'Cancelled': 'Your order has been cancelled.',
  };

  const title = 'AquaLink Order Update';
  const body = statusMessages[order.status] || `Order status: ${order.status}`;

  return sendPushToUser(order.email, {
    notification: { title, body },
    data: {
      type: 'order_status',
      orderId: order.id,
      status: order.status,
      oldStatus: oldStatus || '',
    },
    android: {
      priority: 'high',
      notification: { channelId: 'orders' },
    },
    apns: {
      payload: { aps: { contentAvailable: true } },
    },
  });
}

/**
 * Notify seller of new order assignment.
 */
export async function notifySellerNewOrder(order) {
  // Find seller for this order's region
  const sellersSnapshot = await db.collection('sellers')
    .where('status', '==', 'approved')
    .where('available', '==', true)
    .limit(10)
    .get();

  if (sellersSnapshot.empty) return { success: false, reason: 'no_sellers' };

  const results = [];
  for (const sellerDoc of sellersSnapshot.docs) {
    const seller = sellerDoc.data();
    const result = await sendPushToUser(seller.phone, {
      notification: {
        title: 'New Delivery Job',
        body: `${order.volumeLitres}L to ${order.location}`,
      },
      data: {
        type: 'new_order',
        orderId: order.id,
        location: order.location,
        volume: String(order.volumeLitres),
      },
      android: { priority: 'high', notification: { channelId: 'jobs' } },
      apns: { payload: { aps: { contentAvailable: true } } },
    });
    results.push({ sellerId: sellerDoc.id, ...result });
  }
  return results;
}

/**
 * Notify driver of new assignment.
 */
export async function notifyDriverAssignment(driverPhone, order) {
  return sendPushToUser(driverPhone, {
    notification: {
      title: 'New Assignment',
      body: `Deliver ${order.volumeLitres}L to ${order.location}`,
    },
    data: {
      type: 'driver_assignment',
      orderId: order.id,
      location: order.location,
      volume: String(order.volumeLitres),
    },
    android: { priority: 'high', notification: { channelId: 'jobs' } },
    apns: { payload: { aps: { contentAvailable: true } } },
  });
}

/**
 * Store FCM token for a user.
 */
export async function storeFcmToken(userId, token, platform = 'web') {
  const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex').slice(0, 32);
  
  await db.collection('fcmTokens').doc(tokenHash).set({
    userId,
    token,
    platform,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  return { success: true };
}

/**
 * Deactivate FCM token.
 */
export async function deactivateFcmToken(token) {
  const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex').slice(0, 32);
  await db.collection('fcmTokens').doc(tokenHash).update({ active: false });
  return { success: true };
}