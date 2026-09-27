import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SellerApprovalQueue from './SellerApprovalQueue';
import { installFakeApi, seedSellerApplication, teardownFakeApi } from '../testServer';
import { clearAll } from '../lib/storage';

/**
 * This queue used to render three invented sellers (S-019, S-021, S-024) under a
 * hardcoded "3 pending" badge, with "Review →" buttons that did nothing. These
 * tests pin the replacement: it reads real applications, shows an honest count,
 * and records a decision the server accepts.
 */

const TOKEN = 'test.ops.token';

beforeEach(() => {
  clearAll();
  localStorage.clear();
  installFakeApi();
});

afterEach(() => {
  teardownFakeApi();
  clearAll();
});

test('shows no invented sellers when nothing has applied', async () => {
  render(<SellerApprovalQueue opsToken={TOKEN} onNotice={() => {}} />);

  await screen.findByText(/no seller applications are waiting/i);
  expect(screen.getByText(/0 pending/i)).toBeInTheDocument();

  // The fabricated rows are gone, not merely hidden.
  expect(screen.queryByText(/S-019/)).not.toBeInTheDocument();
  expect(screen.queryByText(/S-021/)).not.toBeInTheDocument();
  expect(screen.queryByText(/S-024/)).not.toBeInTheDocument();
});

test('lists real applications with an honest count', async () => {
  seedSellerApplication({ applicationId: 'app-1', business: 'AquaFlow Tankers', phone: '0244000000', vehicle: 'GT-1', capacity: '2,000 gallons' });
  seedSellerApplication({ applicationId: 'app-2', business: 'Borehole Co', phone: '0200000000', vehicle: 'GT-2', capacity: '5,000 gallons' });

  render(<SellerApprovalQueue opsToken={TOKEN} onNotice={() => {}} />);

  await screen.findByText(/AquaFlow Tankers/);
  expect(screen.getByText(/Borehole Co/)).toBeInTheDocument();
  expect(screen.getByText(/2 pending/i)).toBeInTheDocument();
});

test('approving records the decision and removes it from the queue', async () => {
  const onNotice = vi.fn();
  seedSellerApplication({ applicationId: 'app-1', business: 'AquaFlow Tankers', phone: '0244000000', vehicle: 'GT-1' });
  const user = userEvent.setup();
  render(<SellerApprovalQueue opsToken={TOKEN} onNotice={onNotice} />);

  await screen.findByText(/AquaFlow Tankers/);
  await user.click(screen.getByRole('button', { name: /^approve$/i }));

  await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/AquaFlow Tankers approved/i)));
  // Re-read from the server, so the row disappears because it is no longer
  // pending rather than because it was hidden locally.
  await waitFor(() => expect(screen.getByText(/no seller applications are waiting/i)).toBeInTheDocument());
});

test('rejecting records the decision', async () => {
  const onNotice = vi.fn();
  seedSellerApplication({ applicationId: 'app-1', business: 'AquaFlow Tankers', phone: '0244000000' });
  const user = userEvent.setup();
  render(<SellerApprovalQueue opsToken={TOKEN} onNotice={onNotice} />);

  await screen.findByText(/AquaFlow Tankers/);
  await user.click(screen.getByRole('button', { name: /^reject$/i }));

  await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/AquaFlow Tankers rejected/i)));
});

test('reports a server rejection rather than dropping the row', async () => {
  const onNotice = vi.fn();
  seedSellerApplication({ applicationId: 'app-1', business: 'AquaFlow Tankers', phone: '0244000000' });
  const user = userEvent.setup();
  // A token the server will not accept, standing in for a forged or expired one.
  render(<SellerApprovalQueue opsToken="forged.token" onNotice={onNotice} />);

  // The queue itself refuses to load, and says so rather than showing an empty
  // list that would read as "nothing to review".
  await screen.findByRole('alert');
  expect(screen.getByRole('alert')).toHaveTextContent(/sign in as an operator to do that/i);
  expect(screen.queryByText(/AquaFlow Tankers/)).not.toBeInTheDocument();
  expect(screen.queryByText(/no seller applications are waiting/i)).not.toBeInTheDocument();
});

test('tells an unauthenticated viewer the queue needs an operator', () => {
  render(<SellerApprovalQueue opsToken={null} onNotice={() => {}} />);

  expect(screen.getByText(/sign in as an operator to review/i)).toBeInTheDocument();
  // No request is attempted, so nothing is invented about the queue contents.
  expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
});
