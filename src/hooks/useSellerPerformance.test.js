import { describe, expect, test } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { scoreSeller, useSellerPerformance } from './useSellerPerformance';

const delivered = (sellerId, opts = {}) => ({
  status: 'Delivered',
  sellerId,
  sellerName: sellerId,
  volume: '2,000 gallons',
  sellerReceives: 45000,
  assignedAt: opts.assignedAt || '2026-09-20T08:00:00Z',
  deliveredAt: opts.deliveredAt || '2026-09-20T12:00:00Z',
});

describe('scoreSeller', () => {
  test('returns null when a seller has no orders', () => {
    expect(scoreSeller([], 'ghost')).toBe(null);
  });

  test('scores a reliable seller highly', () => {
    const orders = [
      delivered('s1'),
      delivered('s1'),
      delivered('s1'),
    ];
    const s = scoreSeller(orders, 's1');
    expect(s.orders).toBe(3);
    expect(s.completed).toBe(3);
    expect(s.completionRate).toBe(100);
    expect(s.cancellationRate).toBe(0);
    expect(s.score).toBeGreaterThanOrEqual(90);
    expect(s.band.label).toBe('Excellent');
  });

  test('completion and cancellation rates move the score', () => {
    const orders = [
      delivered('s2'),
      { status: 'Cancelled', sellerId: 's2', volume: '1,000 gallons', sellerReceives: 25000 },
      { status: 'Cancelled', sellerId: 's2', volume: '1,000 gallons', sellerReceives: 25000 },
    ];
    const s = scoreSeller(orders, 's2');
    expect(s.orders).toBe(3);
    expect(s.completed).toBe(1);
    expect(s.completionRate).toBe(33);
    expect(s.cancellationRate).toBe(67);
    expect(s.score).toBeLessThan(75);
  });

  test('on-time rate rewards deliveries completed within 24h', () => {
    const onTime = delivered('s3', { deliveredAt: '2026-09-20T20:00:00Z' });
    const late = delivered('s3', { assignedAt: '2026-09-20T08:00:00Z', deliveredAt: '2026-09-21T12:00:00Z' });
    const s = scoreSeller([onTime, late], 's3');
    expect(s.onTimeRate).toBe(50);
  });

  test('volume and revenue are normalised against the best performer', () => {
    const big = { ...delivered('big'), volume: '5,000 gallons', sellerReceives: 120000 };
    const small = { ...delivered('small'), volume: '1,000 gallons', sellerReceives: 20000 };
    const bigScore = scoreSeller([big, small], 'big');
    const smallScore = scoreSeller([big, small], 'small');
    expect(bigScore.volumeDelivered).toBe(5000);
    expect(smallScore.volumeDelivered).toBe(1000);
    expect(bigScore.score).toBeGreaterThan(smallScore.score);
  });

  test('sellerName fallback works when sellerId is absent', () => {
    const name = "Joe's Depot";
    const orders = [{ status: 'Delivered', sellerName: name, volume: '1,000 gallons', sellerReceives: 25000 }];
    const s = scoreSeller(orders, name);
    expect(s).not.toBe(null);
    expect(s.sellerId).toBe(name);
  });

  test('buyer ratings raise the score', () => {
    const rated = { ...delivered('rated'), rating: 5 };
    const unrated = { ...delivered('unrated') };
    const ratedScore = scoreSeller([rated, unrated], 'rated').score;
    const unratedScore = scoreSeller([unrated], 'unrated').score;
    expect(ratedScore).toBeGreaterThan(unratedScore);
  });

  test('averageRating is null when no orders carry a rating', () => {
    const s = scoreSeller([delivered('s1')], 's1');
    expect(s.averageRating).toBe(null);
    expect(s.ratedCount).toBe(0);
  });

  test('averageRating is the mean of delivered orders with a rating', () => {
    const orders = [
      { ...delivered('s1'), rating: 4 },
      { ...delivered('s1'), rating: 5 },
      { ...delivered('s1') },
    ];
    const s = scoreSeller(orders, 's1');
    expect(s.averageRating).toBe(4.5);
    expect(s.ratedCount).toBe(2);
  });
});

describe('useSellerPerformance', () => {
  test('empty order list yields no sellers', () => {
    const { result } = renderHook(() => useSellerPerformance({ orders: [] }));
    expect(result.current.summary).toBe(null);
    expect(result.current.ranked).toEqual([]);
  });

  test('ranks sellers by score descending', () => {
    const orders = [
      delivered('top'),
      delivered('top'),
      delivered('top'),
      delivered('bottom'),
      { status: 'Cancelled', sellerId: 'bottom', volume: '1,000 gallons', sellerReceives: 25000 },
    ];
    const { result } = renderHook(() => useSellerPerformance({ orders }));
    expect(result.current.ranked[0].sellerId).toBe('top');
    expect(result.current.ranked[1].sellerId).toBe('bottom');
    expect(result.current.ranked[0].rank).toBe(1);
    expect(result.current.ranked[1].rank).toBe(2);
  });

  test('summary exposes flagged sellers below the watch threshold', () => {
    const good = delivered('good');
    const weak = { ...delivered('weak'), volume: '500 litres', sellerReceives: 5000 };
    const orders = [
      good, good, good,
      weak,
      { status: 'Cancelled', sellerId: 'weak', volume: '1,000 gallons', sellerReceives: 25000 },
      { status: 'Cancelled', sellerId: 'weak', volume: '1,000 gallons', sellerReceives: 25000 },
    ];
    const { result } = renderHook(() => useSellerPerformance({ orders }));
    expect(result.current.summary.totalSellers).toBe(2);
    expect(result.current.summary.flaggedCount).toBe(1);
    expect(result.current.summary.flagged[0].sellerId).toBe('weak');
  });
});