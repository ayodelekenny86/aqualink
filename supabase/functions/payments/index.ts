import { createClient } from 'https://esm.sh/@supabase/supabase-js@2/dist/esm/index.js';
import { checkSettlement, verifyPaystackSignature } from '../_lib/session.ts';
import { applyCors, fail, json } from '../_lib/utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';

function supabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function paystackRequest(path: string, init: RequestInit = {}) {
  const secret = PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');

  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Paystack returned a non-JSON response (${response.status}).`);
  }
  return { ok: response.ok, status: response.status, body };
}

Deno.serve(async (req: Request) => {
  const init = applyCors(req);

  if (req.method === 'OPTIONS') return new Response('', init);

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop() ?? '';

    // POST /payments/initialize - create a Paystack transaction
    if (path === 'initialize') {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

      const secret = PAYSTACK_SECRET_KEY;
      if (!secret) return fail(503, 'payments_unconfigured', 'Payments are not configured.');

      const body = await req.json();
      const orderId = String(body.orderId ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();

      if (!orderId) return fail(400, 'invalid_order', 'An order id is required.');

      const db = supabase();
      const { data: order, error } = await db
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (error || !order) return fail(404, 'order_not_found', 'That order does not exist.');

      if (String(order.email).toLowerCase() !== email) {
        return fail(403, 'order_email_mismatch', 'This order belongs to a different account.');
      }
      if (order.status === 'Paid') {
        return json({ reference: order.paystack_reference, status: 'settled', alreadyPaid: true });
      }

      const paystackReference = `aq-${orderId.toLowerCase().replace(/[^a-z0-9]/g, '')}-${crypto.randomUUID().slice(0, 8)}`;

      const callbackUrl = Deno.env.get('APP_ORIGIN')
        ? `${Deno.env.get('APP_ORIGIN').replace(/\/$/, '')}/#/payment/return`
        : undefined;

      const { ok, body: paystack } = await paystackRequest('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email: order.email,
          amount: order.charged_minor,
          currency: order.currency ?? 'GHS',
          reference: paystackReference,
          callback_url: callbackUrl,
          metadata: { order_id: orderId, volume_litres: order.volume_litres },
        }),
      });

      if (!ok || !paystack?.status) {
        return fail(502, 'provider_rejected', paystack?.message ?? 'The payment provider rejected this request.');
      }

      await db.from('orders').update({
        paystack_reference: paystackReference,
        paystack_access_code: paystack.data?.access_code ?? null,
        status: 'Awaiting payment',
      }).eq('id', orderId);

      return json({
        reference: paystackReference,
        authorizationUrl: paystack.data?.authorization_url,
        amountMinor: order.charged_minor,
        currency: order.currency ?? 'GHS',
        status: 'pending',
      });
    }

    // GET /payments/verify?reference=xxx - verify a payment
    if (path === 'verify') {
      if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.');

      const secret = PAYSTACK_SECRET_KEY;
      if (!secret) return fail(503, 'payments_unconfigured', 'Payments are not configured.');

      const reference = String(url.searchParams.get('reference') ?? '').trim();
      if (!reference) return fail(400, 'invalid_reference', 'A payment reference is required.');

      const { ok, body: paystack } = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
      if (!ok || !paystack?.status) {
        return fail(502, 'provider_rejected', paystack?.message ?? 'The payment provider could not be reached.');
      }
      const transaction = paystack.data ?? {};

      const db = supabase();
      const { data: order, error: orderError } = await db
        .from('orders')
        .select('*')
        .eq('paystack_reference', reference)
        .single();

      if (orderError || !order) {
        return json({ status: 'unknown', settled: false, reason: 'no_matching_order' });
      }

      const verdict = checkSettlement({
        transaction: {
          status: transaction.status ?? 'success',
          reference,
          amount: transaction.amount,
          currency: transaction.currency,
          paid_at: transaction.paid_at,
        },
        order,
        currency: order.currency ?? 'GHS',
      });

      if (verdict.settled && order.status !== 'Paid') {
        await db.from('orders').update({
          status: 'Paid',
          paid_at: transaction.paid_at ?? new Date().toISOString(),
          paystack_channel: transaction.channel ?? null,
        }).eq('id', order.id);

        return json({
          settled: true,
          status: 'settled',
          reason: verdict.reason,
          reference,
          orderId: order.id,
          amountMinor: order.charged_minor,
          currency: order.currency ?? 'GHS',
          breakdown: {
            grossMinor: order.gross_minor,
            buyerPays: order.charged_minor,
            buyerServiceCharge: order.buyer_service_charge,
            sellerReceives: order.seller_receives,
            driverReceives: order.driver_receives,
            platformCommission: order.platform_commission,
          },
        });
      }

      return json({
        settled: verdict.settled && order.status === 'Paid',
        status: verdict.settled ? 'settled' : 'pending',
        reason: verdict.reason,
        reference,
        orderId: order.id,
        amountMinor: order.charged_minor,
        currency: order.currency ?? 'GHS',
        breakdown: {
          grossMinor: order.gross_minor,
          buyerPays: order.charged_minor,
          buyerServiceCharge: order.buyer_service_charge,
          sellerReceives: order.seller_receives,
          driverReceives: order.driver_receives,
          platformCommission: order.platform_commission,
        },
      });
    }

    // POST /payments/webhook - Paystack webhook endpoint
    if (path === 'webhook') {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

      const secret = PAYSTACK_SECRET_KEY;
      if (!secret) {
        console.error('PAYSTACK_SECRET_KEY is not set; refusing to process webhook.');
        return fail(503, 'payments_unconfigured', 'Payments are not configured.');
      }

      const signature = req.headers.get('x-paystack-signature');
      const rawBody = await req.arrayBuffer();

      if (!verifyPaystackSignature(new TextDecoder().decode(rawBody), signature, secret)) {
        console.warn('rejected webhook with an invalid signature');
        return fail(401, 'invalid_signature', 'Invalid signature.');
      }

      let event;
      try {
        event = JSON.parse(new TextDecoder().decode(rawBody));
      } catch {
        return fail(400, 'invalid_body', 'Malformed webhook body.');
      }

      const reference = event?.data?.reference;
      if (!reference) return json({ received: true, ignored: 'no_reference' });

      try {
        if (event.event === 'charge.success') {
          const db = supabase();
          const { data: order, error: orderError } = await db
            .from('orders')
            .select('*')
            .eq('paystack_reference', reference)
            .single();

          if (orderError || !order) {
            return json({ received: true, ignored: 'order_not_found' });
          }

          const verdict = checkSettlement({
            transaction: {
              status: event.data.status ?? 'success',
              reference,
              amount: event.data.amount,
              currency: event.data.currency,
              paid_at: event.data.paid_at,
            },
            order,
            currency: order.currency ?? 'GHS',
          });

          if (verdict.settled && order.status !== 'Paid') {
            await db.from('orders').update({
              status: 'Paid',
              paid_at: event.data.paid_at ?? null,
              paystack_channel: event.data.channel ?? null,
            }).eq('id', order.id);

            console.info('order marked paid from webhook', { orderId: order.id, reference });
          } else {
            console.warn('webhook did not settle the order', { orderId: order.id, reason: verdict.reason });
          }
        }

        return json({ received: true });
      } catch (error) {
        console.error('webhook handling failed', error);
        return fail(500, 'webhook_failed', 'Webhook processing failed.');
      }
    }

    return fail(404, 'not_found', 'No such payments endpoint.');
  } catch (error) {
    console.error('payments function error', error);
    return fail(500, 'internal_error', 'Something went wrong.');
  }
});