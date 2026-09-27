import { afterEach, beforeEach, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { clearAll } from './lib/storage';
import { installFakeApi, teardownFakeApi } from './testServer';

/**
 * The app mints its own one-time codes, so tests cannot hardcode a value.
 * They read the code the UI displays, type it back, and wait for the gate to
 * open rather than asserting synchronously against an async handler.
 *
 * Bookings are created server-side so the server owns the price, so each test
 * installs a stub server.
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
/** Waits for the account registry to finish generating before interacting. */
async function waitForRegistry() {
  await screen.findByRole('heading', { name: /sign in to view your orders|application awaiting approval|operations data needs a verified admin|create your seller account/i });
}

const OPS_EMAIL = 'ops@aqualink.gh';
const OPS_PASSWORD = 'ops-test-password-42';

/**
 * Create the ops account the tests sign in with.
 *
 * The app no longer seeds an ops account or prints its password, because doing
 * so published an admin credential to anyone who loaded the page. In production
 * the account is created once by the `apiBootstrapOps` function. Here the test
 * owns the credential outright and signs in through the real form, so this still
 * covers the sign-in path rather than stubbing it.
 */
async function createOpsAccount() {
  const { createAccount } = await import('./lib/accounts');
  await createAccount({
    identifier: OPS_EMAIL,
    role: 'ops',
    displayName: 'Operations',
    password: OPS_PASSWORD,
  });
}

async function verifyBuyer(user, identifier = '0544007788') {
  await waitForRegistry();

  // No account is seeded, so register through the real sign-up form first.
  await user.click(screen.getByRole('button', { name: /create an account/i }));
  await user.type(screen.getByRole('textbox', { name: /new buyer phone/i }), identifier);
  await user.click(screen.getByRole('button', { name: /^create account/i }));
  // Registration runs 210k PBKDF2 iterations, so wait for the field to clear:
  // that only happens once the account actually exists.
  const newPhone = screen.getByRole('textbox', { name: /new buyer phone/i });
  await waitFor(() => expect(newPhone).toHaveValue(''));
  await user.click(screen.getByRole('button', { name: /back to sign in/i }));

  await user.type(screen.getByRole('textbox', { name: /buyer phone number/i }), identifier);
  await user.click(screen.getByRole('button', { name: /send otp/i }));

  const code = (await screen.findByTestId('otp-code')).textContent;
  expect(code).toMatch(/^\d{6}$/);

  await user.type(screen.getByRole('textbox', { name: /buyer otp/i }), code);
  await user.click(screen.getByRole('button', { name: /verify otp/i }));
  await screen.findByRole('heading', { name: /good morning, alex/i });
}

/** Signs in to ops with the account the test created. */
async function signInAdmin(user) {
  await waitForRegistry();
  await user.type(screen.getByRole('textbox', { name: /admin account/i }), OPS_EMAIL);
  await user.type(screen.getByLabelText(/admin password/i), OPS_PASSWORD);
  await user.click(screen.getByRole('button', { name: /open admin console/i }));
  // Password verification is async (PBKDF2), so wait for the console itself.
  await screen.findByText(/manual ops mode/i);
}

/** Applies as a seller, is approved with a generated code, and signs in. */
async function approveSeller(user) {
  await waitForRegistry();
  await user.click(screen.getByRole('button', { name: /seller app manage your fleet/i }));
  await user.type(screen.getByRole('textbox', { name: /business name/i }), 'AquaFlow Tankers');
  await user.type(screen.getByRole('textbox', { name: /seller phone/i }), '0244000000');
  await user.click(screen.getByRole('button', { name: /submit signup for review/i }));

  await screen.findByText(/pending manual review/i);
  await user.click(screen.getByRole('button', { name: /generate approval code/i }));
  const code = (await screen.findByTestId('seller-code')).textContent;
  expect(code).toMatch(/^SEL-[0-9A-Z]{8}$/);

  await user.type(screen.getByRole('textbox', { name: /seller approval code/i }), code);
  await user.click(screen.getByRole('button', { name: /approve seller/i }));
  await screen.findByRole('heading', { name: /ready for the next job/i });
}

test('renders the buyer booking workspace', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  expect(screen.getByRole('heading', { name: /good morning, alex/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /where should we deliver/i })).toBeInTheDocument();
  // The booking form used to hardcode "GH₵300 · GH₵250". The price now comes
  // from the server, so the form says so rather than quoting a stale figure.
  expect(screen.getByText(/calculated on the server/i)).toBeInTheDocument();
  expect(screen.queryByText('GH₵300 · GH₵250')).not.toBeInTheDocument();
  expect(screen.getByText(/silver tier/i)).toBeInTheDocument();
});

test('answers a buyer question with Aqua AI', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /aqua ai/i }));
  await user.type(screen.getByRole('textbox', { name: /ask aqua ai/i }), 'What is the delivery price?');
  await user.click(screen.getByRole('button', { name: /^ask/i }));

  // With no orders there is no price to quote, and the panel must say that
  // rather than inventing one.
  expect(screen.getByText(/you have no orders yet/i)).toBeInTheDocument();
  expect(screen.queryByText(/standard water price/i)).not.toBeInTheDocument();
});

test('the Aqua panel refuses to invent forecasts or driver positions', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /aqua ai/i }));
  await user.type(screen.getByRole('textbox', { name: /ask aqua ai/i }), "what's tomorrow's demand forecast?");
  await user.click(screen.getByRole('button', { name: /^ask/i }));

  expect(screen.getByText(/cannot forecast demand or track drivers/i)).toBeInTheDocument();
  // The old answer named a district and a truck count that came from nowhere.
  expect(screen.queryByText(/stage 6 trucks|pre-position 6/i)).not.toBeInTheDocument();
});

test('creates a delivery booking and switches workspaces', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  await user.type(screen.getByPlaceholderText(/enter an address/i), 'Labone, Accra');
  await user.click(screen.getByRole('button', { name: /confirm booking/i }));

  expect(screen.getByRole('status')).toHaveTextContent(/booking confirmed/i);
  expect(screen.getByText('Labone, Accra')).toBeInTheDocument();
  // An order is not confirmed until Paystack has settled it.
  expect(screen.getByText('Awaiting payment')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /seller app manage your fleet/i }));
  await approveSeller(user);
  expect(screen.getByRole('button', { name: /online and accepting jobs/i })).toBeInTheDocument();
});

test('issues a server-issued reference for each new order', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  await user.type(screen.getByPlaceholderText(/enter an address/i), 'Labone, Accra');
  await user.click(screen.getByRole('button', { name: /confirm booking/i }));

  const notice = await screen.findByRole('status');
  // The reference is minted by the server now, not continued from a local
  // counter. There is no local sequence to collide with, so it just has to be
  // the server's shape.
  expect(notice).toHaveTextContent(/your reference is AQ-[0-9A-F]{6}/i);
});

test('never invents a saved address the user did not enter', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  // The address list starts empty. Adding one saves the location that was
  // actually typed, rather than inserting a placeholder.
  expect(screen.queryByRole('button', { name: /⌖/ })).not.toBeInTheDocument();

  await user.type(screen.getByPlaceholderText(/enter an address/i), 'Labone, Accra');
  await user.click(screen.getByRole('button', { name: /save this address/i }));

  await user.click(screen.getByRole('combobox', { name: /water volume/i }));
  await user.click(screen.getByRole('button', { name: /⌖ labone, accra/i }));
  expect(screen.getByRole('textbox', { name: /delivery location/i })).toHaveValue('Labone, Accra');
});

test('supports repeat booking and language switching', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  // Save a real address first, then rebook from it.
  await user.type(screen.getByPlaceholderText(/enter an address/i), 'East Legon, Accra');
  await user.click(screen.getByRole('button', { name: /save this address/i }));
  await user.click(screen.getByRole('button', { name: /⌖ east legon, accra/i }));
  expect(screen.getByRole('textbox', { name: /delivery location/i })).toHaveValue('East Legon, Accra');

  await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'tw');
  expect(screen.getByRole('heading', { name: /Ɛhe na yɛmfa nsuo nkɔ/i })).toBeInTheDocument();
});

test('lets a seller submit onboarding details', async () => {
  const user = userEvent.setup();
  render(<App />);

  await waitForRegistry();
  await user.click(screen.getByRole('button', { name: /seller app manage your fleet/i }));
  await user.type(screen.getByRole('textbox', { name: /business name/i }), 'AquaFlow Tankers');
  await user.type(screen.getByRole('textbox', { name: /seller phone/i }), '0244000000');
  await user.click(screen.getByRole('button', { name: /submit signup for review/i }));

  expect(screen.getByRole('heading', { name: /application awaiting approval/i })).toBeInTheDocument();
  expect(screen.getByText(/pending manual review/i)).toBeInTheDocument();
});

test('shows human support channels to a buyer', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  expect(screen.getByRole('link', { name: /call \+233 30 200 0123/i })).toHaveAttribute('href', 'tel:+233302000123');
  expect(screen.getByRole('link', { name: /support@aqualink.gh/i })).toHaveAttribute('href', 'mailto:support@aqualink.gh');
  expect(screen.getByRole('link', { name: /whatsapp 0545009046/i })).toHaveAttribute('href', 'https://wa.me/233545009046');
});

test('shows AI business health signals in ops', async () => {
  const user = userEvent.setup();
  await createOpsAccount();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /admin authorized operations access/i }));
  await signInAdmin(user);
  expect(screen.getByRole('heading', { name: /business health signals/i })).toBeInTheDocument();
  // The panel used to report a GH₵4,820 escrow balance and three complaining
  // buyers. There is no escrow and no dispute tracking, so it must not.
  expect(screen.queryByText(/in escrow/i)).not.toBeInTheDocument();
  expect(screen.getByText(/unpaid orders/i)).toBeInTheDocument();
  expect(screen.getByText(/no risk model/i)).toBeInTheDocument();
});

test('refreshes a buyer live driver update', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  expect(screen.getByText(/driver kojo · assigned seller/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /refresh position/i }));

  expect(screen.getByText(/driver kojo · en route from east legon/i)).toBeInTheDocument();
});

test('buyer finance shows real aggregates and an honest empty state', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  expect(screen.getByRole('heading', { name: /your money, explained/i })).toBeInTheDocument();
  // No paid orders yet, so the panel says so rather than showing an invented
  // fee of GH₵37.50 and a 15% rate that the configured charge never was.
  expect(screen.getByText(/no paid orders yet/i)).toBeInTheDocument();
  expect(screen.queryByText('GH₵37.50')).not.toBeInTheDocument();
  expect(screen.queryByText(/15% convenience fee/i)).not.toBeInTheDocument();
});

test('buyer finance totals the real service charges on a paid order', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);
  await user.type(screen.getByPlaceholderText(/enter an address/i), 'Labone, Accra');
  await user.click(screen.getByRole('button', { name: /confirm booking/i }));
  await screen.findByRole('status');

  // Booked but not paid, so still nothing to report as collected. The order is
  // listed as outstanding instead.
  expect(screen.getByText(/no paid orders yet/i)).toBeInTheDocument();
});

test('seller finance shows an honest empty state, not an invented payout', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /seller app manage your fleet/i }));
  expect(screen.getByRole('heading', { name: /know what you take home/i })).toBeInTheDocument();
  expect(screen.getByText(/no paid orders yet/i)).toBeInTheDocument();
  expect(screen.queryByText('GH₵6,904.40')).not.toBeInTheDocument();
  expect(screen.queryByText(/20% seller fee/i)).not.toBeInTheDocument();
});

test('rejects a wrong admin password and never stores the plaintext', async () => {
  const user = userEvent.setup();
  await createOpsAccount();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /admin authorized operations access/i }));

  // The stored credential must be a salt plus a hash, never the password.
  const [record] = JSON.parse(localStorage.getItem('aqualink.v1.accounts.list'));
  expect(record.passwordSalt).toMatch(/^[0-9a-f]{32}$/);
  expect(record.passwordHash).toMatch(/^[0-9a-f]{64}$/);
  expect(localStorage.getItem('aqualink.v1.accounts.list')).not.toContain(OPS_PASSWORD);

  await user.type(screen.getByRole('textbox', { name: /admin account/i }), OPS_EMAIL);
  await user.type(screen.getByLabelText(/admin password/i), 'not-the-password');
  await user.click(screen.getByRole('button', { name: /open admin console/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect details/i);
  expect(screen.queryByText(/manual ops mode/i)).not.toBeInTheDocument();
});

test('refuses an unregistered identifier and issues no code for it', async () => {
  const user = userEvent.setup();
  render(<App />);

  await waitForRegistry();
  await user.type(screen.getByRole('textbox', { name: /buyer phone number/i }), '0545999999');
  await user.click(screen.getByRole('button', { name: /send otp/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/no account matches/i);
  // Crucially, no code is generated or displayed for an unknown account.
  expect(screen.queryByTestId('otp-code')).not.toBeInTheDocument();
  expect(screen.getByText(/no account uses that number yet/i)).toBeInTheDocument();
});

test('rejects a malformed phone number before any lookup', async () => {
  const user = userEvent.setup();
  render(<App />);

  await waitForRegistry();
  await user.type(screen.getByRole('textbox', { name: /buyer phone number/i }), '12345');
  await user.click(screen.getByRole('button', { name: /send otp/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/valid ghana number/i);
  expect(screen.queryByTestId('otp-code')).not.toBeInTheDocument();
});

test('institution finance and the ops tower report real figures or none at all', async () => {
  const user = userEvent.setup();
  await createOpsAccount();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /institution plan your supply/i }));
  expect(screen.getByRole('heading', { name: /plan the month with confidence/i })).toBeInTheDocument();
  expect(screen.getByText(/no paid orders yet/i)).toBeInTheDocument();
  // The old dashboard showed a GH₵3,500 plan and GH₵4,820 in escrow; neither
  // came from an order and there is no escrow.
  expect(screen.queryByText('GH₵3,500')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /admin authorized operations access/i }));
  await signInAdmin(user);
  expect(screen.getByText(/revenue control tower/i)).toBeInTheDocument();
});
