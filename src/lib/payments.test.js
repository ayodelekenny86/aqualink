import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  buildReceipt,
  fetchQuote,
  initialisePayment,
  listReceipts,
  referenceFromLocation,
  saveReceipt,
  verifyPayment,
} from './payments';
import { clearAll } from './storage';

/**
 * The point of these tests is the absence of a fake. The old client had a demo
 * path where `verifyPayment` returned `settled` on a timer, so the assertions
 * below are mostly about what the module refuses to do: never report a
 * settlement the server did not confirm, never fall back to a local success, and
 * never carry a secret.
 */

const ORDER = {
  id: 'AQ-1A2B3C',
  email: 'buyer@example.com',
  location: 'East Legon, Accra',
  volumeLitres: 5000,
  grossMinor: 30000,
  chargedMinor: 33000,
  buyerServiceCharge: 3000,
  sellerReceives: 13500,
  driverReceives: 4500,
  platformCommission: 12000,
};

const BREAKDOWN = {
  grossMinor: 30000,
  // What the customer actually paid: order value plus the service charge.
  buyerPays: 33000,
  buyerServiceCharge: 3000,
  sellerReceives: 13500,
  driverReceives: 4500,
  platformCommission: 12000,
};

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

let fetchMock;

beforeEach(() => {
  clearAll();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('starting a payment', () => {
  test('returns the provider URL and always reports pending', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      reference: 'aq1a2b3c-abcdef0123456789',
      authorizationUrl: 'https://checkout.paystack.com/abc',
      amountMinor: 33000,
      currency: 'GHS',
      status: 'pending',
    }));

    const result = await initialisePayment({ orderId: ORDER.id, email: ORDER.email });

    expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc');
    // Creating a transaction is not receiving money. Anything else here would let
    // the UI say "paid" before the customer has authorised anything.
    expect(result.status).toBe('pending');
  });

  test('never reports a settlement of its own, whatever the server sends back', async () => {
    // A server that wrongly claims `settled` still must not be able to make the
    // client mark an order paid on the initialise leg.
    fetchMock.mockResolvedValue(jsonResponse({
      reference: 'r1',
      authorizationUrl: 'https://checkout.paystack.com/abc',
      status: 'settled',
    }));

    const result = await initialisePayment({ orderId: ORDER.id, email: ORDER.email });
    expect(result.status).toBe('pending');
  });

  test('fails when the provider gives no payment page, rather than pretending', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ reference: 'r1', status: 'pending' }));
    await expect(initialisePayment({ orderId: ORDER.id, email: ORDER.email }))
      .rejects.toThrow(/did not return a payment page/i);
  });

  test('surfaces the server message when the order cannot be paid', async () => {
    fetchMock.mockResolvedValue(jsonResponse(
      { error: 'order_email_mismatch', message: 'This order belongs to a different account.' },
      403,
    ));
    await expect(initialisePayment({ orderId: ORDER.id, email: 'someone@else.com' }))
      .rejects.toThrow(/different account/i);
  });

  test('reports an unconfigured deployment instead of attempting a charge', async () => {
    fetchMock.mockResolvedValue(jsonResponse(
      { error: 'payments_unconfigured', message: 'Payments are not configured on this deployment.' },
      503,
    ));
    await expect(initialisePayment({ orderId: ORDER.id, email: ORDER.email }))
      .rejects.toThrow(/not configured/i);
  });

  test('sends the order id and email, and no amount', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ reference: 'r1', authorizationUrl: 'u', status: 'pending' }));
    await initialisePayment({ orderId: ORDER.id, email: ORDER.email });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // The client has no business naming a price; the server computes it.
    expect(Object.keys(body).sort()).toEqual(['email', 'orderId']);
  });
});

describe('confirming a payment', () => {
  test('passes the server verdict through unchanged', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ settled: true, status: 'settled', reference: 'r1', breakdown: BREAKDOWN }));
    await expect(verifyPayment({ reference: 'r1' })).resolves.toMatchObject({ settled: true });
  });

  test('reports an unconfirmed payment as unsettled without inventing success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      settled: false, status: 'pending', reason: 'provider_status_abandoned', reference: 'r1',
    }));
    const result = await verifyPayment({ reference: 'r1' });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('provider_status_abandoned');
  });

  test('surfaces an amount mismatch instead of accepting a cheaper payment', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ settled: false, reason: 'amount_mismatch', reference: 'r1' }));
    await expect(verifyPayment({ reference: 'r1' })).resolves.toMatchObject({
      settled: false,
      reason: 'amount_mismatch',
    });
  });

  test('throws when the server is unreachable, never defaulting to paid', async () => {
    fetchMock.mockRejectedValue(new Error('Network request failed'));
    await expect(verifyPayment({ reference: 'r1' })).rejects.toThrow(/Network request failed/);
  });

  test('throws on an unreadable response rather than guessing', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '<html>gateway error</html>' });
    await expect(verifyPayment({ reference: 'r1' })).rejects.toThrow(/unreadable response/i);
  });

  test('requires a reference', async () => {
    await expect(verifyPayment({})).rejects.toThrow(/reference is required/i);
  });
});

describe('quoting', () => {
  test('takes the price from the server rather than computing it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ quote: { grossMinor: 30000, chargedMinor: 33000 } }));
    const result = await fetchQuote({ volumeLitres: 5000 });
    expect(result.quote.chargedMinor).toBe(33000);
    expect(String(fetchMock.mock.calls[0][0])).toContain('volume=5000');
  });
});

describe('return URL handling', () => {
  test('reads the reference Paystack appends to the hash route', () => {
    // The app uses hash routing, so the query arrives inside the fragment.
    expect(referenceFromLocation({ hash: '#/payment/return?reference=aq1-abc&trxref=1', search: '' })).toBe('aq1-abc');
  });

  test('reads it from a conventional query string too', () => {
    expect(referenceFromLocation({ hash: '', search: '?reference=aq2-def' })).toBe('aq2-def');
  });

  test('returns an empty string when the customer did not pay', () => {
    expect(referenceFromLocation({ hash: '#/payment/return', search: '' })).toBe('');
    expect(referenceFromLocation(null)).toBe('');
  });
});

describe('receipts', () => {
  test('records the server-confirmed breakdown', () => {
    const receipt = buildReceipt({
      order: ORDER,
      payment: { reference: 'aq1-abc', currency: 'GHS', paidAt: '2026-09-27T10:00:00Z' },
      breakdown: BREAKDOWN,
    });

    expect(receipt.totalCharged).toBe('GH₵330.00');
    expect(receipt.sellerShare).toBe('GH₵135.00');
    expect(receipt.driverShare).toBe('GH₵45.00');
    expect(receipt.platformShare).toBe('GH₵120.00');
    expect(receipt.status).toBe('settled');
  });

  test('never shows an order value as the total, so the fee is not dropped', () => {
    // Regression: the receipt once rendered `grossMinor` as the total, which
    // understated GH¢330.00 as GH₵300.00 and made the fee vanish from the
    // customer's copy of the record.
    const receipt = buildReceipt({
      order: ORDER,
      payment: { reference: 'r1' },
      breakdown: { ...BREAKDOWN, buyerPays: undefined },
    });
    expect(receipt.totalCharged).toBe('GH₵330.00');
    expect(receipt.orderValue).toBe('GH₵300.00');
    expect(receipt.serviceCharge).toBe('GH₵30.00');
  });

  test('carries no simulated marker, because there is no simulated receipt', () => {
    const receipt = buildReceipt({ order: ORDER, payment: { reference: 'r1' }, breakdown: BREAKDOWN });
    expect(receipt.simulated).toBeUndefined();
    expect(receipt.mode).toBeUndefined();
  });

  test('persists and de-duplicates by reference', () => {
    const receipt = buildReceipt({ order: ORDER, payment: { reference: 'aq1-abc' }, breakdown: BREAKDOWN });
    saveReceipt(receipt);
    saveReceipt({ ...receipt, totalCharged: 'GH₵400.00' });

    const rows = listReceipts();
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCharged).toBe('GH₵400.00');
  });

  test('survives corrupt storage instead of crashing the panel', () => {
    localStorage.setItem('aqualink.v1.payments.receipts', '{"not":"an array"}');
    expect(listReceipts()).toEqual([]);
  });
});

describe('secret handling', () => {
  test('no secret or provider host appears in the client module source', async () => {
    const source = await readFile('src/lib/payments.js', 'utf8');

    // The whole point of the server split: this file is shipped to every
    // visitor, so it must not name a provider API host or carry anything that
    // looks like a credential.
    expect(source).not.toMatch(/api\.paystack\.co/);
    expect(source).not.toMatch(/sk_(live|test)_/);
    expect(source).not.toMatch(/PAYSTACK_SECRET/);
    expect(source).not.toMatch(/Authorization/);
  });
});
