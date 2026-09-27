import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import GoogleSignInButton from './GoogleSignInButton';
import { clearAll } from '../lib/storage';

/**
 * The important behaviour here is the failure state. A social sign-in button
 * that renders before it can actually verify anything is a security hole, so
 * the button must not exist until a client id is configured.
 */

afterEach(() => clearAll());

test('no sign-in button is offered when Google is not configured', () => {
  render(<GoogleSignInButton role="buyer" />);
  expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
});

test('the missing configuration is explained instead of failing silently', () => {
  render(<GoogleSignInButton role="buyer" />);
  const notice = screen.getByRole('note');
  expect(notice).toHaveTextContent(/not configured/i);
  expect(notice).toHaveTextContent(/VITE_GOOGLE_CLIENT_ID/);
});

test('the explanation states that no unverified identity can be accepted', () => {
  render(<GoogleSignInButton role="buyer" />);
  expect(screen.getByRole('note')).toHaveTextContent(/unverified identity/i);
});

test('a configured deployment renders the button and states that it verifies signatures', async () => {
  // Exercise the configured branch by stubbing the module's config reader.
  vi.resetModules();
  vi.doMock('../lib/googleAuth', async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      googleClientId: () => 'test-client-id.apps.googleusercontent.com',
      isGoogleConfigured: () => true,
      loadGoogleIdentity: () => Promise.resolve({ initialize: () => {}, prompt: () => {} }),
    };
  });

  const { default: Configured } = await import('./GoogleSignInButton');
  render(<Configured role="buyer" />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });
  expect(screen.getByText(/signature-checked/i)).toBeInTheDocument();

  vi.doUnmock('../lib/googleAuth');
  vi.resetModules();
});
