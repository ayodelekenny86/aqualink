import { afterEach, beforeEach, expect, test } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { clearAll } from '../lib/storage';
import { list } from '../lib/collections';

/**
 * Driver workspace and notification coverage, driven through the real app so the
 * auth gate, the order store and the feeds are all exercised together. The
 * driver signs in by phone: a number already in the registry signs in, anything
 * else registers on first use.
 */

beforeEach(() => {
  clearAll();
  localStorage.clear();
});

afterEach(() => clearAll());

async function openDriverApp(user, phone = '0553007788') {
  render(<App />);
  await screen.findByRole('heading', { name: /sign in to view your orders/i });
  await user.click(screen.getByRole('button', { name: /driver app deliver and get paid/i }));
  await screen.findByRole('heading', { name: /sign in to start driving/i });

  await user.type(screen.getByRole('textbox', { name: /driver phone/i }), phone);
  await user.click(screen.getByRole('button', { name: /register and send code|send code/i }));

  // The app mints its own codes, so read it back rather than hardcoding a value.
  const code = (await screen.findByTestId('otp-code')).textContent;
  expect(code).toMatch(/^\d{6}$/);
  await user.type(screen.getByRole('textbox', { name: /driver otp/i }), code);
  await user.click(screen.getByRole('button', { name: /verify code/i }));
}

test('a new driver number registers on first sign-in', async () => {
  const user = userEvent.setup();
  await openDriverApp(user);

  await screen.findByRole('heading', { name: /ready for the next drop/i });
  const accounts = list('users');
  expect(accounts.some((account) => account.role === 'driver')).toBe(true);
});

test('the driver stats bar counts available, active and completed jobs', async () => {
  const user = userEvent.setup();
  await openDriverApp(user);
  await screen.findByRole('heading', { name: /ready for the next drop/i });

  const stats = screen.getByRole('group', { name: /driver statistics/i });
  expect(stats).toHaveTextContent(/available/i);
  expect(stats).toHaveTextContent(/active/i);
  expect(stats).toHaveTextContent(/completed/i);

  // The seeded table ships one unclaimed job and two completed ones.
  expect(within(stats).getByText('1')).toBeInTheDocument();
  expect(within(stats).getAllByText('2')).toHaveLength(1);
});

test('a driver accepts a job, which moves it from available to active', async () => {
  const user = userEvent.setup();
  await openDriverApp(user);
  await screen.findByRole('heading', { name: /ready for the next drop/i });

  await user.click(screen.getByRole('button', { name: /accept job/i }));
  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent(/accepted/i);
  });

  const order = list('orders').find((row) => row.code === 'AQ-1051-3');
  expect(order.status).toBe('Accepted');
});

test('an accepted job advances through the handover steps and notifies the buyer', async () => {
  const user = userEvent.setup();
  await openDriverApp(user);
  await screen.findByRole('heading', { name: /ready for the next drop/i });

  await user.click(screen.getByRole('button', { name: /accept job/i }));
  await screen.findByRole('tab', { name: /active deliveries/i });
  await user.click(screen.getByRole('tab', { name: /active deliveries/i }));

  await user.click(await screen.findByRole('button', { name: /picked up/i }));
  expect(list('orders').find((row) => row.code === 'AQ-1051-3').status).toBe('Picked Up');

  const buyerNotice = list('notifications').find((row) => /picked up/i.test(row.title ?? ''));
  expect(buyerNotice.role).toBe('buyer');
  expect(buyerNotice.orderId).toBe('AQ-1051-3');
});

test('a delivery only completes when the buyer code matches', async () => {
  const user = userEvent.setup();
  await openDriverApp(user);
  await screen.findByRole('heading', { name: /ready for the next drop/i });

  await user.click(screen.getByRole('button', { name: /accept job/i }));
  await user.click(screen.getByRole('tab', { name: /active deliveries/i }));
  await user.click(await screen.findByRole('button', { name: /picked up/i }));
  await user.click(await screen.findByRole('button', { name: /start delivery/i }));

  // A wrong code must not release escrow.
  await user.type(screen.getByRole('textbox', { name: /delivery code for/i }), '000000');
  await user.click(screen.getByRole('button', { name: /confirm delivery/i }));
  expect(list('orders').find((row) => row.code === 'AQ-1051-3').status).toBe('En Route');
});

test('the notifications panel lists, counts and marks everything read', async () => {
  const user = userEvent.setup();
  await openDriverApp(user);
  await screen.findByRole('heading', { name: /ready for the next drop/i });

  await user.click(screen.getByRole('button', { name: /accept job/i }));

  await user.click(screen.getByRole('button', { name: /notifications/i }));
  const panel = await screen.findByRole('region', { name: /notifications/i });
  expect(panel).toBeInTheDocument();

  await user.click(within(panel).getByRole('button', { name: /mark all as read/i }));
  await waitFor(() => {
    // Marking read is scoped to the signed-in role: a driver's click must not
    // silently clear the buyer's own unread notifications.
    expect(list('notifications').filter((row) => row.role === 'driver' && !row.read)).toHaveLength(0);
  });
  expect(list('notifications').some((row) => row.role === 'buyer' && !row.read)).toBe(true);
});

test('a buyer booking reaches the driver feed as an unread notification', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: /sign in to view your orders/i });

  // Sign in as the seeded buyer.
  await user.type(screen.getByRole('textbox', { name: /buyer phone number/i }), '0545009046');
  await user.click(screen.getByRole('button', { name: /send otp/i }));
  const buyerCode = (await screen.findByTestId('otp-code')).textContent;
  await user.type(screen.getByRole('textbox', { name: /buyer otp/i }), buyerCode);
  await user.click(screen.getByRole('button', { name: /verify otp/i }));
  await screen.findByRole('heading', { name: /good morning/i });

  await user.type(screen.getByPlaceholderText(/enter an address/i), 'Spintex, Accra');
  await user.click(screen.getByRole('button', { name: /confirm booking/i }));

  // The booking must be visible to drivers, not just to the buyer who placed it.
  expect(list('notifications').some((row) => row.role === 'driver')).toBe(true);

  // Switch to the driver workspace and sign in on a new number.
  await user.click(screen.getByRole('button', { name: /driver app deliver and get paid/i }));
  await screen.findByRole('heading', { name: /sign in to start driving/i });
  await user.type(screen.getByRole('textbox', { name: /driver phone/i }), '0553007788');
  await user.click(screen.getByRole('button', { name: /register and send code/i }));
  const driverCode = (await screen.findByTestId('otp-code')).textContent;
  await user.type(screen.getByRole('textbox', { name: /driver otp/i }), driverCode);
  await user.click(screen.getByRole('button', { name: /verify code/i }));
  await screen.findByRole('heading', { name: /ready for the next drop/i });

  const bell = screen.getByRole('button', { name: /notifications/i });
  await waitFor(() => expect(bell).toHaveTextContent('1'));

  await user.click(bell);
  const panel = await screen.findByRole('region', { name: /notifications/i });
  expect(within(panel).getByText(/new job available/i)).toBeInTheDocument();

  await user.click(within(panel).getByRole('button', { name: /mark all as read/i }));
  await waitFor(() => expect(bell).not.toHaveTextContent('1'));
});

test('the new booking is offered to drivers in the available feed', async () => {
  const user = userEvent.setup();
  await openDriverApp(user);
  await screen.findByRole('heading', { name: /ready for the next drop/i });

  // The seeded unclaimed job plus the one this session booked.
  const feed = screen.getByRole('region', { name: /available orders/i });
  expect(within(feed).getByText('Airport Residential, Accra')).toBeInTheDocument();
  expect(within(feed).getAllByRole('button', { name: /accept job/i })).toHaveLength(1);
});
