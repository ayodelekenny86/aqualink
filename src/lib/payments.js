import { readValue, writeValue } from './storage';
import { formatCedi, toMinor } from './money';
import { apiRequest, apiTarget } from './api';

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

/**
 * Whether the deployment can take payments at all.
 *
 * The server is the only thing that knows if it is configured, so this is a hint
 * for the UI, never a decision. The UI uses it to explain itself early; the
 * authoritative check is the server refusing to charge.
 */
export function paymentsConfigured() {
  if (apiTarget() === 'supabase') return true;
  return typeof import.meta.env?.VITE_API_BASE === 'string'
    ? import.meta.env.VITE_API_BASE.length > 0
    : true;
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
 * The field names the server sends, and the camelCase names the app reads.
 *
 * The order endpoint is a Postgres-shaped API, so its amounts arrive
 * snake_cased: `charged_minor`, `gross_minor`, `buyer_service_charge`. The rest
 * of the app reads camelCase (`chargedMinor`), and `createOrder` used to hand
 * the response straight back, so every amount was `undefined` on a real booking.
 * `formatCedi(undefined)` renders **GH₵NaN.NaN**, which is what a buyer was told
 * they would be charged, and what every payout figure in the order was derived
 * from. Tests never saw it because the stub returned camelCase.
 *
 * Nested `pricing` and `split` objects are already camelCase on the server, so
 * they are passed through untouched.
 */
const ORDER_AMOUNT_FIELDS = [
  ['list_minor', 'listMinor'],
  ['volume_litres', 'volumeLitres'],
  ['gross_minor', 'grossMinor'],
  ['charged_minor', 'chargedMinor'],
  ['buyer_pays', 'buyerPays'],
  ['buyer_service_charge', 'buyerServiceCharge'],
  ['seller_receives', 'sellerReceives'],
  ['driver_receives', 'driverReceives'],
  ['platform_commission', 'platformCommission'],
  ['company_take', 'companyTake'],
  ['discount_minor', 'discountMinor'],
  ['surge_minor', 'surgeMinor'],
  ['paystack_reference', 'paystackReference'],
  ['created_at', 'createdAt'],
];

/**
 * Rename the server's order fields to the names the app reads.
 *
 * Amounts are carried through as-is rather than recomputed: the server owns the
 * price, and the client exists only to display what it was told.
 */
export function normaliseOrder(order) {
  if (!order || typeof order !== 'object') return order;
  const normalised = { ...order };
  for (const [from, to] of ORDER_AMOUNT_FIELDS) {
    if (normalised[to] === undefined && normalised[from] !== undefined) {
      normalised[to] = normalised[from];
    }
  }
  // The server never sends the undiscounted list price as an amount. It sends
  // the gross (post-discount) figure and the discount it took, so the list
  // price is those two added back together. Falling back to the gross figure
  // instead made a 25%-off order advertise its discounted price as the list
  // price, which is how a 50%-off GH₵600 booking listed GH₵300.
  if (normalised.listMinor === undefined
    && Number.isFinite(normalised.grossMinor)
    && Number.isFinite(normalised.discountMinor)) {
    normalised.listMinor = normalised.grossMinor + normalised.discountMinor;
  }
  return normalised;
}

/**
 * The reverse of `normaliseOrder`: the columns the `orders` table actually has.
 *
 * The client used to push its whole display object at the table. That object is
 * full of fields the server never created — `price`, `listPrice`, `whatsapp`,
 * `buyerPhone`, `chargedMinor` and so on — so PostgREST rejected the entire
 * statement with `column orders.price does not exist`. The server's own row was
 * already correct, so nothing was lost by dropping the write, but the client
 * fields that belong on that row (the driver and seller it assigned) never
 * landed either.
 *
 * Only names the server created are sent. The display fields stay in the local
 * cache, which is where the app reads them from anyway.
 */
export function toServerOrderRow(order) {
  const pick = (key) => (order?.[key] === undefined ? undefined : order[key]);
  const row = {
    code: pick('code'),
    email: pick('email'),
    phone: pick('phone'),
    location: pick('location'),
    volume_litres: pick('volumeLitres'),
    currency: pick('currency') ?? 'GHS',
    pricing: pick('pricing'),
    split: pick('split'),
    gross_minor: pick('grossMinor'),
    charged_minor: pick('chargedMinor'),
    buyer_pays: pick('buyerPays'),
    buyer_service_charge: pick('buyerServiceCharge'),
    seller_receives: pick('sellerReceives'),
    driver_receives: pick('driverReceives'),
    platform_commission: pick('platformCommission'),
    company_take: pick('companyTake'),
    discount_minor: pick('discountMinor'),
    surge_minor: pick('surgeMinor'),
    paystack_reference: pick('paystackReference') ?? null,
  };
  // Drop the keys the order never had rather than sending `undefined`, which
  // PostgREST rejects as a null on a not-null column.
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
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
  return normaliseOrder(payload.order);
}

/**
 * Start a payment and hand back the URL to send the customer to.
 *
 * The result is `status: 'pending'` even on success. Creating a transaction is
 * not receiving money, and returning anything else here is how a redirect flow
 * ends up telling a customer they paid before they have.
 *
 * `provider` is optional and defaults to Paystack. Flutterwave is supported as
 * well — both are live simultaneously, each behind its own secret, and the
 * server rejects a request for a provider whose key is not set.
 */
export async function initialisePayment({ orderId, email, provider = 'paystack' }, { signal } = {}) {
  const payload = await apiRequest('/payments/initialize', {
    method: 'POST',
    signal,
    body: { orderId, email, provider },
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
 * Read a payment reference out of the return URL.
 *
 * Paystack appends `reference` (and `trxref`) to the callback URL, and
 * Flutterwave appends `tx_ref`. The callback is a hash route here, so the
 * query can arrive inside the fragment. Returns whichever the provider used,
 * or '' when neither is present — the verify call below needs a reference and
 * throws on an empty one, so this cannot hand back a guess.
 */
export function referenceFromLocation(location = globalThis.location) {
  if (!location) return '';
  const hash = String(location.hash ?? '');
  const fromHash = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const params = new URLSearchParams(fromHash || String(location.search ?? ''));
  return String(params.get('reference') ?? params.get('tx_ref') ?? '').trim();
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
 *
 * Where the figures come from, and why `breakdown` is not the whole answer:
 *
 * `/payments/verify` returns the amount the provider actually took
 * (`amountMinor`) but **no revenue split**. The panel passed `result.breakdown`,
 * which was therefore always `undefined` in production, so every figure below
 * fell through to `?? 0` and the customer's receipt read GH₵0.00 for the order
 * value, the total charged, and all three shares — on a document they keep, for
 * a payment that had just taken GH₵300.00. The tests passed because they handed
 * `buildReceipt` a hand-written breakdown the server never sends.
 *
 * Nothing is re-derived here. The split is what the server wrote onto the order
 * when it priced the booking, and the total is what the settlement reports it
 * took. Where neither is known the figure is left unstated rather than shown as
 * a confident zero.
 */
export function buildReceipt({ order, payment, breakdown, issuedAt = new Date().toISOString() }) {
  const source = breakdown ?? order ?? {};

  // The order value is what the server priced, before any service charge. It is
  // reported separately so a receipt cannot present the discounted total as the
  // whole bill — which is how a receipt once understated GH¢330.00 as GH₵300.00.
  const grossMinor = source.grossMinor;
  const buyerServiceCharge = source.buyerServiceCharge ?? 0;

  // What the settlement says was taken wins; the priced figure is the fallback.
  const settledMinor = Number.isFinite(payment?.amountMinor) ? payment.amountMinor : undefined;
  const totalChargedMinor = settledMinor ?? source.buyerPays ?? source.chargedMinor
    ?? (Number.isFinite(grossMinor) ? grossMinor + buyerServiceCharge : undefined);

  const line = (minor) => (Number.isFinite(minor) ? formatCedi(minor) : null);

  return {
    reference: payment.reference ?? order.code ?? order.id,
    orderId: order.id ?? order.code,
    issuedAt,
    status: 'settled',
    paidAt: payment.paidAt ?? null,
    accountName: order.email ?? '',
    currency: payment.currency ?? 'GHS',
    provider: payment.provider ?? null,
    orderValue: line(grossMinor),
    // Omitted when there is no charge, so a receipt does not itemise a
    // GH₵0.00 fee the customer was never billed.
    ...(buyerServiceCharge > 0 ? { serviceCharge: formatCedi(buyerServiceCharge) } : {}),
    totalCharged: line(totalChargedMinor),
    sellerShare: line(source.sellerReceives),
    driverShare: line(source.driverReceives),
    platformShare: line(source.platformCommission),
    location: order.location ?? '',
    volume: order.volumeLitres ? `${order.volumeLitres} litres` : '',
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

/** What a receipt says about a figure the server never sent. */
export const NOT_RECORDED = 'Not recorded';

/**
 * Render one receipt value for display, on screen or in the document.
 *
 * `buildReceipt` leaves an unknown figure null instead of defaulting it, because
 * a receipt reading GH₵0.00 for a settled payment is worse than one admitting the
 * figure is missing. Both places that show a receipt then print this instead of
 * a blank cell, so the on-screen card and the downloaded document cannot disagree
 * about what was and was not recorded.
 */
export function receiptCell(value) {
  return value === null || value === undefined || value === '' ? NOT_RECORDED : String(value);
}

/**
 * Render a receipt as a self-contained HTML document for download and print.
 * Every value is escaped, so a customer-supplied address cannot inject markup
 * into the downloaded file.
 */
export function receiptHtml(receipt) {
  const cell = receiptCell;

  const rows = [
    ['Order reference', cell(receipt.reference)],
    ['Order number', cell(receipt.orderId)],
    ['Issued', cell(new Date(receipt.issuedAt).toLocaleString('en-GB'))],
    ['Location', cell(receipt.location)],
    ['Volume', cell(receipt.volume)],
    ['Paid to', cell(receipt.accountName)],
    ['Order value', cell(receipt.orderValue)],
    // Only present when a charge was actually applied, matching `buildReceipt`.
    // Emitting the row unconditionally would print an empty or `undefined`
    // service charge on a receipt for a plan that charges none.
    ...(receipt.serviceCharge ? [['Service charge', receipt.serviceCharge]] : []),
    ['Water seller share', cell(receipt.sellerShare)],
    ['Driver share', cell(receipt.driverShare)],
    ['AquaLink share', cell(receipt.platformShare)],
  ];

  // Both providers are live at once, behind their own keys, so naming Paystack
  // unconditionally credited the wrong one on every Flutterwave receipt.
  const provider = receipt.provider === 'flutterwave'
    ? 'Flutterwave'
    : receipt.provider === 'paystack'
      ? 'Paystack'
      : null;

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
<p class="sub">${provider ? `Payment confirmed by ${provider}` : 'Payment confirmed'}</p>
<table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}
<tr class="total"><td>Total charged</td><td>${escapeHtml(cell(receipt.totalCharged))}</td></tr></table>
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

/* --------------------------------------------------- operator and seller API */

/**
 * Sign an operator in and get a session token back.
 *
 * This is what replaced the old localStorage password check. The token is what
 * proves to the server that a pricing change or a seller approval came from a
 * real operator, so it must come from the server and not be manufactured here.
 */
export async function opsSignIn({ email, password }, { signal } = {}) {
  const payload = await apiRequest('/ops/login', {
    method: 'POST',
    signal,
    body: { email, password },
  });
  return { token: payload.token, email: payload.email, expiresInSeconds: payload.expiresInSeconds };
}

/**
 * Publish a new price or revenue split.
 *
 * The server validates the change and rejects it if it would produce a nonsense
 * price, so a typo here costs a round trip but cannot reach a customer.
 */
export async function updatePricing({ pricing, split, token }, { signal } = {}) {
  return apiRequest('/pricing/update', {
    method: 'POST',
    signal,
    auth: token,
    body: { pricing, split },
  });
}

/**
 * Record an operator's decision on a seller application.
 */
export async function reviewSeller({ applicationId, decision, note, token }, { signal } = {}) {
  return apiRequest('/sellers/review', {
    method: 'POST',
    signal,
    auth: token,
    body: { applicationId, decision, note },
  });
}

/**
 * Load the seller applications waiting on review.
 *
 * Operator-only, and the real source for the ops approval queue. That panel used
 * to render three invented sellers and a hardcoded "3 pending".
 */
export async function listSellerApplications({ status = 'pending', token }, { signal } = {}) {
  const query = new URLSearchParams({ status: String(status ?? 'pending') });
  return apiRequest(`/sellers/applications?${query}`, { signal, auth: token });
}

/**
 * Submit a seller application for review.
 *
 * The seller cannot approve themselves; this only records the request.
 */
export async function applyAsSeller({ phone, business, vehicle, capacity }, { signal } = {}) {
  return apiRequest('/sellers/apply', {
    method: 'POST',
    signal,
    body: { phone, business, vehicle, capacity },
  });
}

/**
 * Ask whether a seller application has been approved yet.
 *
 * Returns 'pending' for an unknown number, matching the server, so this cannot be
 * used to find out which numbers have applied.
 */
export async function sellerStatus(phone, { signal } = {}) {
  const query = new URLSearchParams({ phone: String(phone ?? '') });
  return apiRequest(`/sellers/status?${query}`, { signal });
}
