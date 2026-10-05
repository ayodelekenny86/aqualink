import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { installFakeApi, teardownFakeApi } from './testServer';
import { clearAll } from './lib/storage';

/**
 * Guards against fabricated figures and false claims reappearing in the app.
 *
 * Each string below was hardcoded at some point and shown to a user as though it
 * were measured: a GH\u20b58,420 seller month, 52 deliveries, a 4.8\u2605 rating, three
 * invented Accra job locations, two invented disputes, an escrow account this app
 * does not have, a "100% \u2014 certificates up to date" water-quality score, a
 * GH\u20b53,500/month subscription with a renewal date, a pending-payout queue, and a
 * weekday-morning demand claim with no model behind it.
 *
 * A business cannot tell invented numbers from measured ones, which is why they
 * were removed rather than kept as sample data. For a drinking-water supplier the
 * quality claim is the dangerous one: it asserts something about the safety of
 * people's water with no document behind it.
 *
 * These are source-level assertions on purpose. The claims were literals spread
 * across components that are awkward to render individually, so a source check
 * catches them anywhere in the file.
 *
 * Comments are exempt. The note explaining that a claim was removed necessarily
 * quotes it, and deleting those notes would remove the only record of why the
 * figure is gone. So the checks look for the claim in code the user can see.
 */

beforeEach(() => {
  clearAll();
  localStorage.clear();
  installFakeApi();
});

afterEach(() => {
  teardownFakeApi();
  clearAll();
});

const APP = 'src/App.jsx';

/** Every match of `pattern` that is not inside a `//` comment. */
function visible(source, pattern) {
  return [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))]
    .filter((match) => !isCommentedOut(source, match.index));
}

/**
 * True when the match sits inside a `//` comment.
 *
 * Only line comments are considered. Every explanatory note in this repo is a
 * `//` comment, and treating an unhandled block comment as "not visible" would
 * be a false pass rather than a false failure.
 */
function isCommentedOut(source, index) {
  const lineStart = source.lastIndexOf('\n', index) + 1;
  return source.slice(lineStart, index).includes('//');
}

const GROUPS = [
  {
    name: 'fabricated figures in the app shell',
    file: APP,
    claims: [
      { label: 'seller month figure', pattern: /GH\u20b58,420/ },
      { label: 'seller delivery count', pattern: />52</ },
      { label: 'seller rating', pattern: /4\.8 <small>/ },
      { label: 'invented job location', pattern: /Osu, Oxford Street/ },
      { label: 'invented dispute', pattern: /AQ-1043/ },
      { label: 'refund availability claim', pattern: /refund available/ },
    ],
  },
  {
    name: 'an escrow account that does not exist',
    files: [APP, 'src/components/RevenueBreakdown.jsx'],
    claims: [
      { label: 'escrow release promise', pattern: /escrow only releases/i },
      { label: 'escrow holding promise', pattern: /escrow holds/i },
      { label: 'held-in-escrow claim', pattern: /held in escrow/i },
      { label: 'in-escrow claim', pattern: /\bin escrow\b/i },
    ],
  },
  {
    name: 'a pending-payout queue with no payout system',
    file: APP,
    claims: [
      { label: 'pending payout label', pattern: /PENDING PAYOUT/i },
      { label: 'unpaid-out-to-sellers claim', pattern: /not yet paid out/i },
    ],
  },
  {
    name: 'unverifiable water-quality or certification claims',
    file: APP,
    claims: [
      { label: 'certificates-up-to-date claim', pattern: /certificates up to date/i },
      { label: 'quality score element', pattern: /quality-score/ },
      { label: 'uploaded-certification claim', pattern: /Certification uploaded/i },
      { label: 'badge publication claim', pattern: /Approve to publish the verified-water badge/i },
    ],
  },
  {
    name: 'a subscription plan with no billing system',
    file: APP,
    claims: [
      { label: 'plan name', pattern: /Reliability Plus/ },
      { label: 'deliveries-remaining counter', pattern: /deliveries remaining/i },
      { label: 'renewal date', pattern: /renews \d/i },
      { label: 'plan management action', pattern: /Manage plan/ },
    ],
  },
  {
    name: 'demand claims with no forecasting model',
    file: APP,
    claims: [
      { label: 'peak demand assertion', pattern: /demand is typically highest/i },
      { label: 'reserve recommendation', pattern: /reserve capacity/i },
    ],
  },
  {
    // The sidebar showed a fixed name, avatar and city on every account, so every
    // user of the app was identified as a person who does not exist, in a city
    // they may never have been in. The identity is derived from the session now.
    name: 'a fixed signed-in persona',
    file: APP,
    claims: [
      { label: 'invented signed-in name', pattern: /Alex K\./ },
      { label: 'invented avatar initials', pattern: />AK</ },
      { label: 'hardcoded signed-in city', pattern: /Accra, Ghana/ },
    ],
  },
  {
    // The `ai` function is not deployed on this server, so every answer the Aqua
    // panel gives today comes from the local matcher. The panel used to call that
    // an offline condition, which is false: the device is online and the server has
    // no AI on it. A reader told their device is offline stops looking for the real
    // cause, which is a deploy or a missing key.
    name: 'a fallback attributed to the wrong cause',
    file: APP,
    claims: [
      { label: 'offline-only fallback claim', pattern: /local rules when offline/i },
      { label: 'offline-only AI claim', pattern: /Gemini[^\n]*only[^\n]*offline/i },
    ],
  },
];

/**
 * Writes whose result is thrown away.
 *
 * `supabase-js` resolves with `{ error }` and does not reject when the database
 * refuses a statement, so `try/catch` around a write catches network failures and
 * nothing else. Every write that inferred success from an un-thrown catch was
 * reporting a change that had not been saved — the worst being a delivery the
 * buyer was told was confirmed while the order stayed on En Route.
 *
 * `writeResult` in `src/lib/supabase.js` is the one place that tells the two cases
 * apart, and these check every write in the two hooks that decide something a user
 * is told about still goes through it.
 *
 * The negative lookbehind is the point of the pattern: without it it would match
 * the `await` inside `writeResult(await supabase...)`, which is the correct form.
 */
describe('no write reports success without checking what the server said', () => {
  const HOOKS = ['src/hooks/useBooking.js', 'src/hooks/useNotifications.js'];
  const UNCHECKED = /(?<!writeResult\()await supabase\.from\([^)]*\)\.(?:update|insert|delete)\(/;

  for (const file of HOOKS) {
    test(`every Supabase write in ${file} inspects its result`, async () => {
      const source = await readFile(file, 'utf8');
      expect(`${file} -> ${visible(source, UNCHECKED).length} unchecked`).toBe(`${file} -> 0 unchecked`);
    });
  }

  test('the helper that does the checking exists and is used', async () => {
    const helper = await readFile('src/lib/supabase.js', 'utf8');
    expect(helper).toMatch(/export function writeResult/);

    // A helper nothing calls is not a check. Five writes in useBooking (booking,
    // status change, release, delivery code, delivery confirmation) and one in
    // useNotifications.
    const booking = await readFile('src/hooks/useBooking.js', 'utf8');
    expect(booking.match(/writeResult\(/g) ?? []).toHaveLength(5);
    const notifications = await readFile('src/hooks/useNotifications.js', 'utf8');
    expect(notifications.match(/writeResult\(/g) ?? []).toHaveLength(1);
  });

  test('no write promises a retry that does not exist', async () => {
    // There is no sync queue behind these writes, so "will sync when the
    // connection returns" describes a recovery that has never existed.
    const source = await readFile('src/hooks/useNotifications.js', 'utf8');
    expect(visible(source, /will sync when/i)).toHaveLength(0);
  });
});

for (const group of GROUPS) {
  const files = group.files ?? [group.file];

  for (const { label, pattern } of group.claims) {
    test(`no ${label} is shown to users (${group.name})`, async () => {
      for (const file of files) {
        const source = await readFile(file, 'utf8');
        expect(`${file} :: ${label} -> ${visible(source, pattern).length} visible`)
          .toBe(`${file} :: ${label} -> 0 visible`);
      }
    });
  }
}
