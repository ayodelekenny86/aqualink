/**
 * AquaLink server.
 *
 * Three responsibilities, and the boundary between them is the point of this
 * file:
 *
 *   1. It holds the Paystack secret key. That value must never be sent to a
 *      browser, so every provider call happens here.
 *   2. It owns the price of an order. The browser sends *what the customer
 *      wants* (volume, location, contact); the server decides *what it costs*
 *      and stores that. If the client could set the amount it would simply
 *      claim a GH¢300 order is GH¢1.
 *   3. It decides whether money arrived, by asking Paystack and comparing the
 *      answer to the order it stored. The browser's word is never evidence.
 *
 * There is no "demo" or "sandbox" behaviour in here. If the secret key is
 * missing these endpoints fail closed, because an endpoint that pretends to
 * charge a card is worse than one that refuses.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { logger, setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { DEFAULT_PRICING, DEFAULT_SPLIT, checkSettlement, newReference, priceOrder, verifyPaystackSignature } from './lib/index.js';
import { bearerToken, signOpsToken, validatePricingInput, verifyOpsToken } from './lib/session.js';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

initializeApp();
const db = getFirestore();

const PAYSTACK_SECRET_KEY = defineSecret('PAYSTACK_SECRET_KEY');
const OPS_BOOTSTRAP_TOKEN = defineSecret('OPS_BOOTSTRAP_TOKEN');
const OPS_ADMIN_EMAIL = defineString('OPS_ADMIN_EMAIL', { default: '' });
const OPS_ADMIN_PASSWORD = defineSecret('OPS_ADMIN_PASSWORD');
const OPS_SESSION_SECRET = defineSecret('OPS_SESSION_SECRET');
const ALLOWED_ORIGINS = defineString('ALLOWED_ORIGINS', { default: '' });

const CURRENCY = 'GHS';
const COLLECTIONS = { orders: 'orders', config: 'config', ops: 'ops' };

/* ------------------------------------------------------------------ helpers */

function allowedOrigins() {
  return ALLOWED_ORIGINS.value()
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function applyCors(req, res) {
  const origin = req.get('origin');
  const allowed = allowedOrigins();
  if (origin && allowed.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Ops-Token');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  // Responses must never be cached: a cached "settled" or a cached price would
  // outlive the fact that decided it.
  res.set('Cache-Control', 'no-store');
}

function fail(res, status, code, message) {
  return res.status(status).json({ error: code, message });
}

async function readJson(req) {
  const raw = req.rawBody ?? req.body;
  if (!raw) return {};
  if (typeof raw === 'string') return JSON.parse(raw || '{}');
  if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString('utf8') || '{}');
  return raw;
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Read the live pricing config, falling back to the compiled defaults the first
 * time round. Env overrides let an operator change price without a deploy.
 */
async function readPricingConfig() {
  const snapshot = await db.collection(COLLECTIONS.config).doc('pricing').get();
  if (snapshot.exists) {
    const data = snapshot.data();
    return { pricing: data.pricing ?? DEFAULT_PRICING, split: data.split ?? DEFAULT_SPLIT };
  }
  return {
    pricing: {
      ...DEFAULT_PRICING,
      ...(process.env.PRICING_LIST_PRICE ? { listPrice: Number(process.env.PRICING_LIST_PRICE) } : {}),
    },
    split: DEFAULT_SPLIT,
  };
}

async function paystackRequest(secret, path, init = {}) {
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
    // A non-JSON body from the provider is not something to interpret; surface
    // it as a provider failure rather than guessing at its meaning.
    throw new Error(`Paystack returned a non-JSON response (${response.status}).`);
  }
  return { ok: response.ok, status: response.status, body };
}

function callbackUrl() {
  const configured = process.env.APP_ORIGIN;
  if (!configured) return undefined;
  return `${configured.replace(/\/$/, '')}/#/payment/return`;
}

/* ------------------------------------------------------------------ pricing */

export const apiPricing = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed', 'Use GET.');

  try {
    const { pricing, split } = await readPricingConfig();
    const volumeLitres = Number(req.query.volume ?? 0);
    if (!Number.isFinite(volumeLitres) || volumeLitres < 0) {
      return fail(res, 400, 'invalid_volume', 'Volume must be a positive number of litres.');
    }

    // The same computation the order will be priced with, so what the buyer is
    // shown and what they are charged cannot come from two different rules.
    const priced = priceOrder({ pricing, split, volumeLitres });
    return res.status(200).json({ currency: CURRENCY, pricing, split, quote: priced });
  } catch (error) {
    logger.error('pricing failed', error);
    return fail(res, 500, 'pricing_failed', 'Could not price this order.');
  }
});

/* -------------------------------------------------------------------- orders */

export const apiCreateOrder = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  try {
    const body = await readJson(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim();
    const location = String(body.location ?? '').trim();
    const volumeLitres = Number(body.volumeLitres ?? 0);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return fail(res, 400, 'invalid_email', 'A valid email address is required for the receipt.');
    }
    if (!/^\+?233?\d{9,12}$/.test(phone.replace(/[\s-]/g, ''))) {
      return fail(res, 400, 'invalid_phone', 'A valid Ghanaian phone number is required.');
    }
    if (location.length < 4) {
      return fail(res, 400, 'invalid_location', 'A delivery address or landmark is required.');
    }
    if (!Number.isFinite(volumeLitres) || volumeLitres <= 0 || volumeLitres > 100000) {
      return fail(res, 400, 'invalid_volume', 'Volume must be between 1 and 100000 litres.');
    }

    const { pricing, split } = await readPricingConfig();

    // Any amount sent by the client is ignored on purpose. The price below is
    // the only one that is stored and later charged.
    const priced = priceOrder({ pricing, split, volumeLitres });
    const orderId = `AQ-${randomBytes(5).toString('hex').toUpperCase()}`;

    const order = {
      id: orderId,
      code: orderId,
      email,
      phone,
      location,
      volumeLitres,
      currency: CURRENCY,
      pricing,
      split,
      grossMinor: priced.grossMinor,
      chargedMinor: priced.chargedMinor,
      buyerPays: priced.buyerPays,
      buyerServiceCharge: priced.buyerServiceCharge,
      sellerReceives: priced.sellerReceives,
      driverReceives: priced.driverReceives,
      platformCommission: priced.platformCommission,
      companyTake: priced.companyTake,
      discountMinor: priced.discountMinor,
      surgeMinor: priced.surgeMinor,
      status: 'Awaiting payment',
      paystackReference: null,
      createdAt: FieldValue.serverTimestamp(),
      paidAt: null,
    };

    await db.collection(COLLECTIONS.orders).doc(orderId).set(order);
    return res.status(201).json({ order: { ...order, createdAt: new Date().toISOString() } });
  } catch (error) {
    logger.error('create order failed', error);
    return fail(res, 500, 'order_failed', 'Could not create the order.');
  }
});

/* ------------------------------------------------------------------ payments */

export const apiInitializePayment = onRequest({ secrets: [PAYSTACK_SECRET_KEY] }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  const secret = PAYSTACK_SECRET_KEY.value();
  if (!secret) {
    logger.error('PAYSTACK_SECRET_KEY is not set; refusing to initialise a payment.');
    return fail(res, 503, 'payments_unconfigured', 'Payments are not configured on this deployment.');
  }

  try {
    const body = await readJson(req);
    const orderId = String(body.orderId ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!orderId) return fail(res, 400, 'invalid_order', 'An order id is required.');

    const reference = db.collection(COLLECTIONS.orders).doc(orderId);
    const snapshot = await reference.get();
    if (!snapshot.exists) return fail(res, 404, 'order_not_found', 'That order does not exist.');

    const order = snapshot.data();

    // Without this check anyone could enumerate order ids and learn a customer's
    // email and live Paystack charges against their order.
    if (String(order.email).toLowerCase() !== email) {
      return fail(res, 403, 'order_email_mismatch', 'This order belongs to a different account.');
    }
    if (order.status === 'Paid') {
      return res.status(200).json({ reference: order.paystackReference, status: 'settled', alreadyPaid: true });
    }

    const paystackReference = newReference(orderId);

    // The amount sent to Paystack is the server's stored figure. `order.chargedMinor`
    // is not influenced by anything the client sent at order time.
    const { ok, body: paystack } = await paystackRequest(secret, '/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: order.email,
        amount: order.chargedMinor,
        currency: order.currency ?? CURRENCY,
        reference: paystackReference,
        callback_url: callbackUrl(),
        metadata: { order_id: orderId, volume_litres: order.volumeLitres },
      }),
    });

    if (!ok || !paystack?.status) {
      logger.error('paystack initialize rejected', { orderId, message: paystack?.message });
      return fail(res, 502, 'provider_rejected', paystack?.message ?? 'The payment provider rejected this request.');
    }

    await reference.update({
      paystackReference,
      paystackAccessCode: paystack.data?.access_code ?? null,
      status: 'Awaiting payment',
    });

    // Pending, always. A transaction has been created, not a payment received.
    return res.status(200).json({
      reference: paystackReference,
      authorizationUrl: paystack.data?.authorization_url,
      amountMinor: order.chargedMinor,
      currency: order.currency ?? CURRENCY,
      status: 'pending',
    });
  } catch (error) {
    logger.error('initialize payment failed', error);
    return fail(res, 500, 'payment_initialize_failed', 'Could not start the payment.');
  }
});

export const apiVerifyPayment = onRequest({ secrets: [PAYSTACK_SECRET_KEY] }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed', 'Use GET.');

  const secret = PAYSTACK_SECRET_KEY.value();
  if (!secret) {
    return fail(res, 503, 'payments_unconfigured', 'Payments are not configured on this deployment.');
  }

  try {
    const reference = String(req.query.reference ?? '').trim();
    if (!reference) return fail(res, 400, 'invalid_reference', 'A payment reference is required.');

    const { ok, body: paystack } = await paystackRequest(secret, `/transaction/verify/${encodeURIComponent(reference)}`);
    if (!ok || !paystack?.status) {
      return fail(res, 502, 'provider_rejected', paystack?.message ?? 'The payment provider could not be reached.');
    }
    const transaction = paystack.data ?? {};

    // Find the order that issued this reference. The query is on the stored
    // reference, so an attacker cannot point a real charge at a different order.
    const orders = await db.collection(COLLECTIONS.orders)
      .where('paystackReference', '==', reference)
      .limit(1)
      .get();

    if (orders.empty) {
      return res.status(200).json({ status: 'unknown', settled: false, reason: 'no_matching_order' });
    }

    const orderDoc = orders.docs[0];
    const order = orderDoc.data();
    const verdict = checkSettlement({ transaction, order, currency: order.currency ?? CURRENCY });

    if (verdict.settled && order.status !== 'Paid') {
      await orderDoc.update({
        status: 'Paid',
        paidAt: transaction.paid_at ?? null,
        paystackChannel: transaction.channel ?? null,
      });
    }

    return res.status(200).json({
      // `settled` here means Paystack confirmed it AND it matched the order. The
      // client can rely on this flag; nothing else in the app decides it.
      settled: verdict.settled && order.status === 'Paid',
      status: verdict.settled ? 'settled' : 'pending',
      reason: verdict.reason,
      reference,
      orderId: order.id,
      amountMinor: order.chargedMinor,
      currency: order.currency ?? CURRENCY,
      breakdown: {
        grossMinor: order.grossMinor,
        // `buyerPays` is what was actually taken, which is the order value plus
        // the service charge. The receipt renders this rather than deriving it,
        // so a customer is never shown a total that omits the fee.
        buyerPays: order.chargedMinor,
        buyerServiceCharge: order.buyerServiceCharge,
        sellerReceives: order.sellerReceives,
        driverReceives: order.driverReceives,
        platformCommission: order.platformCommission,
      },
    });
  } catch (error) {
    logger.error('verify payment failed', error);
    return fail(res, 500, 'verify_failed', 'Could not confirm this payment.');
  }
});

export const apiPaystackWebhook = onRequest({ secrets: [PAYSTACK_SECRET_KEY] }, async (req, res) => {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  const secret = PAYSTACK_SECRET_KEY.value();
  const signature = req.get('x-paystack-signature');
  const raw = req.rawBody;

  // Verified against the exact bytes received. An unverified webhook is an
  // unauthenticated instruction to mark orders paid, so it is refused outright.
  if (!verifyPaystackSignature(raw, signature, secret)) {
    logger.warn('rejected webhook with an invalid signature');
    return fail(res, 401, 'invalid_signature', 'Invalid signature.');
  }

  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
  } catch {
    return fail(res, 400, 'invalid_body', 'Malformed webhook body.');
  }

  const reference = event?.data?.reference;
  if (!reference) return res.status(200).json({ received: true, ignored: 'no_reference' });

  try {
    if (event.event === 'charge.success') {
      const orders = await db.collection(COLLECTIONS.orders)
        .where('paystackReference', '==', reference)
        .limit(1)
        .get();

      if (!orders.empty) {
        const orderDoc = orders.docs[0];
        const order = orderDoc.data();
        // The webhook payload is re-checked against the stored order with the
        // same rules as the verify endpoint. A signed event is still not proof
        // that it matches this order.
        const verdict = checkSettlement({
          transaction: {
            status: event.data.status ?? 'success',
            reference,
            // Paystack's webhook data is in pesewas, same unit as stored.
            amount: event.data.amount,
            currency: event.data.currency,
            paid_at: event.data.paid_at,
          },
          order,
          currency: order.currency ?? CURRENCY,
        });

        if (verdict.settled && order.status !== 'Paid') {
          await orderDoc.update({
            status: 'Paid',
            paidAt: event.data.paid_at ?? null,
            paystackChannel: event.data.channel ?? null,
          });
          logger.info('order marked paid from webhook', { orderId: order.id, reference });
        } else {
          logger.warn('webhook did not settle the order', { orderId: order.id, reason: verdict.reason });
        }
      }
    }

    // Always 200 once the signature is trusted, so Paystack stops retrying an
    // event we have deliberately declined to act on.
    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error('webhook handling failed', error);
    return fail(res, 500, 'webhook_failed', 'Webhook processing failed.');
  }
});

/* ------------------------------------------------------------- ops bootstrap */

/**
 * Create the first ops account exactly once, from a secret the operator sets.
 *
 * The credential comes from the environment and is never rendered to a browser,
 * and the endpoint refuses once an ops account exists. This replaces the old
 * behaviour of printing a generated ops password on the sign-in page, which
 * handed a real admin credential to anyone who loaded the app.
 */
export const apiBootstrapOps = onRequest({ secrets: [OPS_BOOTSTRAP_TOKEN, OPS_ADMIN_PASSWORD] }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  const expectedToken = OPS_BOOTSTRAP_TOKEN.value();
  const presentedToken = String(req.get('x-ops-token') ?? '');
  if (!expectedToken) {
    return fail(res, 503, 'bootstrap_unconfigured', 'Set OPS_BOOTSTRAP_TOKEN before bootstrapping.');
  }
  if (!presentedToken || !timingSafeEqual(Buffer.from(presentedToken), Buffer.from(expectedToken))) {
    return fail(res, 401, 'unauthorised', 'A valid bootstrap token is required.');
  }

  const email = String(OPS_ADMIN_EMAIL.value() ?? '').trim().toLowerCase();
  const password = String(OPS_ADMIN_PASSWORD.value() ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return fail(res, 400, 'invalid_email', 'Set OPS_ADMIN_EMAIL to a valid address.');
  }
  if (password.length < 12) {
    return fail(res, 400, 'weak_password', 'Set OPS_ADMIN_PASSWORD to at least 12 characters.');
  }

  try {
    const existing = await db.collection(COLLECTIONS.ops).where('role', '==', 'ops').limit(1).get();
    if (!existing.empty) {
      return fail(res, 409, 'already_bootstrapped', 'An ops account already exists. This endpoint runs once only.');
    }

    const { salt, hash } = hashPassword(password);
    const id = createHash('sha256').update(email).digest('hex').slice(0, 24);
    await db.collection(COLLECTIONS.ops).doc(id).set({
      email,
      role: 'ops',
      salt,
      passwordHash: hash,
      createdAt: FieldValue.serverTimestamp(),
      // Kept as evidence that the one-time run has happened, so a rotated token
      // cannot be used to mint a second admin.
      bootstrapped: true,
    });

    logger.info('ops account bootstrapped', { email });
    return res.status(201).json({ created: true, email });
  } catch (error) {
    logger.error('ops bootstrap failed', error);
    return fail(res, 500, 'bootstrap_failed', 'Could not create the ops account.');
  }
});

export { verifyPassword, hashPassword };
