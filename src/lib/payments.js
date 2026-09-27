import { readValue, writeValue } from './storage';
import { formatCedi, toMinor } from './money';

/**
 * Payment client.
 *
 * This module no longer contains a demo path, and that is the most important
 * thing in it. The previous version had a `demo` mode whose `verifyPayment`
 * returned `status: 'settled'` whenever a timer elapsed, which meant the app
 * could mark an order paid, mint a receipt, and report revenue without any money
 * moving. That is not a demo, it is a way to make a business believe it was
 * paid.
 *
 * So there is exactly one code path now, and it talks to the AquaLink server:
 *
 *   - the server holds the Paystack secret and is never shipped to a browser;
 *   - the server prices the order, so a tampered client cannot lower the amount;
 *   - the server asks Paystack whether money arrived and compares that answer to
 *     the order it stored before reporting `settled`.
 *
 * When the server is unreachable or unconfigured, every function here throws.
 * Nothing is faked, and no receipt can be produced.
 */

const RECEIPTS_KEY = 'payments.receipts';
const API_ROOT = '/api';

/**
 * Whether the deployment can take payments at all.
 *
 * The server is the only thing that knows if it is configured, so this is a hint
 * for the UI, never a decision. The UI uses it to explain itself early; the
 * authoritative check is the server refusing to charge.
 */
export function paymentsConfigured() {
  return typeof import.meta.env?.VITE_API_BASE === 'string'
    ? import.meta.env.VITE_API_BASE.length > 0
    : true;
}

function apiBase() {
  const configured = import.meta.env?.VITE_API_BASE;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/$/, '');
  }
  // Same origin by default: Firebase Hosting proxies /api/* to the functions in
  // firebase.json, which keeps the functions domain out of the client entirely.
  return API_ROOT;
}

async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    signal,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('The payments service returned an unreadable response.');
  }

  if (!response.ok) {
    // The server's message is written for a customer, so prefer it over anything
    // generic. Fall back only when there is none.
    throw new Error(payload.message || `The payments service is unavailable (${response.status}).`);
  }
  return payload;
}

/**
 * Fetch the authoritative price for a booking.
 *
 * The figure the buyer is shown comes from the same function that will price
 * the order, so the two cannot disagree.
 */
export async function fetchQuote({ volumeLitres = 0, signal } = {}) {
  const query = new URLSearchParams({ volume: String(volumeLitres) });
  return apiRequest(`/pricing?${query}`, { signal });
}

/**
 * Create an order. The server decides the price and returns it; any amount the
 * browser might have wanted to send is not accepted.
 */
export async function createOrder({ email, phone, location, volumeLitres }, { signal } = {}) {
  const payload = await apiRequest('/orders', {
    method: 'POST',
    signal,
    body: { email, phone, location, volumeLitres },
  });
  return payload.order;
}

/**
 * Start a payment and hand back the URL to send the customer to.
 *
 * The result is `status: 'pending'` even on success. Creating a Paystack
 * transaction is not receiving money, and returning anything else here is how a
 * redirect flow ends up telling a customer they paid before they have.
 */
export async function initialisePayment({ orderId, email }, { signal } = {}) {
  const payload = await apiRequest('/payments/initialize', {
    method: 'POST',
    signal,
    body: { orderId, email },
  });

  if (payload.alreadyPaid) {
    return { ...payload, status: 'settled', alreadyPaid: true };
  }
  if (!payload.authorizationUrl) {
    throw new Error('The payment provider did not return a payment page.');
  }
  // Deliberately normalised to `pending` no matter what the response said. The
  // initialise leg creates a transaction; it is not the thing that proves money
  // moved, so it is never allowed to report otherwise.
  return { ...payload, status: 'pending' };
}

/**
 * Ask the server whether a payment actually settled.
 *
 * This is a question, not a decision. `settled: true` is the only thing in the
 * app that means money arrived, and it is set by the server after it has
 * compared Paystack's record to the stored order.
 */
export async function verifyPayment({ reference }, { signal } = {}) {
  if (!reference) throw new Error('A payment reference is required.');
  return apiRequest(`/payments/verify?reference=${encodeURIComponent(reference)}`, { signal });
}

/**
 * Read a Paystack reference out of the return URL.
 *
 * Paystack appends `reference` (and `trxref`) to the callback URL, which is a
 * hash route here, so the query can arrive inside the fragment.
 */
export function referenceFromLocation(location = globalThis.location) {
  if (!location) return '';
  const hash = String(location.hash ?? '');
  const fromHash = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const params = new URLSearchParams(fromHash || String(location.search ?? ''));
  return String(params.get('reference') ?? '').trim();
}

export function listReceipts() {
  const rows = readValue(RECEIPTS_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

export function saveReceipt(receipt) {
  const rows = listReceipts();
  writeValue(RECEIPTS_KEY, [receipt, ...rows.filter((row) => row.reference !== receipt.reference)]);
  return receipt;
}

/**
 * Build a receipt from a settlement the server has already confirmed.
 *
 * There is no `simulated` flag any more because there is no simulated result to
 * flag. A receipt is only ever built from `settled: true`.
 */
export function buildReceipt({ order, payment, breakdown, issuedAt = new Date().toISOString() }) {
  // The customer paid the order value plus the service charge. Deriving the
  // total from the order value alone would quietly under-report what was taken.
  const grossMinor = breakdown?.grossMinor ?? 0;
  const buyerServiceCharge = breakdown?.buyerServiceCharge ?? 0;
  const totalChargedMinor = breakdown?.buyerPays ?? breakdown?.chargedMinor ?? grossMinor + buyerServiceCharge;

  return {
    reference: payment.reference ?? order.code ?? order.id,
    orderId: order.id ?? order.code,
    issuedAt,
    status: 'settled',
    paidAt: payment.paidAt ?? null,
    accountName: order.email ?? '',
    currency: payment.currency ?? 'GHS',
    orderValue: formatCedi(grossMinor),
    serviceCharge: formatCedi(buyerServiceCharge),
    totalCharged: formatCedi(totalChargedMinor),
    sellerShare: formatCedi(breakdown?.sellerReceives ?? 0),
    driverShare: formatCedi(breakdown?.driverReceives ?? 0),
    platformShare: formatCedi(breakdown?.platformCommission ?? 0),
    location: order.location ?? '',
    volume: order.volumeLitres ? `${order.volumeLitres} litres` : '',
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

/**
 * Render a receipt as a self-contained HTML document for download and print.
 * Every value is escaped, so a customer-supplied address cannot inject markup
 * into the downloaded file.
 */
export function receiptHtml(receipt) {
  const rows = [
    ['Order reference', receipt.reference],
    ['Order number', receipt.orderId],
    ['Issued', new Date(receipt.issuedAt).toLocaleString('en-GB')],
    ['Location', receipt.location],
    ['Volume', receipt.volume],
    ['Paid to', receipt.accountName],
    ['Order value', receipt.orderValue],
    ['Service charge', receipt.serviceCharge],
    ['Total charged', receipt.totalCharged],
    ['Water seller share', receipt.sellerShare],
    ['Driver share', receipt.driverShare],
    ['AquaLink share', receipt.platformShare],
  ];

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AquaLink receipt ${escapeHtml(receipt.reference)}</title>
<style>
  body{font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:32px;background:#f6f8f8;color:#16333a}
  .card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2eae9;border-radius:14px;padding:28px}
  h1{font-size:20px;margin:0 0 2px}
  .sub{color:#7d8c8a;font-size:13px;margin:0 0 20px}
  table{width:100%;border-collapse:collapse}
  td{padding:9px 0;border-bottom:1px solid #eef2f1;vertical-align:top}
  td:first-child{color:#5d6f6d;width:52%}
  td:last-child{text-align:right;font-weight:600}
  .total td{font-size:17px;border-bottom:none;border-top:2px solid #16333a;padding-top:13px}
  .foot{margin-top:20px;font-size:11.5px;color:#8b9997;text-align:center}
  @media print{body{background:#fff;padding:0}.card{border:none}}
</style></head>
<body><div class="card">
<h1>AquaLink receipt</h1>
<p class="sub">Payment confirmed by Paystack</p>
<table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}
<tr class="total"><td>Total charged</td><td>${escapeHtml(receipt.totalCharged)}</td></tr></table>
<p class="foot">AquaLink · water delivery coordination</p>
</div></body></html>`;
}

export function downloadReceipt(receipt) {
  const blob = new Blob([receiptHtml(receipt)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `aqualink-receipt-${receipt.reference}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export { toMinor };
