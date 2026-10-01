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

import { createHash } from 'node:crypto';
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

      const id = createHash('sha256').update(token).digest('hex').slice(0, 32);
      const { error } = await db.from('fcm_tokens').upsert({
        id,
        user_id: userId,
        token,
        platform,
        active: true,
        updated_at: new Date().toISOString(),
      });

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
      if (!token) return fail(400, 'missing_token', 'A token is required.');

      const id = createHash('sha256').update(token).digest('hex').slice(0, 32);
      const { error } = await db.from('fcm_tokens').update({
        active: false,
        updated_at: new Date().toISOString(),
      }).eq('id', id);

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