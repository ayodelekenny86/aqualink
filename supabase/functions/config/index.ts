import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DEFAULT_PRICING, DEFAULT_SPLIT, validateSplit } from '../_lib/pricing.ts';
import { validatePricingInput, bearerToken, verifyOpsToken } from '../_lib/session.ts';
import { applyCors, fail, json, readJson } from '../_lib/utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPS_SESSION_SECRET = Deno.env.get('OPS_SESSION_SECRET') ?? '';

function supabase(req: Request) {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

function requireOps(req: Request) {
  if (!OPS_SESSION_SECRET) {
    return { operator: null, error: fail(503, 'auth_unconfigured', 'Operations access is not configured.') };
  }
  const result = verifyOpsToken(bearerToken(req), OPS_SESSION_SECRET, { requiredRole: 'ops' });
  if (!result.valid) {
    return { operator: null, error: fail(401, 'not_authorised', 'Sign in as an operator to do that.') };
  }
  return { operator: { sub: result.payload!.sub, role: result.payload!.role }, error: null };
}

Deno.serve(async (req: Request) => {
  const init = applyCors(req);

  if (req.method === 'OPTIONS') return new Response('', init);

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop() ?? '';

    if (path === 'get') {
      // GET /config/get - public read of pricing config
      if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.');

      const db = supabase(req);
      const { data: config, error } = await db
        .from('config')
        .select('pricing,split')
        .eq('key', 'pricing')
        .single();

      if (error) {
        return json({ pricing: DEFAULT_PRICING, split: DEFAULT_SPLIT });
      }

      const pricing = { ...DEFAULT_PRICING, ...(config.pricing ?? {}) };
      const split = { ...DEFAULT_SPLIT, ...(config.split ?? {}) };

      return json({ pricing, split });
    }

    if (path === 'update') {
      // POST /config/update - operator-only pricing update
      if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

      const { operator, error: authError } = requireOps(req);
      if (authError) return authError;

      const body = await readJson(req);
      const { pricing, split } = body;

      const db = supabase(req);
      const { data: current } = await db
        .from('config')
        .select('pricing,split')
        .eq('key', 'pricing')
        .single();

      const mergedPricing = { ...(current?.pricing ?? DEFAULT_PRICING), ...(pricing ?? {}) };
      const mergedSplit = split ? { ...(current?.split ?? DEFAULT_SPLIT), ...split } : (current?.split ?? DEFAULT_SPLIT);

      const check = validatePricingInput(mergedPricing, mergedSplit);
      if (!check.valid) return fail(400, 'invalid_pricing', check.problems.join(' '));

      validateSplit(mergedSplit);

      const { error: writeError } = await db.from('config').update({
        pricing: {
          listPrice: Number(mergedPricing.listPrice),
          discountPercent: Number(mergedPricing.discountPercent),
          surgePercent: Number(mergedPricing.surgePercent),
          surgeReason: String(mergedPricing.surgeReason ?? '').slice(0, 140),
        },
        split: Object.fromEntries(Object.entries(mergedSplit).map(([k, v]) => [k, Number(v)])),
        updated_at: new Date().toISOString(),
        updated_by: operator.sub,
      }).eq('key', 'pricing');

      // A discarded write result means a failed save answers 200 with the
      // requested figures, so the operator sees a price that is not in effect.
      if (writeError) {
        console.error('config update failed', writeError);
        return fail(500, 'update_failed', 'Could not save the new configuration.');
      }

      return json({ pricing: mergedPricing, split: mergedSplit, updatedBy: operator.sub });
    }

    return fail(404, 'not_found', 'No such config endpoint.');
  } catch (error) {
    console.error('config function error', error);
    return fail(500, 'internal_error', 'Something went wrong.');
  }
});