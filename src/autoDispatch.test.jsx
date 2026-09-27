import { afterEach, beforeEach, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { clearAll } from './lib/storage';
import { list } from './lib/collections';
import { allocate, formatCedi, toMinor } from './lib/money';
import { installFakeApi, teardownFakeApi } from './testServer';
import { DEFAULT_PRICING, DEFAULT_SPLIT } from './lib/money';

/**
 * Auto-dispatch coverage.
 *
 * There is no driver-side app, so an order must be fully allocated the moment it
 * is placed: a driver, a seller, and a recorded reason for both. These tests
 * exercise that through the real booking flow rather than calling the dispatch
 * functions directly, because the wiring is where this can silently break.
 *
 * Booking goes to the server for its price, so each test installs a stub server
 * that prices with the real server module.
 */

beforeEach(() => {
  clearAll();
  localStorage.clear();
  installFakeApi();
});

afterEach(() => {
  teardownFakeApi();
  clearAll();
});

async function signInAsBuyer(user) {
  render(<App />);
  await screen.findByRole('heading', { name: /sign in to view your orders/i });

  // No account is seeded any more, so the test creates its own through the real
  // sign-up path before signing in. That keeps the flow honest: if sign-up
  // breaks, these tests break too.
  await user.click(screen.getByRole('button', { name: /create an account/i }));
  await user.type(screen.getByRole('textbox', { name: /new buyer phone/i }), '0544007788');
  await user.click(screen.getByRole('button', { name: /^create account/i }));

  // Registration hashes a password with 210k PBKDF2 iterations, so it is slow
  // enough that clicking straight through to sign-in races it. The field is
  // cleared only once the account exists, so an empty value is the completion
  // signal worth waiting for.
  const newPhone = screen.getByRole('textbox', { name: /new buyer phone/i });
  await waitFor(() => expect(newPhone).toHaveValue(''));

  await user.click(screen.getByRole('button', { name: /back to sign in/i }));

  await user.type(screen.getByRole('textbox', { name: /buyer phone number/i }), '0544007788');
  await user.click(screen.getByRole('button', { name: /send otp/i }));

  const code = (await screen.findByTestId('otp-code')).textContent;
  await user.type(screen.getByRole('textbox', { name: /buyer otp/i }), code);
  await user.click(screen.getByRole('button', { name: /verify otp/i }));
  await screen.findByRole('heading', { name: /good morning/i });
}

async function bookWater(user, location = 'East Legon, Accra', volume = '2,000 gallons') {
  await user.type(screen.getByPlaceholderText(/enter an address/i), location);
  await user.selectOptions(screen.getByRole('combobox', { name: /water volume/i }), volume);
  await user.click(screen.getByRole('button', { name: /confirm booking/i }));
  return screen.findByRole('status');
}

test('a new order is assigned a driver and a seller without any manual step', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  await bookWater(user, 'East Legon, Accra', '2,000 gallons');

  const order = list('orders').find((row) => row.status === 'Awaiting payment' && row.location === 'East Legon, Accra');
  expect(order).toBeTruthy();
  expect(order.driverName).toBeTruthy();
  expect(order.sellerName).toBeTruthy();
});

test('the buyer is told who is coming, before they have to ask', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  const notice = await bookWater(user, 'East Legon, Accra', '2,000 gallons');

  expect(notice).toHaveTextContent(/is assigned/i);
  expect(notice).toHaveTextContent(/Kojo Mensah/i);
});

test('the assignment reason is recorded so ops can audit the choice', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  await bookWater(user, 'East Legon, Accra', '2,000 gallons');

  const order = list('orders').find((row) => row.status === 'Awaiting payment');
  expect(order.assignmentReason).toMatch(/driver Kojo Mensah \(\d+\)/);
  expect(order.assignmentReason).toMatch(/seller/);
});

test('a driver in the delivery locality is preferred over one from another town', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  await bookWater(user, 'Cantonments, Accra', '2,000 gallons');

  const order = list('orders').find((row) => row.status === 'Awaiting payment');
  // Ama is based in Cantonments; Kojo in East Legon.
  expect(order.driverName).toBe('Ama Boateng');
});

test('the total charged and the service charge are both quoted to the buyer', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  const notice = await bookWater(user);

  // GH¢300 order value + 10% service charge = GH¢330 taken from the buyer.
  const money = allocate(toMinor(300));
  expect(notice).toHaveTextContent(formatCedi(money.buyerPays));
  expect(notice).toHaveTextContent(formatCedi(money.buyerServiceCharge));
});

test('the order stores the gross value so payouts can be recomputed later', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  await bookWater(user);

  const order = list('orders').find((row) => row.status === 'Awaiting payment');
  // GH¢600 list less a 50% discount is GH¢300, and the buyer is charged GH¢330.
  expect(order.grossMinor).toBe(30000);
  expect(order.chargedMinor).toBe(33000);
  expect(allocate(order.grossMinor).companyTake).toBe(15000);
});

test('the price comes from the server and the browser cannot change it', async () => {
  const user = userEvent.setup();
  // The server is discounted; the browser's own local pricing is left at the
  // default on purpose. What the buyer is charged must follow the server.
  installFakeApi({ pricing: { ...DEFAULT_PRICING, discountPercent: 25 } });

  // A tampered local admin price must not be able to move the charged amount.
  localStorage.setItem('aqualink.v1.admin.pricing.pricing', JSON.stringify({ listPrice: 1, discountPercent: 100 }));

  await signInAsBuyer(user);
  await bookWater(user);

  const order = list('orders').find((row) => row.status === 'Awaiting payment');
  // GH¢600 list, 25% off = GH₵450.00 order value, +10% charge = GH₵495.00.
  expect(order.listPrice).toBe('GH₵600.00');
  expect(order.chargedMinor).toBe(49500);
  expect(order.discountPercent).toBe(25);
});

test('dispatchers are notified of the new order', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  await bookWater(user);

  await waitFor(() => {
    expect(list('notifications').some((row) => row.role === 'ops' && /new order/i.test(row.title ?? ''))).toBe(true);
  });
});

test('the buyer can supply a WhatsApp number different from their phone', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);

  await user.type(screen.getByPlaceholderText(/enter an address/i), 'Osu, Accra');
  await user.type(screen.getByRole('textbox', { name: /whatsapp number/i }), '0551234567');
  await user.click(screen.getByRole('button', { name: /confirm booking/i }));

  const order = list('orders').find((row) => row.status === 'Awaiting payment');
  expect(order.whatsapp).toBe('0551234567');
});

test('a WhatsApp number is optional and does not block booking', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  const notice = await bookWater(user, 'Osu, Accra');

  expect(notice).toHaveTextContent(/booking confirmed/i);
  const order = list('orders').find((row) => row.status === 'Awaiting payment');
  expect(order.whatsapp).toBe('');
});

test('no driver-side app is offered in the workspace switcher', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);

  expect(screen.queryByRole('button', { name: /driver app/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /seller app manage your fleet/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /admin authorized operations access/i })).toBeInTheDocument();
});

test('the driver payout is quoted correctly for the order value', async () => {
  // 15% of the discounted GH¢300 order value.
  const money = allocate(toMinor(300));
  expect(formatCedi(money.driverReceives)).toBe('GH₵45.00');
});
