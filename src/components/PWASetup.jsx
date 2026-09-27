import { useEffect, useState } from 'react';

let registerSWModule = null;
let loadPromise = null;

async function loadRegisterSW() {
  if (registerSWModule) return registerSWModule;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const mod = await import('virtual:pwa-register/react');
        registerSWModule = mod;
        return mod;
      } catch {
        registerSWModule = { registerSW: null };
        return registerSWModule;
      }
    })();
  }
  return loadPromise;
}

// Detect test environment - Vitest sets VITEST=1, also check for jsdom
const isTest = typeof process !== 'undefined' && (process.env.VITEST === '1' || process.env.NODE_ENV === 'test') 
  || (typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom'));

export function usePWAUpdate() {
  if (isTest) {
    return { needRefresh: false, offlineReady: false, updateServiceWorker: () => {} };
  }
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState(() => () => {});

  useEffect(() => {
    let mounted = true;
    loadRegisterSW().then((mod) => {
      if (!mounted || !mod.registerSW) return;
      const { needRefresh: nr, offlineReady: or, updateServiceWorker: usw } = mod.registerSW({
        onNeedRefresh() {
          if (confirm('New content available. Click OK to refresh.')) {
            usw(true);
          }
        },
        onOfflineReady() {
          if (mounted) setOfflineReady(true);
          console.log('App ready to work offline');
        },
      });
      const sync = setInterval(() => {
        if (!mounted) return;
        setNeedRefresh(nr.value);
        setOfflineReady(or.value);
      }, 1000);
      setUpdateServiceWorker(usw);
      return () => clearInterval(sync);
    });
    return () => { mounted = false; };
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

export function PWASetup() {
  if (isTest) {
    return null;
  }
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState(() => () => {});

  useEffect(() => {
    let mounted = true;
    loadRegisterSW().then((mod) => {
      if (!mounted || !mod.registerSW) return;
      const { needRefresh: nr, offlineReady: or, updateServiceWorker: usw } = mod.registerSW({
        onNeedRefresh() {
          if (confirm('New content available. Click OK to refresh.')) {
            usw(true);
          }
        },
        onOfflineReady() {
          if (mounted) setOfflineReady(true);
          console.log('App ready to work offline');
        },
      });
      const sync = setInterval(() => {
        if (!mounted) return;
        setNeedRefresh(nr.value);
        setOfflineReady(or.value);
      }, 1000);
      setUpdateServiceWorker(usw);
      return () => clearInterval(sync);
    });
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <PWAUpdatePrompt needRefresh={needRefresh} updateServiceWorker={updateServiceWorker} />
      {offlineReady && (
        <div className="pwa-offline-ready" role="status">
          <span>✓ Ready for offline use</span>
        </div>
      )}
    </>
  );
}