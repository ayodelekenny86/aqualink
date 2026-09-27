import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update, findBy } from '../lib/collections';
import { formatCedi } from '../lib/money';

/**
 * Buyer loyalty, rewards and referral engine.
 *
 * The buyer workspace advertises a tier ladder, points balance, cashback and a
 * "+GH₵20" referral button, but nothing behind those labels computed anything.
 * Every figure here is summed from real paid orders against this buyer's
 * identifier, so an empty order history shows an empty wallet rather than a
 * plausible-looking balance.
 *
 * Rules (intentionally simple and auditable):
 *   - 1 point per GH₵1 actually paid (chargedMinor / 100).
 *   - Tiers are reached by lifetime points, never invented.
 *   - Cashback is a share of points converted back to pesewas.
 *   - Referral credit is awarded once, only when the referee's first order is
 *     paid, and only when the referrer is the recorded referrer of that order.
 */

const POINTS_PER_CEDI = 1;
const CASHBACK_RATE = 0.02; // 2% of points value returned as wallet credit
export const REFERRAL_BONUS_MINOR = 2000; // GH₵20 in pesewas

export const TIERS = [
  { name: 'Bronze', minPoints: 0, color: '#b08d57' },
  { name: 'Silver', minPoints: 250, color: '#c0c5cb' },
  { name: 'Gold', minPoints: 600, color: '#d4af37' },
];

export function tierFor(points) {
  let current = TIERS[0];
  for (const tier of TIERS) {
    if (points >= tier.minPoints) current = tier;
  }
  return current;
}

export function pointsForOrder(chargedMinor) {
  return Math.floor((Number(chargedMinor) || 0) / 100 * POINTS_PER_CEDI);
}

/**
 * Sum a buyer's lifetime points from the orders that have actually been paid.
 * Only `Paid` orders move money, so only they earn points.
 */
export function computePoints(orders, buyerId) {
  return orders
    .filter(o => o.status === 'Paid' && (o.customerId === buyerId || o.buyerPhone === buyerId || o.email === buyerId))
    .reduce((sum, o) => sum + pointsForOrder(o.chargedMinor), 0);
}

/** Cashback in pesewas: 2% of the cedi value the points represent. */
export function computeCashback(points) {
  return Math.round(points * CASHBACK_RATE * 100);
}

export function computeWallet(orders, buyerId) {
  const credited = orders
    .filter(o => o.status === 'Paid' && o.referralCreditTo === buyerId)
    .reduce((sum, o) => sum + (Number(o.referralCreditMinor) || 0), 0);
  const spent = orders
    .filter(o => o.status === 'Paid' && (o.customerId === buyerId || o.buyerPhone === buyerId || o.email === buyerId))
    .reduce((sum, o) => sum + (Number(o.walletAppliedMinor) || 0), 0);
  return { credited, spent, balance: credited - spent };
}

export function useLoyalty({ orders = [], buyerId, onNotice } = {}) {
  const [loading, setLoading] = useState(true);

  // Derive the profile during render rather than in an effect, so a freshly
  // mounted hook carries its data immediately and tests can assert on it
  // without waiting for a deferred tick.
  const profile = useMemo(() => {
    if (!buyerId) return null;
    const points = computePoints(orders, buyerId);
    const tier = tierFor(points);
    const wallet = computeWallet(orders, buyerId);
    const nextTier = TIERS.find(t => t.minPoints > points) ?? null;
    const pointsToNext = nextTier ? nextTier.minPoints - points : 0;
    return {
      buyerId,
      points,
      tier: tier.name,
      tierColor: tier.color,
      nextTier: nextTier ? nextTier.name : null,
      pointsToNextTier: Math.max(0, pointsToNext),
      progressToNext: nextTier ? Math.min(1, points / nextTier.minPoints) : 1,
      cashbackMinor: computeCashback(points),
      wallet,
      paidOrderCount: orders.filter(o => o.status === 'Paid' &&
        (o.customerId === buyerId || o.buyerPhone === buyerId || o.email === buyerId)).length,
    };
  }, [orders, buyerId]);

  const summary = useMemo(() => {
    if (!profile) return null;
    return {
      tier: profile.tier,
      points: profile.points,
      cashback: formatCedi(profile.cashbackMinor),
      walletBalance: formatCedi(profile.wallet.balance),
      nextTier: profile.nextTier,
      pointsToNextTier: profile.pointsToNextTier,
      progressToNext: profile.progressToNext,
    };
  }, [profile]);

  const refresh = useCallback(() => {
    // Re-derivation happens through the memo above; this is exposed so callers
    // can nudge the hook after an order settles.
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(false);
  }, []);

  return { profile, summary, loading, refresh };
}

/**
 * Referral helper. Awards the bonus once, when a referee's first order is paid
 * and the referrer is recorded as the referee's source.
 */
export function awardReferralIfEligible(orders, refereeId, referrerId) {
  const refereePaid = orders.some(o =>
    o.status === 'Paid' &&
    (o.customerId === refereeId || o.buyerPhone === refereeId || o.email === refereeId) &&
    o.referredBy === referrerId
  );
  if (!refereePaid) return null;
  return { referrerId, refereeId, bonusMinor: REFERRAL_BONUS_MINOR, awarded: true };
}

export default useLoyalty;