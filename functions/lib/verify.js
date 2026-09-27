/**
 * Deciding whether money actually arrived.
 *
 * This module is deliberately free of any Firebase or HTTP dependency so the
 * decision that matters can be tested directly, with no emulator and no
 * network. It is Node-only and is never bundled into the browser app.
 *
 * The rule it exists to enforce: a payment counts as settled only when the
 * provider's own record agrees with the order we stored, on every field. A
 * client that says "I paid" proves nothing, and neither does a transaction whose
 * amount is smaller than the order it is being applied to.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret
 * key, hex encoded, in `x-paystack-signature`.
 *
 * `rawBody` must be the exact bytes received. Re-serialising parsed JSON to
 * validate it will fail on whitespace and key order, so pass the raw buffer.
 */
export function verifyPaystackSignature(rawBody, signature, secret) {
  if (!secret) return false;
  if (typeof signature !== 'string' || signature.length === 0) return false;

  const expected = createHmac('sha512', secret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'))
    .digest('hex');

  const provided = Buffer.from(signature.trim(), 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  // Length check first: timingSafeEqual throws on a length mismatch, and that
  // throw must not become a way to distinguish a bad signature from a short one.
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}

/** Paystack reports the terminal states we care about here. */
export const TERMINAL_STATUSES = new Set(['success', 'failed', 'abandoned', 'reversed']);

/**
 * Compare a provider transaction against the order it is claimed to settle.
 *
 * Returns `{ settled, reason }`. `reason` is a stable code for logs and for the
 * client, and is never a reason to be vague: when settlement is refused the
 * caller must be able to say why.
 */
export function checkSettlement({ transaction, order, currency = 'GHS' }) {
  if (!transaction || typeof transaction !== 'object') {
    return { settled: false, reason: 'no_transaction_record' };
  }
  if (!order || typeof order !== 'object') {
    return { settled: false, reason: 'no_matching_order' };
  }

  const status = String(transaction.status ?? '').toLowerCase();
  if (status !== 'success') {
    return { settled: false, reason: `provider_status_${status || 'unknown'}` };
  }

  // The reference must be the one we issued for this order. Without this, a
  // successful payment of any amount for any other order could be replayed here.
  if (String(transaction.reference ?? '') !== String(order.paystackReference ?? '')) {
    return { settled: false, reason: 'reference_mismatch' };
  }

  // Amount is compared in integer pesewas and must match exactly. This is what
  // stops a GH¢1.00 transaction from being applied to a GH¢300.00 order. A
  // partial payment is not a settled payment and must not be treated as one.
  if (!Number.isInteger(order.chargedMinor) || order.chargedMinor <= 0) {
    return { settled: false, reason: 'order_amount_invalid' };
  }
  if (!Number.isInteger(transaction.amount) || transaction.amount !== order.chargedMinor) {
    return { settled: false, reason: 'amount_mismatch' };
  }

  const paidCurrency = String(transaction.currency ?? '').toUpperCase();
  if (paidCurrency !== String(currency).toUpperCase()) {
    return { settled: false, reason: 'currency_mismatch' };
  }

  if (order.status === 'refunded') {
    return { settled: false, reason: 'already_refunded' };
  }

  return { settled: true, reason: 'settled', paidAt: transaction.paid_at ?? transaction.paidAt ?? null };
}

/**
 * A reference we can hand to Paystack and look up later.
 *
 * The order code is included so a support agent can recognise the reference
 * without a database lookup, and the random suffix keeps it unguessable, which
 * matters because the verify endpoint is reachable by anyone holding a
 * reference.
 */
export function newReference(orderCode) {
  const code = String(orderCode ?? 'aq').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'aq';
  return `${code}-${randomBytes(8).toString('hex')}`;
}

/**
 * Ghanaian mobile money numbers in E.164 form, the shape Paystack expects for
 * an MSISDN channel.
 */
export function normaliseMsisdn(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (/^0(2|5)\d{8}$/.test(digits)) return `+233${digits.slice(1)}`;
  if (/^233(2|5)\d{8}$/.test(digits)) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `+233${digits.slice(1)}`;
  return null;
}
