import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BuyerRatingsHistory from '../components/BuyerRatingsHistory';

const showNotice = vi.fn();

describe('BuyerRatingsHistory', () => {
  test('shows loading state when loading is true', () => {
    render(<BuyerRatingsHistory buyerId="buyer_1" showNotice={showNotice} loading ratings={[]} />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  test('shows empty state when no ratings', () => {
    render(<BuyerRatingsHistory buyerId="buyer_1" showNotice={showNotice} loading={false} ratings={[]} />);
    expect(screen.getByText(/have not submitted any ratings/i)).toBeTruthy();
  });

  test('renders ratings list when data is present', () => {
    const ratings = [
      { id: 'r1', orderId: 'AQ-1', buyerId: 'buyer_1', sellerId: 'seller_1', driverId: 'driver_1', overall: 5, createdAt: new Date('2026-10-01').toISOString() },
    ];
    render(<BuyerRatingsHistory buyerId="buyer_1" showNotice={showNotice} loading={false} ratings={ratings} />);
    expect(screen.getByText('AQ-1')).toBeTruthy();
    expect(screen.getByText('5/5')).toBeTruthy();
  });
});
