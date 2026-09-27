import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { installFakeApi, teardownFakeApi } from './testServer';
import { clearAll } from './lib/storage';

/**
 * Guards against fabricated figures reappearing in the app shell.
 *
 * Every one of these strings was hardcoded at some point and shown to a user as
 * if it were measured: a GH₵8,420 seller month, 52 deliveries, a 4.8★ rating,
 * three invented Accra job locations, two invented disputes, an escrow account
 * that this app does not have, and a weekday-morning demand claim with no model
 * behind it. A business cannot tell invented numbers from measured ones, which
 * is why they were removed rather than kept as sample data.
 *
 * These are source-level assertions on purpose: the numbers were literals, so a
 * source check catches them anywhere in the file, including in a component that
 * is awkward to render.
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

const FABRICATED = [
  // Anchored to the closing JSX tag so these match rendered markup, not a
  // comment that happens to quote the old figure while explaining it was removed.
  { label: 'seller month figure', pattern: /GH\u20b58,420<\/strong>/ },
  { label: 'seller delivery count', pattern: />52<\/strong>/ },
  { label: 'seller rating', pattern: /4\.8 <small>/ },
  { label: 'invented job location', pattern: /Osu, Oxford Street/ },
  { label: 'invented dispute', pattern: /AQ-1043/ },
  { label: 'dispute count claim', pattern: /refund available/ },
];

for (const { label, pattern } of FABRICATED) {
  test(`no fabricated ${label} in the app source`, async () => {
    const source = await readFile('src/App.jsx', 'utf8');
    expect(source).not.toMatch(pattern);
  });
}

test('no escrow account is claimed to the user', async () => {
  // useBooking.js established there is no escrow: Paystack collects the buyer's
  // money directly. Promising a buyer that payouts are "held in escrow" is how
  // an operator ends up owing money that is being held nowhere.
  //
  // The word still appears in this codebase, deliberately: in comments that
  // record that escrow does not exist, and in one CSS class name. So this checks
  // the specific false claims rather than banning the word, which would also
  // delete the note explaining the absence.
  const files = ['src/App.jsx', 'src/components/RevenueBreakdown.jsx'];
  const falseClaims = [
    /escrow only releases/gi,
    /escrow holds/gi,
    /held in escrow/gi,
    /in escrow/gi,
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const claim of falseClaims) {
      // Allowed only inside a comment that is recording the removal.
      const occurrences = [...source.matchAll(claim)].filter(
        (match) => !isCommentedOut(source, match.index),
      );
      expect(`${file}: ${String(claim)} -> ${occurrences.length}`).toBe(`${file}: ${String(claim)} -> 0`);
    }
  }
});

/**
 * True when the match sits inside a `//` or block comment.
 *
 * Only line comments are checked, which is enough here: every explanatory note
 * that mentions escrow is a `//` comment, and a block comment would be a false
 * pass rather than a false failure.
 */
function isCommentedOut(source, index) {
  const lineStart = source.lastIndexOf('\n', index) + 1;
  return source.slice(lineStart, index).includes('//');
}

test('the institution agent no longer claims to know when demand peaks', async () => {
  const source = await readFile('src/App.jsx', 'utf8');
  expect(source).not.toMatch(/demand is typically highest/i);
  expect(source).not.toMatch(/reserve capacity/i);
});

test('no unverifiable quality or certification claim is made to users', async () => {
  // The riskiest invention in this app. It is a drinking-water supplier: claiming
  // certified, in-date water quality that no document in the system supports is
  // the claim most likely to cause real harm, and the old institution workspace
  // scored itself a flat "100% \u2014 certificates up to date".
  const source = await readFile('src/App.jsx', 'utf8');
  const claims = [
    /certificates up to date/i,
    /Reliability Plus/,
    /quality-score/,
    /verified-water badge/i,
    /Certification uploaded/i,
  ];
  for (const claim of claims) {
    expect(`${String(claim)} present`).toBe(`${String(claim)} absent`);
  }
});

test('no subscription plan is invented', async () => {
  // There is no billing, plan, or renewal system. A monthly price and a renewal
  // date imply a contract the app cannot honour or cancel.
  const source = await readFile('src/App.jsx', 'utf8');
  expect(source).not.toMatch(/deliveries remaining/i);
  expect(source).not.toMatch(/renews \d/i);
  expect(source).not.toMatch(/Manage plan/);
});

test('no payout queue is claimed, because no payout system exists', async () => {
  // Paystack collects the buyer's money into the platform account. Promising a
  // seller a "pending payout" is a liability the app cannot meet.
  const source = await readFile('src/App.jsx', 'utf8');
  const claims = [/PENDING PAYOUT/i, /not yet paid out/i, /escrow only releases/i, /escrow holds/i];
  for (const claim of claims) {
    const occurrences = [...source.matchAll(new RegExp(claim.source, 'gi'))].filter(
      (match) => !isCommentedOut(source, match.index),
    );
    expect(`${String(claim)} -> ${occurrences.length}`).toBe(`${String(claim)} -> 0`);
  }
});
