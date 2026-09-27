import { useEffect, useState } from 'react';
import { googleClientId, isGoogleConfigured, loadGoogleIdentity, signInWithGoogle } from '../lib/googleAuth';

/**
 * Google sign-in surface.
 *
 * When no client id is configured this renders an explicit "not configured"
 * state instead of a button that looks usable. A social button that silently
 * fails, or worse one that signs everyone in, is how people end up with a
 * security incident they did not notice; the whole point of showing the failure
 * state is to make the missing configuration obvious during setup rather than
 * in production.
 */
export default function GoogleSignInButton({ role = 'buyer', onVerified, onError, showNotice }) {
  const configured = isGoogleConfigured();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!configured) return undefined;
    loadGoogleIdentity().catch((caught) => setError(caught.message));
    return undefined;
  }, [configured]);

  if (!configured) {
    return (
      <div className="google-signin unconfigured" role="note">
        <strong>Google sign-in is not configured.</strong>
        <p>
          Add <code>VITE_GOOGLE_CLIENT_ID</code> to the environment and redeploy. The button appears once a
          Google OAuth client id is present. AquaLink never enables this button without one, so it cannot
          accept an unverified identity.
        </p>
      </div>
    );
  }

  async function handleClick() {
    setBusy(true);
    setError('');
    try {
      const { identity, claims } = await signInWithGoogle({ role });
      onVerified?.(identity, claims);
      showNotice?.(`Signed in as ${identity.displayName} with Google.`);
    } catch (caught) {
      setError(caught.message);
      onError?.(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="google-signin">
      <p className="divider"><span>or</span></p>
      <button className="google-button" type="button" onClick={handleClick} disabled={busy}>
        <svg viewBox="0 0 18 18" aria-hidden="true" width="17" height="17">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
        </svg>
        {busy ? 'Verifying…' : 'Continue with Google'}
      </button>
      <small className="google-note">The Google credential is signature-checked before the account is created.</small>
      {error && <p className="gate-error" role="alert">{error}</p>}
    </div>
  );
}
