import { describe, expect, test } from 'vitest';
import * as server from '../../functions/lib/pricing.js';
import * as client from './money.js';

/**
 * The business rule, and the fact that two copies of it exist.
 *
 * `src/lib/money.js` is shipped to every browser and `functions/lib/pricing.js`
 * runs on the server that does the actual charging. They are separate files on
 * purpose: a modified browser must not be able to decide the price. But that
 * means the two can drift, and a drift here is a customer being quoted one
 * figure and charged another.
 *
 * These tests pin both halves: that the customer pays GH¢300, and that the two
 * implementations agree.
 */

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

describe('the client and server pricing copies cannot drift apart', () => {
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

  test('the default config is identical in both files', () => {
    expect(client.DEFAULT_SPLIT).toEqual(server.DEFAULT_SPLIT);
    expect(client.DEFAULT_PRICING).toEqual(server.DEFAULT_PRICING);
  });

  test('raising a service charge would break the rule, so the default stays at zero', () => {
    // Documented behaviour for whoever configures pricing next: setting a fee
    // makes the charged amount exceed the advertised discounted price, which is
    // exactly what the 10% charge used to do.
    const withFee = server.allocate(30000, { ...server.DEFAULT_SPLIT, buyerServiceCharge: 10 });
    expect(withFee.buyerPays).toBeGreaterThan(30000);
    expect(server.DEFAULT_SPLIT.buyerServiceCharge).toBe(0);
  });
});
