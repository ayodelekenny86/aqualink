import { useEffect, useState } from 'react';

let registerSW = null;
try {
  const mod = await import('virtual:pwa-register/react');
  registerSW = mod.registerSW;
} catch {
  // Virtual module not available (e.g., in tests)
  registerSW = null;
}

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (registerSW) {
      const { needRefresh: nr, offlineReady: or, updateServiceWorker } = registerSW({
        onNeedRefresh() {
          if (confirm('New content available. Click OK to refresh.')) {
            updateServiceWorker(true);
          }
        },
        onOfflineReady() {
          setOfflineReady(true);
          console.log('App ready to work offline');
        },
      });
      // The returned values are refs, so we need to sync them to state
      const sync = setInterval(() => {
        setNeedRefresh(nr.value);
        setOfflineReady(or.value);
      }, 1000);
      return () => clearInterval(sync);
    }
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'CACHE_UPDATED') {
          console.log('Cache updated:', event.data.payload);
        }
      });
    }
  }, []);

  const updateServiceWorker = registerSW
    ? registerSW().updateServiceWorker
    : () => {};

  return { needRefresh, offlineReady, updateServiceWorker };
}

export function PWAUpdatePrompt({ needRefresh, updateServiceWorker }) {
  if (!needRefresh) return null;

  return (
    <div className="pwa-update-prompt" role="alert">
      <span>New version available</span>
      <button onClick={() => updateServiceWorker(true)}>Refresh</button>
      <button onClick={() => needRefresh(false)}>Later</button>
    </div>
  );
}

export function PWADetectOffline({ onOfflineChange }) {
  useEffect(() => {
    const handleOnline = () => onOfflineChange?.(false);
    const handleOffline = () => onOfflineChange?.(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onOfflineChange]);

  return null;
}

export default function PWASetup() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (registerSW) {
      const { needRefresh: nr, offlineReady: or, updateServiceWorker } = registerSW({
        onNeedRefresh() {
          if (confirm('New content available. Click OK to refresh.')) {
            updateServiceWorker(true);
          }
        },
        onOfflineReady() {
          setOfflineReady(true);
          console.log('App ready to work offline');
        },
      });
      const sync = setInterval(() => {
        setNeedRefresh(nr.value);
        setOfflineReady(or.value);
      }, 1000);
      return () => clearInterval(sync);
    }
  }, []);

  return (
    <>
      <PWAUpdatePrompt needRefresh={needRefresh} updateServiceWorker={registerSW ? registerSW().updateServiceWorker : () => {}} />
      {offlineReady && (
        <div className="pwa-offline-ready" role="status">
          <span>✓ Ready for offline use</span>
        </div>
      )}
    </>
  );
}