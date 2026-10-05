import { supabaseUrl, anonKey } from './supabase';

/**
 * One place that knows how to reach the AquaLink server.
 *
 * There are two deployments of the same API and the app has to talk to exactly
 * one of them:
 *
 *   - Supabase Edge Functions, reached at `<project>/functions/v1/<fn>/<action>`;
 *   - the legacy Firebase Functions, reached on the same origin under `/api/*`.
 *
 * They are not the same paths. A single deployed function is reached at
 * `/functions/v1/<name>` and dispatches on the last path segment, so the client's
 * stable `/api` contract is mapped onto (function, action) pairs here rather than
 * being smeared across every call site.
 *
 * The mapping is deliberately explicit. Inferring a function name from a path
 * would silently send `/payments/verify` to a function that does not exist, and
 * an unmapped path is a loud error instead.
 *
 * No secret is ever named here. The Paystack key lives only in the server
 * environment; this module sends the customer's request and reads the answer.
 */

const API_ROOT = '/api';

/**
 * The client's `/api` path mapped to the Supabase function and action that
 * answers it. The Firebase rewrites in firebase.json use these same client paths,
 * so this table is the only thing that has to change to move between them.
 */
const ROUTES = {
  '/pricing': { fn: 'pricing', action: 'price' },
  '/pricing/update': { fn: 'pricing', action: 'update' },
  '/orders': { fn: 'orders', action: 'create' },
  '/orders/verify': { fn: 'orders', action: 'verify' },
  '/payments/initialize': { fn: 'payments', action: 'initialize' },
  '/payments/verify': { fn: 'payments', action: 'verify' },
  '/webhooks/paystack': { fn: 'payments', action: 'webhook' },
  '/webhooks/flutterwave': { fn: 'payments', action: 'webhook' },
  '/ops/login': { fn: 'ops', action: 'login' },
  '/sellers/apply': { fn: 'sellers', action: 'apply' },
  '/sellers/status': { fn: 'sellers', action: 'status' },
  '/sellers/applications': { fn: 'sellers', action: 'applications' },
  '/sellers/review': { fn: 'sellers', action: 'review' },
  '/config/get': { fn: 'config', action: 'get' },
  '/config/update': { fn: 'config', action: 'update' },
  '/fcmToken': { fn: 'fcm', action: 'fcmToken' },
  '/fcmTokenDelete': { fn: 'fcm', action: 'fcmTokenDelete' },
  '/ai/chat': { fn: 'ai', action: 'chat' },
  '/notifications': { fn: 'notifications', action: 'list' },
  '/notifications/read': { fn: 'notifications', action: 'read' },
};

/**
 * Where requests go, and which deployment is in use.
 *
 * Supabase is preferred when it is configured, so the cutover needs nothing more
 * than the project ref and anon key. Falling back to `/api` keeps a developer who
 * has not set those variables pointing at the Firebase functions, which is what
 * the app did before any of this existed.
 */
export function apiTarget() {
  if (supabaseUrl && anonKey) return 'supabase';
  const configured = import.meta.env?.VITE_API_BASE;
  if (typeof configured === 'string' && configured.trim()) return 'firebase';
  return 'firebase';
}

/**
 * Build the absolute URL for a client API path.
 *
 * Returns the Supabase Edge Function URL or a same-origin `/api` path. The
 * result is the only place a host is introduced in the client, which is what
 * lets the tests assert that no credential-bearing header can be pointed
 * anywhere else.
 */
export function apiUrl(path) {
  if (apiTarget() === 'supabase') {
    const route = ROUTES[path.split('?')[0]];
    if (!route) {
      throw new Error(`No Supabase function is mapped to ${path}.`);
    }
    const query = path.includes('?') ? `?${path.slice(path.indexOf('?') + 1)}` : '';
    return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${route.fn}/${route.action}${query}`;
  }

  const configured = import.meta.env?.VITE_API_BASE;
  if (typeof configured === 'string' && configured.trim()) {
    return `${configured.trim().replace(/\/$/, '')}${path}`;
  }
  return `${API_ROOT}${path}`;
}

/**
 * How long a request may take before it is abandoned.
 *
 * A checkout is a redirect, so a request that never resolves leaves the buyer
 * looking at a disabled button labelled "Working…" with no way forward and no
 * explanation. Failing lets them retry, which is strictly better than hanging.
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Send a request to the AquaLink server and parse the JSON reply.
 *
 * A non-2xx reply throws with the server's own customer-facing message and its
 * `code`, so the UI can explain what went wrong instead of showing a generic
 * failure. An unreadable body throws too: guessing at a gateway error page is how
 * a payment flow ends up believing it succeeded.
 */
export async function apiRequest(path, { method = 'GET', body, signal, auth = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  // Combined rather than replaced: a caller's own signal (an unmounted component,
  // a superseded quote) must still cancel the request.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const forwardAbort = () => abort.abort();
  signal?.addEventListener('abort', forwardAbort);

  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        // Only sent when there is a token, so unauthenticated calls carry no
        // Authorization header at all rather than an empty one.
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        // The anon key is public by design and is what Supabase uses to identify
        // the caller. It is not a secret and grants no privileged access.
        ...(apiTarget() === 'supabase' && anonKey ? { apikey: anonKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    // Distinguish our own timeout from a caller-initiated cancel. Without this,
    // an expired quote and a 30-second gateway stall both read as "the network
    // is down", which sends people to the wrong fix.
    if (abort.signal.aborted && !signal?.aborted) {
      throw new Error('The server took too long to answer. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('The server returned an unreadable response.');
  }

  if (!response.ok) {
    // The server's message is written for a customer, so prefer it over anything
    // generic. Fall back only when there is none.
    //
    // The fallback names no service, because this one function is used by every
    // endpoint in the app. It used to say "payments service" unconditionally, so
    // the AI panel reported a missing Gemini key as a payments outage and an
    // operator reading it would go looking in the wrong place.
    const error = new Error(payload.message || `The server could not complete that request (${response.status}).`);
    error.code = payload.code ?? null;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export { API_ROOT };
