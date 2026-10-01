import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHash } from 'node:crypto';
import { applyCors, fail, json, readJson } from '../_lib/utils.ts';
import { bearerToken, verifyOpsToken } from '../_lib/session.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPS_SESSION_SECRET = Deno.env.get('OPS_SESSION_SECRET') ?? '';

function supabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalisePhone(value: string): string {
  return String(value ?? '').replace(/[\s-]/g, '');
}

function sellerIdFromPhone(phone: string): string {
  return createHash('sha256').update(normalisePhone(phone)).digest('hex').slice(0, 24);
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

    // POST /sellers/apply - submit seller application
    if (path === 'apply') {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

      const body = await readJson(req);
      const phone = normalisePhone(String(body.phone ?? ''));
      const business = String(body.business ?? '').trim();
      const vehicle = String(body.vehicle ?? '').trim();
      const capacity = String(body.capacity ?? '').trim();

      if (!/^\+?233?\d{9,12}$/.test(phone)) {
        return fail(400, 'invalid_phone', 'A valid Ghanaian phone number is required.');
      }
      if (business.length < 2) return fail(400, 'invalid_business', 'A business or trading name is required.');
      if (vehicle.length < 3) return fail(400, 'invalid_vehicle', 'A vehicle registration is required.');

      const id = sellerIdFromPhone(phone);
      const db = supabase();

      const { data: existing } = await db.from('sellers').select('*').eq('id', id).single();

      if (existing && existing.status === 'approved') {
        return json({ applicationId: id, status: 'approved' });
      }

      const appliedAt = existing?.applied_at ?? new Date().toISOString();

      const { error } = await db.from('sellers').upsert({
        id,
        phone,
        business,
        vehicle,
        capacity,
        status: existing?.status ?? 'pending',
        applied_at: appliedAt,
        reviewed_at: existing?.reviewed_at ?? null,
        reviewed_by: existing?.reviewed_by ?? null,
        review_note: existing?.review_note ?? null,
      });

      if (error) {
        console.error('seller application failed', error);
        return fail(500, 'apply_failed', 'Could not submit the application.');
      }

      return json({ applicationId: id, status: existing?.status ?? 'pending' }, existing ? 200 : 201);
    }

    // GET /sellers/applications?status=pending - list applications (operator only)
    if (path === 'applications') {
      if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.');

      const { operator, error: authError } = requireOps(req);
      if (authError) return authError;

      const requested = String(url.searchParams.get('status') ?? 'pending');
      const status = ['pending', 'approved', 'rejected'].includes(requested) ? requested : 'pending';

      const db = supabase();
      const { data: applications, error } = await db
        .from('sellers')
        .select('*')
        .eq('status', status)
        .order('applied_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('seller applications list failed', error);
        return fail(500, 'list_failed', 'Could not load the review queue.');
      }

      const formatted = (applications ?? []).map((app) => ({
        applicationId: app.id,
        business: app.business ?? '',
        phone: app.phone ?? '',
        vehicle: app.vehicle ?? '',
        capacity: app.capacity ?? '',
        status: app.status,
        appliedAt: app.applied_at ?? null,
        reviewedAt: app.reviewed_at ?? null,
        reviewedBy: app.reviewed_by ?? null,
        reviewNote: app.review_note ?? null,
      }));

      return json({ applications: formatted, status, count: formatted.length });
    }

    // POST /sellers/review - approve/reject application (operator only)
    if (path === 'review') {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

      const { operator, error: authError } = requireOps(req);
      if (authError) return authError;

      const body = await readJson(req);
      const id = String(body.applicationId ?? '').trim();
      const decision = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : null;

      if (!id) return fail(400, 'invalid_application', 'An application id is required.');
      if (!decision) return fail(400, 'invalid_decision', 'Decision must be approve or reject.');

      const db = supabase();
      const { data: existing, error: fetchError } = await db
        .from('sellers')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !existing) return fail(404, 'application_not_found', 'That application does not exist.');

      if (existing.status !== 'pending') {
        return fail(409, 'already_reviewed', `That application was already ${existing.status}.`);
      }

      const { error: updateError } = await db.from('sellers').update({
        status: decision,
        review_note: String(body.note ?? '').slice(0, 280),
        reviewed_at: new Date().toISOString(),
        reviewed_by: operator.sub,
      }).eq('id', id);

      if (updateError) {
        console.error('seller review failed', updateError);
        return fail(500, 'review_failed', 'Could not record the decision.');
      }

      console.info('seller application reviewed', { id, decision, by: operator.sub });
      return json({ applicationId: id, status: decision });
    }

    // GET /sellers/status?phone=xxx - check application status
    if (path === 'status') {
      if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.');

      const phone = normalisePhone(String(url.searchParams.get('phone') ?? ''));
      if (!/^\+?233?\d{9,12}$/.test(phone)) {
        return fail(400, 'invalid_phone', 'A valid Ghanaian phone number is required.');
      }

      const id = sellerIdFromPhone(phone);
      const db = supabase();
      const { data: application, error } = await db
        .from('sellers')
        .select('status')
        .eq('id', id)
        .single();

      const status = error || !application ? 'pending' : application.status;
      return json({ status });
    }

    return fail(404, 'not_found', 'No such sellers endpoint.');
  } catch (error) {
    console.error('sellers function error', error);
    return fail(500, 'internal_error', 'Something went wrong.');
  }
});