// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock virtual:pwa-register/react for tests
vi.mock('virtual:pwa-register/react', () => ({
  registerSW: () => ({
    needRefresh: { value: false },
    offlineReady: { value: false },
    updateServiceWorker: vi.fn(),
  }),
}));

// Mock firebase for tests
vi.mock('../lib/firebase', () => ({
  db: null,
  auth: null,
  messaging: null,
  firebaseConfig: {},
}));

// Mock PWASetup component to avoid virtual module issues in tests
vi.mock('../components/PWASetup', () => ({
  default: () => null,
  usePWAUpdate: () => ({ needRefresh: false, offlineReady: false, updateServiceWorker: vi.fn() }),
  PWAUpdatePrompt: () => null,
  PWADetectOffline: () => null,
}));

// Mock push notifications hook to avoid FCM sync during tests
vi.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    token: null,
    permission: 'default',
    error: null,
    requestPermission: vi.fn().mockResolvedValue(false),
    revokeToken: vi.fn(),
    syncTokenToServer: vi.fn(),
  }),
  useFCMTokenSync: vi.fn(),
}));