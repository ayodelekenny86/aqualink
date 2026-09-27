import { vi } from 'vitest';
import { DEFAULT_PRICING, DEFAULT_SPLIT, priceOrder } from '../functions/lib/index.js';

/**
 * Stubs the AquaLink server for tests.
 *
 * The booking flow now creates its order server-side, because the server owns
 * the price, so tests need something to talk to. This stub prices with the real
 * `functions/lib/pricing` module rather than hardcoded numbers, so if the
 * pricing rules change the stub follows them instead of quietly disagreeing
 * with production.
 */

const ORDERS = new Map();
const SELLERS = new Map();
const OPS = new Map();

/**
 * The operator credentials the stub accepts.
 *
 * Kept explicit rather than derived so a test can prove the client refuses to
 * publish when the server rejects the sign-in.
 */
const OPS_EMAIL = 'ops@aqualink.gh';
const OPS_PASSWORD = 'ops-test-password-42';
const OPS_TOKEN = 'test.ops.token';

let currentPricing = DEFAULT_PRICING;
let currentSplit = DEFAULT_SPLIT;

/**
 * Exported so tests sign in with the credential the stub actually accepts.
 * Duplicating it in the test file is how a stub and its test drift apart and the
 * suite passes against a sign-in path that would fail in production.
 */
export const STUB_OPS_CREDENTIALS = { email: OPS_EMAIL, password: OPS_PASSWORD };

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function authorised(init) {
  const header = init.headers?.Authorization ?? init.headers?.authorization ?? '';
  return header === `Bearer ${OPS_TOKEN}`;
}

/** The order shape the server returns, matching `apiCreateOrder`. */
function serverOrder(body, pricing = DEFAULT_PRICING, split = DEFAULT_SPLIT) {
  const volumeGallons = Number.parseInt(String(body.volume ?? '2,000'), 10) || 0;
  const volumeLitres = Math.round(volumeGallons * 3.785411784);
  const priced = priceOrder({ pricing, split, volumeLitres });

  const id = `AQ-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
  const order = {
    id,
    code: id,
    email: body.email,
    phone: body.phone,
    location: body.location,
    volumeLitres,
    currency: 'GHS',
    pricing,
    split,
    listMinor: priced.listMinor,
    grossMinor: priced.grossMinor,
    chargedMinor: priced.chargedMinor,
    buyerServiceCharge: priced.buyerServiceCharge,
    sellerReceives: priced.sellerReceives,
    driverReceives: priced.driverReceives,
    platformCommission: priced.platformCommission,
    companyTake: priced.companyTake,
    discountMinor: priced.discountMinor,
    surgeMinor: priced.surgeMinor,
    status: 'Awaiting payment',
  };
  ORDERS.set(id, order);
  return order;
}

/**
 * Install the stub. `pricing` can be varied per test to exercise admin
 * discounts and surge without touching the module.
 *
 * Returns the fetch mock so a test can assert on what the client sent, which is
 * how we prove the browser never names its own amount.
 */
export function installFakeApi({ pricing = DEFAULT_PRICING, split = DEFAULT_SPLIT } = {}) {
  ORDERS.clear();
  SELLERS.clear();
  OPS.clear();
  currentPricing = pricing;
  currentSplit = split;

  const mock = vi.fn(async (url, init = {}) => {
    const path = String(url).split('?')[0];

    if (path.endsWith('/api/orders') && init.method === 'POST') {
      return json({ order: serverOrder(JSON.parse(init.body), currentPricing, currentSplit) }, 201);
    }
    if (path.endsWith('/api/pricing')) {
      return json({ quote: priceOrder({ pricing: currentPricing, split: currentSplit }), split: currentSplit });
    }
    if (path.endsWith('/api/pricing/update')) {
      // Mirrors the real handler: a request without a valid operator token is
      // rejected, so a test cannot pass by skipping sign-in.
      if (!authorised(init)) {
        return json({ code: 'not_authorised', message: 'Sign in as an operator to do that.' }, 401);
      }
      const body = JSON.parse(init.body);
      currentPricing = { ...currentPricing, ...(body.pricing ?? {}) };
      currentSplit = { ...currentSplit, ...(body.split ?? {}) };
      return json({ pricing: currentPricing, split: currentSplit });
    }
    if (path.endsWith('/api/ops/login') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      if (body.email !== OPS_EMAIL || body.password !== OPS_PASSWORD) {
        return json({ code: 'invalid_credentials', message: 'Those sign-in details are not correct.' }, 401);
      }
      OPS.set(body.email, true);
      return json({ token: OPS_TOKEN, email: OPS_EMAIL, expiresInSeconds: 28800 });
    }
    if (path.endsWith('/api/sellers/apply') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      const applicationId = `app-${String(body.phone).replace(/\D/g, '').slice(-8)}`;
      SELLERS.set(applicationId, { ...body, status: 'pending' });
      return json({ applicationId, status: 'pending' }, 201);
    }
    if (path.endsWith('/api/sellers/status')) {
      const phone = new URL(String(url), 'http://test').searchParams.get('phone') ?? '';
      const id = `app-${phone.replace(/\D/g, '').slice(-8)}`;
      const seller = SELLERS.get(id);
      // Unknown numbers read as 'pending' rather than 404, matching the server so
      // this endpoint cannot be used to find out who has applied.
      return json({ status: seller?.status ?? 'pending' });
    }
    if (path.endsWith('/api/sellers/review') && init.method === 'POST') {
      if (!authorised(init)) {
        return json({ code: 'not_authorised', message: 'Sign in as an operator to do that.' }, 401);
      }
      const body = JSON.parse(init.body);
      const seller = SELLERS.get(body.applicationId);
      if (!seller) return json({ code: 'application_not_found', message: 'That application does not exist.' }, 404);
      seller.status = body.decision === 'approve' ? 'approved' : 'rejected';
      return json({ applicationId: body.applicationId, status: seller.status });
    }
    if (path.endsWith('/api/payments/initialize')) {
      return json({ error: 'not_used_in_these_tests', message: 'not stubbed' }, 501);
    }
    if (path.includes('/api/payments/verify')) {
      return json({ settled: false, status: 'pending', reason: 'not_stubbed' });
    }
    return json({ error: 'not_found', message: `no stub for ${path}` }, 404);
  });

  vi.stubGlobal('fetch', mock);
  return mock;
}

/** Record an operator decision, as `apiReviewSeller` would. */
export function reviewSellerApplication(applicationId, decision) {
  const seller = SELLERS.get(applicationId);
  if (seller) seller.status = decision === 'approve' ? 'approved' : 'rejected';
  return seller;
}

/** The pricing the stub is currently serving, i.e. what a real order would be charged. */
export function livePricing() {
  return { pricing: currentPricing, split: currentSplit };
}

export function stubbedOrders() {
  return [...ORDERS.values()];
}

export function teardownFakeApi() {
  vi.unstubAllGlobals();
  ORDERS.clear();
  SELLERS.clear();
  OPS.clear();
}
