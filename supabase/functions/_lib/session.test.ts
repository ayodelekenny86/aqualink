import { describe, expect, test } from 'vitest';
import {
  checkFlutterwaveSettlement,
  checkSettlement,
  newReference,
  signOpsToken,
  verifyOpsToken,
} from './session.ts';

/**
 * These are the Supabase Edge Functions' copies of the payment decisions, and
 * they are the code that actually runs in production. `functions/lib/verify.js`
 * is the Firebase deployment of the same rules.
 *
 * The assertions concentrate on the ways a settlement check can be made to agree
 * with itself: comparing a caller-supplied reference against the order that same
 * reference selected, defaulting an absent provider status to success, and
 * comparing amounts in different units. Each of those returns `settled: true`
 * for a payment that did not happen.
 */

const ORDER = {
  id: 'AQ-1A2B3C',
  charged_minor: 30000,
  paystack_reference: 'aq1a2b3c-0123456789abcdef',
  flutterwave_reference: null,
  status: 'Awaiting payment',
};

const PAYSTACK_SUCCESS = {
  status: 'success',
  reference: ORDER.paystack_reference,
  amount: 30000,
  currency: 'GHS',
  paid_at: '2026-10-02T09:00:00Z',
};

describe('Paystack settlement', () => {
  test('settles when the provider agrees on every field', () => {
    const result = checkSettlement({ transaction: PAYSTACK_SUCCESS, order: ORDER });
    expect(result.settled).toBe(true);
    expect(result.reason).toBe('settled');
    expect(result.paidAt).toBe('2026-10-02T09:00:00Z');
  });

  test('refuses when the provider reports no status at all', () => {
    // The regression this guards: callers used to write
    // `transaction.status ?? 'success'`, so a Paystack record with the field
    // missing was read as a successful charge and the order was marked paid on
    // the strength of an absent answer.
    const result = checkSettlement({
      transaction: { ...PAYSTACK_SUCCESS, status: undefined },
      order: ORDER,
    });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('provider_status_unknown');
  });

  test('refuses a transaction whose own reference belongs to another order', () => {
    // The replay guard. When the handler passed the reference from the query
    // string into `transaction.reference`, this comparison agreed by
    // construction — the order had been selected *by* that value — so any
    // successful charge of the right amount settled the order.
    const result = checkSettlement({
      transaction: { ...PAYSTACK_SUCCESS, reference: 'aq99999999-fedcba9876543210' },
      order: ORDER,
    });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('reference_mismatch');
  });

  test('refuses an amount that does not match exactly', () => {
    for (const amount of [100, 29999, 30001, 30000.4]) {
      expect(checkSettlement({ transaction: { ...PAYSTACK_SUCCESS, amount }, order: ORDER }).settled).toBe(false);
    }
    expect(checkSettlement({ transaction: { ...PAYSTACK_SUCCESS, amount: 100 }, order: ORDER }).reason).toBe('amount_mismatch');
  });

  test('refuses a different currency', () => {
    expect(checkSettlement({ transaction: { ...PAYSTACK_SUCCESS, currency: 'NGN' }, order: ORDER }).reason)
      .toBe('currency_mismatch');
  });

  test('refuses every non-success provider status', () => {
    for (const status of ['failed', 'pending', 'abandoned', 'reversed']) {
      expect(checkSettlement({ transaction: { ...PAYSTACK_SUCCESS, status }, order: ORDER }).reason)
        .toBe(`provider_status_${status}`);
    }
  });

  test('refuses a refunded order and a missing transaction', () => {
    expect(checkSettlement({ transaction: PAYSTACK_SUCCESS, order: { ...ORDER, status: 'refunded' } }).reason)
      .toBe('already_refunded');
    expect(checkSettlement({ transaction: null, order: ORDER }).settled).toBe(false);
    expect(checkSettlement({ transaction: PAYSTACK_SUCCESS, order: null }).settled).toBe(false);
  });

  test('accepts an order whose stored amount is unusable rather than assuming zero', () => {
    for (const charged of [0, -1, 300.5, null]) {
      expect(checkSettlement({ transaction: PAYSTACK_SUCCESS, order: { ...ORDER, charged_minor: charged } }).reason)
        .toBe('order_amount_invalid');
    }
  });
});

describe('Flutterwave settlement', () => {
  const fwOrder = {
    ...ORDER,
    paystack_reference: null,
    flutterwave_reference: 'aq1a2b3c-0123456789abcdef',
  };
  const fwSuccess = {
    tx_ref: fwOrder.flutterwave_reference,
    status: 'successful',
    // Flutterwave reports major units; the order stores integer pesewas.
    amount: 300,
    currency: 'GHS',
    created_at: '2026-10-02T09:00:00Z',
  };

  test('settles a matching major-unit amount against the stored minor units', () => {
    // The bug: `Math.round(data.amount)` was compared to `charged_minor`, so
    // 300 (cedis) never equalled 30000 (pesewas) and every Flutterwave payment
    // failed `amount_mismatch`. Money arrived and the order stayed unpaid.
    const result = checkFlutterwaveSettlement({ transaction: fwSuccess, order: fwOrder });
    expect(result.settled).toBe(true);
    expect(result.reason).toBe('settled');
    expect(result.paidAt).toBe('2026-10-02T09:00:00Z');
  });

  test('refuses a pesewa figure rather than reading it as a huge cedi amount', () => {
    // Flutterwave reports major units. Treating 30000 as cedi would let a
    // GH¢30,000.00 charge settle a GH¢300.00 order, so the scale is not guessed.
    expect(checkFlutterwaveSettlement({ transaction: { ...fwSuccess, amount: 30000 }, order: fwOrder }).reason)
      .toBe('amount_mismatch');
  });

  test('refuses a figure with precision finer than a pesewa', () => {
    // 300.004 is not 300.00. Rounding it into agreement would let a charge that
    // is not the order amount pass.
    expect(checkFlutterwaveSettlement({ transaction: { ...fwSuccess, amount: 300.004 }, order: fwOrder }).reason)
      .toBe('amount_mismatch');
  });

  test('refuses an amount that is a different charge, not a different scale', () => {
    expect(checkFlutterwaveSettlement({ transaction: { ...fwSuccess, amount: 1 }, order: fwOrder }).reason)
      .toBe('amount_mismatch');
    expect(checkFlutterwaveSettlement({ transaction: { ...fwSuccess, amount: 450 }, order: fwOrder }).reason)
      .toBe('amount_mismatch');
  });

  test('refuses a tx_ref belonging to another order', () => {
    expect(checkFlutterwaveSettlement({
      transaction: { ...fwSuccess, tx_ref: 'aq00000000-ffffffffffffffff' },
      order: fwOrder,
    }).reason).toBe('reference_mismatch');
  });

  test('refuses a non-successful status', () => {
    expect(checkFlutterwaveSettlement({ transaction: { ...fwSuccess, status: 'failed' }, order: fwOrder }).reason)
      .toBe('provider_status_failed');
  });

  test('refuses when no status is reported at all', () => {
    expect(checkFlutterwaveSettlement({
      transaction: { ...fwSuccess, status: undefined },
      order: fwOrder,
    }).settled).toBe(false);
  });

  test('reads the fields whether nested under data or passed flat', () => {
    expect(checkFlutterwaveSettlement({ transaction: { data: fwSuccess }, order: fwOrder }).settled).toBe(true);
  });
});

describe('ops session tokens', () => {
  const SECRET = 'ops-session-signing-secret';
  const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);

  test('issues a token that verifies', () => {
    const token = signOpsToken({ email: 'ops@aqualink.gh', secret: SECRET, now: NOW });
    const result = verifyOpsToken(token, SECRET, { now: NOW });
    expect(result.valid).toBe(true);
    expect(result.payload.sub).toBe('ops@aqualink.gh');
  });

  test('expires at the stated second, not one second after it', () => {
    // `exp` is the first second the token is no longer valid, so the comparison
    // must be `>=`. With `>` a token stayed usable for one second past its
    // lifetime — small on its own, but it is an off-by-one in an expiry check.
    const token = signOpsToken({ email: 'ops@aqualink.gh', secret: SECRET, ttlSeconds: 3600, now: NOW });
    const atExpiry = NOW + 3600 * 1000;
    expect(verifyOpsToken(token, SECRET, { now: atExpiry - 1000 }).valid).toBe(true);
    expect(verifyOpsToken(token, SECRET, { now: atExpiry }).valid).toBe(false);
    expect(verifyOpsToken(token, SECRET, { now: atExpiry + 1000 }).reason).toBe('expired');
  });

  test('refuses a token signed with a different secret', () => {
    const token = signOpsToken({ email: 'ops@aqualink.gh', secret: SECRET, now: NOW });
    expect(verifyOpsToken(token, 'another-secret', { now: NOW }).valid).toBe(false);
  });

  test('refuses a tampered payload', () => {
    const token = signOpsToken({ email: 'ops@aqualink.gh', secret: SECRET, now: NOW });
    const [body, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'attacker@evil.test', role: 'ops', exp: NOW / 1000 + 9999 }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(verifyOpsToken(`${forged}.${signature}`, SECRET, { now: NOW }).valid).toBe(false);
    expect(body.length).toBeGreaterThan(0);
  });

  test('refuses a token for a role other than ops', () => {
    const token = signOpsToken({ email: 'buyer@example.com', role: 'buyer', secret: SECRET, now: NOW });
    expect(verifyOpsToken(token, SECRET, { now: NOW, requiredRole: 'ops' }).reason).toBe('wrong_role');
  });
});

describe('payment references', () => {
  test('carries enough entropy to be unguessable', () => {
    // `/payments/verify` is reachable by anyone holding a reference, so the
    // suffix is the only thing standing between them and someone else's
    // receipt. The handlers previously used `crypto.randomUUID().slice(0, 8)`,
    // which is 32 bits.
    const reference = newReference('AQ-1A2B3C');
    expect(reference).toMatch(/^aq1a2b3c-[0-9a-f]{16}$/);
    expect(new Set(Array.from({ length: 1000 }, () => newReference('AQ-1A2B3C'))).size).toBe(1000);
  });

  test('sanitises an order code that cannot be used verbatim', () => {
    expect(newReference('---///')).toMatch(/^aq-[0-9a-f]{16}$/);
  });
});

describe('the reference allowlist', () => {
  // The verify handlers interpolate the reference into a PostgREST `.or()` filter,
  // where a comma or a parenthesis changes what the query selects, so
  // `isPlausibleReference` gatekeeps them. It lives in `utils.ts`, which imports
  // the Supabase SDK over an https ESM specifier and so cannot be loaded by the
  // Node test runner; the pattern is therefore duplicated here verbatim and
  // pinned against `newReference`, which is what actually mints references.
  //
  // If `newReference` changes shape, this fails — which is the point. An
  // allowlist that rejects real references is worse than none: every payment
  // would fail to verify.
  const REFERENCE_PATTERN = /^aq[a-z0-9]{0,64}-[0-9a-f]{16,64}$/;

  test('accepts every reference the server actually issues', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(REFERENCE_PATTERN.test(newReference(`AQ-1A2B3C${i}`))).toBe(true);
    }
    expect(REFERENCE_PATTERN.test(newReference('AQ-1048-2'))).toBe(true);
    expect(REFERENCE_PATTERN.test(newReference('---///'))).toBe(true);
  });

  test('rejects PostgREST filter metacharacters', () => {
    const injections = [
      'aq1a2b3c-0123456789abcdef,paystack_reference.eq.other',
      'aq1a2b3c-0123456789abcdef).or(id.not.is.null',
      'aq1a2b3c-0123456789abcdef*',
      'aq1a2b3c-0123456789abcdef:eq',
      "aq1a2b3c-0123456789abcdef'",
    ];
    for (const value of injections) {
      expect(REFERENCE_PATTERN.test(value)).toBe(false);
    }
  });

  test('rejects shapes that were never issued', () => {
    for (const value of ['', 'r1', 'AQ-1A2B3C', 'aq1a2b3c', 'aq1a2b3c-short', 'aq-1A2B3C-0123456789abcdef']) {
      expect(REFERENCE_PATTERN.test(value)).toBe(false);
    }
  });

  test('the shipped allowlist matches this pattern', async () => {
    // Keeps the copy above honest. A regex edited in `utils.ts` without updating
    // this file would otherwise keep passing here while the handlers enforced
    // something else.
    const { readFile } = await import('node:fs/promises');
    const source = await readFile('supabase/functions/_lib/utils.ts', 'utf8');
    expect(source).toContain('/^aq[a-z0-9]{0,64}-[0-9a-f]{16,64}$/');
  });
});