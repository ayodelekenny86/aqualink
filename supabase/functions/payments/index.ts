import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  checkSettlement,
  newReference,
  verifyPaystackSignature,
  verifyFlutterwaveSignature,
  checkFlutterwaveSettlement,
} from '../_lib/session.ts';
import { applyCors, fail, json, isPlausibleReference } from '../_lib/utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
const FLUTTERWAVE_SECRET_KEY = Deno.env.get('FLUTTERWAVE_SECRET_KEY') ?? '';

function supabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Which provider answers a request. Both are supported at once — a buyer
 * chooses at checkout and the server talks to whichever they picked — but
 * each needs its own secret, and an unset one is a loud 503 rather than a
 * silent fallback to the other.
 */
type Provider = 'paystack' | 'flutterwave';

function providerFrom(body: any): Provider {
  const provider = String(body?.provider ?? 'paystack').toLowerCase();
  if (provider === 'flutterwave') return 'flutterwave';
  return 'paystack';
}

async function flutterwaveRequest(path: string, init: RequestInit = {}) {
  const secret = FLUTTERWAVE_SECRET_KEY;
  if (!secret) throw new Error('FLUTTERWAVE_SECRET_KEY is not set');

  const response = await fetch(`https://api.flutterwave.com/v3${path}`, {
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
    throw new Error(`Flutterwave returned a non-JSON response (${response.status}).`);
  }
  return { ok: response.ok, status: response.status, body };
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

    // POST /payments/initialize - create a payment transaction
    if (path === 'initialize') {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

      const body = await req.json().catch(() => ({}));
      const provider = providerFrom(body);
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
        return json({ reference: order.paystack_reference ?? order.flutterwave_reference, status: 'settled', alreadyPaid: true });
      }

      const callbackUrl = Deno.env.get('APP_ORIGIN')
        ? `${Deno.env.get('APP_ORIGIN').replace(/\/$/, '')}/#/payment/return`
        : undefined;

      if (provider === 'flutterwave') {
        if (!FLUTTERWAVE_SECRET_KEY) return fail(503, 'payments_unconfigured', 'Flutterwave is not configured.');

        const txRef = newReference(orderId);

        const { ok, body: fw } = await flutterwaveRequest('/payments', {
          method: 'POST',
          body: JSON.stringify({
            tx_ref: txRef,
            amount: order.charged_minor / 100,
            currency: order.currency ?? 'GHS',
            payment_options: 'card,mobilemoney,banktransfer,ussd',
            redirect_url: callbackUrl,
            customer: { email: order.email, phone: order.phone ?? '' },
            customizations: { title: 'AquaLink water delivery', description: `Order ${orderId}` },
            metadata: { order_id: orderId, volume_litres: order.volume_litres },
          }),
        });

        if (!ok || fw?.status !== 'success') {
          return fail(502, 'provider_rejected', fw?.message ?? 'The payment provider rejected this request.');
        }

        const { error: storeError } = await db.from('orders').update({
          flutterwave_reference: txRef,
          status: 'Awaiting payment',
        }).eq('id', orderId);

        // The reference has to be stored before the customer is redirected. If
        // the write failed and the redirect happened anyway, the buyer paid
        // against a reference no order knows about, so the webhook found no
        // order and the payment could never be applied.
        if (storeError) {
          console.error('flutterwave reference store failed', storeError);
          return fail(500, 'reference_store_failed', 'Could not start this payment. Please try again.');
        }

        return json({
          reference: txRef,
          authorizationUrl: fw.data?.link ?? null,
          amountMinor: order.charged_minor,
          currency: order.currency ?? 'GHS',
          provider: 'flutterwave',
          status: 'pending',
        });
      }

      // Paystack path
      if (!PAYSTACK_SECRET_KEY) return fail(503, 'payments_unconfigured', 'Paystack is not configured.');

      const paystackReference = newReference(orderId);

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

      const { error: storeError } = await db.from('orders').update({
        paystack_reference: paystackReference,
        paystack_access_code: paystack.data?.access_code ?? null,
        status: 'Awaiting payment',
      }).eq('id', orderId);

      // Same reasoning as the Flutterwave leg: the reference must be stored
      // before the buyer is redirected to Paystack, or the payment arrives
      // against an order that has no record of it.
      if (storeError) {
        console.error('paystack reference store failed', storeError);
        return fail(500, 'reference_store_failed', 'Could not start this payment. Please try again.');
      }

      return json({
        reference: paystackReference,
        authorizationUrl: paystack.data?.authorization_url,
        amountMinor: order.charged_minor,
        currency: order.currency ?? 'GHS',
        provider: 'paystack',
        status: 'pending',
      });
    }

    // GET /payments/verify?reference=xxx - verify a payment
    if (path === 'verify') {
      if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.');

      const reference = String(url.searchParams.get('reference') ?? '').trim();
      if (!reference) return fail(400, 'invalid_reference', 'A payment reference is required.');
      // This value is interpolated into a PostgREST `.or()` filter below. An
      // allowlist is the only thing standing between a caller and a crafted
      // filter, so it is checked before the query is built rather than trusted
      // because it "came from the URL".
      if (!isPlausibleReference(reference)) {
        return fail(400, 'invalid_reference', 'That payment reference is not valid.');
      }

      const db = supabase();
      const { data: order, error: orderError } = await db
        .from('orders')
        .select('*')
        .or(`paystack_reference.eq.${reference},flutterwave_reference.eq.${reference}`)
        .single();

      if (orderError || !order) {
        return json({ status: 'unknown', settled: false, reason: 'no_matching_order' });
      }

      // Which provider to ask is decided by *which reference was presented*, not by
      // whether the order happens to hold a Flutterwave reference at all.
      //
      // A customer can start a Flutterwave payment, abandon it, and then pay
      // through Paystack. The order still carries the abandoned Flutterwave
      // reference, so the old `order.flutterwave_reference ? ...` test sent the
      // Paystack reference to Flutterwave's API, which rejected it — and a
      // genuinely paid order showed the customer "not completed".
      const matchedFlutterwave = String(order.flutterwave_reference ?? '') === reference;
      const provider: Provider = matchedFlutterwave ? 'flutterwave' : 'paystack';
      const secret = provider === 'flutterwave' ? FLUTTERWAVE_SECRET_KEY : PAYSTACK_SECRET_KEY;
      if (!secret) return fail(503, 'payments_unconfigured', `${provider} is not configured.`);

      let transaction: any = {};
      if (provider === 'flutterwave') {
        const { ok, body: fw } = await flutterwaveRequest(`/transactions/${encodeURIComponent(reference)}/verify`);
        if (!ok || fw?.status !== 'success') {
          return fail(502, 'provider_rejected', fw?.message ?? 'The payment provider could not be reached.');
        }
        transaction = fw.data ?? {};
      } else {
        const { ok, body: paystack } = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
        if (!ok || !paystack?.status) {
          return fail(502, 'provider_rejected', paystack?.message ?? 'The payment provider could not be reached.');
        }
        transaction = paystack.data ?? {};
      }

      const verdict = provider === 'flutterwave'
        ? checkFlutterwaveSettlement({ transaction, order, currency: order.currency ?? 'GHS' })
        : checkSettlement({
            transaction: {
              // No `?? 'success'` here. When Paystack returned a record with no
              // `status` field, the old default read as a successful charge and
              // marked the order paid on the strength of an absent field. The
              // provider's own status is the only thing that can say 'success';
              // when it is missing the answer has to be 'not yet'.
              status: transaction.status,
              // The provider's reference, not the one from the query string.
              // `checkSettlement` exists to prove the charge belongs to this
              // order, and it cannot prove that if it is handed the caller's own
              // value to agree with.
              reference: transaction.reference,
              amount: transaction.amount,
              currency: transaction.currency,
              paid_at: transaction.paid_at,
            },
            order,
            currency: order.currency ?? 'GHS',
          });

      const alreadyPaid = order.status === 'Paid';
      if (verdict.settled && !alreadyPaid) {
        const { error: writeError } = await db.from('orders').update({
          status: 'Paid',
          paid_at: verdict.paidAt ?? transaction.paid_at ?? new Date().toISOString(),
          // Only the column for the provider that actually took the money. Both
          // were previously written with the same value, so every Paystack
          // charge also recorded a Flutterwave channel and vice versa.
          ...(provider === 'flutterwave'
            ? { flutterwave_channel: transaction.channel ?? null }
            : { paystack_channel: transaction.channel ?? null }),
        }).eq('id', order.id);

        // Refuse to confirm a settlement the database did not accept. Reporting
        // `settled: true` after a failed write issues a receipt for a state that
        // was never stored, and the next verification reads the order as unpaid
        // again.
        if (writeError) {
          console.error('settlement record failed', { orderId: order.id, writeError });
          return fail(500, 'settlement_record_failed', 'The payment arrived but could not be recorded. Support has been notified.');
        }

        return json({
          settled: true,
          status: 'settled',
          reason: verdict.reason,
          reference,
          orderId: order.id,
          amountMinor: order.charged_minor,
          currency: order.currency ?? 'GHS',
          provider,
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

      // An order already marked `Paid` is settled regardless of what this call
      // observes, because the earlier write is the durable record. The old
      // `verdict.settled && alreadyPaid` meant a repeat verification of a paid
      // order returned `settled: false` — the customer had paid, the webhook
      // had confirmed it, and the app still told them nothing was taken.
      const settledNow = alreadyPaid || verdict.settled;

      return json({
        settled: settledNow,
        status: settledNow ? 'settled' : 'pending',
        reason: alreadyPaid ? 'already_paid' : verdict.reason,
        reference,
        orderId: order.id,
        amountMinor: order.charged_minor,
        currency: order.currency ?? 'GHS',
        provider,
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

    // POST /payments/webhook - provider webhook endpoint
    if (path === 'webhook') {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

      // Flutterwave identifies itself with the `verifier` header; Paystack with
      // `x-paystack-signature`. Verify against the provider that actually sent
      // it — verifying a Paystack signature with the Flutterwave secret (or
      // vice versa) would accept a forged request.
      const signature = req.headers.get('x-paystack-signature');
      const fwVerifier = req.headers.get('verifier');
      const provider: Provider = fwVerifier ? 'flutterwave' : 'paystack';
      const secret = provider === 'flutterwave' ? FLUTTERWAVE_SECRET_KEY : PAYSTACK_SECRET_KEY;

      if (!secret) {
        console.error(`${provider} secret is not set; refusing to process webhook.`);
        return fail(503, 'payments_unconfigured', 'Payments are not configured.');
      }

      const rawBody = await req.arrayBuffer();
      const bodyText = new TextDecoder().decode(rawBody);

      const valid = provider === 'flutterwave'
        ? verifyFlutterwaveSignature(bodyText, fwVerifier, secret)
        : verifyPaystackSignature(bodyText, signature, secret);

      if (!valid) {
        console.warn('rejected webhook with an invalid signature');
        return fail(401, 'invalid_signature', 'Invalid signature.');
      }

      let event;
      try {
        event = JSON.parse(bodyText);
      } catch {
        return fail(400, 'invalid_body', 'Malformed webhook body.');
      }

      // Flutterwave nests the event under `data`; Paystack under `data` too, but
      // Flutterwave's top-level `status` and `tx_ref` are the useful fields.
      const reference = provider === 'flutterwave'
        ? event?.data?.tx_ref
        : event?.data?.reference;
      if (!reference) return json({ received: true, ignored: 'no_reference' });
      // Same allowlist as the verify leg, and for the same reason: the reference
      // is interpolated into a PostgREST `.or()` filter. The signature check
      // above proves the body came from the provider, but a provider will relay
      // whatever reference it was given, so the value still has to be shaped
      // like one we issued.
      if (!isPlausibleReference(String(reference))) {
        return fail(400, 'invalid_reference', 'That payment reference is not valid.');
      }

      try {
        const db = supabase();
        const { data: order, error: orderError } = await db
          .from('orders')
          .select('*')
          .or(`paystack_reference.eq.${reference},flutterwave_reference.eq.${reference}`)
          .single();

        if (orderError || !order) {
          return json({ received: true, ignored: 'order_not_found' });
        }

        const transaction = provider === 'flutterwave' ? (event.data ?? {}) : (event.data ?? {});
        const verdict = provider === 'flutterwave'
          ? checkFlutterwaveSettlement({ transaction, order, currency: order.currency ?? 'GHS' })
          : checkSettlement({
              transaction: {
                // Same rule as the verify leg: a webhook that omits `status` has
                // not reported success, and must not be read as though it had.
                status: event.data?.status,
                // The reference Paystack put in the signed body, which is the
                // one the signature covers.
                reference: event.data?.reference,
                amount: event.data?.amount,
                currency: event.data?.currency,
                paid_at: event.data?.paid_at,
              },
              order,
              currency: order.currency ?? 'GHS',
            });

        if (verdict.settled && order.status !== 'Paid') {
          const { error: writeError } = await db.from('orders').update({
            status: 'Paid',
            paid_at: verdict.paidAt ?? event.data?.paid_at ?? null,
            // Provider-scoped, for the same reason as the verify leg.
            ...(provider === 'flutterwave'
              ? { flutterwave_channel: event.data?.channel ?? null }
              : { paystack_channel: event.data?.channel ?? null }),
          }).eq('id', order.id);

          // The webhook still answers 200 either way: the provider must not
          // retry a payment it already took. The failure is logged loudly and
          // surfaced to the operator rather than hidden behind a cheerful 200.
          if (writeError) {
            console.error('webhook settlement record failed', { orderId: order.id, reference, writeError });
            return fail(500, 'settlement_record_failed', 'Could not record this settlement.');
          }

          console.info('order marked paid from webhook', { orderId: order.id, reference, provider });
        } else {
          console.warn('webhook did not settle the order', { orderId: order.id, reason: verdict.reason });
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