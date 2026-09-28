import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  clearMetaSdkCache,
  identityFromMetaClaims,
  isMetaConfigured,
  signInWithMeta,
} from './metaAuth';

const CLIENT_ID = '123456789012345';

const META_PROFILE = {
  id: '10215478901234567',
  name: 'Kwame Asante',
  email: 'Kwame.Asante@Gmail.com',
};

describe('configuration', () => {
  test('reports unconfigured when no app id is present', () => {
    expect(isMetaConfigured()).toBe(false);
  });

  test('refuses to sign in when unconfigured, rather than trusting it', async () => {
    await expect(signInWithMeta({})).rejects.toThrow(/not configured/i);
  });
});

describe('identity mapping', () => {
  test('lowercases the email and records the provider subject', () => {
    const identity = identityFromMetaClaims(META_PROFILE, 'buyer');
    expect(identity.identifier).toBe('kwame.asante@gmail.com');
    expect(identity.identifierType).toBe('email');
    expect(identity.provider).toBe('facebook');
    expect(identity.subject).toBe('10215478901234567');
    expect(identity.displayName).toBe('Kwame Asante');
  });

  test('falls back to the email prefix when Meta supplies no name', () => {
    const identity = identityFromMetaClaims({ ...META_PROFILE, name: undefined }, 'buyer');
    expect(identity.displayName).toBe('kwame.asante');
  });

  test('refuses an unknown role rather than passing it through', () => {
    expect(identityFromMetaClaims(META_PROFILE, 'superuser').role).toBe('buyer');
  });

  test('falls back to a numeric slice when no email or name is present', () => {
    const identity = identityFromMetaClaims({ id: '10215478901234567' }, 'buyer');
    expect(identity.displayName).toBe('10215478');
    expect(identity.identifierType).toBe('subject');
  });
});

describe('sign-in flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMetaSdkCache();
  });

  test('rejects when the SDK is not available', async () => {
    vi.stubEnv('VITE_FACEBOOK_CLIENT_ID', CLIENT_ID);
    // loadFacebookSdk relies on window.FB; without a browser env it rejects.
    await expect(signInWithMeta({})).rejects.toThrow();
  });

  test('verifies a token and returns the identity on success', async () => {
    vi.stubEnv('VITE_FACEBOOK_CLIENT_ID', CLIENT_ID);

    const mockFB = {
      init: vi.fn(),
      login: vi.fn((callback) => callback({
        authResponse: {
          accessToken: 'valid-token',
          userID: META_PROFILE.id,
          expiresIn: 3600,
        },
      })),
    };

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('graph.facebook.com/me')) {
        return {
          ok: true,
          json: async () => META_PROFILE,
        };
      }
      return { ok: false, json: async () => ({ error: { message: 'unexpected' } }) };
    }));

    // Bypass the SDK loading by setting window.FB directly.
    if (typeof window !== 'undefined') {
      window.FB = mockFB;
    }

    const result = await signInWithMeta({ role: 'seller' });
    expect(result.identity.identifier).toBe('kwame.asante@gmail.com');
    expect(result.identity.role).toBe('seller');
    expect(result.identity.provider).toBe('facebook');
    expect(result.claims.id).toBe(META_PROFILE.id);

    if (typeof window !== 'undefined') {
      delete window.FB;
    }
  });

  test('rejects when the Graph API does not return the user id', async () => {
    vi.stubEnv('VITE_FACEBOOK_CLIENT_ID', CLIENT_ID);

    const mockFB = {
      init: vi.fn(),
      login: vi.fn((callback) => callback({
        authResponse: {
          accessToken: 'bad-token',
          userID: '12345',
        },
      })),
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: { message: 'Invalid OAuth access token.' } }),
    })));

    if (typeof window !== 'undefined') {
      window.FB = mockFB;
    }

    await expect(signInWithMeta({})).rejects.toThrow(/verification failed/i);

    if (typeof window !== 'undefined') {
      delete window.FB;
    }
  });

  test('rejects when the Graph API id does not match the SDK userID', async () => {
    vi.stubEnv('VITE_FACEBOOK_CLIENT_ID', CLIENT_ID);

    const mockFB = {
      init: vi.fn(),
      login: vi.fn((callback) => callback({
        authResponse: {
          accessToken: 'valid-token',
          userID: '12345',
        },
      })),
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...META_PROFILE, id: 'different-id' }),
    })));

    if (typeof window !== 'undefined') {
      window.FB = mockFB;
    }

    await expect(signInWithMeta({})).rejects.toThrow(/identity mismatch/i);

    if (typeof window !== 'undefined') {
      delete window.FB;
    }
  });

  test('rejects when no email is returned', async () => {
    vi.stubEnv('VITE_FACEBOOK_CLIENT_ID', CLIENT_ID);

    const mockFB = {
      init: vi.fn(),
      login: vi.fn((callback) => callback({
        authResponse: {
          accessToken: 'valid-token',
          userID: '10215478901234567',
        },
      })),
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: '10215478901234567', name: 'Kwame Asante' }),
    })));

    if (typeof window !== 'undefined') {
      window.FB = mockFB;
    }

    await expect(signInWithMeta({})).rejects.toThrow(/email/i);

    if (typeof window !== 'undefined') {
      delete window.FB;
    }
  });

  test('rejects when the user cancels the login dialog', async () => {
    vi.stubEnv('VITE_FACEBOOK_CLIENT_ID', CLIENT_ID);

    const mockFB = {
      init: vi.fn(),
      login: vi.fn((callback) => callback({ authResponse: null })),
    };

    if (typeof window !== 'undefined') {
      window.FB = mockFB;
    }

    await expect(signInWithMeta({})).rejects.toThrow(/cancelled/i);

    if (typeof window !== 'undefined') {
      delete window.FB;
    }
  });
});
