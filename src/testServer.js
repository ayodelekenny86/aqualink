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

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
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

  const mock = vi.fn(async (url, init = {}) => {
    const path = String(url).split('?')[0];

    if (path.endsWith('/api/orders') && init.method === 'POST') {
      return json({ order: serverOrder(JSON.parse(init.body), pricing, split) }, 201);
    }
    if (path.endsWith('/api/pricing')) {
      return json({ quote: priceOrder({ pricing, split }) });
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

export function stubbedOrders() {
  return [...ORDERS.values()];
}

export function teardownFakeApi() {
  vi.unstubAllGlobals();
  ORDERS.clear();
}
