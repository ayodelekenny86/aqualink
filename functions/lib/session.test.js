import { describe, expect, test } from 'vitest';
import { bearerToken, signOpsToken, validatePricingInput, verifyOpsToken } from './session.js';
import { DEFAULT_PRICING, DEFAULT_SPLIT } from './pricing.js';

/**
 * These tokens are the only thing standing between an anonymous HTTP request and
 * the endpoints that change pricing and approve sellers, so the tests are mostly
 * about what the verifier refuses.
 */

const SECRET = 'ops-session-signing-secret';
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

function okToken(overrides = {}) {
  return signOpsToken({ email: 'ops@aqualink.gh', secret: SECRET, now: NOW, ...overrides });
}

describe('issuing ops tokens', () => {
  test('produces a token that verifies', () => {
    const result = verifyOpsToken(okToken(), SECRET, { now: NOW });
    expect(result.valid).toBe(true);
    expect(result.payload.sub).toBe('ops@aqualink.gh');
    expect(result.payload.role).toBe('ops');
  });

  test('refuses to issue a token with no secret', () => {
    expect(() => signOpsToken({ email: 'ops@aqualink.gh', secret: '' })).toThrow(/signing secret/i);
  });

  test('refuses to issue a token with no subject', () => {
    expect(() => signOpsToken({ email: '', secret: SECRET })).toThrow(/email/i);
  });

  test('lowercases the subject so identity is not case-dependent', () => {
    const token = signOpsToken({ email: '  OPS@AquaLink.GH ', secret: SECRET, now: NOW });
    expect(verifyOpsToken(token, SECRET, { now: NOW }).payload.sub).toBe('ops@aqualink.gh');
  });
});

describe('verifying ops tokens', () => {
  test('rejects a token signed with a different secret', () => {
    const forged = signOpsToken({ email: 'ops@aqualink.gh', secret: 'another-secret', now: NOW });
    const result = verifyOpsToken(forged, SECRET, { now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  test('rejects a tampered payload even with a valid signature shape', () => {
    // Re-encoding a different subject but keeping the old signature must fail.
    const [body] = okToken().split('.');
    const tampered = `${body}.${'A'.repeat(43)}`;
    expect(verifyOpsToken(tampered, SECRET, { now: NOW }).valid).toBe(false);
  });

  test('rejects an expired token', () => {
    const token = okToken({ ttlSeconds: 60 });
    const result = verifyOpsToken(token, SECRET, { now: NOW + 120_000 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  test('accepts a token that has not expired', () => {
    const token = okToken({ ttlSeconds: 3600 });
    expect(verifyOpsToken(token, SECRET, { now: NOW + 3_500_000 }).valid).toBe(true);
  });

  test('rejects a token issued far in the future', () => {
    const token = okToken();
    const result = verifyOpsToken(token, SECRET, { now: NOW - 10 * 60_000 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('issued_in_future');
  });

  test('tolerates a small clock skew rather than locking an operator out', () => {
    const token = okToken();
    expect(verifyOpsToken(token, SECRET, { now: NOW - 30_000 }).valid).toBe(true);
  });

  test('rejects a token minted for a different role', () => {
    const token = okToken({ role: 'buyer' });
    const result = verifyOpsToken(token, SECRET, { now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_role');
  });

  test('fails closed when no signing secret is configured', () => {
    // A deployment missing its secret must reject every token, not accept all.
    const result = verifyOpsToken(okToken(), '', { now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no_signing_secret');
  });

  test('rejects malformed input without throwing', () => {
    for (const value of ['', 'nodot', 'a.b', null, undefined, 42, {}]) {
      expect(() => verifyOpsToken(value, SECRET, { now: NOW })).not.toThrow();
      expect(verifyOpsToken(value, SECRET, { now: NOW }).valid).toBe(false);
    }
  });

  test('rejects a payload that is not valid JSON', () => {
    const token = `${Buffer.from('not json').toString('base64url')}.${'A'.repeat(43)}`;
    const result = verifyOpsToken(token, SECRET, { now: NOW });
    expect(result.valid).toBe(false);
  });
});

describe('bearer token extraction', () => {
  test('reads a well-formed header', () => {
    expect(bearerToken({ get: () => 'Bearer abc.def' })).toBe('abc.def');
    expect(bearerToken({ get: () => 'bearer   abc.def  ' })).toBe('abc.def');
  });

  test('returns empty for anything else, so a missing header is not an exception', () => {
    expect(bearerToken({ get: () => '' })).toBe('');
    expect(bearerToken({ get: () => 'Basic dXNlcjpwYXNz' })).toBe('');
    expect(bearerToken({ get: () => 'Bearer' })).toBe('');
    expect(bearerToken({})).toBe('');
    expect(bearerToken(null)).toBe('');
  });
});

describe('pricing input validation', () => {
  test('accepts the defaults', () => {
    expect(validatePricingInput(DEFAULT_PRICING, DEFAULT_SPLIT)).toEqual({ valid: true, problems: [] });
  });

  test('rejects a percentage outside 0-100, which would charge nonsense', () => {
    const result = validatePricingInput({ ...DEFAULT_PRICING, discountPercent: 900 }, DEFAULT_SPLIT);
    expect(result.valid).toBe(false);
    expect(result.problems.join(' ')).toMatch(/discountPercent must be between 0 and 100/);
  });

  test('rejects the same for surge', () => {
    expect(validatePricingInput({ ...DEFAULT_PRICING, surgePercent: -1 }, DEFAULT_SPLIT).valid).toBe(false);
  });

  test('rejects a non-positive or absurd list price', () => {
    expect(validatePricingInput({ ...DEFAULT_PRICING, listPrice: 0 }, DEFAULT_SPLIT).valid).toBe(false);
    expect(validatePricingInput({ ...DEFAULT_PRICING, listPrice: -5 }, DEFAULT_SPLIT).valid).toBe(false);
    expect(validatePricingInput({ ...DEFAULT_PRICING, listPrice: 1e9 }, DEFAULT_SPLIT).valid).toBe(false);
  });

  test('rejects a split that does not close', () => {
    const result = validatePricingInput(DEFAULT_PRICING, { ...DEFAULT_SPLIT, driver: 5 });
    expect(result.valid).toBe(false);
    expect(result.problems.join(' ')).toMatch(/total 100%/);
  });

  test('rejects a negative share', () => {
    expect(validatePricingInput(DEFAULT_PRICING, { ...DEFAULT_SPLIT, seller: -10 }).valid).toBe(false);
  });

  test('rejects an over-long surge reason', () => {
    const result = validatePricingInput({ ...DEFAULT_PRICING, surgeReason: 'x'.repeat(200) }, DEFAULT_SPLIT);
    expect(result.valid).toBe(false);
    expect(result.problems.join(' ')).toMatch(/140 characters/);
  });

  test('reports every problem at once rather than one per round trip', () => {
    const result = validatePricingInput(
      { listPrice: -1, discountPercent: 900, surgePercent: 900, surgeReason: 'x'.repeat(200) },
      { ...DEFAULT_SPLIT, driver: 0 },
    );
    expect(result.problems.length).toBeGreaterThanOrEqual(4);
  });

  test('accepts a pricing change with no split supplied', () => {
    expect(validatePricingInput({ ...DEFAULT_PRICING, listPrice: 750 }, null).valid).toBe(true);
  });
});
