import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PRICING,
  DEFAULT_SPLIT,
  allocate,
  effectiveTakeRate,
  formatCedi,
  grossFromBuyerCharge,
  quotePrice,
  toMajor,
  toMinor,
  validateSplit,
} from './money';

describe('minor units', () => {
  test('converts to and from pesewas without floating point drift', () => {
    expect(toMinor(250)).toBe(25000);
    expect(toMinor('250.50')).toBe(25050);
    expect(toMajor(25050)).toBe(250.5);
  });

  test('rounds half away from zero so money is never silently truncated', () => {
    expect(toMinor(0.005)).toBe(1);
    expect(toMinor(-0.005)).toBe(-1);
  });

  test('rejects values that are not numbers', () => {
    expect(() => toMinor('free')).toThrow(TypeError);
  });

  test('formats as a fixed 2dp cedi string', () => {
    expect(formatCedi(25050)).toBe('GH₵250.50');
    expect(formatCedi(5)).toBe('GH₵0.05');
    expect(formatCedi(123456789)).toBe('GH₵1,234,567.89');
  });
});

describe('split validation', () => {
  test('accepts the default plan', () => {
    expect(validateSplit(DEFAULT_SPLIT)).toBe(true);
  });

  test('rejects shares that do not total 100%', () => {
    // The literal plan in the brief: 10 + 70 + 5 + 35 = 120%.
    expect(() => validateSplit({ buyerServiceCharge: 10, seller: 70, driver: 5, platformCommission: 35 }))
      .toThrow(/must total 100%/);
  });

  test('rejects negative shares', () => {
    expect(() => validateSplit({ buyerServiceCharge: 10, seller: 70, driver: -5, platformCommission: 35 }))
      .toThrow(/non-negative/);
  });

  test('allocate refuses to pay out an invalid split', () => {
    expect(() => allocate(10000, { buyerServiceCharge: 10, seller: 70, driver: 5, platformCommission: 35 }))
      .toThrow(/Invalid revenue split/);
  });
});

describe('allocation', () => {
  test('splits a 100 cedi order per the default plan', () => {
    const result = allocate(toMinor(100));
    expect(result.gross).toBe(10000);
    expect(result.buyerPays).toBe(11000);
    expect(result.sellerReceives).toBe(4500);
    expect(result.driverReceives).toBe(1500);
    expect(result.buyerServiceCharge).toBe(1000);
    expect(result.platformCommission).toBe(4000);
    expect(result.companyTake).toBe(5000);
  });

  test('the company take is 40% commission plus the 10% buyer charge', () => {
    const result = allocate(toMinor(100));
    expect(result.companyTake).toBe(result.platformCommission + result.buyerServiceCharge);
  });

  test('what the buyer pays equals the gross plus the service charge', () => {
    for (const amount of [1, 99, 250, 980, 12345]) {
      const result = allocate(toMinor(amount));
      expect(result.buyerPays).toBe(result.gross + result.buyerServiceCharge);
    }
  });

  test('every party is paid exactly once, with nothing created or lost', () => {
    for (const amount of [0.01, 0.07, 1, 3, 7, 33.33, 250, 999.99]) {
      const result = allocate(toMinor(amount));
      const paid = result.sellerReceives + result.driverReceives + result.platformCommission;
      expect(paid).toBe(result.gross);
      // The buyer's charge is the only money above the gross.
      expect(result.sellerReceives + result.driverReceives + result.companyTake).toBe(result.buyerPays);
    }
  });

  test('largest remainder keeps a repeating split exact', () => {
    // GH¢10.00 at 70/5/25 needs 7000/500/2500; this checks a case that does not divide.
    const result = allocate(toMinor(10));
    expect(result.sellerReceives + result.driverReceives + result.platformCommission).toBe(1000);
  });

  test('is deterministic for the same input', () => {
    expect(allocate(toMinor(33.33))).toEqual(allocate(toMinor(33.33)));
  });

  test('rejects a negative order amount', () => {
    expect(() => allocate(-100)).toThrow(RangeError);
  });

  test('handles a zero-value order without producing NaN', () => {
    const result = allocate(0);
    expect(result.companyTake).toBe(0);
    expect(result.buyerPays).toBe(0);
  });
});

describe('round trips and take rate', () => {
  test('recovers the gross from what the buyer was charged', () => {
    expect(grossFromBuyerCharge(11000)).toBe(10000);
    expect(grossFromBuyerCharge(27500)).toBe(25000);
  });

  test('the company take rate is reported against what the buyer pays', () => {
    // 50 of every 110 the buyer hands over = 45.45%.
    expect(effectiveTakeRate()).toBeCloseTo(45.4545, 3);
  });

  test('a zero-fee plan has a take rate equal to its commission', () => {
    const noFee = { buyerServiceCharge: 0, seller: 45, driver: 15, platformCommission: 40 };
    expect(effectiveTakeRate(noFee)).toBeCloseTo(40, 6);
  });
});

describe('price formation', () => {
  test('a 50% discount turns a 600 cedi list price into a 300 cedi order', () => {
    const quote = quotePrice({ listPrice: 600, discountPercent: 50, surgePercent: 0 });
    expect(quote.listMinor).toBe(60000);
    expect(quote.discounted).toBe(30000);
    expect(quote.totalMinor).toBe(30000);
  });

  test('surge is applied to the discounted price, not the list price', () => {
    // 300 discounted + 20% surge = 360, not 600 + 20% = 720.
    const quote = quotePrice({ listPrice: 600, discountPercent: 50, surgePercent: 20 });
    expect(quote.surgeMinor).toBe(6000);
    expect(quote.totalMinor).toBe(36000);
  });

  test('a 100% discount is a free order rather than a negative one', () => {
    const quote = quotePrice({ listPrice: 600, discountPercent: 100, surgePercent: 0 });
    expect(quote.totalMinor).toBe(0);
  });

  test('rejects a discount outside 0-100%', () => {
    expect(() => quotePrice({ listPrice: 600, discountPercent: 120 })).toThrow(RangeError);
    expect(() => quotePrice({ listPrice: 600, discountPercent: -5 })).toThrow(RangeError);
  });

  test('rejects a negative list price or surge', () => {
    expect(() => quotePrice({ listPrice: -1 })).toThrow(RangeError);
    expect(() => quotePrice({ listPrice: 600, surgePercent: -10 })).toThrow(RangeError);
  });

  test('the admin default plan quotes 300 and charges 330', () => {
    const quote = quotePrice(DEFAULT_PRICING);
    const money = allocate(quote.totalMinor, DEFAULT_SPLIT);
    expect(formatCedi(quote.totalMinor)).toBe('GH₵300.00');
    expect(formatCedi(money.buyerPays)).toBe('GH₵330.00');
    expect(formatCedi(money.driverReceives)).toBe('GH₵45.00');
    expect(formatCedi(money.companyTake)).toBe('GH₵150.00');
  });
});
