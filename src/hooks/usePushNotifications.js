import { useEffect, useState, useCallback } from 'react';
import { messaging } from '../lib/firebase';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function usePushNotifications() {
  const [token, setToken] = useState(null);
  const [permission, setPermission] = useState('default');
  const [error, setError] = useState(null);

  const requestPermission = useCallback(async () => {
    if (!messaging || !('Notification' in window)) {
      setError('Messaging not supported');
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError('Notification permission denied');
        return false;
      }

      if (!VAPID_KEY) {
        setError('VAPID key not configured');
        return false;
      }

      const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (currentToken) {
        setToken(currentToken);
        localStorage.setItem('fcm_token', currentToken);
        return true;
      } else {
        setError('No registration token available');
        return false;
      }
    } catch (err) {
      console.error('Error getting FCM token:', err);
      setError(err.message);
      return false;
    }
  }, []);

  const revokeToken = useCallback(async () => {
    if (!messaging) return;
    try {
      await deleteToken(messaging);
      setToken(null);
      localStorage.removeItem('fcm_token');
    } catch (err) {
      console.error('Error deleting FCM token:', err);
    }
  }, []);

  useEffect(() => {
    if (!messaging) return;

    const storedToken = localStorage.getItem('fcm_token');
    if (storedToken) setToken(storedToken);

    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
      const notification = payload.notification || {};
      if (notification.title && notification.body) {
        new Notification(notification.title, {
          body: notification.body,
          icon: notification.icon || '/logo192.png',
          data: payload.data,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return { token, permission, error, requestPermission, revokeToken };
}

export function useFCMTokenSync(userId) {
  const { token } = usePushNotifications();

  useEffect(() => {
    if (!userId || !token) return;
    // Sync token to Firestore for server-side sending
    // This would typically call a Cloud Function or update user document
    console.log('Syncing FCM token for user:', userId, token);
  }, [userId, token]);
}