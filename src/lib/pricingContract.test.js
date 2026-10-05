import { describe, expect, test } from 'vitest';
import * as server from '../../functions/lib/pricing.js';
import * as edge from '../../supabase/functions/_lib/pricing.ts';
import * as client from './money.js';

/**
 * The business rule, and the fact that three copies of it exist.
 *
 * `src/lib/money.js` is shipped to every browser, `functions/lib/pricing.js` runs
 * on the Firebase functions, and `supabase/functions/_lib/pricing.ts` runs on the
 * Supabase Edge Functions that do the actual charging today. They are separate
 * files on purpose: a modified browser must not be able to decide the price. But
 * that means they can drift, and a drift here is a customer being quoted one figure
 * and charged another.
 *
 * These tests pin both halves: that the customer pays GH¢300, and that all three
 * implementations agree.
 *
 * The third copy used to be outside this file. It had already drifted — its
 * `quotePrice` had lost the three range guards the others kept — and nothing
 * noticed, because the only tests that ran against pricing arithmetic covered the
 * client and the Firebase copy. The copy nobody tested was the one charging money.
 */

const COPIES = [
  ['client (src/lib/money.js)', client],
  ['firebase server (functions/lib/pricing.js)', server],
  ['supabase edge (supabase/functions/_lib/pricing.ts)', edge],
];

describe('the customer pays GH¢300, inclusive of the 50% discount', () => {
  test('the server charges 300, not 330', () => {
    const priced = server.priceOrder({});
    expect(priced.listMinor).toBe(60000);
    expect(priced.grossMinor).toBe(30000);
    expect(priced.chargedMinor).toBe(30000);
    // The fee that used to make this 330.
    expect(priced.buyerServiceCharge).toBe(0);
  });

  test('the browser quotes the same 300 the server charges', () => {
    const quote = client.quotePrice(client.DEFAULT_PRICING);
    const parts = client.allocate(quote.totalMinor, client.DEFAULT_SPLIT);
    expect(parts.buyerPays).toBe(30000);
  });

  test('the 300 reconciles across seller, driver and platform with nothing left over', () => {
    const { chargedMinor, sellerReceives, driverReceives, platformCommission } = server.priceOrder({});
    expect(sellerReceives + driverReceives + platformCommission).toBe(chargedMinor);
  });
});

describe('every copy of the pricing arithmetic agrees, to the pesewa', () => {
  const priced = server.priceOrder({});
  const clientQuote = client.quotePrice(client.DEFAULT_PRICING);
  const clientParts = client.allocate(clientQuote.totalMinor, client.DEFAULT_SPLIT);

  const PAIRS = [
    ['list price', priced.listMinor, clientQuote.listMinor],
    ['discounted value', priced.grossMinor, clientQuote.discounted],
    ['customer pays', priced.chargedMinor, clientParts.buyerPays],
    ['service charge', priced.buyerServiceCharge, clientParts.buyerServiceCharge],
    ['seller share', priced.sellerReceives, clientParts.sellerReceives],
    ['driver share', priced.driverReceives, clientParts.driverReceives],
    ['platform share', priced.platformCommission, clientParts.platformCommission],
    ['company take', priced.companyTake, clientParts.companyTake],
  ];

  for (const [label, serverValue, clientValue] of PAIRS) {
    test(`${label} agrees on both sides`, () => {
      expect(clientValue).toBe(serverValue);
    });
  }

  test('the default config is identical in all three files', () => {
    for (const [name, copy] of COPIES) {
      expect(`${name} split: ${JSON.stringify(copy.DEFAULT_SPLIT)}`).toBe(
        `${name} split: ${JSON.stringify(server.DEFAULT_SPLIT)}`,
      );
      expect(`${name} pricing: ${JSON.stringify(copy.DEFAULT_PRICING)}`).toBe(
        `${name} pricing: ${JSON.stringify(server.DEFAULT_PRICING)}`,
      );
    }
  });

  /**
   * The drift that actually happened, pinned so it cannot happen quietly again.
   *
   * `quotePrice` rejected out-of-range pricing on two copies and silently computed
   * it on the third. Each case below must throw on every copy; only the range
   * validation is under test, since the arithmetic below is already pinned above.
   */
  const OUT_OF_RANGE = [
    ['a negative list price', { listPrice: -1 }],
    ['a discount over 100%', { listPrice: 600, discountPercent: 150 }],
    ['a negative discount', { listPrice: 600, discountPercent: -10 }],
    ['negative surge', { listPrice: 600, discountPercent: 50, surgePercent: -20 }],
  ];

  for (const [description, pricing] of OUT_OF_RANGE) {
    test(`every copy rejects ${description} rather than quoting it`, () => {
      for (const [name, copy] of COPIES) {
        expect(`${name}: ${(() => {
          try {
            copy.quotePrice(pricing);
            return 'no error';
          } catch (error) {
            return error.constructor.name;
          }
        })()}`).toBe(`${name}: RangeError`);
      }
    });
  }

  test('raising a service charge would break the rule, so the default stays at zero', () => {
    // Documented behaviour for whoever configures pricing next: setting a fee
    // makes the charged amount exceed the advertised discounted price, which is
    // exactly what the 10% charge used to do.
    const withFee = server.allocate(30000, { ...server.DEFAULT_SPLIT, buyerServiceCharge: 10 });
    expect(withFee.buyerPays).toBeGreaterThan(30000);
    expect(server.DEFAULT_SPLIT.buyerServiceCharge).toBe(0);
  });
});
