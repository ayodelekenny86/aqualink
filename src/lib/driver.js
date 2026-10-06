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

/** Digits only. */
function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Reduce a Ghanaian number to its nine national digits.
 *
 * `0545009046`, `+233545009046`, `233545009046` and `+233 54 500 9046` all
 * become `545009046`. Both the country code and the national trunk zero have to
 * come off, or the local and international forms of the same number do not
 * match — which produced a driver who had signed in successfully and then saw
 * no jobs, with nothing on screen to explain why.
 */
function nationalDigits(value) {
  let local = digits(value);
  if (local.startsWith('233')) local = local.slice(3);
  if (local.startsWith('0')) local = local.slice(1);
  return local;
}

/**
 * Whether two phone numbers are the same number.
 *
 * Compared on the nine national digits rather than by exact string, so the
 * three formats a number is actually written in all match.
 */
export function samePhone(a, b) {
  const first = nationalDigits(a);
  const second = nationalDigits(b);
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
 * in progress. `averageRating` is the mean overall score across delivered orders
 * that carry a rating; null when the driver has no rated deliveries.
 *
 * When `ratings` is supplied it wins over any `rating` field embedded on the
 * order rows. The embedded number is a single overall score and is what
 * `scoreSeller` reads; the ratings collection carries the full breakdown. When
 * both exist they can disagree, and the collection is the authoritative one —
 * so the dashboard prefers it when the caller has loaded it.
 */
export function driverStats(driver, orders, ratings = []) {
  const mine = driverOrders(driver, orders);
  const delivered = mine.filter((order) => DRIVER_DONE_STATUSES.includes(order.status));
  const active = mine.filter((order) => DRIVER_ACTIVE_STATUSES.includes(order.status));
  const completed = active.filter((order) => order.status !== 'Awaiting payment');
  const available = active.filter((order) => order.status === 'Awaiting payment');

  let rated = [];
  if (ratings.length) {
    const ratedOrderIds = new Set(ratings.map((r) => r.orderId));
    rated = delivered.filter((order) => ratedOrderIds.has(order.id));
  } else {
    rated = delivered.filter((order) => typeof order.rating === 'number');
  }
  const averageRating = rated.length
    ? Number((rated.reduce((sum, order) => {
        const r = ratings.find((x) => x.orderId === order.id);
        return sum + (r ? r.overall : order.rating);
      }, 0) / rated.length).toFixed(1))
    : null;

  return {
    available: available.length,
    active: completed.length,
    completed: delivered.length,
    averageRating,
    ratedCount: rated.length,
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