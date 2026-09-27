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
];

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
