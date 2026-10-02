/**
 * Push notification token management for Supabase Edge Functions.
 *
 * The client calls `POST /fcmToken` to register a token and
 * `POST /fcmTokenDelete` to revoke one. The server stores them in the
 * `fcm_tokens` table, which the migration creates with row-level security so
 * only the owning user can read or write their own tokens.
 *
 * This function does not itself talk to a push provider. It is the registry
 * that a future push channel would read from; until one is wired up, tokens
 * are stored and the app keeps working, with notifications arriving through
 * whatever channel the operator configures.
 */

import { createSupabase, applyCors, fail, json, readJson } from '../_lib/utils.ts';

Deno.serve(async (req: Request) => {
  const init = applyCors(req);
  if (req.method === 'OPTIONS') return new Response('', init);

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop() ?? '';
    const db = createSupabase(req);
    if (!db) return fail(503, 'database_unconfigured', 'Supabase is not configured.');

    if (path === 'fcmToken') {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

      const body = await readJson(req);
      const userId = String(body.userId ?? '').trim();
      const token = String(body.token ?? '').trim();
      const platform = String(body.platform ?? 'web').trim() || 'web';

      if (!userId || !token) {
        return fail(400, 'missing_fields', 'userId and token are required.');
      }
      if (token.length > 4096 || userId.length > 256) {
        return fail(400, 'invalid_fields', 'That token or user id is not usable.');
      }

      // The id is deliberately not supplied. `fcm_tokens.id` is a `uuid` column
      // with a `uuid_generate_v4()` default, and this function used to write a
      // 32-character sha256 hex string into it. Postgres rejected that as an
      // invalid uuid on every single call, so no push token was ever stored —
      // the endpoint answered `{ success: true }` only because the error was
      // checked, but nothing was written. Conflicting on the natural key lets
      // the default generate the uuid while still de-duplicating by token.
      const { error } = await db.from('fcm_tokens').upsert(
        {
          user_id: userId,
          token,
          platform,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' },
      );

      if (error) {
        console.error('fcm token store failed', error);
        return fail(500, 'token_failed', 'Could not store the push token.');
      }

      return json({ success: true });
    }

    if (path === 'fcmTokenDelete') {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

      const body = await readJson(req);
      const token = String(body.token ?? '').trim();
      const userId = String(body.userId ?? '').trim();
      if (!token) return fail(400, 'missing_token', 'A token is required.');
      if (token.length > 4096) return fail(400, 'invalid_token', 'That token is not usable.');

      // Matched on the token itself, not on a derived id. The id is a generated
      // uuid, so a hash of the token never equals it and this update matched no
      // rows: revoking a token silently did nothing and the user kept receiving
      // notifications they had asked to stop.
      //
      // When the caller identifies itself, the row must belong to it. Without
      // that, anyone who learned a token string could revoke it — and, more
      // usefully for an attacker, could not use it to learn anything, so this
      // is a narrowing rather than a full authorisation boundary. AquaLink's
      // buyer accounts are local to the browser, so there is no server-side
      // session to check against yet; `userId` is a caller assertion until then.
      let query = db.from('fcm_tokens').update({
        active: false,
        updated_at: new Date().toISOString(),
      }).eq('token', token);
      if (userId) query = query.eq('user_id', userId);

      const { error } = await query;

      if (error) {
        console.error('fcm token delete failed', error);
        return fail(500, 'token_failed', 'Could not remove the push token.');
      }

      return json({ success: true });
    }

    return fail(404, 'not_found', 'No such fcm endpoint.');
  } catch (error) {
    console.error('fcm function error', error);
    return fail(500, 'internal_error', 'Something went wrong.');
  }
});