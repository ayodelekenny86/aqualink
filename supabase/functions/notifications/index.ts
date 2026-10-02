import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyCors, fail, json, readJson } from '../_lib/utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function supabase(req: Request) {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

Deno.serve(async (req: Request) => {
  const init = applyCors(req);
  if (req.method === 'OPTIONS') return new Response('', init);

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop() ?? '';

  if (path === 'list') {
    if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.');

    const role = url.searchParams.get('role') ?? '';
    const db = supabase(req);

    let query = db.from('notifications').select('*').order('created_at', { ascending: false });
    if (role) query = query.eq('role', role);

    const { data, error } = await query;
    if (error) return fail(500, 'query_failed', error.message);

    return json({ notifications: data ?? [] });
  }

  if (path === 'read') {
    if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

    const body = await readJson(req);
    const role = String(body.role ?? '');
    const db = supabase(req);

    const { error } = await db
      .from('notifications')
      .update({ read: true })
      .eq('read', false)
      .eq('role', role);

    if (error) return fail(500, 'update_failed', error.message);
    return json({ ok: true });
  }

  return fail(404, 'not_found', 'No such notifications endpoint.');
});
