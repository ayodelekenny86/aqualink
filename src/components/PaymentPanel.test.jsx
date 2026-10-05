import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PaymentPanel from './PaymentPanel';
import { clearAll } from '../lib/storage';

/**
 * The panel's return leg, exercised end to end: the browser comes back from the
 * provider with `?reference=...`, the panel asks the server what happened, and
 * the receipt it builds is what the customer is shown.
 *
 * The settlement stub below is the shape the server actually sends, and what
 * matters about it is what it does *not* contain: `/payments/verify` reports the
 * amount the provider took and nothing about how that amount is split. The panel
 * used to build its receipt from a `breakdown` on that response, so in production
 * every figure on the receipt fell through to a default of zero — the card and
 * the downloaded document both read GH₵0.00 for a payment that had just taken
 * GH₵300.00.
 *
 * The library tests in `src/lib/payments.test.js` pin the arithmetic. These pin
 * the wiring: that the panel passes the order through, and that what reaches the
 * screen is the order's priced figures.
 */

const ORDER = {
  id: 'AQ-1A2B3C',
  code: 'AQ-1A2B3C',
  email: 'buyer@example.com',
  location: 'East Legon, Accra',
  volumeLitres: 5000,
  status: 'Pending',
  grossMinor: 30000,
  chargedMinor: 30000,
  buyerServiceCharge: 0,
  sellerReceives: 13500,
  driverReceives: 4500,
  platformCommission: 12000,
};

const SETTLEMENT = {
  settled: true,
  status: 'settled',
  reason: 'payment_confirmed',
  reference: 'aq1-abc',
  orderId: 'AQ-1A2B3C',
  amountMinor: 30000,
  currency: 'GHS',
  provider: 'paystack',
};

/** Answer the one request the panel makes on the return leg. */
function stubVerifySettlement(settlement = SETTLEMENT) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(settlement),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Put the browser where the provider sent it, and undo that afterwards. */
function returnFromProvider(reference) {
  window.location.hash = `#/payment/return?reference=${reference}`;
}

beforeEach(() => {
  clearAll();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearAll();
  window.location.hash = '';
});

test('shows the order\'s priced figures after a confirmed payment', async () => {
  returnFromProvider('aq1-abc');
  stubVerifySettlement();

  render(<PaymentPanel order={ORDER} onPaid={() => {}} showNotice={() => {}} />);

  // The panel renders the receipt card only once the server has confirmed.
  const card = (await screen.findByRole('heading', { name: /receipt aq1-abc/i })).closest('div');
  expect(card).not.toBeNull();
  expect(card).toHaveTextContent('GH₵300.00');
  expect(card).toHaveTextContent('GH₵135.00');
  expect(card).toHaveTextContent('GH₵45.00');
  expect(card).toHaveTextContent('GH₵120.00');
  // The failure this guards against: a settled payment shown as zeroes.
  expect(card).not.toHaveTextContent('GH₵0.00');
});

test('says a figure is unrecorded instead of showing a zero or a blank', async () => {
  returnFromProvider('aq1-abc');
  // An order the server priced nothing on: no shares at all.
  stubVerifySettlement();

  render(<PaymentPanel order={{ ...ORDER, sellerReceives: undefined, driverReceives: undefined, platformCommission: undefined }} />);

  const card = (await screen.findByRole('heading', { name: /receipt aq1-abc/i })).closest('div');
  expect(card).not.toBeNull();
  // The amount the provider took is still known, and is still reported.
  expect(card).toHaveTextContent('GH₵300.00');
  expect(screen.getAllByText('Not recorded')).toHaveLength(3);
});

test('never claims a receipt for a payment the server did not settle', async () => {
  returnFromProvider('aq1-abc');
  stubVerifySettlement({ settled: false, status: 'pending', reason: 'abandoned' });

  render(<PaymentPanel order={ORDER} />);

  expect(await screen.findByRole('status')).toHaveTextContent(/not completed/i);
  expect(screen.queryByRole('heading', { name: /receipt aq1-abc/i })).not.toBeInTheDocument();
});