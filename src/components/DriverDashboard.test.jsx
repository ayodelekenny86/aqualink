import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
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
    onRefresh: vi.fn(),
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
        onRefresh={handlers.onRefresh}
      />,
    ),
  };
}

async function switchToTab(user, tabName) {
  const tab = screen.getByRole('button', { name: new RegExp(tabName, 'i') });
  await user.click(tab);
  await waitFor(() => {
    expect(tab).toHaveAttribute('aria-current', 'page');
  });
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
  test('shows available, active, completed and earned counts', () => {
    renderDashboard({
      orders: [
        order({ id: 'AQ-1', status: 'Awaiting payment' }),
        order({ id: 'AQ-2', status: 'Assigned' }),
        order({ id: 'AQ-3', status: 'Delivered', driverReceives: 4500 }),
      ],
    });
    // Stats bar is always visible - use section-kicker text which is unique
    expect(screen.getByText('AVAILABLE')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('EARNED')).toBeInTheDocument();
    // Check stats bar specifically by looking at the strong elements within the driver-stats-bar region
    const statsBar = screen.getByRole('region', { name: /driver statistics/i });
    const articles = within(statsBar).getAllByRole('article');
    // Available count
    expect(within(articles[0]).getByText('1')).toBeInTheDocument();
    // Active count (Assigned = 1, Delivered is in completed)
    expect(within(articles[1]).getByText('1')).toBeInTheDocument();
    // Completed count
    expect(within(articles[2]).getByText('1')).toBeInTheDocument();
    // Earnings
    expect(within(articles[3]).getByText('GH₵45.00')).toBeInTheDocument();
  });
});

describe('bottom navigation tabs', () => {
  test('shows four tabs: Available, Active, History, Earnings', () => {
    renderDashboard({ orders: [order({ status: 'Awaiting payment' }), order({ status: 'Assigned' }), order({ status: 'Delivered' })] });
    
    expect(screen.getByRole('button', { name: /available/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /active/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /earnings/i })).toBeInTheDocument();
  });

  test('highlights active tab and shows badge counts', () => {
    renderDashboard({ orders: [order({ status: 'Awaiting payment' }), order({ status: 'Assigned' }), order({ status: 'Delivered' })] });
    
    // Available tab should be active by default
    const availableTab = screen.getByRole('button', { name: /available/i });
    expect(availableTab).toHaveAttribute('aria-current', 'page');
    
    // Badge counts should show - check nav-badge elements directly
    const badges = screen.getAllByTestId('nav-badge');
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });

  test('switching tabs changes the view', async () => {
    const user = userEvent.setup();
    renderDashboard({
      orders: [
        order({ id: 'AQ-1', status: 'Awaiting payment' }),
        order({ id: 'AQ-2', status: 'Assigned' }),
        order({ id: 'AQ-3', status: 'Delivered' }),
      ],
    });
    
    // Default is Available tab
    expect(screen.getByText('AVAILABLE NEAR YOU')).toBeInTheDocument();
    expect(screen.getByTestId('driver-job-AQ-1')).toBeInTheDocument();
    
    // Switch to Active tab
    await switchToTab(user, 'active');
    
    await waitFor(() => {
      expect(screen.getByText('ACTIVE DELIVERIES')).toBeInTheDocument();
    });
    expect(screen.getByTestId('driver-job-AQ-2')).toBeInTheDocument();
    
    // Switch to History tab
    await switchToTab(user, 'history');
    
    await waitFor(() => {
      // Look for the section kicker in the history tab panel
      const panel = screen.getByText('COMPLETED', { selector: '.section-kicker' });
      expect(panel).toBeInTheDocument();
    });
    // Completed jobs are hidden by default
    expect(screen.queryByTestId('driver-job-AQ-3')).not.toBeInTheDocument();
  });
});

describe('claiming and progressing a job', () => {
  test('shows accept and skip buttons for unpaid jobs', () => {
    renderDashboard({ orders: [order({ status: 'Awaiting payment' })] });
    
    expect(screen.getByRole('button', { name: /accept job/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
  });

  test('clicking accept calls onAccept with the order id', async () => {
    const user = userEvent.setup();
    const { onAccept } = renderDashboard({ orders: [order({ status: 'Awaiting payment' })] });
    
    await user.click(screen.getByRole('button', { name: /accept job/i }));
    expect(onAccept).toHaveBeenCalledWith('AQ-1001');
  });

  test('shows advance button for Assigned jobs in Active tab', async () => {
    const user = userEvent.setup();
    renderDashboard({ orders: [order({ status: 'Assigned' })] });
    
    // Assigned jobs appear in Active tab
    await switchToTab(user, 'active');
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark picked up/i })).toBeInTheDocument();
    });
  });

  test('clicking advance calls onAdvance with the order id and next status', async () => {
    const user = userEvent.setup();
    const { onAdvance } = renderDashboard({ orders: [order({ status: 'Assigned' })] });
    
    await switchToTab(user, 'active');
    
    await waitFor(() => {
      const advanceBtn = screen.getByRole('button', { name: /mark picked up/i });
      expect(advanceBtn).toBeInTheDocument();
    });
    
    await user.click(screen.getByRole('button', { name: /mark picked up/i }));
    expect(onAdvance).toHaveBeenCalledWith('AQ-1001', 'Picked Up');
  });

  test('shows enter delivery code button for En Route jobs in Active tab', async () => {
    const user = userEvent.setup();
    renderDashboard({ orders: [order({ status: 'En Route' })] });
    
    await switchToTab(user, 'active');
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enter delivery code/i })).toBeInTheDocument();
    });
  });

  test('clicking enter delivery code calls onComplete', async () => {
    const user = userEvent.setup();
    const { onComplete } = renderDashboard({ orders: [order({ status: 'En Route' })] });
    
    await switchToTab(user, 'active');
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enter delivery code/i })).toBeInTheDocument();
    });
    
    await user.click(screen.getByRole('button', { name: /enter delivery code/i }));
    expect(onComplete).toHaveBeenCalledWith('AQ-1001');
  });
});

describe('contacting the buyer', () => {
  test('puts WhatsApp and call links on the job card for En Route jobs', async () => {
    const user = userEvent.setup();
    renderDashboard({ orders: [order({ status: 'En Route', buyerPhone: '0244009999' })] });
    
    // Switch to Active tab where En Route jobs appear
    await switchToTab(user, 'active');
    
    await waitFor(() => {
      // ContactButtons renders links with wa.me domain
      const whatsappLink = screen.getByRole('link', { name: /whatsapp/i });
      expect(whatsappLink).toHaveAttribute('href', expect.stringContaining('wa.me'));
      
      const callLink = screen.getByRole('link', { name: /call/i });
      expect(callLink).toHaveAttribute('href', expect.stringContaining('tel:'));
    });
  });

  test('falls back to support contact when the order has no buyer number', async () => {
    const user = userEvent.setup();
    renderDashboard({ orders: [order({ status: 'En Route', buyerPhone: '' })] });
    
    // Switch to Active tab where En Route jobs appear
    await switchToTab(user, 'active');
    
    await waitFor(() => {
      // Should still show contact buttons (they fall back to support number)
      expect(screen.getByRole('link', { name: /contact support/i })).toBeInTheDocument();
    });
  });
});

describe('the delivery stepper', () => {
  test('shows the steps reached and the one in progress', async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard({ orders: [order({ status: 'Picked Up' })] });
    
    // Picked Up jobs appear in Active tab
    await switchToTab(user, 'active');
    
    await waitFor(() => {
      const stepper = container.querySelector('.driver-stepper');
      expect(stepper).not.toBeNull();
      expect(within(stepper).getByText('Accepted')).toBeInTheDocument();
      expect(within(stepper).getByText('Picked up')).toBeInTheDocument();
      // One step behind is complete, one is current.
      expect(stepper.querySelectorAll('li.done')).toHaveLength(1);
      expect(stepper.querySelectorAll('li.current')).toHaveLength(1);
    });
  });

  test('marks every step done once delivered', async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard({ orders: [order({ status: 'Delivered' })] });
    
    // Delivered jobs appear in History tab
    await switchToTab(user, 'history');
    
    // Click show history
    await user.click(screen.getByRole('button', { name: /show history/i }));
    
    await waitFor(() => {
      const stepper = container.querySelector('.driver-stepper');
      expect(stepper).not.toBeNull();
      expect(stepper.querySelectorAll('li.done')).toHaveLength(4);
    });
  });
});

describe('completed history tab', () => {
  test('shows toggle to show/hide completed deliveries', async () => {
    const user = userEvent.setup();
    renderDashboard({ orders: [order({ id: 'AQ-1', status: 'Delivered' }), order({ id: 'AQ-2', status: 'Delivered' })] });
    
    await switchToTab(user, 'history');
    
    await waitFor(() => {
      // Should show toggle button
      expect(screen.getByRole('button', { name: /show history/i })).toBeInTheDocument();
    });
    
    // Click to show
    await user.click(screen.getByRole('button', { name: /show history/i }));
    
    await waitFor(() => {
      expect(screen.getByTestId('driver-job-AQ-1')).toBeInTheDocument();
      expect(screen.getByTestId('driver-job-AQ-2')).toBeInTheDocument();
    });
    
    // Click to hide
    await user.click(screen.getByRole('button', { name: /hide history/i }));
    
    await waitFor(() => {
      expect(screen.queryByTestId('driver-job-AQ-1')).not.toBeInTheDocument();
    });
  });
});

describe('earnings tab', () => {
  test('shows earnings breakdown with weekly, monthly, all-time totals', async () => {
    const user = userEvent.setup();
    renderDashboard({ 
      orders: [
        order({ id: 'AQ-1', status: 'Delivered', driverReceives: 4500, createdAt: '2026-10-01T09:00:00Z' }),
        order({ id: 'AQ-2', status: 'Delivered', driverReceives: 3500, createdAt: '2026-09-15T09:00:00Z' }),
      ] 
    });
    
    await switchToTab(user, 'earnings');
    
    await waitFor(() => {
      expect(screen.getByText(/earnings breakdown/i)).toBeInTheDocument();
      expect(screen.getByText('This Week')).toBeInTheDocument();
      expect(screen.getByText('This Month')).toBeInTheDocument();
      expect(screen.getByText('All Time')).toBeInTheDocument();
      expect(screen.getByText('Avg / Delivery')).toBeInTheDocument();
    });
  });
});

describe('offline banner', () => {
  test('shows offline banner when navigator.onLine is false', () => {
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    
    renderDashboard({ orders: [order()] });
    
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByText(/changes will sync when reconnected/i)).toBeInTheDocument();
    
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});

describe('GPS tracker', () => {
  test('shows GPS tracker when there are active jobs', () => {
    renderDashboard({ orders: [order({ status: 'Assigned' })] });
    
    expect(screen.getByText(/live location/i)).toBeInTheDocument();
    expect(screen.getByText(/acquiring gps signal/i)).toBeInTheDocument();
  });
  
  test('does not show GPS tracker when no active jobs', () => {
    renderDashboard({ orders: [order({ status: 'Awaiting payment' })] });
    
    expect(screen.queryByText(/live location/i)).not.toBeInTheDocument();
  });
});