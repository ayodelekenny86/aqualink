import { vi } from 'vitest';

// Mock PWASetup and virtual:pwa-register/react before any imports
vi.mock('./components/PWASetup', () => ({
  PWASetup: () => null,
  PWADetectOffline: () => null,
  usePWAUpdate: () => ({ needRefresh: false, offlineReady: false, updateServiceWorker: vi.fn() }),
  PWAUpdatePrompt: () => null,
}));

import { afterEach, beforeEach, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { clearAll } from './lib/storage';
import { installFakeApi, reviewSellerApplication, STUB_OPS_CREDENTIALS, teardownFakeApi } from './testServer';
import { listAccounts, deleteAccount } from './lib/accounts';
import { readValue, writeValue } from './lib/storage';

/**
 * The app mints its own one-time codes, so tests cannot hardcode a value.
 * They read the code the UI displays, type it back, and wait for the gate to
 * open rather than asserting synchronously against an async handler.
 *
 * Bookings are created server-side so the server owns the price, so each test
 * installs a stub server.
 */
function clearAccounts() {
  // Directly clear the accounts storage key
  try {
    writeValue('accounts.list', []);
  } catch {
    // ignore
  }
}

beforeEach(() => {
  clearAll();
  localStorage.clear();
  clearAccounts();
  installFakeApi();
});

afterEach(() => {
  teardownFakeApi();
  clearAll();
  localStorage.clear();
  clearAccounts();
});
/** Waits for the account registry to finish generating before interacting. */
async function waitForRegistry() {
  await screen.findByRole('heading', { name: /sign in to view your orders|application awaiting approval|operations data needs a verified admin|create your seller account/i });
}

// One source of truth: the same credential the fake server accepts on
// `POST /api/ops/login`, so this exercises the real sign-in path end to end.
const OPS_EMAIL = STUB_OPS_CREDENTIALS.email;
const OPS_PASSWORD = STUB_OPS_CREDENTIALS.password;

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

/**
 * Applies as a seller and has an operator approve it, then signs in.
 *
 * There is deliberately no "generate approval code" step. That control minted
 * `SEL-XXXXXXXX` in the browser and then accepted it, so anyone who loaded the
 * page could approve themselves. The test now goes through the server, and the
 * status only changes when `reviewSellerApplication` says an operator did it.
 */
async function approveSeller(user) {
  await waitForRegistry();
  await user.click(screen.getByRole('button', { name: /seller app manage your fleet/i }));
  await user.type(screen.getByRole('textbox', { name: /business name/i }), 'AquaFlow Tankers');
  await user.type(screen.getByRole('textbox', { name: /seller phone/i }), '0244000000');
  await user.type(screen.getByRole('textbox', { name: /vehicle registration/i }), 'GT-4471-22');
  await user.click(screen.getByRole('button', { name: /submit signup for review/i }));

  await screen.findByText(/pending operator review/i);

  const checkButton = screen.getByRole('button', { name: /check approval status/i });

  // The workspace must still be locked: a status check with nobody having
  // approved anything is what a self-approval exploit would look like.
  await user.click(checkButton);
  // Wait for the in-flight check to settle before approving. Clicking again while
  // the first request is still open lets the stale 'pending' answer land after
  // the approval and lock the workspace again.
  await waitFor(() => expect(checkButton).toBeEnabled());
  expect(screen.queryByRole('heading', { name: /ready for the next job/i })).not.toBeInTheDocument();

  reviewSellerApplication((await screen.findByTestId('seller-application-id')).textContent, 'approve');
  await user.click(checkButton);
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
  // The rewards panel now reads the tier from real paid orders. A fresh buyer
  // with no orders is Bronze, so the panel says that rather than inventing a
  // Silver balance.
  expect(screen.getByText(/bronze tier/i)).toBeInTheDocument();
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
  // The server requires a vehicle registration, so the form has to carry one
  // before an application can even be recorded.
  await user.type(screen.getByRole('textbox', { name: /vehicle registration/i }), 'GT-8891-11');
  await user.click(screen.getByRole('button', { name: /submit signup for review/i }));

  expect(await screen.findByRole('heading', { name: /application awaiting approval/i })).toBeInTheDocument();
  expect(screen.getByText(/pending operator review/i)).toBeInTheDocument();

  // The control that made this self-service is gone, not merely hidden.
  expect(screen.queryByRole('button', { name: /generate approval code/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: /seller approval code/i })).not.toBeInTheDocument();
});

test('will not accept a seller application with no vehicle registration', async () => {
  const user = userEvent.setup();
  render(<App />);

  await waitForRegistry();
  await user.click(screen.getByRole('button', { name: /seller app manage your fleet/i }));
  await user.type(screen.getByRole('textbox', { name: /business name/i }), 'AquaFlow Tankers');
  await user.type(screen.getByRole('textbox', { name: /seller phone/i }), '0244000000');
  await user.click(screen.getByRole('button', { name: /submit signup for review/i }));

  // Stays on the form rather than pretending the application was submitted.
  expect(await screen.findByText(/add a vehicle registration before applying/i)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /application awaiting approval/i })).not.toBeInTheDocument();
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
  expect(screen.getByText(/sellers at risk/i)).toBeInTheDocument();
});

test('shows an honest reliability panel with no timing recorded', async () => {
  const user = userEvent.setup();
  await createOpsAccount();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /admin authorized operations access/i }));
  await signInAdmin(user);
  expect(screen.getByText(/how dependable is each seller/i)).toBeInTheDocument();
  // No seller has a completed order in a fresh workspace, so the reliability
  // panel says so rather than inventing a delivery window.
  expect(screen.getByText(/no reliability score and no delivery window to estimate/i)).toBeInTheDocument();
  expect(screen.getByText(/delivery timing is not recorded/i)).toBeInTheDocument();
});

test('shows the honest driver state for a buyer with no assignment', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  // The card used to invent a "Driver Kojo · ETA 18 min" for every buyer. A
  // buyer with no assigned driver now sees that plainly instead.
  expect(screen.getByText(/no driver is assigned to your orders yet/i)).toBeInTheDocument();
  expect(screen.queryByText(/driver kojo/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /refresh position/i }));

  // Refreshing simply reports the seller app pushed an update; it does not
  // invent a name or ETA.
  expect(screen.getByText(/live delivery update received from the seller app/i)).toBeInTheDocument();
  expect(screen.queryByText(/driver kojo/i)).not.toBeInTheDocument();
});

test('shows an honest delivery estimate for a buyer with no timed history', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);
  await user.type(screen.getByPlaceholderText(/enter an address/i), 'Labone, Accra');
  await user.click(screen.getByRole('button', { name: /confirm booking/i }));
  await screen.findByRole('status');

  // The estimate panel exists and does not invent a window. A freshly booked
  // order is not yet assigned, so the card says so plainly rather than quoting
  // a delivery window nobody measured.
  expect(screen.getByText(/when will my water arrive/i)).toBeInTheDocument();
  expect(screen.getByText(/no order is on the way yet/i)).toBeInTheDocument();
  expect(screen.queryByText(/estimated window/i)).not.toBeInTheDocument();
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

  await approveSeller(user);
  expect(screen.getByRole('heading', { name: /ready for the next job/i })).toBeInTheDocument();
  expect(screen.getByText(/no active jobs/i)).toBeInTheDocument();
  expect(screen.getByText(/no completed jobs yet/i)).toBeInTheDocument();
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
  expect(screen.getByRole('heading', { name: /your supply, as delivered/i })).toBeInTheDocument();
  expect(screen.getByText(/no upcoming scheduled deliveries/i)).toBeInTheDocument();
  // The old dashboard showed a GH₵3,500 plan and GH₵4,820 in escrow; neither
  // came from an order and there is no escrow.
  expect(screen.queryByText('GH₵3,500')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /admin authorized operations access/i }));
  await signInAdmin(user);
  expect(screen.getByText(/revenue control tower/i)).toBeInTheDocument();
});
