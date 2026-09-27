import { describe, expect, test } from 'vitest';
import {
  DEFAULT_SPLIT,
  allocate,
  effectiveTakeRate,
  formatCedi,
  grossFromBuyerCharge,
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
    expect(result.sellerReceives).toBe(7000);
    expect(result.driverReceives).toBe(500);
    expect(result.buyerServiceCharge).toBe(1000);
    expect(result.platformCommission).toBe(2500);
    expect(result.companyTake).toBe(3500);
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
    // 35 of every 110 the buyer hands over = 31.82%.
    expect(effectiveTakeRate()).toBeCloseTo(31.818, 2);
  });

  test('a zero-fee plan has a take rate equal to its commission', () => {
    const noFee = { buyerServiceCharge: 0, seller: 70, driver: 5, platformCommission: 25 };
    expect(effectiveTakeRate(noFee)).toBeCloseTo(25, 6);
  });
});
