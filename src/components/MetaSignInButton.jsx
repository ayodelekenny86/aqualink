import { useEffect, useState } from 'react';
import { isMetaConfigured, loadFacebookSdk, signInWithMeta } from '../lib/metaAuth';

/**
 * Meta (Facebook) sign-in surface.
 *
 * Follows the same pattern as GoogleSignInButton: when no app id is configured
 * this renders an explicit "not configured" state instead of a button that
 * looks usable. A social button that silently fails, or worse one that accepts
 * an unverified identity, is how a missing environment variable becomes a
 * security incident nobody noticed.
 */
export default function MetaSignInButton({ role = 'buyer', onVerified, onError, showNotice }) {
  const configured = isMetaConfigured();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!configured) return undefined;
    loadFacebookSdk().catch((caught) => setError(caught.message));
    return undefined;
  }, [configured]);

  if (!configured) {
    return (
      <div className="meta-signin unconfigured" role="note">
        <strong>Meta sign-in is not configured.</strong>
        <p>
          Add <code>VITE_FACEBOOK_CLIENT_ID</code> to the environment and redeploy. The button appears once a
          Facebook app id is present. AquaLink never enables this button without one, so it cannot
          accept an unverified identity.
        </p>
      </div>
    );
  }

  async function handleClick() {
    setBusy(true);
    setError('');
    try {
      const { identity, claims } = await signInWithMeta({ role });
      onVerified?.(identity, claims);
      showNotice?.(`Signed in as ${identity.displayName} with Meta.`);
    } catch (caught) {
      setError(caught.message);
      onError?.(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="meta-signin">
      <p className="divider"><span>or</span></p>
      <button className="meta-button" type="button" onClick={handleClick} disabled={busy}>
        <svg viewBox="0 0 320 512" aria-hidden="true" width="16" height="16">
          <path fill="#1877F2" d="M279.14 288l14.22-92.66h-88.86V127.1c0-25.06 12.5-50 52.21-50h40.5V6.26S260.2 0 228.2 0C188.6 0 155.3 30.4 155.3 74.7v76.8H64.55v96.66h90.75v223.14H172.5V288z" />
        </svg>
        {busy ? 'Verifying…' : 'Continue with Meta'}
      </button>
      <small className="meta-note">The Meta profile is verified through Facebook before the account is created.</small>
      {error && <p className="gate-error" role="alert">{error}</p>}
    </div>
  );
}
