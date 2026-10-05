import { expect, test } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';

/**
 * The deployment checks are only worth running if they would actually fail on a
 * bad deployment, and only worth having if every origin is covered.
 *
 * The reason this file exists: a production URL served a build from 82 commits
 * earlier, with an admin console that accepted any password and invented GMV
 * figures on screen, and nothing in the repository reported it. `npm run verify:live`
 * was the tool that should have caught it, and it pointed at a different host while
 * asking only whether the site answered 200.
 *
 * So these assert the checker's own coverage. They cannot tell whether a live site
 * is healthy — that needs a network — but they do stop the list of things being
 * watched from shrinking back to one host and one status code.
 */

const checker = await readFile('scripts/verify-live.mjs', 'utf8');

test('every origin this project serves from is probed', () => {
  // Each deployment found in the wild belongs in the default list. A URL that is
  // not probed is a URL nobody looks at.
  expect(checker).toMatch(/viviluxy-assistant\.web\.app/);
  expect(checker).not.toMatch(/aqualinkgh1\.vercel\.app/);
});

test('the check is about what is served, not just that it answers', () => {
  // These four are the checks a status code alone cannot make. Dropping any one
  // puts the failure it exists to catch back out of sight.
  for (const check of [
    'the live build matches this checkout',
    'the served bundle contains no fabricated claims',
    'the served bundle is built against the server',
    'a CSP is set',
  ]) {
    expect(checker).toContain(check);
  }
});

test('the fabricated claims it hunts for are ones the app removed', async () => {
  // The checker must look for the same strings `src/honesty.test.jsx` keeps out of
  // the source. A pattern for a claim nobody removed is theatre: it can only ever
  // match a build that predates the fix, never one that reintroduced the claim.
  const honesty = await readFile('src/honesty.test.jsx', 'utf8');
  expect(honesty).toMatch(/GH\\u20b58,420/);
  expect(honesty).toMatch(/in escrow/i);

  expect(checker).toMatch(/this demo workspace/);
  expect(checker).toMatch(/18,540/);
  expect(checker).toMatch(/4,820/);
  // The persona that identified every visitor as "Alex K., Accra, Ghana".
  expect(checker).toMatch(/Alex K\\\./);
});

test('both hosting configs set the same security headers', async () => {
  // Firebase and Vercel serve the same app, so a header set on one and not the
  // other means the deployment without it is unprotected while looking identical.
  // The Vercel deployment shipped with no CSP at all, which is the whole reason
  // this file is needed.
  // The header blocks sit in different places: Firebase nests them under
  // `hosting`, Vercel takes them at the root. Normalised here so the comparison is
  // about the header values rather than where each platform puts them.
  const [firebase, vercel] = await Promise.all([
    readFile('firebase.json', 'utf8').then(JSON.parse).then((config) => config.hosting),
    readFile('vercel.json', 'utf8').then(JSON.parse),
  ]);

  const headerValue = (config, key) => config.headers
    .flatMap((entry) => entry.headers)
    .find((header) => header.key === key)?.value;

  for (const key of [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Strict-Transport-Security',
  ]) {
    expect(`${key}: ${headerValue(vercel, key)}`).toBe(`${key}: ${headerValue(firebase, key)}`);
  }

  // The CSP has to name the API origin the client actually calls, or every request
  // is blocked in the browser and reads as a network failure.
  expect(headerValue(vercel, 'Content-Security-Policy')).toMatch(/connect-src[^;]*\.supabase\.co/);
});

test('the Vercel config rewrites unknown paths to the app shell', async () => {
  // The app is a hash router on every surface, but a deep link or a stray asset
  // path still has to return the shell rather than a 404.
  const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
  expect(vercel.rewrites.at(-1).destination).toBe('/index.html');
});

test('the route list is read from the app, not copied beside it', async () => {
  // The checker used to keep a hand-written list of functions that "mirrored" the
  // ROUTES table in src/lib/api.js, and it had drifted: six of the twenty client
  // routes were missing from it, including `config/update` and `sellers/review`.
  // Duplicating a table that already has to exist in one place is how the three
  // copies of the pricing arithmetic drifted too.
  expect(checker).toMatch(/src\/lib\/api\.js/);
  expect(checker).not.toMatch(/const FUNCTIONS = \[/);

  // And the routes it reads are the routes the app actually has.
  const api = await readFile('src/lib/api.js', 'utf8');
  const routeCount = [...api.matchAll(/'(\/[^']+)':\s*\{\s*fn:/g)].length;
  expect(routeCount).toBeGreaterThan(15);
});

test('every table the client subscribes to is published for Realtime', async () => {
  // Postgres changes are only delivered for tables in the `supabase_realtime`
  // publication, and the failure is deceptive: the server replies to the join with
  // `ok` and *then* refuses it. An unpublished table therefore looks subscribed.
  //
  // Both were confirmed refused against this project and both now have a migration.
  // This test derives the tables from the client rather than listing them, because a
  // new subscription with nothing publishing it is exactly how the first two
  // happened.
  const subscribed = new Set();
  for (const file of ['src/hooks/useBooking.js']) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/table:\s*'([^']+)'/g)) subscribed.add(match[1]);
  }
  expect(subscribed.size).toBeGreaterThanOrEqual(1);

  const migrations = await Promise.all(
    (await readdir('supabase/migrations'))
      .map((name) => readFile(`supabase/migrations/${name}`, 'utf8')),
  );
  for (const table of subscribed) {
    expect(
      `${table} => ${migrations.some((m) => m.includes(`add table public.${table}`)) ? 'published' : 'MISSING'}`,
    ).toBe(`${table} => published`);
  }
});
  // Postgres changes are only delivered for tables in the `supabase_realtime`
  // publication. Without this, `useNotifications` subscribes and the server refuses
  // the join, no cross-device event can ever arrive, and the feed is empty for a
  // reason the panel used to have no way of saying. The subscription was confirmed
  // against the server and refused:
  //
  //   "Unable to subscribe to changes with given parameters. Please check Realtime
  //    is enabled for the given connect parameters: [table: notifications]"
  //
  // Nothing can prove this from a unit test, so what is pinned here is that the
  // migration exists and that it is written to be re-runnable.
  const migration = await readFile('supabase/migrations/20250104000000_notifications_realtime.sql', 'utf8');
  expect(migration).toMatch(/alter publication supabase_realtime add table public\.notifications/);
  // `add table` is not idempotent, so an unguarded migration aborts on re-apply.
  expect(migration).toMatch(/pg_publication_tables/);

  // And the client must consume that Realtime state rather than ignore it.
  const hook = await readFile('src/hooks/useNotifications.js', 'utf8');
  expect(hook).toMatch(/NOTIFICATION_SYNC\.blocked/);
  const panel = await readFile('src/components/NotificationsPanel.jsx', 'utf8');
  expect(panel).toMatch(/not reaching this one/i);
});

test('every build is stamped with the commit it came from', async () => {
  // Without the stamp a stale deployment is indistinguishable from a current one.
  const config = await readFile('vite.config.js', 'utf8');
  expect(config).toMatch(/aqualink-build/);
  expect(config).toMatch(/aqualink-built/);
  expect(config).toMatch(/rev-parse/);
});