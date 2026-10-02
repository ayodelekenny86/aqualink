import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DriverDashboard from './DriverDashboard';
import { replaceAll } from '../lib/collections';
import { clearAll } from '../lib/storage';

/**
 * The driver app, exercised the way a driver would use it.
 *
 * The assertions that matter are the refusals: a driver sees only their own jobs,
 * an unpaid job cannot be collected, and delivery cannot be closed without the
 * code the buyer holds.
 */

const KOJO = { id: 'drv_kojo', name: 'Kojo Mensah', phone: '0545009046', base: 'East Legon, Accra', status: 'online', vehicle: 'GR-4432', rating: 4.8, capacityGallons: 5000, activeJobs: 0 };

function order(overrides = {}) {
  return {
    id: 'AQ-1001',
    code: 'AQ-1001',
    location: 'East Legon, Accra',
    volume: '2,000 gal',
    status: 'Awaiting payment',
    driverId: 'drv_kojo',
    driverName: 'Kojo Mensah',
    driverPhone: '0545009046',
    buyerName: 'Ada Lartey',
    buyerPhone: '0244009999',
    chargedMinor: 30000,
    driverReceives: 4500,
    createdAt: '2026-10-02T09:00:00Z',
    ...overrides,
  };
}

function renderDashboard(props = {}) {
  const handlers = {
    onAccept: vi.fn(),
    onAdvance: vi.fn(),
    onComplete: vi.fn(),
    onReject: vi.fn(),
    showNotice: vi.fn(),
    ...props,
  };
  // The render result is returned alongside the handlers so tests that need to
  // query the DOM directly — the stepper, which has no accessible label per
  // step — can reach the container instead of reaching into document.body.
  return {
    ...handlers,
    ...render(
      <DriverDashboard
        orders={props.orders ?? []}
        fleetDrivers={props.fleetDrivers ?? [KOJO]}
        driverIdentifier={props.driverIdentifier ?? '0545009046'}
        driverName={props.driverName ?? 'Kojo Mensah'}
        onAccept={handlers.onAccept}
        onAdvance={handlers.onAdvance}
        onComplete={handlers.onComplete}
        onReject={handlers.onReject}
        showNotice={handlers.showNotice}
      />,
    ),
  };
}

beforeEach(() => {
  clearAll();
});

describe('signing in as a driver', () => {
  test('says plainly when the account is not on the driver roster', () => {
    // Better than an empty feed: an empty feed reads as a quiet day and sends
    // the driver looking for work that was never going to arrive.
    renderDashboard({ driverIdentifier: '0200000000' });
    expect(screen.getByTestId('driver-not-rostered')).toBeInTheDocument();
    expect(screen.getByText(/not on the driver roster yet/i)).toBeInTheDocument();
  });

  test('matches the signed-in number against the roster in any format', () => {
    renderDashboard({ driverIdentifier: '+233545009046', orders: [order()] });
    expect(screen.queryByTestId('driver-not-rostered')).not.toBeInTheDocument();
    expect(screen.getByText(/hello, kojo/i)).toBeInTheDocument();
  });
});

describe('a driver only sees their own work', () => {
  test("does not show another driver's job", () => {
    renderDashboard({
      orders: [
        order({ id: 'AQ-MINE', driverId: 'drv_kojo' }),
        order({ id: 'AQ-THEIRS', driverId: 'drv_ama', driverPhone: '0544002233' }),
      ],
    });
    expect(screen.getByTestId('driver-job-AQ-MINE')).toBeInTheDocument();
    expect(screen.queryByTestId('driver-job-AQ-THEIRS')).not.toBeInTheDocument();
  });
});

describe('the stats bar', () => {
  test('counts available, active and completed from real orders', () => {
    renderDashboard({
      orders: [
        order({ id: 'A', status: 'Awaiting payment' }),
        order({ id: 'B', status: 'En Route' }),
        order({ id: 'C', status: 'Delivered', driverReceives: 4500 }),
      ],
    });
    const bar = document.querySelector('.driver-stats-bar');
    expect(within(bar).getByText('AVAILABLE').parentElement).toHaveTextContent('1');
    expect(within(bar).getByText('ACTIVE').parentElement).toHaveTextContent('1');
    expect(within(bar).getByText('COMPLETED').parentElement).toHaveTextContent('1');
    expect(within(bar).getByText('EARNED').parentElement).toHaveTextContent(/45/);
  });
});

describe('claiming and progressing a job', () => {
  test('offers accept on an unpaid job and hands back the order id', async () => {
    const user = userEvent.setup();
    const handlers = renderDashboard({ orders: [order()] });

    await user.click(screen.getByRole('button', { name: /accept job/i }));
    expect(handlers.onAccept).toHaveBeenCalledWith('AQ-1001');
  });

  test('refuses to let a driver pick up water for an unpaid order', () => {
    // There is no "picked up" action on an unpaid job at all. The platform
    // absorbing an uncollected delivery is a real loss, so the button is absent
    // rather than disabled-and-clickable.
    renderDashboard({ orders: [order({ status: 'Awaiting payment' })] });
    expect(screen.queryByRole('button', { name: /mark picked up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start delivery/i })).not.toBeInTheDocument();
  });

  test('walks a claimed job from assigned to picked up to on the road', async () => {
    const user = userEvent.setup();
    const handlers = renderDashboard({ orders: [order({ status: 'Assigned' })] });

    await user.click(screen.getByRole('button', { name: /mark picked up/i }));
    expect(handlers.onAdvance).toHaveBeenCalledWith('AQ-1001', 'Picked Up');
  });

  test('asks for the delivery code rather than completing the job outright', async () => {
    const user = userEvent.setup();
    const handlers = renderDashboard({ orders: [order({ status: 'En Route' })] });

    // "Complete delivery" is not on the card: the only path out of En Route is
    // the handover dialog, which cannot succeed without the buyer's code.
    expect(screen.queryByRole('button', { name: /^complete delivery$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /enter delivery code/i }));
    expect(handlers.onComplete).toHaveBeenCalledWith('AQ-1001');
  });

  test('hides a delivered job behind the completed toggle, showing it as earned', async () => {
    const user = userEvent.setup();
    renderDashboard({ orders: [order({ status: 'Delivered', driverReceives: 4500 })] });

    // Collapsed by default: a driver on the road does not need a wall of history.
    expect(screen.queryByTestId('driver-job-AQ-1001')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show/i }));
    const card = screen.getByTestId('driver-job-AQ-1001');
    expect(within(card).getByText(/delivered/i)).toBeInTheDocument();
    expect(within(card).getByText(/45/)).toBeInTheDocument();
  });
});

describe('contacting the buyer', () => {
  test('puts WhatsApp and call on the job card', () => {
    renderDashboard({ orders: [order({ status: 'En Route' })] });

    const whatsapp = screen.getByRole('link', { name: /whatsapp/i });
    expect(whatsapp).toHaveAttribute('href', expect.stringContaining('https://wa.me/233244009999'));
    // The message has to carry the order so the buyer knows which delivery this
    // is about from the driver standing at the gate.
    expect(decodeURIComponent(whatsapp.getAttribute('href'))).toMatch(/AQ-1001/);

    expect(screen.getByRole('link', { name: /^call/i })).toHaveAttribute('href', 'tel:+233244009999');
  });

  test('falls back to support contact when the order has no buyer number', () => {
    renderDashboard({ orders: [order({ status: 'En Route', buyerPhone: '' })] });
    expect(screen.getByRole('link', { name: /contact support/i })).toBeInTheDocument();
  });
});

describe('the delivery stepper', () => {
  test('shows the steps reached and the one in progress', () => {
    const { container } = renderDashboard({ orders: [order({ status: 'Picked Up' })] });
    const stepper = container.querySelector('.driver-stepper');
    expect(within(stepper).getByText('Accepted')).toBeInTheDocument();
    expect(within(stepper).getByText('Picked up')).toBeInTheDocument();
    // One step behind is complete, one is current.
    expect(stepper.querySelectorAll('li.done')).toHaveLength(1);
    expect(stepper.querySelector('li.current')?.textContent).toMatch(/Picked up/);
  });

  test('shows no stepper at all for an unpaid order', () => {
    // An unpaid order has not entered the progression, so no stepper is drawn
    // rather than a row of greyed steps implying a plan that is under way.
    const { container } = renderDashboard({ orders: [order({ status: 'Awaiting payment' })] });
    expect(container.querySelector('.driver-stepper')).toBeNull();
  });

  test('marks every step done once delivered', () => {
    const { container } = renderDashboard({ orders: [order({ status: 'Delivered' })] });
    const stepper = container.querySelector('.driver-stepper');
    expect(stepper.querySelectorAll('li.done')).toHaveLength(4);
  });
});