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
 * The revenue plan.
 *
 * `buyerServiceCharge` is charged to the buyer **on top of** the order value;
 * the other three shares divide the order value itself and must sum to 100.
 * `platformCommission + buyerServiceCharge` is the company's total take, which
 * is the number that matters for sustainability.
 */
export const DEFAULT_SPLIT = {
  buyerServiceCharge: 10,
  seller: 70,
  driver: 5,
  platformCommission: 25,
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
