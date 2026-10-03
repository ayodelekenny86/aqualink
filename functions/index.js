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
import { sendPushToUser, storeFcmToken, deactivateFcmToken, notifyOrderStatusChange } from './lib/fcm.js';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

initializeApp();
const db = getFirestore();

const PAYSTACK_SECRET_KEY = defineSecret('PAYSTACK_SECRET_KEY');
const OPS_BOOTSTRAP_TOKEN = defineSecret('OPS_BOOTSTRAP_TOKEN');
const OPS_ADMIN_EMAIL = defineString('OPS_ADMIN_EMAIL', { default: '' });
const OPS_ADMIN_PASSWORD = defineSecret('OPS_ADMIN_PASSWORD');
const OPS_SESSION_SECRET = defineSecret('OPS_SESSION_SECRET');
const ALLOWED_ORIGINS = defineString('ALLOWED_ORIGINS', { default: '' });

// Where Paystack should send the customer back to once they have authorised (or
// abandoned) the charge. Declared as a param rather than read from
// `process.env`: on the v2 runtime `process.env` is not populated with the
// function's own configuration, so a `process.env.APP_ORIGIN` read is always
// undefined in production. That made `callback_url` undefined, Paystack fell
// back to redirecting to its own dashboard, and the return leg of the redirect
// — the only thing that verifies the payment and issues the receipt — never
// happened. This is a v2 param, so it is set in functions/.env, which the CLI
// deploys along with the code:
//
//   APP_ORIGIN=https://your-app.web.app
const APP_ORIGIN = defineString('APP_ORIGIN', { default: '' });
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

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

/**
 * The URL Paystack redirects to after checkout.
 *
 * Returns `undefined` when the deployment has not declared an origin. Callers
 * must treat that as a misconfiguration rather than silently falling back to
 * something that would leave the customer stranded.
 */
function callbackUrl() {
  const configured = String(APP_ORIGIN.value() ?? '').trim();
  if (!configured) {
    logger.error(
      'APP_ORIGIN is not set, so the payment return URL is undefined and Paystack will not redirect back to the app. ' +
      'Set APP_ORIGIN in functions/.env and redeploy.',
    );
    return undefined;
  }
  return `${configured.replace(/\/$/, '')}/#/payment/return`;
}

/* ------------------------------------------------------------------ pricing */

/* ------------------------------------------------------------- ops identity */

/**
 * Authenticate an operations login and issue a session token.
 *
 * This is the piece that makes the admin side enforceable. Previously the ops
 * console checked a password against `localStorage`, which meant the server could
 * not tell an operator from an anonymous caller, so anything that changed money
 * or approved a seller either could not be protected or was left wide open.
 */
export const apiOpsLogin = onRequest({ secrets: [OPS_SESSION_SECRET] }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  const secret = OPS_SESSION_SECRET.value();
  if (!secret) {
    logger.error('OPS_SESSION_SECRET is not set; refusing to issue session tokens.');
    return fail(res, 503, 'auth_unconfigured', 'Operations sign-in is not configured on this deployment.');
  }

  try {
    const body = await readJson(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!email || !password) {
      return fail(res, 400, 'missing_credentials', 'An email address and password are required.');
    }

    const snapshot = await db.collection(COLLECTIONS.ops)
      .where('email', '==', email)
      .where('role', '==', 'ops')
      .limit(1)
      .get();

    // One message for "no such operator" and "wrong password" alike, so this
    // cannot be used to enumerate which addresses have admin accounts.
    const invalid = () => fail(res, 401, 'invalid_credentials', 'Those sign-in details are not correct.');

    if (snapshot.empty) {
      // Still spend the time hashing, so a missing account and a wrong password
      // take about the same wall-clock time and cannot be told apart.
      hashPassword(password);
      return invalid();
    }

    const operator = snapshot.docs[0].data();
    if (!verifyPassword(password, operator.salt, operator.passwordHash)) return invalid();

    await snapshot.docs[0].ref.update({ lastLoginAt: FieldValue.serverTimestamp() });
    logger.info('ops signed in', { email });

    return res.status(200).json({
      token: signOpsToken({ email, role: 'ops', secret }),
      email,
      expiresInSeconds: 60 * 60 * 8,
    });
  } catch (error) {
    logger.error('ops login failed', error);
    return fail(res, 500, 'login_failed', 'Could not sign in.');
  }
});

/**
 * Require a valid ops session.
 *
 * Every protected endpoint calls this and returns 401 on anything other than a
 * good token, so a missing deployment secret rejects everyone rather than
 * everyone.
 */
function requireOps(req, res) {
  const secret = OPS_SESSION_SECRET.value();
  if (!secret) {
    fail(res, 503, 'auth_unconfigured', 'Operations access is not configured on this deployment.');
    return null;
  }
  const result = verifyOpsToken(bearerToken(req), secret, { requiredRole: 'ops' });
  if (!result.valid) {
    fail(res, 401, 'not_authorised', 'Sign in as an operator to do that.');
    return null;
  }
  return result.payload;
}

/* ------------------------------------------------------------------ pricing */

/**
 * Update pricing. Operator-only.
 *
 * The admin console is not the reason this is protected: it is because this
 * endpoint decides what every customer is charged. The browser's copy of the
 * price is display-only, so this is the single point where a price can change.
 */
export const apiUpdatePricing = onRequest({ secrets: [OPS_SESSION_SECRET] }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  const operator = requireOps(req, res);
  if (!operator) return undefined;

  try {
    const body = await readJson(req);
    const current = await readPricingConfig();

    // Partial updates are allowed, so the console can change the discount
    // without resending the list price. Unspecified fields keep their value.
    const pricing = {
      ...current.pricing,
      ...(body.pricing ?? {}),
    };
    const split = body.split ? { ...current.split, ...body.split } : current.split;

    const check = validatePricingInput(pricing, split);
    if (!check.valid) {
      return fail(res, 400, 'invalid_pricing', check.problems.join(' '));
    }

    await db.collection(COLLECTIONS.config).doc('pricing').set({
      pricing: {
        listPrice: Number(pricing.listPrice),
        discountPercent: Number(pricing.discountPercent),
        surgePercent: Number(pricing.surgePercent),
        surgeReason: String(pricing.surgeReason ?? '').slice(0, 140),
      },
      split: Object.fromEntries(Object.entries(split).map(([key, value]) => [key, Number(value)])),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: operator.sub,
    }, { merge: true });

    logger.info('pricing updated', { by: operator.sub, listPrice: pricing.listPrice });
    return res.status(200).json({ pricing, split, updatedBy: operator.sub });
  } catch (error) {
    logger.error('update pricing failed', error);
    return fail(res, 500, 'pricing_update_failed', 'Could not save the pricing change.');
  }
});

/* -------------------------------------------------------- seller onboarding */

export const apiApplySeller = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  try {
    const body = await readJson(req);
    const phone = String(body.phone ?? '').trim();
    const business = String(body.business ?? '').trim();
    const vehicle = String(body.vehicle ?? '').trim();
    const capacity = String(body.capacity ?? '').trim();

    if (!/^\+?233?\d{9,12}$/.test(phone.replace(/[\s-]/g, ''))) {
      return fail(res, 400, 'invalid_phone', 'A valid Ghanaian phone number is required.');
    }
    if (business.length < 2) return fail(res, 400, 'invalid_business', 'A business or trading name is required.');
    if (vehicle.length < 3) return fail(res, 400, 'invalid_vehicle', 'A vehicle registration is required.');

    const normalisedPhone = phone.replace(/[\s-]/g, '');
    const id = createHash('sha256').update(normalisedPhone).digest('hex').slice(0, 24);

    const existing = await db.collection('sellers').doc(id).get();
    if (existing.exists && existing.get('status') === 'approved') {
      return res.status(200).json({ applicationId: id, status: 'approved' });
    }

    await db.collection('sellers').doc(id).set({
      id,
      phone: normalisedPhone,
      business,
      vehicle,
      capacity,
      status: 'pending',
      // No self-issued approval code. The old flow minted `SEL-XXXXXXXX` in the
      // browser and displayed it, so anyone who loaded the app could approve
      // themselves; approval now has to come from a signed-in operator.
      appliedAt: existing.exists ? existing.get('appliedAt') : FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
    }, { merge: true });

    return res.status(201).json({ applicationId: id, status: 'pending' });
  } catch (error) {
    logger.error('seller application failed', error);
    return fail(res, 500, 'apply_failed', 'Could not submit the application.');
  }
});

/**
 * List seller applications for review. Operator-only.
 *
 * This is what the ops approval queue reads. The panel it replaces hardcoded
 * "3 pending" and three invented sellers (S-019, S-021, S-024), so an operator
 * reviewing that list was reading fiction.
 */
export const apiSellerApplications = onRequest({ secrets: [OPS_SESSION_SECRET] }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed', 'Use GET.');

  const operator = requireOps(req, res);
  if (!operator) return undefined;

  try {
    const requested = String(req.query.status ?? 'pending');
    const status = ['pending', 'approved', 'rejected'].includes(requested) ? requested : 'pending';

    const snapshot = await db.collection('sellers')
      .where('status', '==', status)
      .limit(200)
      .get();

    const applications = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        applicationId: data.id,
        business: data.business ?? '',
        phone: data.phone ?? '',
        vehicle: data.vehicle ?? '',
        capacity: data.capacity ?? '',
        status: data.status,
        appliedAt: data.appliedAt ?? null,
        // The audit trail the README claims exists: who decided, and when.
        reviewedAt: data.reviewedAt ?? null,
        reviewedBy: data.reviewedBy ?? null,
      };
    });

    return res.status(200).json({ applications, status, count: applications.length });
  } catch (error) {
    logger.error('seller applications list failed', error);
    return fail(res, 500, 'list_failed', 'Could not load the review queue.');
  }
});

export const apiReviewSeller = onRequest({ secrets: [OPS_SESSION_SECRET] }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  const operator = requireOps(req, res);
  if (!operator) return undefined;

  try {
    const body = await readJson(req);
    const id = String(body.applicationId ?? '').trim();
    const decision = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : null;

    if (!id) return fail(res, 400, 'invalid_application', 'An application id is required.');
    if (!decision) return fail(res, 400, 'invalid_decision', 'Decision must be approve or reject.');

    const ref = db.collection('sellers').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return fail(res, 404, 'application_not_found', 'That application does not exist.');

    // A second decision would silently overwrite the first, so the audit trail
    // would show only the latest. Reject it instead.
    if (snapshot.get('status') !== 'pending') {
      return fail(res, 409, 'already_reviewed', `That application was already ${snapshot.get('status')}.`);
    }

    await ref.update({
      status: decision,
      reviewNote: String(body.note ?? '').slice(0, 280),
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: operator.sub,
    });

    logger.info('seller application reviewed', { id, decision, by: operator.sub });
    return res.status(200).json({ applicationId: id, status: decision });
  } catch (error) {
    logger.error('seller review failed', error);
    return fail(res, 500, 'review_failed', 'Could not record the decision.');
  }
});

export const apiSellerStatus = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed', 'Use GET.');

  try {
    const phone = String(req.query.phone ?? '').replace(/[\s-]/g, '').trim();
    if (!/^\+?233?\d{9,12}$/.test(phone)) {
      return fail(res, 400, 'invalid_phone', 'A valid Ghanaian phone number is required.');
    }
    const id = createHash('sha256').update(phone).digest('hex').slice(0, 24);
    const snapshot = await db.collection('sellers').doc(id).get();

    // An unknown number is 'pending' rather than 404, so this endpoint does not
    // reveal which phone numbers have applied.
    return res.status(200).json({ status: snapshot.exists ? snapshot.get('status') : 'pending' });
  } catch (error) {
    logger.error('seller status failed', error);
    return fail(res, 500, 'status_failed', 'Could not read the application status.');
  }
});

/* ------------------------------------------------- public price read-back */

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
    // Notify available sellers of new order (fire-and-forget)
    notifySellerNewOrder(order).catch((err) => logger.warn('seller notification failed', err));
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
      const oldStatus = order.status;
      await orderDoc.update({
        status: 'Paid',
        paidAt: transaction.paid_at ?? null,
        paystackChannel: transaction.channel ?? null,
      });
      // Send push notification for status change
      await notifyOrderStatusChange({ ...order, status: 'Paid' }, oldStatus);
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
          const oldStatus = order.status;
          await orderDoc.update({
            status: 'Paid',
            paidAt: event.data.paid_at ?? null,
            paystackChannel: event.data.channel ?? null,
          });
          // Send push notification for status change
          await notifyOrderStatusChange({ ...order, status: 'Paid' }, oldStatus);
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

/* ----------------------------------------------------------- FCM tokens */

export const apiFcmToken = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  try {
    const body = await readJson(req);
    const userId = String(body.userId ?? '').trim();
    const token = String(body.token ?? '').trim();
    const platform = String(body.platform ?? 'web');

    if (!userId || !token) {
      return fail(res, 400, 'missing_fields', 'userId and token are required.');
    }

    await storeFcmToken(userId, token, platform);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('fcm token store failed', error);
    return fail(res, 500, 'token_failed', 'Could not store FCM token.');
  }
});

export const apiFcmTokenDelete = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  try {
    const body = await readJson(req);
    const token = String(body.token ?? '').trim();

    if (!token) {
      return fail(res, 400, 'missing_token', 'Token is required.');
    }

    await deactivateFcmToken(token);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('fcm token delete failed', error);
    return fail(res, 500, 'token_failed', 'Could not remove FCM token.');
  }
});

/* ------------------------------------------------------------ test notify */

export const apiTestNotification = onRequest({ secrets: [OPS_SESSION_SECRET] }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  const operator = requireOps(req, res);
  if (!operator) return undefined;

  try {
    const body = await readJson(req);
    const userId = String(body.userId ?? '').trim();
    const title = String(body.title ?? 'Test Notification');
    const bodyText = String(body.body ?? 'This is a test push notification from AquaLink.');

    if (!userId) {
      return fail(res, 400, 'missing_user', 'userId is required.');
    }

    const result = await sendPushToUser(userId, {
      notification: { title, body: bodyText },
      data: { type: 'test' },
    });

    return res.status(200).json({ success: true, result });
  } catch (error) {
    logger.error('test notification failed', error);
    return fail(res, 500, 'notify_failed', 'Could not send test notification.');
  }
});

/* ----------------------------------------------------------- AI chat */

const SYSTEM_PROMPTS = {
  buyer: `You are Aqua, the AI assistant for AquaLink, a water delivery service in Ghana. You answer questions about the buyer's orders, pricing, delivery status, and loyalty rewards. You read the buyer's real order history from the data provided. If you don't know something, say so rather than inventing an answer. Never invent phone numbers, emails, order references, or prices. Always quote GH₵ amounts in the format GH₵XX.XX.`,
  seller: `You are Aqua, the AI assistant for AquaLink's seller dashboard. You answer questions about seller performance, order payouts, delivery reliability, and pricing. You read the seller's real order data from the provided context. If you don't know something, say so.`,
  driver: `You are Aqua, the AI assistant for AquaLink's driver app. You answer questions about a driver's deliveries, earnings, and route information. You read the driver's real delivery data from the provided context. If you don't know something, say so.`,
  ops: `You are Aqua, the AI operations copilot for AquaLink. You answer questions about revenue, seller performance, delivery reliability, order status, and pricing configuration. You read real order data from the provided context. If you don't know something, say so.`,
  institution: `You are Aqua, the AI assistant for AquaLink's institutional dashboard. You answer questions about supply schedules, budgets, and delivery volumes. You read real data from the provided context. If you don't know something, say so.`,
};

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function formatCedi(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const major = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}GH₵${major.toLocaleString('en-GB')}.${String(rest).padStart(2, '0')}`;
}

function buildContext(body) {
  const role = String(body.role ?? 'buyer');
  const question = String(body.question ?? '').trim();
  const orders = Array.isArray(body.orders) ? body.orders : [];
  const split = body.split;
  const sellerScores = Array.isArray(body.sellerScores) ? body.sellerScores : [];
  const reliabilityScores = Array.isArray(body.reliabilityScores) ? body.reliabilityScores : [];
  const buyerId = body.buyerId ?? null;

  let context = '';
  if (orders.length > 0) {
    context += `Recent orders:\n${orders.slice(0, 5).map((o) =>
      `- ${o.code || o.id}: ${o.location || 'unknown'}, ${o.volume || o.volumeLitres + 'L'}, status=${o.status}, charged=${o.chargedMinor ? formatCedi(o.chargedMinor) : 'unknown'}, driver=${o.driverName || 'unassigned'}, seller=${o.sellerName || 'unassigned'}`
    ).join('\n')}\n`;
  }
  if (split) {
    context += `\nRevenue split: ${split.seller || 0}% seller, ${split.driver || 0}% driver, ${split.platformCommission || 0}% platform, ${split.buyerServiceCharge || 0}% buyer fee.`;
  }
  if (sellerScores.length > 0) {
    context += `\n\nSeller performance:\n${sellerScores.slice(0, 10).map((s) =>
      `- ${s.sellerId}: score=${s.score} (${s.band?.label || 'unranked'}), ${s.slaHours || 0}h avg`
    ).join('\n')}\n`;
  }
  if (reliabilityScores.length > 0) {
    context += `\nDelivery reliability:\n${reliabilityScores.slice(0, 10).map((s) =>
      `- ${s.sellerId}: ${s.slaHours || 0}h average, ${s.slaMeasured ? 'timed' : 'untimed'}`
    ).join('\n')}\n`;
  }
  if (buyerId) {
    context += `\nBuyer ID: ${buyerId}`;
  }

  return { role, question, context };
}

export const apiAiChat = onRequest({ secrets: [GEMINI_API_KEY] }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  try {
    const body = await readJson(req);
    const { role, question, context } = buildContext(body);

    if (!question) return fail(res, 400, 'missing_question', 'A question is required.');

    const apiKey = GEMINI_API_KEY.value();
    if (!apiKey) {
      return fail(res, 503, 'ai_unconfigured', 'The AI assistant is not configured on this deployment.');
    }

    const systemPrompt = SYSTEM_PROMPTS[role] ?? SYSTEM_PROMPTS.buyer;
    const userPrompt = `${systemPrompt}\n\nContext:\n${context}\n\nQuestion: ${question}\n\nAnswer concisely in plain text, no markdown formatting.`;

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.3,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('gemini api error', { status: response.status, body: err });
      return fail(res, 502, 'ai_error', `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!answer) return fail(res, 502, 'ai_error', 'Gemini returned an empty response.');

    return res.status(200).json({ answer, role });
  } catch (error) {
    logger.error('ai chat failed', error);
    return fail(res, 500, 'ai_error', 'Could not get an AI response.');
  }
});

export { verifyPassword, hashPassword };
