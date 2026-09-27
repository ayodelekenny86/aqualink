import { describe, expect, test } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  DEFAULT_PRICING,
  DEFAULT_SPLIT,
  allocate,
  checkSettlement,
  newReference,
  normaliseMsisdn,
  priceOrder,
  quotePrice,
  validateSplit,
  verifyPaystackSignature,
} from './index.js';

/**
 * These tests cover the two things a payment integration can silently get wrong:
 * a signature check that accepts anything, and a settlement check that accepts
 * the wrong amount. Both run here with no emulator and no network.
 */

const ORDER = {
  id: 'AQ-1048-2',
  chargedMinor: 33000, // GH¢330.00
  paystackReference: 'aq10482-9f2c1b7a4e6d8c0b1a2c3d4e5f60718',
  status: 'Confirmed',
};

const SUCCESS = {
  status: 'success',
  reference: ORDER.paystackReference,
  amount: ORDER.chargedMinor,
  currency: 'GHS',
  paid_at: '2026-09-27T10:00:00Z',
};

describe('webhook signature', () => {
  const SECRET = 'sk_test_deadbeef';

  function sign(body) {
    return createHmac('sha512', SECRET).update(body).digest('hex');
  }

  test('accepts a signature Paystack would produce', () => {
    const body = JSON.stringify({ event: 'charge.success' });
    expect(verifyPaystackSignature(body, sign(body), SECRET)).toBe(true);
  });

  test('accepts a signature computed over raw bytes, not a re-serialised string', () => {
    // Key order and spacing differ from a naive re-serialisation; the raw buffer
    // is what must be verified, so a Buffer input must work identically.
    const raw = Buffer.from('{"event":"charge.success","data":{"id":1}}', 'utf8');
    expect(verifyPaystackSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  test('rejects a tampered body', () => {
    const original = JSON.stringify({ event: 'charge.success' });
    const signature = sign(original);
    expect(verifyPaystackSignature(`${original} `, signature, SECRET)).toBe(false);
  });

  test('rejects a signature made with a different secret', () => {
    const body = JSON.stringify({ event: 'charge.success' });
    const forged = createHmac('sha512', 'sk_live_someone_elses_key').update(body).digest('hex');
    expect(verifyPaystackSignature(body, forged, SECRET)).toBe(false);
  });

  test('rejects an empty or malformed signature without throwing', () => {
    const body = 'x';
    expect(verifyPaystackSignature(body, '', SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, null, SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, 'short', SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, undefined, SECRET)).toBe(false);
  });

  test('fails closed when no secret is configured', () => {
    // A missing secret must never mean "accept everything".
    expect(verifyPaystackSignature('x', 'a'.repeat(128), '')).toBe(false);
    expect(verifyPaystackSignature('x', 'a'.repeat(128), undefined)).toBe(false);
  });
});

describe('settlement decision', () => {
  test('settles when the provider record matches the stored order exactly', () => {
    const result = checkSettlement({ transaction: SUCCESS, order: ORDER });
    expect(result.settled).toBe(true);
    expect(result.reason).toBe('settled');
    expect(result.paidAt).toBe('2026-09-27T10:00:00Z');
  });

  test('refuses a payment smaller than the order', () => {
    // The attack this blocks: create a GH¢1.00 transaction, then present it as
    // payment for a GH¢330.00 order.
    const result = checkSettlement({ transaction: { ...SUCCESS, amount: 100 }, order: ORDER });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('amount_mismatch');
  });

  test('refuses a payment larger than the order too', () => {
    // Overpayment is not settled either; it needs a refund, not a silent pass.
    const result = checkSettlement({ transaction: { ...SUCCESS, amount: 99000 }, order: ORDER });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('amount_mismatch');
  });

  test('refuses a non-integer amount rather than rounding it into agreement', () => {
    const result = checkSettlement({ transaction: { ...SUCCESS, amount: 33000.4 }, order: ORDER });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('amount_mismatch');
  });

  test('refuses a successful payment belonging to a different order', () => {
    // Replay guard: any real successful charge, for any amount, must not be
    // usable to settle this order.
    const result = checkSettlement({
      transaction: { ...SUCCESS, reference: 'aq9999-00000000000000000000000000000000' },
      order: ORDER,
    });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('reference_mismatch');
  });

  test('refuses an order that has no reference to match against', () => {
    const result = checkSettlement({ transaction: SUCCESS, order: { ...ORDER, paystackReference: null } });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('reference_mismatch');
  });

  for (const status of ['failed', 'pending', 'abandoned', 'reversed', 'unknown']) {
    test(`refuses provider status "${status}"`, () => {
      const result = checkSettlement({ transaction: { ...SUCCESS, status }, order: ORDER });
      expect(result.settled).toBe(false);
      expect(result.reason).toBe(`provider_status_${status}`);
    });
  }

  test('is case-insensitive about the provider status', () => {
    expect(checkSettlement({ transaction: { ...SUCCESS, status: 'SUCCESS' }, order: ORDER }).settled).toBe(true);
  });

  test('refuses a different currency', () => {
    const result = checkSettlement({ transaction: { ...SUCCESS, currency: 'NGN' }, order: ORDER });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('currency_mismatch');
  });

  test('refuses to re-settle a refunded order', () => {
    const result = checkSettlement({ transaction: SUCCESS, order: { ...ORDER, status: 'refunded' } });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('already_refunded');
  });

  test('refuses an order whose stored amount is missing or nonsensical', () => {
    expect(checkSettlement({ transaction: SUCCESS, order: { ...ORDER, chargedMinor: null } }).reason).toBe('order_amount_invalid');
    expect(checkSettlement({ transaction: SUCCESS, order: { ...ORDER, chargedMinor: -1 } }).reason).toBe('order_amount_invalid');
    expect(checkSettlement({ transaction: SUCCESS, order: { ...ORDER, chargedMinor: 330.5 } }).reason).toBe('order_amount_invalid');
  });

  test('refuses a missing transaction or order rather than defaulting to success', () => {
    expect(checkSettlement({ transaction: null, order: ORDER }).settled).toBe(false);
    expect(checkSettlement({ transaction: SUCCESS, order: null }).settled).toBe(false);
    expect(checkSettlement({}).settled).toBe(false);
  });
});

describe('references', () => {
  test('embeds a recognisable order code and stays unguessable', () => {
    const reference = newReference('AQ-1048-2');
    expect(reference.startsWith('aq10482-')).toBe(true);
    // 16 hex chars of entropy, so a reference cannot be enumerated.
    expect(reference.split('-')[1]).toMatch(/^[0-9a-f]{16}$/);
  });

  test('never repeats, even for the same order code', () => {
    const seen = new Set(Array.from({ length: 500 }, () => newReference('AQ-1048-2')));
    expect(seen.size).toBe(500);
  });

  test('survives a code made entirely of unusable characters', () => {
    expect(() => newReference('---///')).not.toThrow();
    expect(newReference('---///').startsWith('aq-')).toBe(true);
    expect(newReference(null)).toMatch(/^aq-[0-9a-f]{16}$/);
  });
});

describe('MSISDN normalisation', () => {
  test('converts the local formats a Ghanaian customer would actually type', () => {
    expect(normaliseMsisdn('0240000000')).toBe('+233240000000');
    expect(normaliseMsisdn('0540000000')).toBe('+233540000000');
    expect(normaliseMsisdn('233240000000')).toBe('+233240000000');
    expect(normaliseMsisdn('+233240000000')).toBe('+233240000000');
  });

  test('rejects a number that is not a Ghanaian mobile number', () => {
    expect(normaliseMsisdn('1234567890')).toBeNull();
    expect(normaliseMsisdn('+12025550123')).toBeNull();
    expect(normaliseMsisdn('')).toBeNull();
    expect(normaliseMsisdn(null)).toBeNull();
  });
});

describe('server-side pricing', () => {
  test('produces the documented default quote', () => {
    // GH¢600 list, 50% off = GH¢300, plus 10% service charge = GH¢330.
    const priced = priceOrder({});
    expect(priced.grossMinor).toBe(30000);
    expect(priced.chargedMinor).toBe(33000);
    expect(priced.sellerReceives).toBe(13500);
    expect(priced.driverReceives).toBe(4500);
    expect(priced.platformCommission).toBe(12000);
    // Platform 40% of 30000 = 12000, plus the 10% service charge of 3000.
    expect(priced.companyTake).toBe(15000);
  });

  test('allocates every pesewa, with no residue', () => {
    for (let gross = 1; gross <= 500; gross += 1) {
      const parts = allocate(gross, DEFAULT_SPLIT);
      const sum = parts.sellerReceives + parts.driverReceives + parts.platformCommission;
      expect(sum).toBe(gross);
    }
  });

  test('the parts plus the service charge equal what the buyer pays', () => {
    const parts = allocate(30000, DEFAULT_SPLIT);
    expect(parts.sellerReceives + parts.driverReceives + parts.platformCommission + parts.buyerServiceCharge)
      .toBe(parts.buyerPays);
  });

  test('refuses a split that does not total 100%', () => {
    expect(() => validateSplit({ ...DEFAULT_SPLIT, driver: 30 })).toThrow(/total 100%/);
    expect(() => validateSplit({ ...DEFAULT_SPLIT, seller: -5 })).toThrow(/non-negative/);
  });

  test('applies surge on top of the discounted price', () => {
    const quote = quotePrice({ ...DEFAULT_PRICING, surgePercent: 20 });
    expect(quote.discounted).toBe(30000);
    expect(quote.surgeMinor).toBe(6000);
    expect(quote.totalMinor).toBe(36000);
  });

  test('rejects a discount outside 0-100%', () => {
    expect(() => quotePrice({ ...DEFAULT_PRICING, discountPercent: 120 })).toThrow(/between 0% and 100%/);
  });
});
