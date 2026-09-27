import { describe, expect, test } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  TIERS,
  tierFor,
  pointsForOrder,
  computePoints,
  computeCashback,
  computeWallet,
  awardReferralIfEligible,
  REFERRAL_BONUS_MINOR,
  default as useLoyalty,
} from './useLoyalty';

describe('loyalty tier ladder', () => {
  test('ladder is Bronze -> Silver -> Gold with rising thresholds', () => {
    expect(TIERS.map(t => t.name)).toEqual(['Bronze', 'Silver', 'Gold']);
    expect(TIERS.map(t => t.minPoints)).toEqual([0, 250, 600]);
  });

  test('tierFor climbs with points and never goes backwards', () => {
    expect(tierFor(0).name).toBe('Bronze');
    expect(tierFor(100).name).toBe('Bronze');
    expect(tierFor(250).name).toBe('Silver');
    expect(tierFor(599).name).toBe('Silver');
    expect(tierFor(600).name).toBe('Gold');
    expect(tierFor(5000).name).toBe('Gold');
  });
});

describe('points accrual', () => {
  test('1 point per GH₵1 actually paid', () => {
    expect(pointsForOrder(25000)).toBe(250); // GH₵250.00
    expect(pointsForOrder(5000)).toBe(50);
    expect(pointsForOrder(0)).toBe(0);
    expect(pointsForOrder(50)).toBe(0); // GH₵0.50 rounds down
  });

  test('computePoints sums only Paid orders for this buyer', () => {
    const orders = [
      { status: 'Paid', chargedMinor: 25000, customerId: 'b1' },
      { status: 'Paid', chargedMinor: 5000, customerId: 'b1' },
      { status: 'Awaiting payment', chargedMinor: 99999, customerId: 'b1' },
      { status: 'Paid', chargedMinor: 40000, customerId: 'someone-else' },
    ];
    expect(computePoints(orders, 'b1')).toBe(300);
  });

  test('computePoints matches buyer by phone or email too', () => {
    const orders = [
      { status: 'Paid', chargedMinor: 10000, buyerPhone: '0545009046' },
      { status: 'Paid', chargedMinor: 10000, email: 'a@b.com' },
    ];
    expect(computePoints(orders, '0545009046')).toBe(100);
    expect(computePoints(orders, 'a@b.com')).toBe(100);
  });
});

describe('cashback', () => {
  test('2% of points value, returned in pesewas', () => {
    expect(computeCashback(300)).toBe(600);   // GH₵6.00
    expect(computeCashback(0)).toBe(0);
    expect(computeCashback(1)).toBe(2); // 1 point = 2 pesewas cashback
  });
});

describe('wallet', () => {
  test('balance is referral credits minus wallet applied', () => {
    const orders = [
      { status: 'Paid', referralCreditTo: 'b1', referralCreditMinor: 2000 },
      { status: 'Paid', customerId: 'b1', walletAppliedMinor: 500 },
    ];
    expect(computeWallet(orders, 'b1')).toEqual({ credited: 2000, spent: 500, balance: 1500 });
  });
});

describe('awardReferralIfEligible', () => {
  test('REFERRAL_BONUS_MINOR is GH₵20 in pesewas', () => {
    expect(REFERRAL_BONUS_MINOR).toBe(2000);
  });

  test('awards when referee first order is paid and referred by referrer', () => {
    const orders = [{ status: 'Paid', customerId: 'ref-1', referredBy: 'ref-0' }];
    expect(awardReferralIfEligible(orders, 'ref-1', 'ref-0')).toEqual({
      referrerId: 'ref-0', refereeId: 'ref-1', bonusMinor: 2000, awarded: true,
    });
  });

  test('does not award when referee has not paid', () => {
    const orders = [{ status: 'Awaiting payment', customerId: 'ref-1', referredBy: 'ref-0' }];
    expect(awardReferralIfEligible(orders, 'ref-1', 'ref-0')).toBeNull();
  });

  test('does not award when referrer did not refer this buyer', () => {
    const orders = [{ status: 'Paid', customerId: 'ref-1', referredBy: 'someone-else' }];
    expect(awardReferralIfEligible(orders, 'ref-1', 'ref-0')).toBeNull();
  });

  test('does not award when referee id does not match', () => {
    const orders = [{ status: 'Paid', customerId: 'other', referredBy: 'ref-0' }];
    expect(awardReferralIfEligible(orders, 'ref-1', 'ref-0')).toBeNull();
  });
});

describe('useLoyalty hook', () => {
  test('returns null profile when no buyer id', () => {
    const { result } = renderHook(() => useLoyalty({ orders: [], buyerId: null }));
    expect(result.current.profile).toBe(null);
  });

  test('sums points and picks tier from real paid orders', () => {
    const orders = [
      { status: 'Paid', chargedMinor: 25000, customerId: 'b1' },
      { status: 'Paid', chargedMinor: 5000, customerId: 'b1' },
    ];
    const { result } = renderHook(() => useLoyalty({ orders, buyerId: 'b1' }));
    expect(result.current.profile).not.toBe(null);
    expect(result.current.profile.points).toBe(300);
    expect(result.current.profile.tier).toBe('Silver');
    expect(result.current.profile.cashbackMinor).toBe(600);
  });

  test('summary formats cashback and wallet as cedi', () => {
    const orders = [{ status: 'Paid', chargedMinor: 10000, customerId: 'b1' }];
    const { result } = renderHook(() => useLoyalty({ orders, buyerId: 'b1' }));
    expect(result.current.summary.tier).toBe('Bronze');
    expect(result.current.summary.cashback).toMatch(/GH₵/);
    expect(result.current.summary.walletBalance).toMatch(/GH₵/);
  });
});