import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { apiRequest, apiUrl, apiTarget } from './api';

/**
 * The client has two possible backends, and this module is the only place that
 * knows which one it is talking to. So these tests are about two things: the
 * mapping from the stable `/api` contract onto Supabase function names, and the
 * guarantee that a credential-bearing header cannot be aimed anywhere except the
 * AquaLink server.
 */

const PROJECT_URL = 'https://project-ref.supabase.co';
const ANON_KEY = 'anon-public-key';

async function withSupabaseEnv(run) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', PROJECT_URL);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON_KEY);
  const mod = await import('./api');
  try {
    await run(mod);
  } finally {
    vi.unstubAllEnvs();
  }
}

let fetchMock;

beforeEach(() => {
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('choosing a backend', () => {
  test('prefers Supabase when the project is configured', async () => {
    await withSupabaseEnv(async (mod) => {
      expect(mod.apiTarget()).toBe('supabase');
    });
  });

  test('falls back to the same-origin API when Supabase is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const mod = await import('./api');

    expect(mod.apiTarget()).toBe('firebase');
    // Same origin by default: Firebase Hosting proxies /api/* to the functions in
    // firebase.json, which keeps the functions domain out of the client entirely.
    expect(mod.apiUrl('/payments/verify?reference=r1')).toBe('/api/payments/verify?reference=r1');
  });
});

describe('mapping the api contract onto Supabase functions', () => {
  test('every client path reaches the function that implements it', async () => {
    await withSupabaseEnv(async (mod) => {
      // These are the exact URLs the Paystack flow depends on. A mismatch here is
      // the difference between a working checkout and a 404 at the last step.
      expect(mod.apiUrl('/payments/initialize')).toBe(
        `${PROJECT_URL}/functions/v1/payments/initialize`,
      );
      expect(mod.apiUrl('/payments/verify?reference=abc')).toBe(
        `${PROJECT_URL}/functions/v1/payments/verify?reference=abc`,
      );
      expect(mod.apiUrl('/orders')).toBe(`${PROJECT_URL}/functions/v1/orders/create`);
      expect(mod.apiUrl('/pricing?volume=500')).toBe(
        `${PROJECT_URL}/functions/v1/pricing/price?volume=500`,
      );
      expect(mod.apiUrl('/sellers/apply')).toBe(`${PROJECT_URL}/functions/v1/sellers/apply`);
      expect(mod.apiUrl('/ops/login')).toBe(`${PROJECT_URL}/functions/v1/ops/login`);
    });
  });

  test('refuses an unmapped path rather than guessing a function name', async () => {
    await withSupabaseEnv(async (mod) => {
      // Inferring a function name from a path would silently address a function
      // that does not exist, so an unknown route is a loud failure.
      expect(() => mod.apiUrl('/nonsense/leg')).toThrow(/No Supabase function is mapped/);
    });
  });

  test('tolerates a trailing slash on the project URL', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', `${PROJECT_URL}/`);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON_KEY);
    const mod = await import('./api');

    expect(mod.apiUrl('/payments/initialize')).toBe(
      `${PROJECT_URL}/functions/v1/payments/initialize`,
    );
  });
});

describe('error handling', () => {
  test('prefers the server message so the UI can explain itself', async () => {
    await withSupabaseEnv(async (mod) => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({
          error: 'order_email_mismatch',
          message: 'This order belongs to a different account.',
        }),
      });

      await expect(mod.apiRequest('/payments/initialize', { method: 'POST' }))
        .rejects.toThrow(/different account/i);
    });
  });

  test('throws on an unreadable body rather than guessing', async () => {
    await withSupabaseEnv(async (mod) => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '<html>gateway</html>' });
      await expect(mod.apiRequest('/payments/verify?reference=r1'))
        .rejects.toThrow(/unreadable response/i);
    });
  });
});

describe('secret handling', () => {
  test('the transport never names a payment provider or carries a secret', async () => {
    const source = await readFile('src/lib/api.js', 'utf8');

    // This module is shipped to every visitor. It may only name the AquaLink
    // server, never a payment provider's API host, and must carry nothing that
    // looks like a credential.
    expect(source).not.toMatch(/api\.paystack\.co/);
    expect(source).not.toMatch(/sk_(live|test)_/);
    expect(source).not.toMatch(/PAYSTACK_SECRET/);
    expect(source).not.toMatch(/OPS_SESSION_SECRET/);
  });

  test('the only host in the client comes from the project URL', async () => {
    const source = await readFile('src/lib/api.js', 'utf8');

    // Every absolute URL in this module is built from `supabaseUrl`, which comes
    // from the environment. No host is hardcoded, so there is nowhere for a
    // token to be sent other than the deployment the app already points at.
    expect(source).toMatch(/supabaseUrl/);
    const hardcoded = source.match(/https?:\/\/[a-z0-9.-]+/gi) ?? [];
    expect(hardcoded).toEqual([]);
  });
});
