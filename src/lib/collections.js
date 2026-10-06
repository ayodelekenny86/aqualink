import { readValue, writeValue } from './storage';

/**
 * Local collection layer for the self-contained build.
 *
 * The five tables the product needs (users, products, orders, notifications and
 * otp_codes) are modelled as persisted collections instead of a SQL database, so
 * the app runs with no backend and no third-party service. The trade-off is
 * deliberate and worth stating plainly: these rows live in this browser's
 * localStorage only. They do not sync across devices, and clearing site data
 * deletes them. Swapping in a real backend later means replacing the bodies of
 * the functions below and nothing else, because every caller goes through this
 * module.
 */

const COLLECTIONS = {
  users: 'db.users',
  products: 'db.products',
  orders: 'db.orders',
  notifications: 'db.notifications',
  otpCodes: 'db.otpCodes',
  drivers: 'db.drivers',
  sellers: 'db.sellers',
  institutionSchedules: 'db.institution_schedules',
  qualityRecords: 'db.quality_records',
  institutionBudget: 'db.institution_budget',
  ratings: 'db.ratings',
};

export const COLLECTION_NAMES = Object.keys(COLLECTIONS);

/** Storage keys are exposed so "reset demo data" can wipe them precisely. */
export const STORAGE_KEYS = { ...COLLECTIONS };

function keyFor(name) {
  const key = COLLECTIONS[name];
  if (!key) throw new Error(`Unknown collection: ${name}`);
  return key;
}

/**
 * Collision-resistant id. Prefers the platform CSPRNG and falls back to a
 * timestamp, so ids stay unique even where crypto is unavailable.
 */
export function createId(prefix = 'id') {
  const unique = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.abs(Date.now() % 0xffffffff).toString(36) + Math.random().toString(36).slice(2, 6);
  return `${prefix}_${unique}`;
}

/** Human-facing booking code, e.g. AQ-1051. Unique within the orders table. */
export function createBookingCode(existing = []) {
  const taken = new Set(existing.map((order) => order.code));
  let candidate = 1000;
  while (taken.has(`AQ-${candidate}`)) candidate += 1;
  return `AQ-${candidate}`;
}

export function list(name, fallback = []) {
  return readValue(keyFor(name), fallback);
}

export function replaceAll(name, rows) {
  writeValue(keyFor(name), rows);
  return rows;
}

/** Append a row, assigning an id and timestamp when the caller omits them. */
export function insert(name, row) {
  const rows = list(name);
  const stamped = { id: row.id ?? createId(name), createdAt: row.createdAt ?? new Date().toISOString(), ...row };
  replaceAll(name, [...rows, stamped]);
  return stamped;
}

/**
 * Apply `changes` to the row with a matching id. Returns the updated row, or
 * null when no row matched, so callers can branch on a miss instead of guessing.
 */
export function update(name, id, changes) {
  const rows = list(name);
  let updated = null;
  const next = rows.map((row) => {
    if (row.id !== id) return row;
    updated = { ...row, ...changes, id: row.id, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (!updated) return null;
  replaceAll(name, next);
  return updated;
}

export function remove(name, id) {
  const rows = list(name);
  replaceAll(name, rows.filter((row) => row.id !== id));
}

export function findBy(name, predicate) {
  return list(name).find(predicate) ?? null;
}

const WATER_PRODUCTS = [
  { id: 'prod_borehole_1000', name: 'Borehole water · 1,000 gal', volume: '1,000 gallons', category: 'Household', price: 250, listPrice: 300, image: '💧' },
  { id: 'prod_borehole_2000', name: 'Borehole water · 2,000 gal', volume: '2,000 gallons', category: 'Household', price: 450, listPrice: 520, image: '💧' },
  { id: 'prod_borehole_5000', name: 'Borehole water · 5,000 gal', volume: '5,000 gallons', category: 'Commercial', price: 980, listPrice: '1,100', image: '🚛' },
  { id: 'prod_treated_1000', name: 'Treated water · 1,000 gal', volume: '1,000 gallons', category: 'Household', price: 290, listPrice: 340, image: '🧴' },
  { id: 'prod_purified_500', name: 'Purified sachet water · 500 L', volume: '500 litres', category: 'Drinking', price: 180, listPrice: 210, image: '🥤' },
];

/** Seed the catalogue once; safe to call on every load. */
export function seedProducts() {
  const existing = list('products');
  if (existing.length) return existing;
  return replaceAll('products', WATER_PRODUCTS);
}

export function findProductByVolume(volume) {
  return list('products').find((product) => product.volume === volume) ?? null;
}

/**
 * Mirror the account registry into the `users` table.
 *
 * The registry in accounts.js owns credentials and stays the only place a
 * password hash is ever written, so this projects out just the columns a users
 * table needs. It is called after the registry is seeded and after any sign-in
 * that may have created an account, which keeps the table in step without
 * copying secrets into a second store.
 */
export function syncUsers(accounts) {
  const rows = (accounts ?? []).map((account) => ({
    id: account.identifier,
    identifier: account.identifier,
    identifierType: account.identifierType,
    displayName: account.displayName ?? '',
    role: account.role,
    status: account.status,
    createdAt: account.createdAt,
  }));
  return replaceAll('users', rows);
}
