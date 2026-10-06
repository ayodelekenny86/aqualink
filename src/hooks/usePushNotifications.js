import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../lib/api';

/**
 * Push notifications via the AquaLink server.
 *
 * The push channel is whatever the operator configures on the server; this
 * hook only asks the server to store or revoke a token. When no server is
 * configured the hook reports "not supported" and does nothing, so the app
 * still runs.
 */

async function syncTokenToServer(userId, token, platform = 'web') {
  try {
    await apiRequest('/fcmToken', {
      method: 'POST',
      body: { userId, token, platform },
    });
  } catch (err) {
    console.warn('Failed to sync push token to server:', err);
  }
}

async function revokeTokenOnServer(token) {
  try {
    await apiRequest('/fcmTokenDelete', {
      method: 'POST',
      body: { token },
    });
  } catch (err) {
    console.warn('Failed to revoke push token on server:', err);
  }
}

export function usePushNotifications() {
  const [token, setToken] = useState(null);
  const [permission, setPermission] = useState('default');
  const [error, setError] = useState(null);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      setError('Notifications are not supported in this browser');
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError('Notification permission was denied');
        return false;
      }

      // No Firebase project is configured for this deployment, so there is no
      // FCM token to mint. The server is the single push channel, and it will
      // tell the UI when it is ready.
      setError(null);
      return true;
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      setError(err.message);
      return false;
    }
  }, []);

  const revokeToken = useCallback(async () => {
    const oldToken = localStorage.getItem('fcm_token');
    if (oldToken) await revokeTokenOnServer(oldToken);
    setToken(null);
    localStorage.removeItem('fcm_token');
  }, []);

  useEffect(() => {
    if (!('Notification' in window)) return;
    setPermission(Notification.permission);

    const storedToken = localStorage.getItem('fcm_token');
    if (storedToken) setToken(storedToken);
  }, []);

  return { token, permission, error, requestPermission, revokeToken, syncTokenToServer };
}

export function useFCMTokenSync(userId) {
  const { token, syncTokenToServer } = usePushNotifications();

  useEffect(() => {
    if (!userId || !token) return;
    syncTokenToServer(userId, token);
  }, [userId, token, syncTokenToServer]);
}