import { test, expect } from 'vitest';
import { scoreReliability, rankReliability, reliabilitySummary, describeSla, deliveryWindowHours } from '../lib/reliability';

function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

test('a seller with no orders returns null', () => {
  expect(scoreReliability([], 'slr_none')).toBeNull();
});

test('completion and cancellation rates come from real orders', () => {
  const orders = [
    { sellerId: 'slr_a', status: 'Delivered', volume: '2,000 gal', sellerReceives: 30000, chargedMinor: 30000 },
    { sellerId: 'slr_a', status: 'Cancelled', volume: '1,000 gal', sellerReceives: 0, chargedMinor: 0 },
  ];
  const s = scoreReliability(orders, 'slr_a');
  expect(s.completionRate).toBe(50);
  expect(s.cancellationRate).toBe(50);
  expect(s.orders).toBe(2);
  expect(s.completed).toBe(1);
  expect(s.cancelled).toBe(1);
});

test('on-time rate is null when no delivery window can be measured', () => {
  const orders = [{ sellerId: 'slr_a', status: 'Delivered', volume: '1,000 gal' }];
  const s = scoreReliability(orders, 'slr_a');
  expect(s.onTimeRate).toBeNull();
  expect(s.slaMeasured).toBe(false);
  expect(s.slaHours).toBeNull();
});

test('on-time rate is measured when both timestamps exist', () => {
  const orders = [
    { sellerId: 'slr_a', status: 'Delivered', volume: '1,000 gal', assignedAt: hoursAgo(30), deliveredAt: hoursAgo(29) },
    { sellerId: 'slr_a', status: 'Delivered', volume: '1,000 gal', assignedAt: hoursAgo(30), deliveredAt: hoursAgo(20) },
    { sellerId: 'slr_a', status: 'Delivered', volume: '1,000 gal', assignedAt: hoursAgo(30), deliveredAt: hoursAgo(10) },
  ];
  const s = scoreReliability(orders, 'slr_a');
  expect(s.timedDeliveries).toBe(3);
  // 1h, 10h, 20h — all within the 24h window.
  expect(s.onTimeRate).toBe(100);
  expect(s.slaMeasured).toBe(true);
  // Median of 1, 10, 20 hours.
  expect(s.slaHours).toBe(10);
});

test('a delivery that took longer than the window counts as late', () => {
  const orders = [
    { sellerId: 'slr_a', status: 'Delivered', volume: '1,000 gal', assignedAt: hoursAgo(72), deliveredAt: hoursAgo(20) },
    { sellerId: 'slr_a', status: 'Delivered', volume: '1,000 gal', assignedAt: hoursAgo(72), deliveredAt: hoursAgo(60) },
  ];
  const s = scoreReliability(orders, 'slr_a');
  // 52h and 12h windows; only the 12h one is within 24h.
  expect(s.onTimeRate).toBe(50);
});

test('delivery window is null when assignedAt is missing', () => {
  expect(deliveryWindowHours({ status: 'Delivered', deliveredAt: hoursAgo(1) })).toBeNull();
  expect(deliveryWindowHours({ status: 'Delivered', assignedAt: hoursAgo(2), deliveredAt: hoursAgo(1) })).toBeCloseTo(1);
});

test('volume and revenue are normalised against the best performer', () => {
  const orders = [
    { sellerId: 'slr_big', status: 'Delivered', volume: '10,000 gal', sellerReceives: 100000, chargedMinor: 100000 },
    { sellerId: 'slr_small', status: 'Delivered', volume: '1,000 gal', sellerReceives: 10000, chargedMinor: 10000 },
  ];
  const big = scoreReliability(orders, 'slr_big');
  const small = scoreReliability(orders, 'slr_small');
  expect(big.volumeDelivered).toBe(10000);
  expect(small.volumeDelivered).toBe(1000);
  expect(big.score).toBeGreaterThan(small.score);
});

test('ranking is best first and stable', () => {
  const orders = [
    { sellerId: 'slr_a', status: 'Delivered', volume: '2,000 gal', sellerReceives: 40000, chargedMinor: 40000 },
    { sellerId: 'slr_b', status: 'Delivered', volume: '1,000 gal', sellerReceives: 10000, chargedMinor: 10000 },
  ];
  const ranked = rankReliability(orders);
  expect(ranked.length).toBe(2);
  expect(ranked[0].sellerId).toBe('slr_a');
  expect(ranked[0].rank).toBe(1);
  expect(ranked[1].rank).toBe(2);
});

test('summary exposes fastest SLA among timed sellers', () => {
  const orders = [
    { sellerId: 'slr_a', status: 'Delivered', volume: '1,000 gal', assignedAt: hoursAgo(48), deliveredAt: hoursAgo(30) },
    { sellerId: 'slr_b', status: 'Delivered', volume: '1,000 gal', assignedAt: hoursAgo(48), deliveredAt: hoursAgo(12) },
  ];
  const summary = reliabilitySummary(orders);
  expect(summary.timedSellers).toBe(2);
  // slr_a took 18h, slr_b took 36h.
  expect(summary.fastestSla.sellerId).toBe('slr_a');
  expect(summary.fastestSla.slaHours).toBe(18);
});

test('describeSla is honest about unmeasured sellers', () => {
  expect(describeSla(null)).toBe('No delivery history to estimate a window.');
  expect(describeSla({ slaMeasured: false })).toBe('Delivery timing is not recorded for this seller yet, so no delivery window can be estimated.');
  expect(describeSla({ slaMeasured: true, slaHours: 20, timedDeliveries: 5 })).toBe('Estimated delivery window: about 14–28 hours, based on 5 timed deliveries.');
});

test('an empty order list yields no summary', () => {
  expect(reliabilitySummary([])).toBeNull();
});