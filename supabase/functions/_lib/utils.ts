import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const CURRENCY = 'GHS';
export const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

/**
 * The CORS headers for the request currently being handled.
 *
 * `applyCors` is called once at the top of every handler, but the responses are
 * built later by `json`/`fail`, which are called from deep inside route code and
 * have no access to the original `Request`. This carries those headers across
 * that gap.
 *
 * It is request-scoped rather than a plain module variable on purpose: a Deno
 * isolate serves concurrent requests, so one handler setting a global while
 * another reads it would leak one customer's `Access-Control-Allow-Origin` into
 * a response meant for someone else.
 */
const corsHeaders = new AsyncLocalStorage<Record<string, string>>();

export function createSupabase(req: Request) {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !key) return null;

  // Only forward the caller's Authorization header when there is one. Sending an
  // explicit empty string instead overwrote the client's own credential with
  // nothing, and a service-role client that has been stripped of its key then
  // silently runs as an anonymous caller: RLS applies, and writes match no rows
  // rather than erroring, so the caller is told the token was stored.
  const authorization = req.headers.get('Authorization') ?? '';
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
  });
}

export function applyCors(req: Request, init: ResponseInit = {}): ResponseInit {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    // `apikey` is required here, not optional. The client sends the Supabase
    // anon key on every call (`src/lib/api.js`), and the gateway needs it. A
    // preflight that does not allow the header is rejected by the browser, so
    // omitting it did not degrade one call, it broke every cross-origin request
    // from the deployed app.
    'Access-Control-Allow-Headers': 'Content-Type, X-Ops-Token, Authorization, apikey',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  init.headers = headers;
  corsHeaders.enterWith(headers);
  return init;
}

export function json(data: unknown, status = 200, init: ResponseInit = {}): Response {
  // The stored headers come from the `applyCors` call at the top of the handler.
  // The previous version rebuilt them from a fabricated `new Request('')`, which
  // throws in Deno and had no `origin` header, so every response this module
  // produced was a thrown error rather than a body.
  const headers = {
    ...(corsHeaders.getStore() ?? {}),
    ...(init.headers as Record<string, string> ?? {}),
  };
  return new Response(JSON.stringify(data), { headers, status });
}

export function fail(status: number, code: string, message: string): Response {
  // `error` is the field the rest of the codebase and the client both read, and
  // `code` is emitted as well so `apiRequest` — which reads `payload.code` — can
  // see it. Sending only `error` meant every thrown error arrived with
  // `code: null`, so no caller could branch on *why* a request failed.
  return json({ error: code, code, message }, status);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const raw = await req.text();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

/**
 * An order id.
 *
 * `crypto.getRandomValues`, not `Math.random`. An order id is the first thing an
 * attacker needs: `/payments/initialize` only checks that the caller's email
 * matches the order, so a guessable id plus a known address reaches the charge.
 * `Math.random` is seeded from the clock and its output is recoverable from a
 * handful of observed values, which makes that a real attack rather than a
 * theoretical one.
 */
export function generateId(prefix = 'AQ'): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${hex.toUpperCase()}`;
}

/**
 * Rejects a value that is not shaped like a reference we issued.
 *
 * The reference is interpolated into a PostgREST `.or()` filter, so a comma or a
 * parenthesis in it would change what the query selects. An allowlist is the only
 * thing that prevents that, and it has to match what `newReference` actually
 * produces: `aq` plus the sanitised order code, then the random suffix.
 *
 * The order-code segment is `[a-z0-9]*` rather than `[a-z0-9]+` because
 * `newReference` falls back to the bare word `aq` when a code sanitises to
 * nothing, yielding a reference of exactly `aq-<suffix>`. A `+` there would
 * reject those and every such payment would fail to verify.
 *
 * Anchored at both ends, and the only characters permitted are lowercase
 * alphanumerics and the single internal hyphen. That excludes the filter
 * metacharacters (`,` `.` `(` `)` `*` `:`) rather than trying to strip them.
 */
export function isPlausibleReference(value: string): boolean {
  return /^aq[a-z0-9]{0,64}-[0-9a-f]{16,64}$/.test(String(value ?? ''));
}
