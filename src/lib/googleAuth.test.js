import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearGoogleKeyCache, decodeJwt, identityFromClaims, isGoogleConfigured, verifyGoogleIdToken } from './googleAuth';

/**
 * Verification is the whole security boundary here, so these tests drive the
 * real path: a genuine RSA key pair is generated, a token is signed with it,
 * and Google's key endpoint is stubbed to publish the matching public key. That
 * exercises actual Web Crypto verification rather than asserting on mocks.
 */

const CLIENT_ID = '1234567890-abcdefghijklmnop.apps.googleusercontent.com';
const KID = 'test-key-1';

function base64Url(bytes) {
  return Buffer.from(bytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeSegment(value) {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

let keyPair;

async function ensureKeyPair() {
  if (keyPair) return keyPair;
  keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  return keyPair;
}

async function publicJwk() {
  const pair = await ensureKeyPair();
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { kty: 'RSA', alg: 'RS256', use: 'sig', kid: KID, n: jwk.n, e: jwk.e };
}

async function makeToken(claims, { alg = 'RS256', kid = KID, tamper = false } = {}) {
  const pair = await ensureKeyPair();
  const header = encodeSegment({ alg, typ: 'JWT', kid });
  const payload = encodeSegment(claims);
  const signingInput = tamper ? `${header}.${payload}x` : `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    pair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

const VALID_CLAIMS = {
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1234567890',
  email: 'Ama.Serwaa@Gmail.com',
  email_verified: true,
  name: 'Ama Serwaa',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

function stubCerts(keys) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ keys }) })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // The key cache is deliberately module-level; without this a stubbed
  // certificate endpoint would be ignored and tests would pass for the wrong
  // reason.
  clearGoogleKeyCache();
});

describe('configuration', () => {
  test('reports unconfigured when no client id is present', () => {
    expect(isGoogleConfigured()).toBe(false);
  });

  test('refuses to verify anything when unconfigured, rather than trusting it', async () => {
    await expect(verifyGoogleIdToken('a.b.c', { clientId: '' })).rejects.toThrow(/not configured/i);
  });
});

describe('decoding', () => {
  test('rejects a token that is not a three-part JWT', () => {
    expect(() => decodeJwt('nonsense')).toThrow(/malformed/i);
    expect(() => decodeJwt(null)).toThrow(/malformed/i);
    expect(() => decodeJwt('a.b')).toThrow(/malformed/i);
  });

  test('rejects a token whose segments are not valid base64url JSON', () => {
    expect(() => decodeJwt('!!!.???.###')).toThrow(/malformed/i);
  });
});

describe('signature verification', () => {
  test('accepts a correctly signed, unexpired token for our client', async () => {
    stubCerts([await publicJwk()]);
    const claims = await verifyGoogleIdToken(await makeToken(VALID_CLAIMS), { clientId: CLIENT_ID });
    expect(claims.email).toBe('Ama.Serwaa@Gmail.com');
  });

  test('rejects a token whose payload was altered after signing', async () => {
    stubCerts([await publicJwk()]);
    const token = await makeToken(VALID_CLAIMS, { tamper: true });
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID })).rejects.toThrow(/signature is invalid/i);
  });

  test('rejects a token signed by a key Google does not publish', async () => {
    stubCerts([{ ...(await publicJwk()), kid: 'some-other-key' }]);
    await expect(verifyGoogleIdToken(await makeToken(VALID_CLAIMS), { clientId: CLIENT_ID }))
      .rejects.toThrow(/unknown key/i);
  });

  test('rejects an unsigned (alg none) token', async () => {
    stubCerts([await publicJwk()]);
    const token = await makeToken(VALID_CLAIMS, { alg: 'none' });
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID })).rejects.toThrow(/algorithm/i);
  });

  test('surfaces a network failure instead of silently accepting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    await expect(verifyGoogleIdToken(await makeToken(VALID_CLAIMS), { clientId: CLIENT_ID }))
      .rejects.toThrow(/could not reach google/i);
  });
});

describe('claim validation', () => {
  test('rejects a token issued for a different application', async () => {
    stubCerts([await publicJwk()]);
    const token = await makeToken({ ...VALID_CLAIMS, aud: 'someone-else.apps.googleusercontent.com' });
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID })).rejects.toThrow(/different application/i);
  });

  test('rejects a token from a non-Google issuer', async () => {
    stubCerts([await publicJwk()]);
    const token = await makeToken({ ...VALID_CLAIMS, iss: 'https://evil.example' });
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID })).rejects.toThrow(/not issued by google/i);
  });

  test('rejects an expired token', async () => {
    stubCerts([await publicJwk()]);
    const token = await makeToken({ ...VALID_CLAIMS, exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID })).rejects.toThrow(/expired/i);
  });

  test('rejects an unverified email, so an unproven address cannot sign in', async () => {
    stubCerts([await publicJwk()]);
    const token = await makeToken({ ...VALID_CLAIMS, email_verified: false });
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID })).rejects.toThrow(/not verified/i);
  });
});

describe('identity mapping', () => {
  test('lowercases the identifier and records the provider subject', () => {
    const identity = identityFromClaims(VALID_CLAIMS, 'seller');
    expect(identity.identifier).toBe('ama.serwaa@gmail.com');
    expect(identity.identifierType).toBe('email');
    expect(identity.role).toBe('seller');
    expect(identity.provider).toBe('google');
    expect(identity.subject).toBe('1234567890');
    expect(identity.displayName).toBe('Ama Serwaa');
  });

  test('falls back to the email prefix when Google supplies no name', () => {
    expect(identityFromClaims({ ...VALID_CLAIMS, name: undefined }, 'buyer').displayName).toBe('ama.serwaa');
  });

  test('refuses an unknown role rather than passing it through', () => {
    expect(identityFromClaims(VALID_CLAIMS, 'superuser').role).toBe('buyer');
  });
});
