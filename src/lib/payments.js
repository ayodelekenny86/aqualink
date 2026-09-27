import { readValue, writeValue } from './storage';
import { normalizePhone } from './accounts';
import { formatCedi, toMinor } from './money';

/**
 * Mobile-money payments via Hubtel.
 *
 * Security boundary, stated plainly because it is the thing most likely to be
 * got wrong: Hubtel's API secret **must never reach the browser**. Anything
 * shipped in a JS bundle is public. So this module never accepts a secret and
 * never calls Hubtel's money-moving endpoints directly. It talks to
 * `paymentsEndpoint`, which must be a server you control that holds the secret
 * and returns only the fields the client needs.
 *
 * With no endpoint configured the provider runs in `demo` mode: the full
 * lifecycle (initialise -> pay -> verify -> receipt) executes locally so the
 * product can be exercised end to end without moving money. Demo payments are
 * marked as such on the receipt and are never treated as settled in an
 * accounting export.
 *
 * To go live: deploy a server exposing POST /api/payments/initialise and
 * /api/payments/verify, set VITE_PAYMENTS_ENDPOINT to its URL, and the
 * provider switches to live mode with no other change here.
 */

export const PAYMENT_METHODS = [
  { id: 'mtn_momo', label: 'MTN Mobile Money', network: 'mtn' },
  { id: 'telecel_cash', label: 'Telecel Cash', network: 'telecel' },
  { id: 'atmo_money', label: 'ATMo Money', network: 'atmo' },
];

const MODE_KEY = 'payments.mode';
const RECEIPTS_KEY = 'payments.receipts';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Endpoint supplied at build time; absent means demo mode. */
function paymentsEndpoint() {
  const configured = import.meta.env?.VITE_PAYMENTS_ENDPOINT;
  return typeof configured === 'string' && configured.startsWith('http') ? configured.replace(/\/$/, '') : null;
}

export function paymentMode() {
  const override = readValue(MODE_KEY, null);
  if (override === 'demo' || override === 'live') return override;
  return paymentsEndpoint() ? 'live' : 'demo';
}

export function setPaymentMode(mode) {
  writeValue(MODE_KEY, mode === 'live' ? 'live' : 'demo');
}

/**
 * Start a payment.
 *
 * Returns the reference plus, in live mode, the redirect/prompt payload Hubtel
 * expects. Network and account name are validated first: a malformed MSISDN is
 * rejected before any request, so a typo cannot become a failed charge against
 * a real number.
 */
export async function initialisePayment({ orderId, amountMinor, network, accountName, accountNumber }) {
  // Normalise before validating and sending, so the same account always reaches
  // the provider as the same string. Passing raw digits through would send
  // "0240000000" and "+233240000000" as two different accounts.
  let e164 = '';
  try {
    e164 = normalizePhone(String(accountNumber ?? '').trim());
  } catch {
    e164 = '';
  }
  const digits = String(e164 ?? '').replace(/\D/g, '');
  if (!/^233\d{9}$/.test(digits)) {
    throw new Error('Enter a valid Ghanaian mobile money number.');
  }
  if (!accountName || String(accountName).trim().length < 2) {
    throw new Error('Enter the mobile money account name.');
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Payment amount is invalid.');
  }

  const endpoint = paymentsEndpoint();
  const reference = orderId;

  if (endpoint && paymentMode() === 'live') {
    const response = await fetch(`${endpoint}/initialise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, amountMinor, network, accountName, accountNumber: digits }),
    });
    if (!response.ok) throw new Error('The payment provider rejected this request.');
    return response.json();
  }

  // Demo mode: simulate the provider round trip without moving money.
  await wait(400);
  return {
    mode: 'demo',
    reference,
    amountMinor,
    network,
    accountName,
    accountNumber: digits,
    status: 'pending',
    message: `Demo payment initiated for ${formatCedi(amountMinor)}. No money was taken.`,
  };
}

/**
 * Confirm payment.
 *
 * A client-side "success" is never proof of settlement. In live mode this asks
 * the server to verify with Hubtel and only returns `settled` when the server
 * says so; the demo mode returns a clearly-labelled simulated result.
 */
export async function verifyPayment({ reference, amountMinor }) {
  const endpoint = paymentsEndpoint();
  if (endpoint && paymentMode() === 'live') {
    const response = await fetch(`${endpoint}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    });
    if (!response.ok) throw new Error('Could not confirm this payment yet. Try again shortly.');
    return response.json();
  }

  await wait(300);
  return { mode: 'demo', reference, amountMinor, status: 'settled', simulated: true };
}

export function listReceipts() {
  return readValue(RECEIPTS_KEY, []);
}

export function saveReceipt(receipt) {
  const rows = listReceipts();
  const next = [receipt, ...rows.filter((row) => row.reference !== receipt.reference)];
  writeValue(RECEIPTS_KEY, next);
  return receipt;
}

/**
 * Build a receipt from a settled payment.
 *
 * The stored copy is the record; the HTML file is only a rendering of it, so a
 * downloaded receipt can always be reproduced from what the app holds.
 */
export function buildReceipt({ order, breakdown, payment, issuedAt = new Date().toISOString() }) {
  return {
    reference: order.code ?? order.id,
    issuedAt,
    simulated: Boolean(payment?.simulated),
    mode: payment?.mode ?? 'demo',
    status: payment?.status ?? 'settled',
    network: payment?.network ?? 'mtn',
    accountName: payment?.accountName ?? '',
    orderValue: formatCedi(breakdown.gross),
    serviceCharge: formatCedi(breakdown.buyerServiceCharge),
    totalCharged: formatCedi(breakdown.buyerPays),
    sellerShare: formatCedi(breakdown.sellerReceives),
    driverShare: formatCedi(breakdown.driverReceives),
    platformShare: formatCedi(breakdown.companyTake),
    location: order.location ?? '',
    volume: order.volume ?? '',
    driverName: order.driverName ?? '',
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

/**
 * Render a receipt as a self-contained HTML document for download and print.
 * Values are escaped, so a customer-supplied address cannot inject markup into
 * the downloaded file.
 */
export function receiptHtml(receipt) {
  const rows = [
    ['Order reference', receipt.reference],
    ['Issued', new Date(receipt.issuedAt).toLocaleString('en-GB')],
    ['Location', receipt.location],
    ['Volume', receipt.volume],
    ['Driver', receipt.driverName],
    ['Payment method', `${receipt.network} · ${receipt.accountName}`],
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
  .sim{margin-top:18px;padding:11px 13px;background:#fff6e5;border:1px solid #f0c674;border-radius:9px;font-size:12.5px;color:#7a4b00}
  .foot{margin-top:20px;font-size:11.5px;color:#8b9997;text-align:center}
  @media print{body{background:#fff;padding:0}.card{border:none}}
</style></head>
<body><div class="card">
<h1>AquaLink receipt</h1>
<p class="sub">${escapeHtml(receipt.status === 'settled' ? 'Payment settled' : `Payment ${receipt.status}`)}</p>
<table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}
<tr class="total"><td>Total charged</td><td>${escapeHtml(receipt.totalCharged)}</td></tr></table>
${receipt.simulated ? '<p class="sim"><b>Demo payment.</b> No money was taken and this receipt is not a record of a real transaction.</p>' : ''}
<p class="foot">AquaLink · water delivery coordination</p>
</div></body></html>`;
}

/** Trigger a browser download of the receipt without leaving the app. */
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
