import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DEFAULT_PRICING, DEFAULT_SPLIT, priceOrder } from '../_lib/pricing.ts';
import { checkSettlement } from '../_lib/session.ts';
import { generateId, applyCors, fail, json, readJson, isPlausibleReference } from '../_lib/utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';

function supabase() {
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
    const db = supabase();
    const { data: config, error: configError } = await db
      .from('config')
      .select('pricing,split')
      .eq('key', 'pricing')
      .single();

    // The server recomputes the price from its own config, never trusting
    // anything the client sent.
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
      // Interpolated into the query below, so it is shape-checked first.
      if (!isPlausibleReference(reference)) {
        return fail(400, 'invalid_reference', 'That payment reference is not valid.');
      }

      if (!PAYSTACK_SECRET_KEY) return fail(503, 'payments_unconfigured', 'Payments are not configured.');

      const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      });
      const paystack = await paystackRes.json();
      if (!paystackRes.ok || !paystack.status) {
        return fail(502, 'provider_rejected', paystack.message ?? 'Payment provider could not be reached.');
      }

      const transaction = paystack.data ?? {};
    const db = supabase();
    const { data: orders, error: orderError } = await db
      .from('orders')
      .select('*')
      .eq('paystack_reference', reference)
      .limit(1)
      .maybeSingle();

    if (orderError || !orders) {
      return json({ status: 'unknown', settled: false, reason: 'no_matching_order' });
    }

    const verdict = checkSettlement({
      transaction: {
        // Not `?? 'success'`: a Paystack record with no status field is an
        // absent answer, and reading it as a successful charge marks an unpaid
        // order paid. The provider's status is the only authority here.
        status: transaction.status,
        // The reference Paystack returned, not the one from the query string.
        // Passing the caller's value made the reference check agree with itself
        // and prove nothing about which order the charge belonged to.
        reference: transaction.reference,
        amount: transaction.amount,
        currency: transaction.currency,
        paid_at: transaction.paid_at,
      },
      order: orders,
      currency: orders.currency ?? 'GHS',
    });

    if (verdict.settled && orders.status !== 'Paid') {
      const { error: writeError } = await db.from('orders').update({
        status: 'Paid',
        paid_at: transaction.paid_at ?? new Date().toISOString(),
        paystack_channel: transaction.channel ?? null,
      }).eq('id', orders.id);

      // The write result was discarded, so a failed update still answered
      // `settled: true`. The customer got a receipt for a payment the order
      // record did not reflect, and revenue reports reading the orders table
      // disagreed with every receipt the app had issued.
      if (writeError) {
        console.error('order mark-paid failed', writeError);
        return fail(500, 'settlement_record_failed', 'The payment arrived but could not be recorded. Support has been notified.');
      }

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

    // An order already recorded as `Paid` is settled on the strength of that
    // durable row. Requiring this call to re-derive it meant a repeat
    // verification of a paid order answered `settled: false`.
    const settledNow = orders.status === 'Paid' || verdict.settled;

    return json({
      settled: settledNow,
      status: settledNow ? 'settled' : 'pending',
      reason: orders.status === 'Paid' ? 'already_paid' : verdict.reason,
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
