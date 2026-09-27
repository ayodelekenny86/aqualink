/**
 * Operations session tokens.
 *
 * Why this exists: the ops console used to authenticate against `localStorage`,
 * so the server had no idea who was calling it. That made every "admin" action
 * either impossible to secure or wide open. Giving ops a real, expiring,
 * server-verifiable token is what makes it possible to protect the endpoints
 * that change money and approve sellers.
 *
 * Deliberately not a JWT. There is nothing here that needs a third party to
 * verify it, and a plain HMAC over a compact payload is auditable in one file.
 * If this app ever needs tokens verified by services other than this repo, that
 * is the moment to move to a real library, not before.
 *
 * Node-only. It is never bundled into the browser app, which is why the signing
 * secret can live here.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SECONDS = 60 * 60 * 8; // One working day.

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Issue a token for an authenticated ops operator.
 *
 * `role` is embedded so a token minted for one role cannot be replayed where
 * another is expected, even if a future endpoint checks the wrong thing.
 */
export function signOpsToken({ email, role = 'ops', secret, ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now() }) {
  if (!secret) throw new Error('A signing secret is required to issue a session token.');
  if (!email) throw new Error('A session token needs an email.');

  const issuedAt = Math.floor(now / 1000);
  const payload = {
    // Trimmed as well as lowercased: a token subject that kept its surrounding
    // whitespace would not match the stored account email and would lock the
    // operator out of their own console over a stray space.
    sub: String(email).trim().toLowerCase(),
    role,
    iat: issuedAt,
    // A generous clock-skew allowance, because a phone or laptop with a wrong
    // clock should not lock an operator out of their own console.
    exp: issuedAt + Math.max(60, Math.floor(ttlSeconds)),
  };

  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

/**
 * Verify a token.
 *
 * Returns `{ valid, reason, payload }`. It fails closed in every branch: no
 * secret, malformed token, wrong signature, bad role, and expiry all return
 * `valid: false` rather than throwing, because every caller is an auth check and
 * an exception there would be a 500 instead of a 401.
 */
export function verifyOpsToken(token, secret, { now = Date.now(), requiredRole = 'ops' } = {}) {
  if (!secret) return { valid: false, reason: 'no_signing_secret' };
  if (typeof token !== 'string' || !token.includes('.')) return { valid: false, reason: 'malformed_token' };

  const [body, providedSignature] = token.split('.', 2);
  if (!body || !providedSignature) return { valid: false, reason: 'malformed_token' };

  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(providedSignature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length check first: timingSafeEqual throws on a mismatch, and that throw
  // must not reveal anything about which part was wrong.
  if (a.length !== b.length) return { valid: false, reason: 'invalid_signature' };
  if (!timingSafeEqual(a, b)) return { valid: false, reason: 'invalid_signature' };

  let payload;
  try {
    payload = JSON.parse(fromBase64url(body));
  } catch {
    return { valid: false, reason: 'unreadable_payload' };
  }

  const seconds = Math.floor(now / 1000);
  if (!Number.isFinite(payload?.exp)) return { valid: false, reason: 'missing_expiry' };
  if (seconds > payload.exp) return { valid: false, reason: 'expired' };
  // Reject a token minted in the future by more than the skew allowance, which
  // is what a replayed or doctored token would look like.
  if (Number.isFinite(payload.iat) && payload.iat - seconds > 60) {
    return { valid: false, reason: 'issued_in_future' };
  }
  if (requiredRole && payload.role !== requiredRole) return { valid: false, reason: 'wrong_role' };
  if (!payload.sub) return { valid: false, reason: 'missing_subject' };

  return { valid: true, reason: 'ok', payload };
}

/**
 * Pull the bearer token out of an `Authorization` header.
 * Returns an empty string rather than throwing when there is no header.
 */
export function bearerToken(req) {
  const header = typeof req?.get === 'function' ? req.get('authorization') : req?.headers?.authorization;
  if (typeof header !== 'string') return '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

/**
 * Validate an operator-supplied pricing change before it is stored.
 *
 * Rejects anything that would produce a nonsense price rather than storing it
 * and letting it reach a customer. Discount and surge are percentages, so a
 * value like 900 there is a typo that would charge thousands of cedis.
 */
export function validatePricingInput(pricing, split) {
  const problems = [];

  const listPrice = Number(pricing?.listPrice);
  if (!Number.isFinite(listPrice) || listPrice <= 0) problems.push('List price must be a positive number.');
  if (listPrice > 100000) problems.push('List price is implausibly large.');

  for (const [key, value] of [['discountPercent', pricing?.discountPercent], ['surgePercent', pricing?.surgePercent]]) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 100) problems.push(`${key} must be between 0 and 100.`);
  }

  if (pricing?.surgeReason !== undefined && String(pricing.surgeReason).length > 140) {
    problems.push('Surge reason must be 140 characters or fewer.');
  }

  if (split) {
    for (const key of ['buyerServiceCharge', 'seller', 'driver', 'platformCommission']) {
      const number = Number(split[key]);
      if (!Number.isFinite(number) || number < 0) problems.push(`${key} must be a non-negative number.`);
    }
    const allocated = ['seller', 'driver', 'platformCommission']
      .reduce((sum, key) => sum + (Number(split[key]) || 0), 0);
    if (Math.abs(allocated - 100) > 1e-9) {
      problems.push(`Seller, driver and platform shares must total 100% (they total ${allocated}%).`);
    }
  }

  return { valid: problems.length === 0, problems };
}
