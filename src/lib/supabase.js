import { createClient } from '@supabase/supabase-js';

const projectRef = import.meta.env?.VITE_SUPABASE_PROJECT_REF;
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
const explicitUrl = import.meta.env?.VITE_SUPABASE_URL;

const supabaseUrl = explicitUrl || (projectRef ? `https://${projectRef}.supabase.co` : '');

let client = null;

if (supabaseUrl && anonKey) {
  client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storage: localStorage,
    },
  });
} else if (typeof window !== 'undefined') {
  console.warn(
    'Supabase is not configured. Set VITE_SUPABASE_PROJECT_REF and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_URL) in your environment.'
  );
}

export { client as supabase };
export { supabaseUrl, anonKey };
export default createClient;

/**
 * Whether a Supabase write was actually accepted.
 *
 * `supabase-js` resolves with `{ data, error }` and does **not** reject when
 * PostgREST refuses a statement — a failed row-level-security check, a missing
 * column, a constraint violation all come back as a resolved promise with `error`
 * set. Only a request that never reached the server rejects.
 *
 * That makes `try/catch` the wrong tool for deciding whether a write happened. It
 * catches network failures and nothing else, so a write the database rejected took
 * the success path: no local correction, and a notice telling the user it worked.
 * The worst instance was `confirmDelivery`, which reported a delivery confirmed and
 * left the order's status unchanged on the server.
 *
 * Every write that decides something the user is told about goes through here, so
 * the two cases cannot be confused again: a throw means the request never landed,
 * and a truthy `error` means the server answered no.
 *
 * @returns {{ ok: true } | { ok: false, error: { message?: string, code?: string } }}
 */
export function writeResult(result) {
  const error = result?.error;
  if (!error) return { ok: true };
  return { ok: false, error: { message: error.message || 'The database rejected that write.', code: error.code } };
}
