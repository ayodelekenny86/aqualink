import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * The orders Realtime subscription, and what happens when the server refuses it.
 *
 * `orders` was not in the `supabase_realtime` publication — the same gap that
 * affected `notifications`, and worse because it is the order list every surface
 * reads. Confirmed against this project:
 *
 *   topic: realtime:public:orders
 *   -> phx_reply status ok
 *   -> system error: "Unable to subscribe to changes with given parameters. Please
 *      check Realtime is enabled for the given connect parameters: [table: orders]"
 *
 * The shape of that refusal is the whole problem. The server answers the join with
 * `ok` and only then refuses it, so the status the client sees is not one this hook
 * was listening for, and whether it arrived at all depended on the client library
 * mapping a post-join rejection onto `CHANNEL_ERROR`.
 *
 * These cannot test the live server, so what they pin is that the migration exists
 * and that no outcome can leave the app loading forever.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('orders is published for Realtime', async () => {
  const migration = await readFile('supabase/migrations/20250105000000_orders_realtime.sql', 'utf8');
  expect(migration).toMatch(/alter publication supabase_realtime add table public\.orders/);
  // `add table` is not idempotent; an unguarded migration aborts on re-apply.
  expect(migration).toMatch(/pg_publication_tables/);
  // DELETE events otherwise carry only the primary key, and the client builds a row
  // from `payload.new || payload.old`.
  expect(migration).toMatch(/replica identity full/);
});

test('every subscribed table has a publication migration', async () => {
  // A subscription to an unpublished table is accepted and then refused, which looks
  // like success. Deriving the tables from the client means a new subscription
  // cannot be added without someone noticing there is nothing publishing it.
  const hook = await readFile('src/hooks/useBooking.js', 'utf8');
  const subscribed = [...hook.matchAll(/table:\s*'([^']+)'/g)].map((m) => m[1]);
  expect(subscribed.length).toBeGreaterThanOrEqual(1);

  const { readdir, readFile: read } = await import('node:fs/promises');
  const migrations = await readdir('supabase/migrations');
  let published = '';
  for (const name of migrations) {
    published += await read(`supabase/migrations/${name}`, 'utf8');
  }
  for (const table of new Set(subscribed)) {
    expect(`${table} => ${published.includes(`add table public.${table}`) ? 'published' : 'MISSING'}`)
      .toBe(`${table} => published`);
  }
});

test('the loading flag is cleared on any subscription outcome', async () => {
  const hook = await readFile('src/hooks/useBooking.js', 'utf8');

  // A refused subscription must not be able to leave the app loading. Every
  // non-SUBSCRIBED status has to reach the same failure path.
  expect(hook).toMatch(/ORDER_SYNC_TIMEOUT_MS/);
  expect(hook).toMatch(/failed\('timeout'\)/);
  // And it must be cleared on unmount, or a remount inside the window leaks a timer
  // that fires against a channel that no longer exists.
  expect(hook).toMatch(/clearTimeout\(deadline\)/);

  // The old three-status allowlist is the specific shape that let the refusal
  // through, so its absence is the assertion.
  expect(hook).not.toMatch(/status === 'CHANNEL_ERROR' \|\| status === 'TIMED_OUT'/);
});

test('a successful subscription clears any previous sync error', async () => {
  const hook = await readFile('src/hooks/useBooking.js', 'utf8');

  // Otherwise a single failed attempt leaves "Could not sync orders in real time."
  // on screen permanently, even after a reconnect that works — a stale warning is
  // how a real one stops being believed.
  expect(hook).toMatch(/status === 'SUBSCRIBED'\) \{\s*setError\(null\)/);
});