/**
 * Google Sign-In with real cryptographic token verification.
 *
 * Why this is not a fake "sign in with Google" button: the token Google returns
 * is a signed JWT, and its signature can be verified in the browser against
 * Google's published certificate set using Web Crypto. If that verification
 * passes, the token genuinely was issued by Google and has not been altered.
 *
 * That matters because the usual reason people skip OAuth is "you need a
 * server to verify the token". You do need one for full session management, but
 * *authenticity* can be established client-side. What is verified here:
 *
 *   - the RS256 signature against Google's live JWKS
 *   - `aud` equals our own client id (so another app's token is rejected)
 *   - `iss` is a Google issuer (so a token from elsewhere is rejected)
 *   - `exp` is in the future
 *   - `email_verified` is true
 *
 * Known limits, stated honestly rather than hidden:
 *
 *   - No replay protection. There is no server-side nonce store, so a captured
 *     token is valid until it expires (Google issues ~1h lifetimes). Mitigating
 *     this properly needs a backend.
 *   - No server-side revocation. A user banned in Google's admin console is
 *     refused at the next token issue, not retroactively.
 *   - The client id is public by design. It identifies the app; it is not a
 *     secret, and the API secret must never appear in a browser bundle.
 *
 * Net: this is strong enough to trust an identity for a consumer app, and the
 * two gaps above are exactly what a backend closes later. Nothing here is
 * mocked, and with no client id configured the sign-in path is unavailable
 * rather than quietly accepting anyone.
 */

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

// The audiences a verified Google identity may sign in as.
//
// `driver` is included because a driver signs in through the same gate as a
// buyer: a driver is someone with a verified phone number who delivers, and
// excluding the role would leave Google working for buyers but silently
// downgrading every driver to password or OTP sign-in.
const AUDIENCES = ['buyer', 'seller', 'driver', 'institution', 'ops'];

let scriptPromise = null;
let cachedKeys = null;
let cachedAt = 0;

/**
 * How long Google's certificates are reused.
 *
 * The cache must not be indefinite: Google rotates its signing keys, and a
 * forever-cache would keep verifying against a key set that may no longer be
 * current. One hour comfortably matches their rotation and keeps verification
 * off the network for every sign-in within a session.
 */
const KEY_CACHE_MS = 60 * 60 * 1000;

/** Test seam: forget cached certificates so a stub is actually consulted. */
export function clearGoogleKeyCache() {
  cachedKeys = null;
  cachedAt = 0;
}

/** The public client id. Public by design; it is not a secret. */
export function googleClientId() {
  const value = import.meta.env?.VITE_GOOGLE_CLIENT_ID;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function isGoogleConfigured() {
  return Boolean(googleClientId());
}

/** Load the GIS library once and reuse the promise. */
export function loadGoogleIdentity() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Sign-In needs a browser.'));
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.accounts.id));
      existing.addEventListener('error', () => reject(new Error('Could not load Google Sign-In.')));
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.google?.accounts?.id
      ? resolve(window.google.accounts.id)
      : reject(new Error('Google Sign-In loaded incorrectly.')));
    script.onerror = () => reject(new Error('Could not load Google Sign-In.'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/* ---------------------------------------------------------------- */
/* Token decoding and verification                                    */
/* ---------------------------------------------------------------- */

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

/** Split a JWT without verifying it. Never trust the result on its own. */
export function decodeJwt(token) {
  if (typeof token !== 'string') throw new Error('Malformed credential.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed credential.');
  try {
    return {
      header: decodeSegment(parts[0]),
      claims: decodeSegment(parts[1]),
      signature: base64UrlToBytes(parts[2]),
      signingInput: parts[0] + '.' + parts[1],
    };
  } catch {
    throw new Error('Malformed credential.');
  }
}

async function fetchSigningKeys(now = Date.now()) {
  if (cachedKeys && now - cachedAt < KEY_CACHE_MS) return cachedKeys;
  const response = await fetch(CERTS_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Could not reach Google to verify the credential.');
  const body = await response.json();
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error('Google returned no signing keys.');
  cachedKeys = body.keys;
  cachedAt = now;
  return cachedKeys;
}

async function importVerificationKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256' },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/**
 * Verify a Google ID token and return its claims.
 *
 * Throws on any failure. A caller that catches and continues anyway has opted
 * out of verification, which is why there is no "trust me" flag.
 */
export async function verifyGoogleIdToken(token, { clientId = googleClientId(), now = Date.now() } = {}) {
  if (!clientId) throw new Error('Google Sign-In is not configured on this deployment.');

  const { header, claims, signature, signingInput } = decodeJwt(token);

  if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm.');
  if (!header.kid) throw new Error('Token has no key id.');

  const keys = await fetchSigningKeys(now);
  const jwk = keys.find((entry) => entry.kid === header.kid);
  if (!jwk) throw new Error('Token was signed with an unknown key.');

  const key = await importVerificationKey(jwk);
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    new TextEncoder().encode(signingInput),
  );
  if (!verified) throw new Error('Credential signature is invalid.');

  if (claims.aud !== clientId) throw new Error('Credential is for a different application.');
  if (!VALID_ISSUERS.includes(claims.iss)) throw new Error('Credential was not issued by Google.');
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now) throw new Error('Credential has expired.');
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new Error('Google has not verified this email address.');
  }
  if (!claims.sub) throw new Error('Credential has no subject.');

  return claims;
}

/** Normalise a verified identity into the app's account shape. */
export function identityFromClaims(claims, requestedRole = 'buyer') {
  const role = AUDIENCES.includes(requestedRole) ? requestedRole : 'buyer';
  const email = String(claims.email).toLowerCase();
  return {
    identifier: email,
    identifierType: 'email',
    // Fall back to the address so an account always has something to show.
    displayName: claims.name || email.split('@')[0],
    role,
    provider: 'google',
    subject: claims.sub,
  };
}

/**
 * Drive the Google One Tap / button flow and hand back a *verified* identity.
 */
export function signInWithGoogle({ role = 'buyer', nonce, onError } = {}) {
  const clientId = googleClientId();
  if (!clientId) {
    const message = 'Google Sign-In is not configured on this deployment.';
    onError?.(message);
    return Promise.reject(new Error(message));
  }

  return loadGoogleIdentity()
    .then((id) => new Promise((resolve, reject) => {
      id.initialize({
        client_id: clientId,
        callback: (response) => {
          verifyGoogleIdToken(response.credential, { clientId })
            .then((claims) => resolve({ identity: identityFromClaims(claims, role), claims, nonce }))
            .catch(reject);
        },
        ux_mode: 'popup',
        ...(nonce ? { nonce } : {}),
      });
      id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          reject(new Error('Google sign-in was dismissed.'));
        }
      });
    }))
    .catch((error) => {
      onError?.(error.message);
      throw error;
    });
}
