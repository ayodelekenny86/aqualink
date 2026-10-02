/**
 * Ops session tokens and Paystack verification.
 * Mirrors functions/lib/session.js and functions/lib/verify.js.
 */
import { Buffer } from 'node:buffer';
import { createHmac, randomBytes } from 'node:crypto';

export const DEFAULT_TTL_SECONDS = 60 * 60 * 8;

/**
 * Deno has no global `Buffer` and its `node:crypto` shim rejects the
 * `'base64url'` digest encoding, so `Buffer` is imported explicitly and the
 * base64url encoding is applied by hand. Without both, every ops sign-in and
 * Paystack signature check 500s.
 */
function digestBase64url(hash: { digest(): Uint8Array }): string {
  return Buffer.from(hash.digest()).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function constantTimeEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

export interface OpsPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

export function signOpsToken({
  email,
  role = 'ops',
  secret,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  now = Date.now(),
}: {
  email: string;
  role?: string;
  secret: string;
  ttlSeconds?: number;
  now?: number;
}): string {
  if (!secret) throw new Error('A signing secret is required to issue a session token.');
  if (!email) throw new Error('A session token needs an email.');

  const issuedAt = Math.floor(now / 1000);
  const payload: OpsPayload = {
    sub: String(email).trim().toLowerCase(),
    role,
    iat: issuedAt,
    exp: issuedAt + Math.max(60, Math.floor(ttlSeconds)),
  };

  const body = base64url(JSON.stringify(payload));
  const signature = digestBase64url(createHmac('sha256', secret).update(body));
  return `${body}.${signature}`;
}

export function verifyOpsToken(
  token: string,
  secret: string,
  { now = Date.now(), requiredRole = 'ops' }: { now?: number; requiredRole?: string } = {},
): { valid: boolean; reason: string; payload?: OpsPayload } {
  if (!secret) return { valid: false, reason: 'no_signing_secret' };
  if (typeof token !== 'string' || !token.includes('.')) return { valid: false, reason: 'malformed_token' };

  const [body, providedSignature] = token.split('.', 2);
  if (!body || !providedSignature) return { valid: false, reason: 'malformed_token' };

  const expected = digestBase64url(createHmac('sha256', secret).update(body));
  if (!constantTimeEquals(providedSignature, expected)) return { valid: false, reason: 'invalid_signature' };

  let payload: OpsPayload;
  try {
    payload = JSON.parse(fromBase64url(body));
  } catch {
    return { valid: false, reason: 'unreadable_payload' };
  }

  const seconds = Math.floor(now / 1000);
  if (!Number.isFinite(payload?.exp)) return { valid: false, reason: 'missing_expiry' };
  if (seconds > payload.exp) return { valid: false, reason: 'expired' };
  if (Number.isFinite(payload.iat) && payload.iat - seconds > 60) return { valid: false, reason: 'issued_in_future' };
  if (requiredRole && payload.role !== requiredRole) return { valid: false, reason: 'wrong_role' };
  if (!payload.sub) return { valid: false, reason: 'missing_subject' };

  return { valid: true, reason: 'ok', payload };
}

export function bearerToken(req: Request): string {
  const header = req.headers.get('authorization');
  if (!header) return '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

export function validatePricingInput(pricing: any, split?: any) {
  const problems: string[] = [];

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
      const number = Number((split as any)[key]);
      if (!Number.isFinite(number) || number < 0) problems.push(`${key} must be a non-negative number.`);
    }
    const allocated = ['seller', 'driver', 'platformCommission'].reduce((sum, key) => sum + (Number((split as any)[key]) || 0), 0);
    if (Math.abs(allocated - 100) > 1e-9) {
      problems.push(`Shares must total 100% (got ${allocated}%).`);
    }
  }

  return { valid: problems.length === 0, problems };
}

export const TERMINAL_STATUSES = new Set(['success', 'failed', 'abandoned', 'reversed']);

export function verifyPaystackSignature(rawBody: string | Buffer, signature: string | null, secret: string): boolean {
  if (!secret) return false;
  if (typeof signature !== 'string' || signature.length === 0) return false;

  const expected = createHmac('sha512', secret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'))
    .digest('hex');

  const provided = String(signature).trim();
  return constantTimeEquals(provided, expected);
}

export function checkSettlement({ transaction, order, currency = 'GHS' }: {
  transaction?: any;
  order?: any;
  currency?: string;
}): { settled: boolean; reason: string; paidAt?: string | null } {
  if (!transaction || typeof transaction !== 'object') return { settled: false, reason: 'no_transaction_record' };
  if (!order || typeof order !== 'object') return { settled: false, reason: 'no_matching_order' };

  const status = String(transaction.status ?? '').toLowerCase();
  if (status !== 'success') return { settled: false, reason: `provider_status_${status || 'unknown'}` };

  if (String(transaction.reference ?? '') !== String(order.paystack_reference ?? '')) {
    return { settled: false, reason: 'reference_mismatch' };
  }

  if (!Number.isInteger(order.charged_minor) || order.charged_minor <= 0) return { settled: false, reason: 'order_amount_invalid' };
  if (!Number.isInteger(transaction.amount) || transaction.amount !== order.charged_minor) {
    return { settled: false, reason: 'amount_mismatch' };
  }

  const paidCurrency = String(transaction.currency ?? '').toUpperCase();
  if (paidCurrency !== String(currency).toUpperCase()) return { settled: false, reason: 'currency_mismatch' };

  if (order.status === 'refunded') return { settled: false, reason: 'already_refunded' };

  return { settled: true, reason: 'settled', paidAt: transaction.paid_at ?? transaction.paidAt ?? null };
}

export function newReference(orderCode: string): string {
  const code = String(orderCode ?? 'aq').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'aq';
  return `${code}-${randomBytes(8).toString('hex')}`;
}

export function normaliseMsisdn(value: string): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (/^0(2|5)\d{8}$/.test(digits)) return `+233${digits.slice(1)}`;
  if (/^233(2|5)\d{8}$/.test(digits)) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `+233${digits.slice(1)}`;
  return null;
}

/**
 * Verify a Flutterwave webhook signature.
 *
 * Flutterwave signs webhooks with HMAC-SHA256 using the secret key over the
 * raw request body, and puts the digest in the `verifier` header. The check is
 * the same shape as Paystack's: reject anything unsigned before touching the
 * body, so a forged webhook can never settle an order.
 */
export function verifyFlutterwaveSignature(rawBody: string | Buffer, signature: string | null, secret: string): boolean {
  if (!secret) return false;
  if (typeof signature !== 'string' || signature.length === 0) return false;

  const expected = createHmac('sha256', secret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'))
    .digest('hex');

  return constantTimeEquals(String(signature).trim(), expected);
}

/**
 * Decide whether a Flutterwave transaction record settles the order.
 *
 * Flutterwave reports success as `status === 'successful'` and carries the
 * charged amount in `data.amount` (integer minor units) with the currency in
 * `data.currency`. This mirrors `checkSettlement` for Paystack so the caller
 * can dispatch on provider without re-learning each one's field names.
 */
export function checkFlutterwaveSettlement({ transaction, order, currency = 'GHS' }: {
  transaction?: any; order?: any; currency?: string;
}): { settled: boolean; reason: string; paidAt?: string | null } {
  if (!transaction || typeof transaction !== 'object') return { settled: false, reason: 'no_transaction_record' };
  if (!order || typeof order !== 'object') return { settled: false, reason: 'no_matching_order' };

  const data = transaction.data ?? transaction;
  const status = String(data?.status ?? transaction.status ?? '').toLowerCase();
  if (status !== 'successful') return { settled: false, reason: `provider_status_${status || 'unknown'}` };

  if (String(data?.tx_ref ?? '') !== String(order.flutterwave_reference ?? '')) {
    return { settled: false, reason: 'reference_mismatch' };
  }

  if (!Number.isInteger(order.charged_minor) || order.charged_minor <= 0) return { settled: false, reason: 'order_amount_invalid' };
  const amount = Number(data?.amount);
  if (!Number.isFinite(amount) || Math.round(amount) !== order.charged_minor) {
    return { settled: false, reason: 'amount_mismatch' };
  }

  const paidCurrency = String(data?.currency ?? '').toUpperCase();
  if (paidCurrency !== String(currency).toUpperCase()) return { settled: false, reason: 'currency_mismatch' };

  if (order.status === 'refunded') return { settled: false, reason: 'already_refunded' };

  return { settled: true, reason: 'settled', paidAt: data?.created_at ?? transaction.created_at ?? null };
}
