import { afterEach, beforeEach, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { clearAll } from './lib/storage';

/**
 * The app mints its own one-time codes, so tests cannot hardcode a value.
 * They read the code the UI displays, type it back, and wait for the gate to
 * open rather than asserting synchronously against an async handler.
 */
/** Waits for the account registry to finish generating before interacting. */
async function waitForRegistry() {
  await screen.findByRole('heading', { name: /sign in to view your orders|application awaiting approval|operations data needs a verified admin|create your seller account/i });
}

async function verifyBuyer(user, identifier = '0545009046') {
  await waitForRegistry();
  await user.type(screen.getByRole('textbox', { name: /buyer phone number/i }), identifier);
  await user.click(screen.getByRole('button', { name: /send otp/i }));

  const code = (await screen.findByTestId('otp-code')).textContent;
  expect(code).toMatch(/^\d{6}$/);

  await user.type(screen.getByRole('textbox', { name: /buyer otp/i }), code);
  await user.click(screen.getByRole('button', { name: /verify otp/i }));
  await screen.findByRole('heading', { name: /good morning, alex/i });
}

/** Signs in to ops with the seeded admin account and its generated password. */
async function signInAdmin(user) {
  await waitForRegistry();
  const password = (await screen.findByTestId('demo-ops-password')).textContent;
  expect(password.length).toBeGreaterThanOrEqual(8);

  await user.type(screen.getByRole('textbox', { name: /admin account/i }), 'ops@aqualink.gh');
  await user.type(screen.getByLabelText(/admin password/i), password);
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

beforeEach(() => {
  clearAll();
});

// Seeding hashes a password asynchronously, so a promise from a finished test
// can still write storage. Clearing again stops that leaking into the next test.
afterEach(() => {
  clearAll();
});

test('renders the buyer booking workspace', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  expect(screen.getByRole('heading', { name: /good morning, alex/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /where should we deliver/i })).toBeInTheDocument();
  expect(screen.getByText(/GH₵300 · GH₵250/)).toBeInTheDocument();
  expect(screen.getByText(/silver tier/i)).toBeInTheDocument();
});

test('answers a buyer question with Aqua AI', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /aqua ai/i }));
  await user.type(screen.getByRole('textbox', { name: /ask aqua ai/i }), 'What is the delivery price?');
  await user.click(screen.getByRole('button', { name: /^ask/i }));

  expect(screen.getByText(/standard water price is GH₵300/i)).toBeInTheDocument();
});

test('creates a delivery booking and switches workspaces', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  await user.type(screen.getByPlaceholderText(/enter an address/i), 'Labone, Accra');
  await user.click(screen.getByRole('button', { name: /confirm booking/i }));

  expect(screen.getByRole('status')).toHaveTextContent(/booking confirmed/i);
  expect(screen.getByText('Labone, Accra')).toBeInTheDocument();
  expect(screen.getByText('Confirmed')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /seller app manage your fleet/i }));
  await approveSeller(user);
  expect(screen.getByRole('button', { name: /online and accepting jobs/i })).toBeInTheDocument();
});

test('issues a checksummed booking reference for each new order', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  await user.type(screen.getByPlaceholderText(/enter an address/i), 'Labone, Accra');
  await user.click(screen.getByRole('button', { name: /confirm booking/i }));

  const notice = await screen.findByRole('status');
  expect(notice).toHaveTextContent(/your reference is AQ-\d{4}-[0-9A-Z]/i);
  // The seeded orders top out at AQ-1051, so the next reference continues past it.
  expect(notice).toHaveTextContent(/AQ-1052-/i);
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

test('supports repeat booking and language switching', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  await user.click(screen.getByRole('button', { name: /home · east legon/i }));
  expect(screen.getByRole('textbox', { name: /delivery location/i })).toHaveValue('East Legon, Accra');

  await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'tw');
  expect(screen.getByRole('heading', { name: /ɛhe na yɛmfa nsuo nkɔ/i })).toBeInTheDocument();
});

test('shows AI business health signals in ops', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /admin authorized operations access/i }));
  await signInAdmin(user);
  expect(screen.getByRole('heading', { name: /business health signals/i })).toBeInTheDocument();
  expect(screen.getByText(/GH₵4,820 remains in escrow/i)).toBeInTheDocument();
});

test('refreshes a buyer live driver update', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  expect(screen.getByText(/driver kojo · assigned seller/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /refresh position/i }));

  expect(screen.getByText(/driver kojo · en route from east legon/i)).toBeInTheDocument();
});

test('shows buyer commission and savings', async () => {
  const user = userEvent.setup();
  render(<App />);

  await verifyBuyer(user);

  expect(screen.getByText(/buyer finance/i)).toBeInTheDocument();
  expect(screen.getByText('GH₵37.50')).toBeInTheDocument();
  expect(screen.getByText(/15% convenience fee/i)).toBeInTheDocument();
});

test('shows seller net payout and commission', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /seller app manage your fleet/i }));
  expect(screen.getByText(/seller finance/i)).toBeInTheDocument();
  expect(screen.getByText('GH₵6,904.40')).toBeInTheDocument();
  expect(screen.getByText(/20% seller fee/i)).toBeInTheDocument();
});

test('rejects a wrong admin password and never stores the plaintext', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /admin authorized operations access/i }));
  const password = (await screen.findByTestId('demo-ops-password')).textContent;

  // The stored credential must be a salt plus a hash, never the password.
  const [record] = JSON.parse(localStorage.getItem('aqualink.v1.accounts.list'));
  expect(record.passwordSalt).toMatch(/^[0-9a-f]{32}$/);
  expect(record.passwordHash).toMatch(/^[0-9a-f]{64}$/);
  expect(localStorage.getItem('aqualink.v1.accounts.list')).not.toContain(password);

  await user.type(screen.getByRole('textbox', { name: /admin account/i }), 'ops@aqualink.gh');
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

test('shows institution billing and ops revenue control tower', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /institution plan your supply/i }));
  expect(screen.getByText(/institution finance/i)).toBeInTheDocument();
  expect(screen.getAllByText('GH₵3,500').length).toBeGreaterThan(0);

  await user.click(screen.getByRole('button', { name: /admin authorized operations access/i }));
  await signInAdmin(user);
  expect(screen.getByText(/revenue control tower/i)).toBeInTheDocument();
  expect(screen.getByText('GH₵4,820')).toBeInTheDocument();
});
