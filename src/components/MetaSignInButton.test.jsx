import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MetaSignInButton from './MetaSignInButton';
import { clearAll } from '../lib/storage';

/**
 * The important behaviour here is the failure state. A social sign-in button
 * that renders before it can actually verify anything is a security hole, so
 * the button must not exist until an app id is configured.
 */

afterEach(() => clearAll());

test('no sign-in button is offered when Meta is not configured', () => {
  render(<MetaSignInButton role="buyer" />);
  expect(screen.queryByRole('button', { name: /continue with meta/i })).not.toBeInTheDocument();
});

test('the missing configuration is explained instead of failing silently', () => {
  render(<MetaSignInButton role="buyer" />);
  const notice = screen.getByRole('note');
  expect(notice).toHaveTextContent(/not configured/i);
  expect(notice).toHaveTextContent(/VITE_FACEBOOK_CLIENT_ID/);
});

test('the explanation states that no unverified identity can be accepted', () => {
  render(<MetaSignInButton role="buyer" />);
  expect(screen.getByRole('note')).toHaveTextContent(/unverified identity/i);
});

test('a configured deployment renders the button and states that it verifies', async () => {
  vi.resetModules();
  vi.doMock('../lib/metaAuth', async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      metaClientId: () => '123456789012345',
      isMetaConfigured: () => true,
      loadFacebookSdk: () => Promise.resolve({ init: vi.fn(), login: vi.fn() }),
    };
  });

  const { default: Configured } = await import('./MetaSignInButton');
  render(<Configured role="buyer" />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /continue with meta/i })).toBeInTheDocument();
  });
  expect(screen.getByText(/verified through facebook/i)).toBeInTheDocument();

  vi.doUnmock('../lib/metaAuth');
  vi.resetModules();
});
