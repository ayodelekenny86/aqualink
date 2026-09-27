/**
 * Money and revenue allocation.
 *
 * Two decisions here are deliberate and worth not undoing:
 *
 * 1. All arithmetic runs in integer minor units (Ghanaian pesewas, 100 per
 *    cedi). Floating point money loses pesewas: three 33.33% splits of
 *    GH¢10.00 do not sum back to GH¢10.00, and a ledger that drifts is a
 *    ledger nobody can reconcile or sell.
 *
 * 2. Allocation uses the largest-remainder (Hamilton) method, so the parts
 *    always sum to exactly the input. The residue is distributed to the
 *    largest fractional remainders rather than being silently dropped, which
 *    is what makes per-order splits add up to a monthly total.
 */

/** Minor units per cedi. */
export const MINOR_UNITS_PER_MAJOR = 100;

/** Parse a major-unit amount ("250.50", 250.5) into integer pesewas. */
export function toMinor(amount) {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) throw new TypeError(`Not a number: ${amount}`);
  // Round half away from zero so 0.005 does not truncate downward.
  return Math.sign(value) * Math.round(Math.abs(value) * MINOR_UNITS_PER_MAJOR);
}

/** Integer pesewas back to a major-unit number. */
export function toMajor(minor) {
  return minor / MINOR_UNITS_PER_MAJOR;
}

/**
 * Format minor units as a Ghanaian cedi string.
 * Uses a fixed 2dp so statements never show floating-point dust.
 */
export function formatCedi(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const rest = abs % MINOR_UNITS_PER_MAJOR;
  return `${sign}GH₵${major.toLocaleString('en-GB')}.${String(rest).padStart(2, '0')}`;
}

/**
 * The default commercial plan.
 *
 * The buyer sees a 50% discount off list price, so a GH¢600 list price is sold
 * at GH¢300. A 10% service charge is added on top of that, making GH¢330 the
 * amount taken from the buyer, and the platform keeps 40% of the discounted
 * price. The remaining shares divide the discounted price and must sum to 100.
 *
 * `platformCommission + buyerServiceCharge` is the company's total take, which
 * is the number that matters for sustainability.
 */
export const DEFAULT_SPLIT = {
  buyerServiceCharge: 10,
  seller: 45,
  driver: 15,
  platformCommission: 40,
};

/** Pricing the admin controls: list price, the discount, and surge. */
export const DEFAULT_PRICING = {
  listPrice: 600,
  discountPercent: 50,
  surgePercent: 0,
  surgeReason: '',
};

const SHARES_OF_ORDER_VALUE = ['seller', 'driver', 'platformCommission'];

/**
 * Reject a split that does not close, before any money moves. Silently
 * mis-splitting payouts is the failure mode this guards against.
 */
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

/**
 * Split `amountMinor` across `SHARES_OF_ORDER_VALUE` using largest remainder,
 * so the parts sum to exactly `amountMinor`.
 */
function allocateProportionally(amountMinor, split) {
  const exact = SHARES_OF_ORDER_VALUE.map((key) => ({
    key,
    value: (amountMinor * split[key]) / 100,
  }));

  const floors = exact.map((entry) => ({ ...entry, floor: Math.floor(entry.value), remainder: entry.value - Math.floor(entry.value) }));
  let residue = amountMinor - floors.reduce((sum, entry) => sum + entry.floor, 0);

  // Hand the leftover minor units to the largest remainders, ties by key order
  // so the result is deterministic across runs and platforms.
  const order = [...floors].sort((a, b) => b.remainder - a.remainder || SHARES_OF_ORDER_VALUE.indexOf(a.key) - SHARES_OF_ORDER_VALUE.indexOf(b.key));
  const bonus = new Map();
  for (const entry of order) {
    if (residue <= 0) break;
    bonus.set(entry.key, (bonus.get(entry.key) ?? 0) + 1);
    residue -= 1;
  }

  return Object.fromEntries(
    floors.map((entry) => [entry.key, entry.floor + (bonus.get(entry.key) ?? 0)]),
  );
}

/**
 * Full breakdown for one order.
 *
 * Returns the gross order value, what each party receives, what the buyer is
 * charged on top, and the company's total take. All values are minor units.
 */
export function allocate(amountMinor, split = DEFAULT_SPLIT) {
  validateSplit(split);

  const gross = Math.round(amountMinor);
  if (gross < 0) throw new RangeError('Order amount cannot be negative.');

  const parts = allocateProportionally(gross, split);
  const buyerServiceCharge = Math.round((gross * split.buyerServiceCharge) / 100);

  const companyTake = parts.platformCommission + buyerServiceCharge;

  return {
    gross,
    buyerPays: gross + buyerServiceCharge,
    sellerReceives: parts.seller,
    driverReceives: parts.driver,
    buyerServiceCharge,
    platformCommission: parts.platformCommission,
    companyTake,
    split: { ...split },
  };
}

/** Total order value when the buyer pays `buyerPaysMinor` including the fee. */
export function grossFromBuyerCharge(buyerPaysMinor, split = DEFAULT_SPLIT) {
  validateSplit(split);
  return Math.round(buyerPaysMinor / (1 + split.buyerServiceCharge / 100));
}

/** Company take rate as a percentage of what the buyer actually pays. */
export function effectiveTakeRate(split = DEFAULT_SPLIT) {
  validateSplit(split);
  const gross = 100;
  return allocate(gross, split).companyTake / allocate(gross, split).buyerPays * 100;
}

/**
 * The price a buyer is quoted.
 *
 * Surge is applied to the discounted price, not the list price, so an admin
 * raising surge during a dry spell raises the actual charge rather than
 * inflating the discount back to nothing. Returns minor units throughout.
 */
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
