import { describe, expect, test } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { enrichOrdersWithRatings, createRating, getRatings } from './ratings';
import { list, replaceAll, insert } from './collections';

function reset() {
  replaceAll('ratings', []);
}

describe('enrichOrdersWithRatings', () => {
  test('stamps each order with the rating it received, if any', async () => {
    reset();
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
    reset();
    const result = await createRating({ orderId: 'A1', buyerId: 'b', sellerId: 's', driverId: 'd', overall: 4 });
    expect(result.ok).toBe(true);
    expect(result.rating.orderId).toBe('A1');
    expect(result.rating.id).toBeTruthy();
    expect(result.rating.createdAt).toBeTruthy();
  });

  test('returns validation errors when fields are missing', async () => {
    reset();
    const result = await createRating({ overall: 5 });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Order ID is required');
  });

  test('persists to the local collection', async () => {
    reset();
    await createRating({ orderId: 'A1', buyerId: 'b', sellerId: 's', driverId: 'd', overall: 3 });
    const all = await getRatings();
    expect(all).toHaveLength(1);
    expect(all[0].overall).toBe(3);
  });
});