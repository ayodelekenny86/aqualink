/**
 * Pricing logic for Supabase Edge Functions.
 * Mirrors functions/lib/pricing.js and src/lib/money.js exactly.
 * Changes must be applied in all three places; money.test.js pins the values.
 */

export const MINOR_UNITS_PER_MAJOR = 100;

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

export function toMinor(amount: number | string): number {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) throw new TypeError(`Not a number: ${amount}`);
  return Math.sign(value) * Math.round(Math.abs(value) * MINOR_UNITS_PER_MAJOR);
}

export function validateSplit(split: Record<string, number>): boolean {
  const problems: string[] = [];
  for (const key of ['buyerServiceCharge', ...SHARES_OF_ORDER_VALUE]) {
    const value = split[key];
    if (!Number.isFinite(value) || value < 0) problems.push(`${key} must be non-negative (got ${value}).`);
  }
  const allocated = SHARES_OF_ORDER_VALUE.reduce((sum, key) => sum + (Number(split[key]) || 0), 0);
  if (Math.abs(allocated - 100) > 1e-9) {
    problems.push(`Shares must total 100% (got ${allocated}%).`);
  }
  if (problems.length) throw new Error(`Invalid revenue split: ${problems.join(' ')}`);
  return true;
}

function allocateProportionally(amountMinor: number, split: Record<string, number>) {
  const exact = SHARES_OF_ORDER_VALUE.map((key) => ({
    key,
    value: (amountMinor * split[key]) / 100,
  }));
  const floors = exact.map((entry) => ({
    ...entry,
    floor: Math.floor(entry.value),
    remainder: entry.value - Math.floor(entry.value),
  }));
  let residue = amountMinor - floors.reduce((sum, entry) => sum + entry.floor, 0);
  const order = [...floors].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      SHARES_OF_ORDER_VALUE.indexOf(a.key) - SHARES_OF_ORDER_VALUE.indexOf(b.key),
  );
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

export function allocate(amountMinor: number, split = DEFAULT_SPLIT) {
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
  const listMinor = toMinor(listPrice);
  const discounted = Math.round((listMinor * (100 - discountPercent)) / 100);
  const surge = Math.round((discounted * surgePercent) / 100);
  return { listMinor, discounted, surge, surgeMinor: surge, totalMinor: discounted + surge };
}

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
