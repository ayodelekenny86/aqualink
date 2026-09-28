import { createClient } from 'https://esm.sh/@supabase/supabase-js@2/dist/esm/index.js';
import { priceOrder } from '../_lib/pricing.ts';
import { generateId, applyCors, fail, json, readJson } from '../_lib/utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function supabase(req: Request) {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

Deno.serve(async (req: Request) => {
  const init = applyCors(req);
  if (req.method === 'OPTIONS') return new Response('', init);

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop() ?? '';

  if (path === 'create') {
    if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

    const body = await readJson(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim();
    const location = String(body.location ?? '').trim();
    const volumeLitres = Number(body.volumeLitres ?? 0);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return fail(400, 'invalid_email', 'A valid email address is required for the receipt.');
    }
    if (!/^\+?233?\d{9,12}$/.test(phone.replace(/[\s-]/g, ''))) {
      return fail(400, 'invalid_phone', 'A valid Ghanaian phone number is required.');
    }
    if (location.length < 4) return fail(400, 'invalid_location', 'A delivery address or landmark is required.');
    if (!Number.isFinite(volumeLitres) || volumeLitres <= 0 || volumeLitres > 100000) {
      return fail(400, 'invalid_volume', 'Volume must be between 1 and 100000 litres.');
    }

    // Read pricing config from the database (same as pricing function).
    const db = supabase(req);
    const { data: config, error: configError } = await db
      .from('config')
      .select('pricing,split')
      .eq('key', 'pricing')
      .single();

    // Import pricing defaults — the server recomputes the price from its own
    // config, never trusting anything the client sent.
    const { DEFAULT_PRICING, DEFAULT_SPLIT } = await import('../_lib/pricing.ts');
    const pricing = configError ? DEFAULT_PRICING : { ...DEFAULT_PRICING, ...(config?.pricing ?? {}) };
    const split = configError ? DEFAULT_SPLIT : { ...DEFAULT_SPLIT, ...(config?.split ?? {}) };

    const priced = priceOrder({ pricing, split, volumeLitres });
    const orderId = generateId('AQ');

    const order = {
      id: orderId,
      code: orderId,
      email,
      phone,
      location,
      volume_litres: volumeLitres,
      currency: 'GHS',
      pricing: priced.pricing,
      split: priced.split,
      gross_minor: priced.grossMinor,
      charged_minor: priced.chargedMinor,
      buyer_pays: priced.buyerPays,
      buyer_service_charge: priced.buyerServiceCharge,
      seller_receives: priced.sellerReceives,
      driver_receives: priced.driverReceives,
      platform_commission: priced.platformCommission,
      company_take: priced.companyTake,
      discount_minor: priced.discountMinor,
      surge_minor: priced.surgeMinor,
      status: 'Awaiting payment',
      paystack_reference: null,
      created_at: new Date().toISOString(),
    };

    const { error } = await db.from('orders').insert(order).select().single();
    if (error) {
      console.error('order insert failed', error);
      return fail(500, 'order_failed', 'Could not create the order.');
    }

    return json({ order: { ...order } }, 201);
  }

  if (path === 'verify') {
    if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.');

    const reference = String(url.searchParams.get('reference') ?? '').trim();
    if (!reference) return fail(400, 'invalid_reference', 'A payment reference is required.');

    const secret = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
    if (!secret) return fail(503, 'payments_unconfigured', 'Payments are not configured.');

    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const paystack = await paystackRes.json();
    if (!paystackRes.ok || !paystack.status) {
      return fail(502, 'provider_rejected', paystack.message ?? 'Payment provider could not be reached.');
    }

    const transaction = paystack.data ?? {};
    const db = supabase(req);
    const { data: orders, error: orderError } = await db
      .from('orders')
      .select('*')
      .eq('paystack_reference', reference)
      .limit(1)
      .maybeSingle();

    if (orderError || !orders) {
      return json({ status: 'unknown', settled: false, reason: 'no_matching_order' });
    }

    const { checkSettlement } = await import('../_lib/session.ts');
    const verdict = checkSettlement({
      transaction: {
        status: transaction.status ?? 'success',
        reference,
        amount: transaction.amount,
        currency: transaction.currency,
        paid_at: transaction.paid_at,
      },
      order: orders,
      currency: orders.currency ?? 'GHS',
    });

    if (verdict.settled && orders.status !== 'Paid') {
      await db.from('orders').update({
        status: 'Paid',
        paid_at: transaction.paid_at ?? new Date().toISOString(),
        paystack_channel: transaction.channel ?? null,
      }).eq('id', orders.id);

      return json({
        settled: true,
        status: 'settled',
        reason: verdict.reason,
        reference,
        orderId: orders.id,
        amountMinor: orders.charged_minor,
        currency: orders.currency ?? 'GHS',
        breakdown: {
          grossMinor: orders.gross_minor,
          buyerPays: orders.charged_minor,
          buyerServiceCharge: orders.buyer_service_charge,
          sellerReceives: orders.seller_receives,
          driverReceives: orders.driver_receives,
          platformCommission: orders.platform_commission,
        },
      });
    }

    return json({
      settled: verdict.settled && orders.status === 'Paid',
      status: verdict.settled ? 'settled' : 'pending',
      reason: verdict.reason,
      reference,
      orderId: orders.id,
      amountMinor: orders.charged_minor,
      currency: orders.currency ?? 'GHS',
      breakdown: {
        grossMinor: orders.gross_minor,
        buyerPays: orders.charged_minor,
        buyerServiceCharge: orders.buyer_service_charge,
        sellerReceives: orders.seller_receives,
        driverReceives: orders.driver_receives,
        platformCommission: orders.platform_commission,
      },
    });
  }

  return fail(404, 'not_found', 'No such orders endpoint.');
});
