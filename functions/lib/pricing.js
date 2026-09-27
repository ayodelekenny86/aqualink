/**
 * Authoritative pricing and revenue allocation. This is the SERVER copy.
 *
 * Why a duplicate of the client's `src/lib/money.js` exists: the amount a buyer
 * is charged must never be decided by the browser. A modified client can send
 * any figure it likes, so the server recomputes the price from its own pricing
 * config and stores that on the order. The client copy is display-only.
 *
 * The two are kept numerically identical on purpose, and
 * `functions/lib/pricing.test.js` pins the values that matter so the copies
 * cannot drift apart silently. If you change an allocation rule, change it in
 * both places and let that test tell you if you missed one.
 */

export const MINOR_UNITS_PER_MAJOR = 100;

/**
 * The revenue split, mirroring `src/lib/money.js`.
 *
 * `buyerServiceCharge` is 0 so the customer pays exactly the discounted price:
 * a GH¢600 list price less 50% is GH¢300, and GH¢300 is what is taken. It used
 * to be 10%, which was charged on top of the discount and made the customer pay
 * GH¢330 while still advertising 50% off. The shares below then divide that
 * GH¢300 exactly: seller GH¢135, driver GH¢45, platform GH¢120.
 *
 * `money.test.js` and `payments.test.js` pin that figure, so this cannot drift.
 */
export const DEFAULT_SPLIT = {
  buyerServiceCharge: 0,
  seller: 45,
  driver: 15,
  platformCommission: 40,
};

export const DEFAULT_PRICING = {
  listPrice: 600,
  discountPercent: 50,
  surgePercent: 0,
  surgeReason: '',
};

const SHARES_OF_ORDER_VALUE = ['seller', 'driver', 'platformCommission'];

export function toMinor(amount) {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) throw new TypeError(`Not a number: ${amount}`);
  return Math.sign(value) * Math.round(Math.abs(value) * MINOR_UNITS_PER_MAJOR);
}

/** Reject a split that does not close. Throws before any money moves. */
export function validateSplit(split) {
  const problems = [];

  for (const key of ['buyerServiceCharge', ...SHARES_OF_ORDER_VALUE]) {
    const value = split[key];
    if (!Number.isFinite(value) || value < 0) problems.push(`${key} must be a non-negative number (got ${value}).`);
  }

  const allocated = SHARES_OF_ORDER_VALUE.reduce((sum, key) => sum + (Number(split[key]) || 0), 0);
  if (Math.abs(allocated - 100) > 1e-9) {
    problems.push(`Order-value shares must total 100% (seller + driver + platform = ${allocated}%).`);
  }

  if (problems.length) throw new Error(`Invalid revenue split: ${problems.join(' ')}`);
  return true;
}

/** Largest-remainder split so the parts sum to exactly `amountMinor`. */
function allocateProportionally(amountMinor, split) {
  const exact = SHARES_OF_ORDER_VALUE.map((key) => ({ key, value: (amountMinor * split[key]) / 100 }));

  const floors = exact.map((entry) => ({
    ...entry,
    floor: Math.floor(entry.value),
    remainder: entry.value - Math.floor(entry.value),
  }));
  let residue = amountMinor - floors.reduce((sum, entry) => sum + entry.floor, 0);

  // Largest remainders win the leftover pesewas; ties break by key order so the
  // result is deterministic.
  const order = [...floors].sort(
    (a, b) => b.remainder - a.remainder
      || SHARES_OF_ORDER_VALUE.indexOf(a.key) - SHARES_OF_ORDER_VALUE.indexOf(b.key),
  );
  const bonus = new Map();
  for (const entry of order) {
    if (residue <= 0) break;
    bonus.set(entry.key, (bonus.get(entry.key) ?? 0) + 1);
    residue -= 1;
  }

  return Object.fromEntries(floors.map((entry) => [entry.key, entry.floor + (bonus.get(entry.key) ?? 0)]));
}

export function allocate(amountMinor, split = DEFAULT_SPLIT) {
  validateSplit(split);

  const gross = Math.round(amountMinor);
  if (gross < 0) throw new RangeError('Order amount cannot be negative.');

  const parts = allocateProportionally(gross, split);
  const buyerServiceCharge = Math.round((gross * split.buyerServiceCharge) / 100);

  return {
    gross,
    buyerPays: gross + buyerServiceCharge,
    sellerReceives: parts.seller,
    driverReceives: parts.driver,
    buyerServiceCharge,
    platformCommission: parts.platformCommission,
    companyTake: parts.platformCommission + buyerServiceCharge,
    split: { ...split },
  };
}

export function quotePrice(pricing = DEFAULT_PRICING) {
  const { listPrice = 0, discountPercent = 0, surgePercent = 0 } = pricing;

  if (!Number.isFinite(listPrice) || listPrice < 0) throw new RangeError('List price cannot be negative.');
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new RangeError('Discount must be between 0% and 100%.');
  }
  if (!Number.isFinite(surgePercent) || surgePercent < 0) throw new RangeError('Surge cannot be negative.');

  const listMinor = toMinor(listPrice);
  const discounted = Math.round((listMinor * (100 - discountPercent)) / 100);
  const surge = Math.round((discounted * surgePercent) / 100);
  return { listMinor, discounted, surge, surgeMinor: surge, totalMinor: discounted + surge };
}

/**
 * Price one order from server config and return everything that must be stored
 * on it. `volumeLitres` is accepted for future distance/volume pricing but does
 * not affect the figure yet; it is not silently ignored in the signature so the
 * shape is already right when that rule lands.
 */
export function priceOrder({ pricing = DEFAULT_PRICING, split = DEFAULT_SPLIT, volumeLitres = 0 } = {}) {
  validateSplit(split);
  const quote = quotePrice(pricing);
  const breakdown = allocate(quote.totalMinor, split);

  return {
    volumeLitres,
    pricing: { ...pricing },
    split: { ...split },
    listMinor: quote.listMinor,
    discountMinor: quote.listMinor - quote.discounted,
    surgeMinor: quote.surgeMinor,
    grossMinor: breakdown.gross,
    chargedMinor: breakdown.buyerPays,
    ...breakdown,
  };
}
