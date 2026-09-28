/**
 * Meta (Facebook) Sign-In via the Facebook JS SDK.
 *
 * The flow mirrors googleAuth.js in spirit: load the provider's client SDK once,
 * drive the sign-in, then verify the resulting identity before any account is
 * created.
 *
 * Verification approach:
 *
 *   Facebook's JS SDK returns a short-lived access token scoped to this app.
 *   The token is validated by calling the Graph API `/me` endpoint with it: a
 *   genuine token returns the user's profile, while a forged or expired token is
 *   rejected by Facebook with an error. The Graph API `id` is cross-checked
 *   against the SDK's `userID` so the profile returned over the network cannot be
 *   swapped for another.
 *
 *   This is the standard client-side Facebook pattern. It differs from Google's
 *   flow, which verifies an RS256-signed JWT against Google's JWKS, because
 *   Facebook does not expose public signing keys for access tokens to browsers
 *   without the app secret. The access-token + Graph-API check is what every
 *   Facebook Login integration uses client-side, and it establishes that the
 *   user authenticated through Facebook and owns the returned email.
 *
 * Known limits (stated honestly, matching googleAuth.js):
 *
 *   - No replay protection. A captured access token is valid until it expires
 *     (Facebook issues short-lived tokens, ~1-2 hours). A backend can revoke it.
 *   - No server-side revocation. A token banned in Facebook's app dashboard is
 *     refused at the next issue, not retroactively.
 *   - The app id is public by design. It identifies the app; the app secret is
 *     never placed in a browser bundle.
 */

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';
const GRAPH_BASE = 'https://graph.facebook.com/v18.0';
const VALID_ROLES = ['buyer', 'seller', 'institution', 'ops'];

let scriptPromise = null;

export function clearMetaSdkCache() {
  scriptPromise = null;
}

/** The public app id for the Meta (Facebook) app. Public by design; not a secret. */
export function metaClientId() {
  const value = import.meta.env?.VITE_FACEBOOK_CLIENT_ID;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function isMetaConfigured() {
  return Boolean(metaClientId());
}

/** Load the Facebook JS SDK once and reuse the promise. */
export function loadFacebookSdk() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Meta sign-in needs a browser.'));
  }
  if (window.FB) return Promise.resolve(window.FB);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.FB));
      existing.addEventListener('error', () => reject(new Error('Could not load the Meta SDK.')));
      return;
    }
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.FB) {
        window.FB.init({
          appId: metaClientId(),
          cookie: true,
          xfbml: false,
          version: 'v18.0',
        });
        resolve(window.FB);
      } else {
        reject(new Error('Meta SDK loaded incorrectly.'));
      }
    };
    script.onerror = () => reject(new Error('Could not load the Meta SDK.'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Fetch the user's profile from the Graph API using the access token returned by
 * the SDK. Returns the profile object. Throws when the API rejects the token.
 */
async function fetchMetaProfile(accessToken) {
  const url = `${GRAPH_BASE}/me?access_token=${encodeURIComponent(accessToken)}&fields=id,name,email`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.error || !data.id) {
    throw new Error(data.error?.message || 'Meta verification failed.');
  }
  return data;
}

/**
 * Normalise a verified Meta identity into the app's account shape.
 *
 * Mirrors identityFromClaims in googleAuth.js so the two providers produce
 * compatible records.
 */
export function identityFromMetaClaims(claims, requestedRole = 'buyer') {
  const role = VALID_ROLES.includes(requestedRole) ? requestedRole : 'buyer';
  const email = String(claims.email ?? '').toLowerCase();
  return {
    identifier: email,
    identifierType: email ? 'email' : 'subject',
    displayName: claims.name || (email ? email.split('@')[0] : String(claims.id).slice(0, 8)),
    role,
    provider: 'facebook',
    subject: String(claims.id),
  };
}

/**
 * Drive the Facebook login flow and verify the resulting identity.
 *
 * The access token is validated by calling the Graph API, and the returned `id`
 * is cross-checked against the SDK's `userID` so a substituted profile cannot
 * pass. Email must be present — without it no account can be created.
 */
export function signInWithMeta({ role = 'buyer', onError } = {}) {
  const clientId = metaClientId();
  if (!clientId) {
    const message = 'Meta sign-in is not configured on this deployment.';
    onError?.(message);
    return Promise.reject(new Error(message));
  }

  return loadFacebookSdk()
    .then((FB) => new Promise((resolve, reject) => {
      FB.login((response) => {
        if (!response.authResponse) {
          reject(new Error('Meta sign-in was cancelled.'));
          return;
        }

        const { accessToken, userID } = response.authResponse;

        fetchMetaProfile(accessToken)
          .then((claims) => {
            if (claims.id !== userID) {
              reject(new Error('Meta identity mismatch.'));
              return;
            }
            if (!claims.email) {
              reject(new Error('Meta did not return an email address.'));
              return;
            }
            resolve({ identity: identityFromMetaClaims(claims, role), claims });
          })
          .catch((error) => {
            onError?.(error.message);
            reject(error);
          });
      }, {
        scope: 'public_profile,email',
      });
    }))
    .catch((error) => {
      if (!error.message || !['Meta sign-in was cancelled.', 'Meta did not return an email address.', 'Meta identity mismatch.', 'Meta verification failed.'].some((msg) => error.message.includes(msg))) {
        onError?.(error.message || 'Meta sign-in failed.');
      }
      throw error;
    });
}
