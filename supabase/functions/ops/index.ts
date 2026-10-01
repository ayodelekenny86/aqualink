import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { applyCors, fail, json, readJson } from '../_lib/utils.ts';
import { signOpsToken, verifyOpsToken, bearerToken } from '../_lib/session.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPS_SESSION_SECRET = Deno.env.get('OPS_SESSION_SECRET') ?? '';
const OPS_BOOTSTRAP_TOKEN = Deno.env.get('OPS_BOOTSTRAP_TOKEN') ?? '';
const OPS_ADMIN_EMAIL = (Deno.env.get('OPS_ADMIN_EMAIL') ?? '').trim().toLowerCase();
const OPS_ADMIN_PASSWORD = Deno.env.get('OPS_ADMIN_PASSWORD') ?? '';

function supabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

Deno.serve(async (req: Request) => {
  const init = applyCors(req);
  if (req.method === 'OPTIONS') return new Response('', init);

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop() ?? '';

  if (path === 'login') {
    if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

    const secret = OPS_SESSION_SECRET;
    if (!secret) {
      return fail(503, 'auth_unconfigured', 'Operations sign-in is not configured on this deployment.');
    }

    try {
      const body = await readJson(req);
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');

      if (!email || !password) {
        return fail(400, 'missing_credentials', 'An email address and password are required.');
      }

      const db = supabase();
      const { data: operators, error } = await db
        .from('ops')
        .select('*')
        .eq('email', email)
        .eq('role', 'ops')
        .limit(1);

      const invalid = () => fail(401, 'invalid_credentials', 'Those sign-in details are not correct.');

      if (error || !operators || operators.length === 0) {
        // Constant-time-ish: still spend time hashing so a missing account and a
        // wrong password take about the same wall-clock time.
        hashPassword(password);
        return invalid();
      }

      const operator = operators[0];
      if (!verifyPassword(password, operator.salt, operator.password_hash)) return invalid();

      await db.from('ops').update({ last_login_at: new Date().toISOString() }).eq('id', operator.id);

      return json({
        token: signOpsToken({ email, role: 'ops', secret }),
        email,
        expiresInSeconds: 60 * 60 * 8,
      });
    } catch (error) {
      console.error('ops login failed', error);
      return fail(500, 'login_failed', 'Could not sign in.');
    }
  }

  if (path === 'bootstrap') {
    if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

    const expectedToken = OPS_BOOTSTRAP_TOKEN;
    const presentedToken = req.headers.get('x-ops-token') ?? '';
    if (!expectedToken) {
      return fail(503, 'bootstrap_unconfigured', 'Set OPS_BOOTSTRAP_TOKEN before bootstrapping.');
    }
    if (!presentedToken) {
      return fail(401, 'unauthorised', 'A valid bootstrap token is required.');
    }
    const a = Buffer.from(presentedToken, 'utf8');
    const b = Buffer.from(expectedToken, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return fail(401, 'unauthorised', 'A valid bootstrap token is required.');
    }

    const email = OPS_ADMIN_EMAIL;
    const password = OPS_ADMIN_PASSWORD;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return fail(400, 'invalid_email', 'Set OPS_ADMIN_EMAIL to a valid address.');
    }
    if (password.length < 12) {
      return fail(400, 'weak_password', 'Set OPS_ADMIN_PASSWORD to at least 12 characters.');
    }

    try {
      const db = supabase();
      const { data: existing } = await db
        .from('ops')
        .select('id')
        .eq('role', 'ops')
        .limit(1);

      if (existing && existing.length > 0) {
        return fail(409, 'already_bootstrapped', 'An ops account already exists. This endpoint runs once only.');
      }

      const { salt, hash } = hashPassword(password);
      const id = createHash('sha256').update(email).digest('hex').slice(0, 24);
      const { error } = await db.from('ops').insert({
        id,
        email,
        role: 'ops',
        salt,
        password_hash: hash,
        bootstrapped: true,
      });

      if (error) {
        console.error('ops bootstrap insert failed', error);
        return fail(500, 'bootstrap_failed', 'Could not create the ops account.');
      }

      return json({ created: true, email }, 201);
    } catch (error) {
      console.error('ops bootstrap failed', error);
      return fail(500, 'bootstrap_failed', 'Could not create the ops account.');
    }
  }

  return fail(404, 'not_found', 'No such ops endpoint.');
});