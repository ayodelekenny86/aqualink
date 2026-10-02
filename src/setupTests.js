// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Raise testing-library's default async timeout from 1s to 10s.
 *
 * Several flows hash a password with 210,000 PBKDF2 iterations on the main
 * thread. That is instant in a browser on an idle machine and reliably slower
 * than one second when the suite runs its files in parallel and the CPU is
 * saturated, so any `findBy*`/`waitFor` waiting on a sign-in failed
 * intermittently under full-suite load while passing in isolation.
 *
 * Set once here rather than per assertion: it is a property of how expensive
 * this app's crypto is, not of any individual test. Individual tests can still
 * pass a shorter timeout when they are asserting that something is *absent* and
 * want to fail fast.
 */
configure({ asyncUtilTimeout: 10000 });

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
  app: null,
  db: null,
  auth: null,
  messaging: null,
  firebaseConfig: {},
}));

// Mock Supabase client for tests
vi.mock('../lib/supabase', () => ({
  supabase: null,
  supabaseUrl: '',
  anonKey: '',
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