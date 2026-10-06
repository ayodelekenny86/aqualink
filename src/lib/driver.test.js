import { describe, expect, test } from 'vitest';
import {
  DRIVER_STEPS,
  advanceAction,
  driverOrders,
  driverStats,
  nextDriverStatus,
  resolveDriver,
  samePhone,
  stepIndex,
} from './driver';

/**
 * The driver workspace decides which orders a person may act on and what the
 * next action on a job is. Both are authorisation-adjacent decisions, so the
 * assertions concentrate on what the module refuses: another driver's jobs, an
 * unpaid order, and a delivered job going round again.
 */

const KOJO = { id: 'drv_kojo', name: 'Kojo Mensah', phone: '0545009046', base: 'East Legon, Accra', status: 'online' };
const AMA = { id: 'drv_ama', name: 'Ama Boateng', phone: '0544002233', base: 'Cantonments, Accra', status: 'online' };

function order(overrides = {}) {
  return {
    id: 'AQ-1001',
    code: 'AQ-1001',
    location: 'East Legon, Accra',
    volume: '2,000 gal',
    status: 'Awaiting payment',
    driverId: 'drv_kojo',
    driverName: 'Kojo Mensah',
    driverPhone: '0545009046',
    buyerPhone: '0244009999',
    driverReceives: 4500,
    createdAt: '2026-10-02T09:00:00Z',
    ...overrides,
  };
}

describe('matching a signed-in account to the driver roster', () => {
  test('treats the three written forms of a number as the same number', () => {
    // The roster seed and the account registry rarely agree on format. An exact
    // string comparison produced a driver who had signed in successfully and
    // then saw no jobs at all, with no error to explain it.
    expect(samePhone('0545009046', '+233545009046')).toBe(true);
    expect(samePhone('0545009046', '233545009046')).toBe(true);
    expect(samePhone('0545009046', '+233 54 500 9046')).toBe(true);
  });

  test('does not treat a different number as the same number', () => {
    expect(samePhone('0545009046', '0544002233')).toBe(false);
    // A prefix is not a match: this was the near-miss that let one driver's
    // feed show another's jobs when a number was one digit short.
    expect(samePhone('0545009046', '054500904')).toBe(false);
    expect(samePhone('', '0545009046')).toBe(false);
    expect(samePhone(null, undefined)).toBe(false);
  });

  test('finds the roster entry for a signed-in identifier', () => {
    expect(resolveDriver('0545009046', [KOJO, AMA])?.id).toBe('drv_kojo');
    expect(resolveDriver('+233545009046', [KOJO, AMA])?.id).toBe('drv_kojo');
  });

  test('returns null for a driver who is registered but not rostered', () => {
    // Registration on the app is not the same as being added to the fleet, and
    // the dashboard says so rather than showing an empty feed.
    expect(resolveDriver('0200000000', [KOJO, AMA])).toBeNull();
    expect(resolveDriver('', [KOJO, AMA])).toBeNull();
  });
});

describe('which orders belong to a driver', () => {
  test('shows only orders assigned to them', () => {
    const orders = [order(), order({ id: 'AQ-1002', driverId: 'drv_ama', driverPhone: '0544002233' })];
    const mine = driverOrders(KOJO, orders);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe('AQ-1001');
  });

  test('falls back to phone matching for orders with no driver id', () => {
    // Orders written before `driverId` existed still carry `driverPhone`, and
    // dropping them would leave those drivers with a permanently empty feed.
    const legacy = order({ driverId: '', driverPhone: '+233545009046' });
    expect(driverOrders(KOJO, [legacy])).toHaveLength(1);
  });

  test('does not match on a name, because names are not unique', () => {
    const other = order({ driverId: '', driverPhone: '', driverName: 'Kojo Mensah' });
    expect(driverOrders(KOJO, [other])).toHaveLength(0);
  });

  test('returns nothing at all for an unrostered driver', () => {
    expect(driverOrders(null, [order()])).toEqual([]);
  });

  test('sorts newest first', () => {
    const orders = [
      order({ id: 'AQ-OLD', createdAt: '2026-10-01T09:00:00Z' }),
      order({ id: 'AQ-NEW', createdAt: '2026-10-03T09:00:00Z' }),
    ];
    expect(driverOrders(KOJO, orders).map((row) => row.id)).toEqual(['AQ-NEW', 'AQ-OLD']);
  });
});

describe('the delivery progression', () => {
  test('is one-way and never loops a finished job', () => {
    expect(nextDriverStatus('Assigned')).toBe('Picked Up');
    expect(nextDriverStatus('Picked Up')).toBe('En Route');
    // The important one: no next step from Delivered, so a driver cannot walk a
    // completed delivery back into the flow and earn from it twice.
    expect(nextDriverStatus('Delivered')).toBeNull();
    expect(nextDriverStatus('Cancelled')).toBeNull();
  });

  test('offers no advance action on an unpaid order', () => {
    // Water must not be collected for an order nobody paid for. The guard lives
    // in the action helper so no caller can skip past it.
    expect(advanceAction('Awaiting payment')).toBeNull();
  });

  test('asks for the code rather than a button that completes delivery', () => {
    const action = advanceAction('En Route');
    expect(action).not.toBeNull();
    // No target status: this step is closed by typing the buyer's code, not by
    // tapping through.
    expect(action.status).toBeNull();
  });

  test('names the step the driver is taking', () => {
    expect(advanceAction('Assigned').label).toMatch(/picked up/i);
    expect(advanceAction('Picked Up').label).toMatch(/start delivery/i);
    expect(advanceAction('Delivered')).toBeNull();
  });

  test('reports the step an order has reached, and nothing for unknown states', () => {
    expect(stepIndex('Assigned')).toBe(0);
    expect(stepIndex('Picked Up')).toBe(1);
    expect(stepIndex('En Route')).toBe(2);
    expect(stepIndex('Delivered')).toBe(3);
    // Not -1 becoming step 0: an unknown status must not render as progress.
    expect(stepIndex('Awaiting payment')).toBe(-1);
    expect(stepIndex('Cancelled')).toBe(-1);
    expect(stepIndex(undefined)).toBe(-1);
  });

  test('the stepper covers the whole progression without gaps', () => {
    expect(DRIVER_STEPS.map((step) => step.status)).toEqual([
      'Assigned', 'Picked Up', 'En Route', 'Delivered',
    ]);
  });
});

describe('the driver stats bar', () => {
  const orders = [
    order({ id: 'A', status: 'Awaiting payment' }),
    order({ id: 'B', status: 'Assigned' }),
    order({ id: 'C', status: 'En Route' }),
    order({ id: 'D', status: 'Delivered', driverReceives: 4500 }),
    order({ id: 'E', status: 'Delivered', driverReceives: 5000 }),
    order({ id: 'F', status: 'Cancelled' }),
    order({ id: 'OTHER', status: 'Delivered', driverId: 'drv_ama', driverPhone: '0544002233', driverReceives: 9999 }),
  ];

  test('counts available, active and completed separately', () => {
    const stats = driverStats(KOJO, orders);
    expect(stats.available).toBe(1);
    // "Active" means claimed work in progress. An unpaid order is available, not
    // active, so a driver cannot look busy by holding unclaimed jobs.
    expect(stats.active).toBe(2);
    expect(stats.completed).toBe(2);
  });

  test('earns only from delivered jobs, and only its own', () => {
    const stats = driverStats(KOJO, orders);
    expect(stats.earningsMinor).toBe(9500);
  });

  test('reports zeroes rather than throwing for an unrostered driver', () => {
    expect(driverStats(null, orders)).toEqual({ available: 0, active: 0, completed: 0, averageRating: null, ratedCount: 0, earningsMinor: 0 });
  });

  test('ignores cancelled orders', () => {
    const stats = driverStats(KOJO, [order({ status: 'Cancelled', driverReceives: 7000 })]);
    expect(stats.completed).toBe(0);
    expect(stats.earningsMinor).toBe(0);
  });
});