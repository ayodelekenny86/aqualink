import { afterEach, beforeEach, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { clearAll } from './lib/storage';
import { list } from './lib/collections';
import { allocate, formatCedi, toMinor } from './lib/money';

/**
 * Auto-dispatch coverage.
 *
 * There is no driver-side app, so an order must be fully allocated the moment it
 * is placed: a driver, a seller, and a recorded reason for both. These tests
 * exercise that through the real booking flow rather than calling the dispatch
 * functions directly, because the wiring is where this can silently break.
 */

beforeEach(() => {
  clearAll();
  localStorage.clear();
});

afterEach(() => clearAll());

async function signInAsBuyer(user) {
  render(<App />);
  await screen.findByRole('heading', { name: /sign in to view your orders/i });
  await user.type(screen.getByRole('textbox', { name: /buyer phone number/i }), '0545009046');
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

  const order = list('orders').find((row) => row.status === 'Confirmed' && row.location === 'East Legon, Accra');
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

  const order = list('orders').find((row) => row.status === 'Confirmed');
  expect(order.assignmentReason).toMatch(/driver Kojo Mensah \(\d+\)/);
  expect(order.assignmentReason).toMatch(/seller/);
});

test('a driver in the delivery locality is preferred over one from another town', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  await bookWater(user, 'Cantonments, Accra', '2,000 gallons');

  const order = list('orders').find((row) => row.status === 'Confirmed');
  // Ama is based in Cantonments; Kojo in East Legon.
  expect(order.driverName).toBe('Ama Boateng');
});

test('the service charge is quoted to the buyer at booking', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  const notice = await bookWater(user);

  const money = allocate(toMinor(250));
  expect(notice).toHaveTextContent(new RegExp(money.buyerServiceCharge === 2500 ? '25.00' : String(money.buyerServiceCharge)));
});

test('the order stores the gross value so payouts can be recomputed later', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  await bookWater(user);

  const order = list('orders').find((row) => row.status === 'Confirmed');
  expect(order.grossMinor).toBe(25000);
  expect(allocate(order.grossMinor).companyTake).toBe(8750);
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

  const order = list('orders').find((row) => row.status === 'Confirmed');
  expect(order.whatsapp).toBe('0551234567');
});

test('a WhatsApp number is optional and does not block booking', async () => {
  const user = userEvent.setup();
  await signInAsBuyer(user);
  const notice = await bookWater(user, 'Osu, Accra');

  expect(notice).toHaveTextContent(/booking confirmed/i);
  const order = list('orders').find((row) => row.status === 'Confirmed');
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
  const money = allocate(toMinor(250));
  expect(formatCedi(money.driverReceives)).toBe('GH₵12.50');
});
