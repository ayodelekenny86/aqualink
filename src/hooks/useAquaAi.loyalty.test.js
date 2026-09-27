import { describe, expect, test } from 'vitest';
import { getAiAnswer } from './useAquaAi';

const paid = (code, sellerId, chargedMinor, extra = {}) => ({
  code, status: 'Paid', chargedMinor, sellerId, sellerName: sellerId,
  sellerReceives: Math.round(chargedMinor * 0.45),
  driverReceives: Math.round(chargedMinor * 0.15),
  platformCommission: Math.round(chargedMinor * 0.40),
  volume: '2,000 gallons',
  ...extra,
});

describe('Aqua AI — loyalty intent', () => {
  test('answers a loyalty question from real paid orders', () => {
    const orders = [paid('AQ-1001', 's1', 25000, { customerId: '0544007788' })];
    const answer = getAiAnswer('What is my loyalty tier?', { orders, buyerId: '0544007788' });
    expect(answer).toMatch(/Silver/);
    expect(answer).toMatch(/250/);
  });

  test('refuses when the buyer id is unknown', () => {
    const answer = getAiAnswer('my loyalty tier', { orders: [], buyerId: null });
    expect(answer).toMatch(/do not know which buyer you are/i);
  });

  test('reports the next tier distance', () => {
    const orders = [
      paid('AQ-1001', 's1', 25000, { customerId: '0544007788' }),
      paid('AQ-1002', 's1', 5000, { customerId: '0544007788' }),
    ];
    const answer = getAiAnswer('loyalty', { orders, buyerId: '0544007788' });
    expect(answer).toMatch(/Silver/);
    expect(answer).toMatch(/points away from Gold/);
  });

  test('does not invent a tier ladder for a buyer with no orders', () => {
    const answer = getAiAnswer('loyalty', { orders: [], buyerId: '0544007788' });
    expect(answer).toMatch(/Bronze/);
    expect(answer).toMatch(/0 points/);
    expect(answer).toMatch(/GH₵0.00/);
  });
});

describe('Aqua AI — seller performance intent', () => {
  test('summarises seller scores when data exists', () => {
    const scores = [
      { sellerId: 's1', score: 95, band: { label: 'Excellent' } },
      { sellerId: 's2', score: 40, band: { label: 'At risk' } },
    ];
    const answer = getAiAnswer('score the sellers', { orders: [], sellerScores: scores });
    expect(answer).toMatch(/Top seller is s1/);
    expect(answer).toMatch(/s2/);
  });

  test('says plainly when no seller has completed an order', () => {
    const answer = getAiAnswer('seller performance', { orders: [], sellerScores: [] });
    expect(answer).toMatch(/No seller has a completed order yet/);
  });
});

describe('Aqua AI — delivery time intent', () => {
  test('reports the fastest and slowest observed window', () => {
    const reliability = [
      { sellerId: 'slr_a', slaMeasured: true, slaHours: 10, timedDeliveries: 3 },
      { sellerId: 'slr_b', slaMeasured: true, slaHours: 30, timedDeliveries: 2 },
    ];
    const answer = getAiAnswer('how long do deliveries take', { orders: [], reliabilityScores: reliability });
    expect(answer).toMatch(/slr_a/);
    expect(answer).toMatch(/slr_b/);
    expect(answer).toMatch(/not promises/);
  });

  test('says plainly when no timing has been recorded', () => {
    const reliability = [{ sellerId: 'slr_a', slaMeasured: false, timedDeliveries: 0 }];
    const answer = getAiAnswer('delivery time', { orders: [], reliabilityScores: reliability });
    expect(answer).toMatch(/no delivery window can be estimated/);
  });

  test('says plainly when no seller has completed an order', () => {
    const answer = getAiAnswer('how long do deliveries take', { orders: [], reliabilityScores: [] });
    expect(answer).toMatch(/No seller has a completed order yet/);
  });
});