import { describe, expect, test } from 'vitest';
import {
  validateRating,
  computeAverages,
  computeDistribution,
  RATING_CATEGORIES,
  enrichOrdersWithRatings,
  createRating,
  getRatings,
} from './ratings';

const valid = (overrides = {}) => ({
  orderId: 'AQ-1',
  buyerId: 'buyer_1',
  sellerId: 'seller_1',
  driverId: 'driver_1',
  overall: 5,
  ...overrides,
});

describe('validateRating', () => {
  test('accepts a complete rating', () => {
    const r = validateRating(valid());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  test('rejects missing fields', () => {
    const r = validateRating({ overall: 5 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('Order ID is required');
    expect(r.errors).toContain('Buyer ID is required');
    expect(r.errors).toContain('Seller ID is required');
    expect(r.errors).toContain('Driver ID is required');
  });

  test('rejects overall outside 1-5', () => {
    expect(validateRating(valid({ overall: 0 })).valid).toBe(false);
    expect(validateRating(valid({ overall: 6 })).valid).toBe(false);
  });

  test('rejects out-of-range category scores', () => {
    const r = validateRating(valid({ timeliness: 9 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('On-time delivery'))).toBe(true);
  });

  test('rejects overly long comments', () => {
    const r = validateRating(valid({ comment: 'x'.repeat(1001) }));
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('Comment must be 1000 characters or less');
  });
});

describe('computeAverages', () => {
  test('returns null for an empty list', () => {
    expect(computeAverages([])).toBe(null);
  });

  test('averages every category independently', () => {
    const ratings = [
      { overall: 5, timeliness: 5, communication: 4, water_quality: 3, professionalism: 5 },
      { overall: 3, timeliness: 3, communication: 2, water_quality: 4, professionalism: 4 },
    ];
    const avgs = computeAverages(ratings);
    expect(avgs.overall).toBe(4);
    expect(avgs.timeliness).toBe(4);
    expect(avgs.communication).toBe(3);
    expect(avgs.water_quality).toBe(3.5);
    expect(avgs.professionalism).toBe(4.5);
    expect(avgs.total).toBe(2);
  });

  test('ignores missing category scores rather than treating them as zero', () => {
    const avgs = computeAverages([{ overall: 5 }]);
    expect(avgs.overall).toBe(5);
    expect(avgs.timeliness).toBe(null);
    expect(avgs.total).toBe(1);
  });
});

describe('computeDistribution', () => {
  test('counts each star bucket', () => {
    const dist = computeDistribution([
      { overall: 5 },
      { overall: 5 },
      { overall: 3 },
      { overall: 1 },
    ]);
    expect(dist).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0, 5: 2 });
  });

  test('ignores non-numeric overall scores', () => {
    const dist = computeDistribution([{ overall: 'five' }, { overall: 4 }]);
    expect(dist).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 });
  });
});

describe('RATING_CATEGORIES', () => {
  test('includes overall plus four breakdown dimensions', () => {
    expect(RATING_CATEGORIES).toHaveLength(5);
    expect(RATING_CATEGORIES.map((c) => c.id)).toEqual([
      'overall',
      'timeliness',
      'communication',
      'water_quality',
      'professionalism',
    ]);
  });
});

describe('enrichOrdersWithRatings', () => {
  test('stamps each order with the rating it received, if any', async () => {
    await createRating({ orderId: 'A1', buyerId: 'b', sellerId: 's', driverId: 'd', overall: 5 });
    const orders = [{ id: 'A1' }, { id: 'A2' }];
    const enriched = await enrichOrdersWithRatings(orders);
    expect(enriched[0].rating).toBe(5);
    expect(enriched[1].rating).toBe(null);
  });

  test('returns the same array when no orders are passed', async () => {
    const enriched = await enrichOrdersWithRatings([]);
    expect(enriched).toEqual([]);
  });
});

describe('createRating', () => {
  test('returns ok with the stored rating', async () => {
    const result = await createRating({ orderId: 'A1', buyerId: 'b', sellerId: 's', driverId: 'd', overall: 4 });
    expect(result.ok).toBe(true);
    expect(result.rating.orderId).toBe('A1');
    expect(result.rating.id).toBeTruthy();
    expect(result.rating.createdAt).toBeTruthy();
  });

  test('returns validation errors when fields are missing', async () => {
    const result = await createRating({ overall: 5 });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Order ID is required');
  });

  test('persists to the local collection', async () => {
    await createRating({ orderId: 'A1', buyerId: 'b', sellerId: 's', driverId: 'd', overall: 3 });
    const all = await getRatings();
    expect(all).toHaveLength(1);
    expect(all[0].overall).toBe(3);
  });
});