import { vi } from 'vitest';
import { DEFAULT_PRICING, DEFAULT_SPLIT, priceOrder } from '../functions/lib/pricing.js';

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
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    // Real Response objects have both. Code that calls `response.json()`
    // directly must not fail against the stub for a reason production does not
    // have.
    json: async () => JSON.parse(text),
  };
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
    // The client builds absolute Supabase URLs
    // (`https://<ref>.supabase.co/functions/v1/orders/create`) when a project is
    // configured, and first-party `/api/...` paths otherwise. The stub below is
    // written against the `/api/<route>` shape, so normalise here: drop the
    // Supabase origin and its `/functions/v1/` prefix, and the same route table
    // matches both. Without this, tests with a configured project bypass the
    // stub and hit the real backend.
    const normalised = String(url)
      .replace(/^https?:\/\/[^/]+\/functions\/v1\//, '/api/')
      .replace(/^https?:\/\/[^/]+\//, '/');
    const path = normalised.split('?')[0];
    // The route key is the segment right after `/api/` or `/functions/v1/`. The
    // client calls `/orders` (key) and the server expands it to
    // `/functions/v1/orders/create`, so match on the key, not the full path.
    const routeKey = path.replace(/^\/(api|functions\/v1)\//, '').split('/')[0];

    // The Supabase JS client talks to the PostgREST API itself
    // (`/rest/v1/<table>`) for inserts, updates and deletes. Tests mock the
    // client to null, but when it is not mocked the client fires these requests
    // and the stub has to answer them — otherwise every local commit 404s and
    // the order never lands in the list. Answer them as no-ops: the real
    // mutation already happened in localStorage, and Realtime is what would
    // propagate it to other clients. PostgREST returns an array of affected
    // rows, so return an empty array rather than an object — the client's
    // `.update().select()` chain expects an array and throws on a bare object.
    if (path.startsWith('/rest/v1/')) {
      return json([]);
    }

    if (routeKey === 'orders' && init.method === 'POST') {
      return json({ order: serverOrder(JSON.parse(init.body), currentPricing, currentSplit) }, 201);
    }
    if (routeKey === 'pricing' && init.method !== 'POST') {
      // Mirrors `apiPricing`: the stored config alongside the derived quote, so
      // the console has to pick the config to edit it. The client calls
      // `/pricing` (key) and the server expands it to `/pricing/price`, so
      // match on the key — matching the suffix only left this endpoint
      // unstubbed and the console showed the default price.
      return json({
        currency: 'GHS',
        pricing: currentPricing,
        split: currentSplit,
        quote: priceOrder({ pricing: currentPricing, split: currentSplit }),
      });
    }
    if (routeKey === 'pricing' && init.method === 'POST') {
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
    if ((path.endsWith('/api/ops/login') || path.endsWith('/ops/login')) && init.method === 'POST') {
      const body = JSON.parse(init.body);
      if (body.email !== OPS_EMAIL || body.password !== OPS_PASSWORD) {
        return json({ code: 'invalid_credentials', message: 'Those sign-in details are not correct.' }, 401);
      }
      OPS.set(body.email, true);
      return json({ token: OPS_TOKEN, email: OPS_EMAIL, expiresInSeconds: 28800 });
    }
    if ((path.endsWith('/api/sellers/apply') || path.endsWith('/sellers/apply')) && init.method === 'POST') {
      const body = JSON.parse(init.body);
      const applicationId = `app-${String(body.phone).replace(/\D/g, '').slice(-8)}`;
      SELLERS.set(applicationId, { ...body, applicationId, status: 'pending' });
      return json({ applicationId, status: 'pending' }, 201);
    }
    if (path.endsWith('/api/sellers/status') || path.endsWith('/sellers/status')) {
      const phone = new URL(String(url), 'http://test').searchParams.get('phone') ?? '';
      const id = `app-${phone.replace(/\D/g, '').slice(-8)}`;
      const seller = SELLERS.get(id);
      // Unknown numbers read as 'pending' rather than 404, matching the server so
      // this endpoint cannot be used to find out who has applied.
      return json({ status: seller?.status ?? 'pending' });
    }
    if (path.endsWith('/api/sellers/applications') || path.endsWith('/sellers/applications')) {
      if (!authorised(init)) {
        return json({ code: 'not_authorised', message: 'Sign in as an operator to do that.' }, 401);
      }
      const status = new URL(String(url), 'http://test').searchParams.get('status') ?? 'pending';
      const applications = [...SELLERS.values()]
        .filter((seller) => seller.status === status)
        .map((seller) => ({
          applicationId: seller.applicationId,
          business: seller.business,
          phone: seller.phone,
          vehicle: seller.vehicle,
          capacity: seller.capacity,
          status: seller.status,
          reviewedBy: null,
        }));
      return json({ applications, status, count: applications.length });
    }
    if ((path.endsWith('/api/sellers/review') || path.endsWith('/sellers/review')) && init.method === 'POST') {
      if (!authorised(init)) {
        return json({ code: 'not_authorised', message: 'Sign in as an operator to do that.' }, 401);
      }
      const body = JSON.parse(init.body);
      const seller = SELLERS.get(body.applicationId);
      if (!seller) return json({ code: 'application_not_found', message: 'That application does not exist.' }, 404);
      seller.status = body.decision === 'approve' ? 'approved' : 'rejected';
      return json({ applicationId: body.applicationId, status: seller.status });
    }
    if (path.endsWith('/api/payments/initialize') || path.endsWith('/payments/initialize')) {
      return json({ error: 'not_used_in_these_tests', message: 'not stubbed' }, 501);
    }
    if (path.includes('/api/payments/verify') || path.includes('/payments/verify')) {
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

/** Put an application in the queue without going through the seller form. */
export function seedSellerApplication({ applicationId, business, phone, vehicle, capacity, status = 'pending' }) {
  SELLERS.set(applicationId, { applicationId, business, phone, vehicle, capacity, status });
  return applicationId;
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
