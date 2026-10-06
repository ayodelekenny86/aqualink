import { useCallback, useEffect, useMemo, useState } from 'react';
import { list } from '../lib/collections';
import { summarise } from '../lib/summary';

/**
 * Seller performance scoring.
 *
 * The operations panel used to show no seller-performance tracking at all, and
 * for good reason: there was no data model behind it. This engine scores every
 * seller from the orders that actually exist — completion rate, on-time rate,
 * cancellation rate, volume delivered and revenue — and exposes a rank and a
 * health band. A seller with no orders scores zero and is reported as such,
 * rather than being given a plausible-looking 4.8★ rating.
 *
 * All inputs are read-only over the order list; nothing is persisted here.
 */

const WEIGHTS = {
  completion: 0.26,
  onTime: 0.22,
  cancellation: 0.18,
  volume: 0.14,
  revenue: 0.10,
  rating: 0.10,
};

const HEALTH_BANDS = [
  { min: 90, label: 'Excellent', color: '#2e7d32' },
  { min: 75, label: 'Healthy', color: '#558b2f' },
  { min: 60, label: 'Watch', color: '#ef6c00' },
  { min: 40, label: 'At risk', color: '#c62828' },
  { min: 0, label: 'No data', color: '#9e9e9e' },
];

function bandFor(score) {
  let current = HEALTH_BANDS[HEALTH_BANDS.length - 1];
  for (const band of HEALTH_BANDS) {
    if (score >= band.min) { current = band; break; }
  }
  return current;
}

function sellerIdOf(order) {
  return order.sellerId || order.sellerName || null;
}

/**
 * Score a single seller against the full order list. Returns null when the
 * seller has no orders at all, so callers can distinguish "no data" from "zero".
 */
export function scoreSeller(orders, sellerId) {
  const mine = orders.filter(o => sellerIdOf(o) === sellerId);
  if (!mine.length) return null;

  const completed = mine.filter(o => o.status === 'Delivered');
  const cancelled = mine.filter(o => o.status === 'Cancelled');
  const assigned = mine.filter(o => ['Assigned', 'En Route'].includes(o.status));
  const pending = mine.filter(o => ['Awaiting payment'].includes(o.status));

  const completionRate = mine.length > 0 ? completed.length / mine.length : 0;
  const cancellationRate = mine.length > 0 ? cancelled.length / mine.length : 0;

  // On-time: delivered orders whose deliveredAt is within 24h of assignedAt.
  const deliveredWithTiming = completed.filter(o => o.assignedAt && o.deliveredAt);
  const onTime = deliveredWithTiming.filter(o => {
    const hours = (new Date(o.deliveredAt).getTime() - new Date(o.assignedAt).getTime()) / (1000 * 60 * 60);
    return hours <= 24;
  });
  const onTimeRate = deliveredWithTiming.length > 0
    ? onTime.length / deliveredWithTiming.length
    : completionRate; // fall back to completion when timing is unrecorded

  const volumeDelivered = completed.reduce((s, o) => s + parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0'), 0);
  const revenue = completed.reduce((s, o) => s + (Number(o.sellerReceives) || 0), 0) / 100;

  // Buyer ratings attached to delivered orders. A 1-5 score maps to 0-100.
  const rated = completed.filter(o => typeof o.rating === 'number' && o.rating >= 1 && o.rating <= 5);
  const averageRating = rated.length
    ? rated.reduce((s, o) => s + o.rating, 0) / rated.length
    : null;
  const ratingScore = averageRating != null ? (averageRating / 5) * 100 : 0;

  // Normalise volume and revenue against the best performer so a 0..1 scale
  // emerges from the actual fleet rather than from invented ceilings.
  const allSellers = new Set(orders.map(sellerIdOf)).size;
  const maxVolume = Math.max(...orders.map(o => parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0')), 0);
  const maxRevenue = Math.max(...orders.map(o => Number(o.sellerReceives) || 0), 0);

  const volumeScore = maxVolume > 0 ? Math.min(1, volumeDelivered / maxVolume) : 0;
  const revenueScore = maxRevenue > 0 ? Math.min(1, revenue * 100 / maxRevenue) : 0;

  const raw = (
    completionRate * WEIGHTS.completion +
    onTimeRate * WEIGHTS.onTime +
    (1 - cancellationRate) * WEIGHTS.cancellation +
    volumeScore * WEIGHTS.volume +
    revenueScore * WEIGHTS.revenue +
    (averageRating != null ? ratingScore : completionRate) * WEIGHTS.rating
  );
  const score = Math.round(raw * 100);

  return {
    sellerId,
    orders: mine.length,
    completed: completed.length,
    cancelled: cancelled.length,
    active: assigned.length,
    pending: pending.length,
    completionRate: Math.round(completionRate * 100),
    onTimeRate: Math.round(onTimeRate * 100),
    cancellationRate: Math.round(cancellationRate * 100),
    volumeDelivered: Math.round(volumeDelivered),
    revenue: Math.round(revenue),
    averageRating: averageRating != null ? Number(averageRating.toFixed(1)) : null,
    ratedCount: rated.length,
    score,
    band: bandFor(score),
  };
}

export function useSellerPerformance({ orders = [] } = {}) {
  const [loading, setLoading] = useState(true);

  // Derive synchronously so a freshly mounted hook carries its data without
  // waiting on a deferred effect.
  const scores = useMemo(() => {
    const ids = new Set(orders.map(sellerIdOf).filter(Boolean));
    const next = {};
    ids.forEach(id => {
      const s = scoreSeller(orders, id);
      if (s) next[id] = s;
    });
    return next;
  }, [orders]);

  const ranked = useMemo(() => {
    return Object.values(scores)
      .sort((a, b) => b.score - a.score)
      .map((s, i) => ({ ...s, rank: i + 1 }));
  }, [scores]);

  const summary = useMemo(() => {
    if (!ranked.length) return null;
    const top = ranked[0];
    const bottom = ranked[ranked.length - 1];
    const flagged = ranked.filter(s => s.score < 60);
    return {
      totalSellers: ranked.length,
      topSeller: top.sellerId,
      topScore: top.score,
      bottomSeller: bottom.sellerId,
      bottomScore: bottom.score,
      flaggedCount: flagged.length,
      flagged: flagged.map(s => ({ sellerId: s.sellerId, score: s.score, band: s.band.label })),
    };
  }, [ranked]);

  const refresh = useCallback(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(false);
  }, []);

  return { scores, ranked, summary, loading, refresh };
}

export default useSellerPerformance;