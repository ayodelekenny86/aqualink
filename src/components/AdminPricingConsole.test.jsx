import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPricingConsole from './AdminPricingConsole';
import { installFakeApi, STUB_OPS_CREDENTIALS, teardownFakeApi } from '../testServer';
import { clearAll } from '../lib/storage';

/**
 * The admin console used to write to `localStorage` and report "published" on
 * every save, while the server kept charging the old price. These tests pin the
 * replacement behaviour: publishing is server-side and operator-authenticated,
 * and a refused save is never reported as a success.
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

/** Set the list price field. */
async function setListPrice(user, value) {
  const field = screen.getByRole('spinbutton', { name: /list price/i });
  await user.clear(field);
  await user.type(field, String(value));
}

test('refuses to publish and does not claim success without an operator token', async () => {
  const user = userEvent.setup();
  const onNotice = vi.fn();
  render(<AdminPricingConsole onNotice={onNotice} />);

  await setListPrice(user, 900);
  await user.click(screen.getByRole('button', { name: /publish pricing/i }));

  // The refusal is explicit about why: prices are set on the server.
  expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/sign in as an operator/i));

  // And nothing was written, so a later read cannot mistake this for a live price.
  expect(localStorage.getItem('aqualink.v1.admin.pricing.pricing')).toBeNull();

  // The operator is told up front that this is a preview, not a control.
  expect(screen.getByText(/not signed in as an operator/i)).toBeInTheDocument();
});

test('publishes to the server and only then reports success', async () => {
  const user = userEvent.setup();
  const onNotice = vi.fn();
  render(<AdminPricingConsole onNotice={onNotice} opsToken="test.ops.token" />);

  await setListPrice(user, 900);
  await user.click(screen.getByRole('button', { name: /publish pricing/i }));

  await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/pricing published/i)));
  expect(onNotice).not.toHaveBeenCalledWith(expect.stringMatching(/sign in as an operator/i));

  // The accepted price is what got cached, so the display matches the server.
  const cached = JSON.parse(localStorage.getItem('aqualink.v1.admin.pricing.pricing'));
  expect(cached.listPrice).toBe(900);
});

test('surfaces a server rejection instead of writing the change locally', async () => {
  const user = userEvent.setup();
  const onNotice = vi.fn();
  // A token the fake server will not accept, standing in for a forged or expired
  // one. The console must not treat a 401 as a save.
  render(<AdminPricingConsole onNotice={onNotice} opsToken="forged.token" />);

  await setListPrice(user, 900);
  await user.click(screen.getByRole('button', { name: /publish pricing/i }));

  await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/sign in as an operator to do that/i)));
  expect(onNotice).not.toHaveBeenCalledWith(expect.stringMatching(/pricing published/i));
  expect(localStorage.getItem('aqualink.v1.admin.pricing.pricing')).toBeNull();
});

test('refuses a split that does not total 100% before contacting the server', async () => {
  const user = userEvent.setup();
  const onNotice = vi.fn();
  const fetchMock = installFakeApi();
  render(<AdminPricingConsole onNotice={onNotice} opsToken="test.ops.token" />);

  const driverShare = screen.getByRole('spinbutton', { name: /driver share/i });
  await user.clear(driverShare);
  await user.type(driverShare, '5');
  await user.click(screen.getByRole('button', { name: /publish pricing/i }));

  expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/fix the revenue split/i));
  // A split that does not close would throw at checkout, so it never leaves here.
  const updateCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/pricing/update'));
  expect(updateCalls).toHaveLength(0);
});

test('shows the live server price when an operator opens the console', async () => {
  installFakeApi({ pricing: { listPrice: 450, discountPercent: 20, surgePercent: 0, surgeReason: '' } });
  render(<AdminPricingConsole onNotice={() => {}} opsToken="test.ops.token" />);

  // 450, not the default 600: the console must edit what orders are actually
  // charged, not a stale local figure.
  await waitFor(() => expect(screen.getByRole('spinbutton', { name: /list price/i })).toHaveValue(450));
  expect(STUB_OPS_CREDENTIALS.email).toBeTruthy();
});
