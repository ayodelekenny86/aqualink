import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { applyCors, fail, json, readJson } from '../_lib/utils.ts';
import { signOpsToken, verifyOpsToken, bearerToken, constantTimeEquals } from '../_lib/session.ts';

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
  return constantTimeEquals(hash, expectedHash);
}

/**
 * How long an operator account stays locked after repeated failures.
 *
 * The operator console is the only way to change pricing or approve a seller,
 * and `scryptSync` makes guessing slow without making it impossible. Without a
 * counter there is no limit on attempts at all. The client-side registry has
 * always had one (`MAX_FAILED_ATTEMPTS` in src/lib/accounts.js); this is the
 * server-side equivalent, and it is the one that matters, because the client
 * can be bypassed.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

/**
 * How long a failed attempt is remembered when no counter is stored.
 *
 * Set for accounts created before the lockout columns existed.
 */
function isLocked(operator: any, now: number): boolean {
  return Boolean(operator?.locked_until) && new Date(operator.locked_until).getTime() > now;
}

function minutesRemaining(operator: any, now: number): number {
  const until = new Date(operator?.locked_until ?? 0).getTime();
  return Math.max(1, Math.ceil((until - now) / 60000));
}

async function recordFailure(db: ReturnType<typeof supabase>, operator: any, now: number) {
  const failedAttempts = Number(operator.failed_attempts ?? 0) + 1;
  const locked = failedAttempts >= MAX_FAILED_ATTEMPTS;

  // `failed_attempts` and `locked_until` arrive as null on rows written before
  // the migration, so the update is written as a coalesce rather than a plain
  // assignment. Overwriting them with a bare number would reset a real counter
  // on every attempt.
  await db
    .from('ops')
    .update({
      failed_attempts: failedAttempts,
      locked_until: locked ? new Date(now + LOCKOUT_MS).toISOString() : null,
    })
    .eq('id', operator.id);
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
      const now = Date.now();

      if (isLocked(operator, now)) {
        // Deliberately the same message shape as a bad password would give, but
        // a locked account is a different situation the operator needs told
        // about, so this one is specific. It discloses that the account exists,
        // which is acceptable: it is only reachable after five wrong passwords
        // against that exact address.
        return fail(429, 'account_locked', `Too many failed attempts. Try again in ${minutesRemaining(operator, now)} minute(s).`);
      }

      if (!verifyPassword(password, operator.salt, operator.password_hash)) {
        await recordFailure(db, operator, now);
        return invalid();
      }

      // Clear the counter on success so a legitimate operator who fumbled a few
      // times is not left one mistake away from a lockout.
      await db
        .from('ops')
        .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date(now).toISOString() })
        .eq('id', operator.id);

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
    if (!constantTimeEquals(presentedToken, expectedToken)) {
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
        // 23505 is a unique violation. The handler's own pre-check is a
        // check-then-act and two concurrent bootstraps can both pass it; the
        // partial unique index on `role` is what actually guarantees one
        // operator, so the loser of that race gets the 409 the endpoint means
        // rather than a 500 that reads like a server fault.
        if (error.code === '23505') {
          return fail(409, 'already_bootstrapped', 'An ops account already exists. This endpoint runs once only.');
        }
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