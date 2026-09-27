import { describe, expect, test } from 'vitest';
import { assignDriver, assignSeller, explain, localityAffinity, normalizeLocality, rankCandidates, scoreCandidate } from './dispatch';

const order = { location: 'East Legon, Accra', volumeGallons: 2000 };

const DRIVERS = [
  { id: 'd1', name: 'Kojo Mensah', base: 'East Legon, Accra', capacityGallons: 5000, rating: 4.8, activeJobs: 0, status: 'online' },
  { id: 'd2', name: 'Ama Boateng', base: 'Cantonments, Accra', capacityGallons: 2000, rating: 4.9, activeJobs: 1, status: 'online' },
  { id: 'd3', name: 'Yaw Boateng', base: 'Tema', capacityGallons: 1000, rating: 5.0, activeJobs: 0, status: 'online' },
  { id: 'd4', name: 'Off Duty', base: 'East Legon, Accra', capacityGallons: 9000, rating: 5.0, activeJobs: 0, status: 'offline' },
];

describe('locality matching', () => {
  test('strips filler and punctuation so the same place compares equal', () => {
    expect(normalizeLocality('East Legon, Accra')).toBe(normalizeLocality('east-legon accra ghana'));
  });

  test('an exact locality match scores 1', () => {
    expect(localityAffinity('East Legon, Accra', 'East Legon, Accra')).toBe(1);
  });

  test('a different locality scores 0', () => {
    expect(localityAffinity('East Legon, Accra', 'Tema')).toBe(0);
  });

  test('a shared token scores partially, not zero', () => {
    const score = localityAffinity('East Legon, Accra', 'East Legon Residential');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  test('an unknown locality scores 0 rather than guessing', () => {
    expect(localityAffinity('', 'East Legon')).toBe(0);
    expect(localityAffinity('East Legon', '')).toBe(0);
  });
});

describe('scoring', () => {
  test('factors sum to at most 100', () => {
    const row = scoreCandidate({ order, candidate: DRIVERS[0], kind: 'driver' });
    const total = Object.values(row.factors).reduce((sum, value) => sum + value, 0);
    expect(total).toBeLessThanOrEqual(100);
  });

  test('a driver already in the locality outranks one from another town', () => {
    const local = scoreCandidate({ order, candidate: DRIVERS[0], kind: 'driver' });
    const far = scoreCandidate({ order, candidate: DRIVERS[2], kind: 'driver' });
    expect(local.score).toBeGreaterThan(far.score);
  });

  test('a busier driver scores below an identical idle one', () => {
    const idle = scoreCandidate({ order, candidate: { ...DRIVERS[0], activeJobs: 0 }, kind: 'driver' });
    const busy = scoreCandidate({ order, candidate: { ...DRIVERS[0], activeJobs: 3 }, kind: 'driver' });
    expect(idle.score).toBeGreaterThan(busy.score);
  });
});

describe('ranking and assignment', () => {
  test('offline candidates are never ranked', () => {
    const ranked = rankCandidates({ order, candidates: DRIVERS, kind: 'driver' });
    expect(ranked.map((row) => row.candidate.id)).not.toContain('d4');
  });

  test('assigns the strongest driver', () => {
    expect(assignDriver({ order, drivers: DRIVERS }).candidate.id).toBe('d1');
  });

  test('ranking is deterministic for identical input', () => {
    const a = rankCandidates({ order, candidates: DRIVERS, kind: 'driver' }).map((r) => r.candidate.id);
    const b = rankCandidates({ order, candidates: DRIVERS, kind: 'driver' }).map((r) => r.candidate.id);
    expect(a).toEqual(b);
  });

  test('a seller too small for the order is excluded, not just ranked low', () => {
    const sellers = [
      { id: 's1', name: 'Small tanker', base: 'East Legon', capacityGallons: 1000, rating: 5, status: 'online' },
      { id: 's2', name: 'Big tanker', base: 'East Legon', capacityGallons: 10000, rating: 4, status: 'online' },
    ];
    const result = assignSeller({ order, sellers });
    expect(result.candidate.id).toBe('s2');
    expect(rankCandidates({ order, candidates: sellers, kind: 'seller' }).find((r) => r.candidate.id === 's1').eligible).toBe(false);
  });

  test('returns null when nobody is eligible, so ops sees the gap', () => {
    const sellers = [{ id: 's1', name: 'Tiny', base: 'East Legon', capacityGallons: 100, status: 'online' }];
    expect(assignSeller({ order, sellers })).toBeNull();
  });

  test('an empty fleet returns null rather than throwing', () => {
    expect(assignDriver({ order, drivers: [] })).toBeNull();
  });
});

describe('explainability', () => {
  test('explains a chosen candidate with its top factors', () => {
    const row = assignDriver({ order, drivers: DRIVERS });
    const text = explain(row);
    expect(text).toContain('Kojo Mensah');
    expect(text).toMatch(/proximity/);
  });

  test('explains an empty result without throwing', () => {
    expect(explain(null)).toMatch(/no eligible/i);
  });
});
