import { afterEach, expect, test, vi } from 'vitest';
import {
  buildReceipt,
  initialisePayment,
  paymentMode,
  receiptHtml,
  verifyPayment,
} from './payments';
import { allocate, toMinor } from './money';
import { clearAll } from './storage';

afterEach(() => {
  clearAll();
  vi.restoreAllMocks();
});

const order = {
  id: 'AQ-1052-AB12',
  code: 'AQ-1052-AB12',
  location: 'East Legon, Accra',
  volume: '2,000 gal',
  grossMinor: 30000,
  chargedMinor: 33000,
  driverName: 'Kojo Mensah',
};

const breakdown = allocate(toMinor(300));

test('runs in demo mode when no payments endpoint is configured', () => {
  expect(paymentMode()).toBe('demo');
});

describe('payment validation', () => {
  test('rejects a malformed mobile money number before any request', async () => {
    await expect(initialisePayment({ orderId: 'AQ-1', amountMinor: 33000, network: 'mtn', accountName: 'Ama', accountNumber: '123' }))
      .rejects.toThrow(/valid Ghanaian mobile money number/i);
  });

  test('accepts both local and international formats', async () => {
    const local = await initialisePayment({ orderId: 'AQ-1', amountMinor: 33000, network: 'mtn', accountName: 'Ama', accountNumber: '0240000000' });
    const intl = await initialisePayment({ orderId: 'AQ-1', amountMinor: 33000, network: 'mtn', accountName: 'Ama', accountNumber: '+233240000000' });
    expect(local.accountNumber).toBe('233240000000');
    expect(intl.accountNumber).toBe('233240000000');
  });

  test('requires an account name', async () => {
    await expect(initialisePayment({ orderId: 'AQ-1', amountMinor: 33000, network: 'mtn', accountName: 'A', accountNumber: '0240000000' }))
      .rejects.toThrow(/account name/i);
  });

  test('rejects a non-positive or fractional amount', async () => {
    await expect(initialisePayment({ orderId: 'AQ-1', amountMinor: 0, network: 'mtn', accountName: 'Ama', accountNumber: '0240000000' }))
      .rejects.toThrow(/amount is invalid/i);
    await expect(initialisePayment({ orderId: 'AQ-1', amountMinor: 33.5, network: 'mtn', accountName: 'Ama', accountNumber: '0240000000' }))
      .rejects.toThrow(/amount is invalid/i);
  });

  test('never accepts or stores an API secret', async () => {
    const result = await initialisePayment({ orderId: 'AQ-1', amountMinor: 33000, network: 'mtn', accountName: 'Ama', accountNumber: '0240000000' });
    // A secret in the response would end up in a receipt and a localStorage entry.
    expect(JSON.stringify(result)).not.toMatch(/secret|apikey|api_key|authorization/i);
  });
});

describe('settlement', () => {
  test('a demo verification is flagged as simulated', async () => {
    const result = await verifyPayment({ reference: 'AQ-1', amountMinor: 33000 });
    expect(result.status).toBe('settled');
    expect(result.simulated).toBe(true);
  });
});

describe('receipts', () => {
  const payment = { mode: 'demo', status: 'settled', simulated: true, network: 'mtn', accountName: 'Ama Serwaa' };

  test('records the full money breakdown', () => {
    const receipt = buildReceipt({ order, breakdown, payment });
    expect(receipt.reference).toBe('AQ-1052-AB12');
    expect(receipt.totalCharged).toBe('GH₵330.00');
    expect(receipt.simulated).toBe(true);
    expect(receipt.driverName).toBe('Kojo Mensah');
  });

  test('marks a demo receipt so it can never pass for a real one', () => {
    const html = receiptHtml(buildReceipt({ order, breakdown, payment }));
    expect(html).toMatch(/Demo payment/i);
    expect(html).toMatch(/no money was taken/i);
  });

  test('a live receipt carries no demo warning', () => {
    const html = receiptHtml(buildReceipt({ order, breakdown, payment: { ...payment, simulated: false, mode: 'live' } }));
    expect(html).not.toMatch(/Demo payment/i);
  });

  test('escapes customer-supplied text so a download cannot inject markup', () => {
    const hostile = { ...order, location: '<img src=x onerror=alert(1)>' };
    const html = receiptHtml(buildReceipt({ order: hostile, breakdown, payment }));
    expect(html).not.toMatch(/<img/);
    expect(html).toMatch(/&lt;img/);
  });
});
