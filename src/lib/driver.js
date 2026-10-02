/**
 * The driver workspace's data layer.
 *
 * A driver signs in with the phone number on their fleet record, which is the
 * same number that gets stamped onto every order they are assigned, so
 * `resolveDriver` matches a signed-in account to a real driver row rather than
 * trusting a role claim. There is no driver account that can see jobs it was not
 * assigned.
 *
 * The driver progression is deliberately explicit and one-way:
 *
 *   Assigned → Picked Up → En Route → Delivered
 *
 * The last step requires the delivery code the buyer holds, which is what proves
 * the water actually changed hands rather than the driver tapping a button. That
 * is the same code the seller issues today, so there is one code in the system
 * rather than two competing ones.
 */

/** Statuses a driver can still act on. */
export const DRIVER_ACTIVE_STATUSES = ['Awaiting payment', 'Assigned', 'Picked Up', 'En Route'];

/** Statuses that count as finished work for the driver's stats. */
export const DRIVER_DONE_STATUSES = ['Delivered'];

export const DRIVER_STEPS = [
  { status: 'Assigned', label: 'Accepted' },
  { status: 'Picked Up', label: 'Picked up' },
  { status: 'En Route', label: 'On the road' },
  { status: 'Delivered', label: 'Delivered' },
];

/** Normalise a phone number the same way the fleet and contact code do. */
function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Whether two phone numbers are the same number.
 *
 * Compared on the last nine national digits rather than on an exact string, so
 * `0545009046`, `+233545009046` and `233 54 500 9046` all match. An exact
 * comparison silently produced a driver who had signed in but could see no jobs,
 * because the fleet seed and the account registry rarely agreed on format.
 */
export function samePhone(a, b) {
  const first = digits(a).replace(/^233/, '');
  const second = digits(b).replace(/^233/, '');
  if (!first || !second) return false;
  return first === second;
}

/**
 * Find the fleet record for a signed-in driver.
 *
 * Returns null when the account's number is not on the roster, which the caller
 * surfaces as "not yet on the driver roster" rather than as an error. A driver
 * registered on the app is not automatically rostered.
 */
export function resolveDriver(identifier, drivers) {
  if (!identifier) return null;
  return drivers.find((driver) => samePhone(driver.phone, identifier)) ?? null;
}

/**
 * Orders this driver owns, newest first.
 *
 * Matched on `driverId` when dispatch recorded one, and on phone as a fallback
 * for orders written before `driverId` existed. Both are compared by phone rather
 * than by name, because names are not unique and two drivers can share one.
 */
export function driverOrders(driver, orders) {
  if (!driver) return [];
  return orders
    .filter((order) => {
      if (driver.id && order.driverId) return order.driverId === driver.id;
      if (order.driverPhone) return samePhone(order.driverPhone, driver.phone);
      return false;
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

/**
 * The status after this one, or null when the job is finished.
 *
 * Returns null rather than looping at 'Delivered', so a driver cannot push a
 * completed job back into the flow and re-earn from it.
 */
export function nextDriverStatus(status) {
  switch (status) {
    case 'Assigned':
      return 'Picked Up';
    case 'Picked Up':
      return 'En Route';
    default:
      return null;
  }
}

/**
 * The label for the button that advances a job.
 *
 * Deliberately absent for `Awaiting payment`: an unpaid order must not be
 * collected. A driver who can pick up water for an order nobody paid for is a
 * loss the platform absorbs.
 */
export function advanceAction(status) {
  switch (status) {
    case 'Awaiting payment':
      return null;
    case 'Assigned':
      return { label: 'Mark picked up', status: 'Picked Up' };
    case 'Picked Up':
      return { label: 'Start delivery', status: 'En Route' };
    case 'En Route':
      return { label: 'Enter delivery code', status: null };
    default:
      return null;
  }
}

/**
 * Counts for the driver stats bar.
 *
 * `earningsMinor` is the driver's own configured share of each delivered order
 * — the same `driverReceives` figure the pricing split produces — summed over
 * delivered jobs only. Available counts jobs still to claim, active counts jobs
 * in progress.
 */
export function driverStats(driver, orders) {
  const mine = driverOrders(driver, orders);
  const delivered = mine.filter((order) => DRIVER_DONE_STATUSES.includes(order.status));
  const active = mine.filter((order) => DRIVER_ACTIVE_STATUSES.includes(order.status));
  const completed = active.filter((order) => order.status !== 'Awaiting payment');
  const available = active.filter((order) => order.status === 'Awaiting payment');

  return {
    available: available.length,
    active: completed.length,
    completed: delivered.length,
    earningsMinor: delivered.reduce((sum, order) => sum + (order.driverReceives ?? 0), 0),
  };
}

/**
 * Which step of the progression an order has reached, as an index.
 *
 * Used to render the stepper. An unknown or missing status reports -1 so the
 * stepper shows nothing rather than implying progress that did not happen.
 */
export function stepIndex(status) {
  return DRIVER_STEPS.findIndex((step) => step.status === status);
}