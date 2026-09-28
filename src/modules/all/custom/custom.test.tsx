import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CustomModule } from './CustomModule';
import * as service from './custom.service';

vi.mock('./custom.service');

const mockedService = vi.mocked(service);

describe('CustomModule', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedService.fetchCustomItems.mockResolvedValue([]);
  });

  it('renders the empty state', async () => {
    render(<CustomModule />);
    expect(await screen.findByText('No items yet.')).toBeInTheDocument();
  });

  it('creates a new item', async () => {
    const user = userEvent.setup();
    mockedService.createCustomItem.mockResolvedValue({
      id: '1',
      name: 'Test',
      description: 'Desc',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: 'user-1',
    });

    render(<CustomModule />);
    await screen.findByText('No items yet.');

    await user.type(screen.getByPlaceholderText('Item name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedService.createCustomItem).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Test')).toBeInTheDocument();
  });
});
