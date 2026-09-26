/**
 * Self-contained code and credential generation for AquaLink.
 *
 * Everything here is produced by the browser's own Web Crypto API
 * (`crypto.getRandomValues` and `crypto.subtle`). There is no third-party
 * service, no network call, and no dependency: the app mints its own booking
 * references, one-time codes, confirmation codes and passwords, and verifies
 * them locally.
 *
 * Note on scope: because every secret also lives in the browser, this protects
 * against guessing, replay and casual inspection of stored values. It is not a
 * substitute for server-side authentication.
 */

const cryptoApi = globalThis.crypto;
const subtle = cryptoApi.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Crockford-style alphabet: digits plus letters with no I/L/O/U ambiguity. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*-_=+';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 3;
const PBKDF2_ITERATIONS = 210000;
const PBKDF2_KEY_BYTES = 32;

/* ------------------------------------------------------------------ */
/* Encoding helpers                                                     */
/* ------------------------------------------------------------------ */

export function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex) {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64Url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------------------ */
/* Random source                                                        */
/* ------------------------------------------------------------------ */

/** Cryptographically secure random bytes. */
export function randomBytes(length) {
  return cryptoApi.getRandomValues(new Uint8Array(length));
}

/**
 * Uniform integer in [0, maxExclusive) via rejection sampling, so no value is
 * more likely than any other the way a plain modulo would make it.
 */
export function randomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('maxExclusive must be a positive integer');
  }
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let value;
  do {
    cryptoApi.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % maxExclusive;
}

export function randomString(length, alphabet = CODE_ALPHABET) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export function randomHex(byteLength = 16) {
  return toHex(randomBytes(byteLength));
}

/* ------------------------------------------------------------------ */
/* Human-facing codes                                                   */
/* ------------------------------------------------------------------ */

/**
 * Single check character (mod 37 over CODE_ALPHABET) so a mistyped code is
 * rejected before it is ever compared against a real one.
 */
export function checkCharacter(body) {
  let remainder = 0;
  for (const char of body) {
    const index = CODE_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Cannot checksum unexpected character: ${char}`);
    remainder = (remainder * 31 + index) % 37;
  }
  return CODE_ALPHABET[remainder];
}

/**
 * Booking reference such as `AQ-1048-K`. Sequential so references look and sort
 * like real ones, with a check character that catches transcription errors.
 */
export function generateBookingCode(existingCodes = [], { prefix = 'AQ', start = 1000 } = {}) {
  const highest = existingCodes.reduce((max, code) => {
    const match = /^([A-Z]+)-(\d+)/.exec(code ?? '');
    return match ? Math.max(max, Number(match[2])) : max;
  }, start - 1);

  const body = `${prefix}-${String(highest + 1)}`;
  return `${body}-${checkCharacter(body.replace('-', ''))}`;
}

export function isBookingCodeWellFormed(code) {
  const match = /^([A-Z]+)-(\d+)-([0-9A-Z])$/.exec(code ?? '');
  if (!match) return false;
  return checkCharacter(`${match[1]}${match[2]}`) === match[3];
}

/** Numeric one-time code, e.g. `483920`. */
export function generateOtp(digits = 6) {
  let code = '';
  for (let i = 0; i < digits; i += 1) code += DIGITS[randomInt(DIGITS.length)];
  return code;
}

const CONFIRMATION_PREFIX = {
  delivery: 'DEL',
  refund: 'REF',
  payout: 'PAY',
  admin: 'ADM',
  seller: 'SEL',
};

/** Purpose-tagged confirmation code such as `DEL-7F3K9Q`. */
export function generateConfirmationCode(purpose = 'delivery', length = 6) {
  const prefix = CONFIRMATION_PREFIX[purpose] ?? purpose.slice(0, 3).toUpperCase();
  return `${prefix}-${randomString(length)}`;
}

/* ------------------------------------------------------------------ */
/* Passwords                                                            */
/* ------------------------------------------------------------------ */

/**
 * Random password that always contains a lowercase, uppercase, digit and
 * symbol, then Fisher-Yates shuffled with the same CSPRNG so the guaranteed
 * characters are not always in the same positions.
 */
export function generatePassword({ length = 20 } = {}) {
  if (length < 8) throw new Error('Password length must be at least 8');
  const pools = [LOWER, UPPER, DIGITS, SYMBOLS];
  const all = pools.join('');

  const chars = pools.map((pool) => pool[randomInt(pool.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Rough strength label for the UI; deliberately conservative. */
export function ratePassword(password) {
  if (!password) return { score: 0, label: 'Empty' };
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^A-Za-z0-9]/.test(password)) pool += 32;
  const bits = password.length * Math.log2(pool || 1);
  const score = Math.min(4, Math.floor(bits / 32));
  return { score, label: ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'][score] };
}

/* ------------------------------------------------------------------ */
/* Hashing and constant-time comparison                                */
/* ------------------------------------------------------------------ */

export function generateSalt(byteLength = 16) {
  return randomHex(byteLength);
}

/** PBKDF2-HMAC-SHA256. Returns hex. */
export async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(salt), iterations, hash: 'SHA-256' },
    key,
    PBKDF2_KEY_BYTES * 8,
  );
  return toHex(new Uint8Array(bits));
}

/** Length-independent, content constant-time string comparison. */
export function timingSafeEqual(a = '', b = '') {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return difference === 0;
}

export async function verifyPassword(password, salt, expectedHash, iterations = PBKDF2_ITERATIONS) {
  const actual = await hashPassword(password, salt, iterations);
  return timingSafeEqual(actual, expectedHash);
}

/* ------------------------------------------------------------------ */
/* Signed tokens (used for OTP challenges and sessions)                */
/* ------------------------------------------------------------------ */

async function hmacKey(secret) {
  return subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function sha256Hex(value) {
  const digest = await subtle.digest('SHA-256', encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

/** `payload.signature`, both base64url. */
export async function signToken(payload, secret) {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = await subtle.sign('HMAC', key, encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Verifies signature before returning the payload; never throws on bad input. */
export async function verifyToken(token, secret) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 2) return { valid: false, reason: 'malformed' };

  const [body, signature] = parts;
  const key = await hmacKey(secret);
  const expected = await subtle.sign('HMAC', key, encoder.encode(body));

  let ok = false;
  try {
    ok = await subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(body));
  } catch {
    ok = false;
  }
  if (!ok) return { valid: false, reason: 'signature' };

  let payload;
  try {
    payload = JSON.parse(decoder.decode(fromBase64Url(body)));
  } catch {
    return { valid: false, reason: 'payload' };
  }

  if (typeof payload.exp === 'number' && Date.now() > payload.exp) {
    return { valid: false, reason: 'expired', payload };
  }
  return { valid: true, payload };
}

/* ------------------------------------------------------------------ */
/* One-time-code challenges                                             */
/* ------------------------------------------------------------------ */

/**
 * Mints a code and a signed challenge. The plaintext code is returned to the
 * caller for display only and is never embedded in the challenge, so a stored
 * challenge cannot be read back into a usable code.
 */
export async function createOtpChallenge({ secret, purpose = 'login', ttlMs = OTP_TTL_MS, maxAttempts = OTP_MAX_ATTEMPTS } = {}) {
  const code = generateOtp();
  const challenge = await signToken(
    {
      purpose,
      codeHash: await sha256Hex(`${secret}:${code}`),
      exp: Date.now() + ttlMs,
      attempts: 0,
      maxAttempts,
    },
    secret,
  );
  return { code, challenge };
}

/**
 * Verifies user input against a challenge. Tracks attempts inside the returned
 * token so a brute-force limit survives without server state.
 */
export async function verifyOtpChallenge(challenge, input, secret) {
  const result = await verifyToken(challenge, secret);
  if (!result.valid) return { ok: false, reason: result.reason };

  const { codeHash, attempts = 0, maxAttempts = OTP_MAX_ATTEMPTS, exp } = result.payload;
  if (attempts >= maxAttempts) return { ok: false, reason: 'locked' };

  const submitted = await sha256Hex(`${secret}:${String(input ?? '').trim()}`);
  const correct = timingSafeEqual(submitted, codeHash);

  if (correct) return { ok: true, reason: 'verified' };

  const used = attempts + 1;
  const updated = await signToken(
    { ...result.payload, attempts: used, exp: exp ?? Date.now() + OTP_TTL_MS },
    secret,
  );
  return {
    ok: false,
    reason: used >= maxAttempts ? 'locked' : 'mismatch',
    attemptsLeft: Math.max(0, maxAttempts - used),
    challenge: updated,
  };
}

/* ------------------------------------------------------------------ */
/* Per-device secret                                                    */
/* ------------------------------------------------------------------ */

const DEVICE_SECRET_KEY = 'aqualink.deviceSecret.v1';

/**
 * A per-browser secret used to sign local challenges. Generated on first use
 * and kept in localStorage, so codes stay valid across reloads without any
 * server round trip.
 */
export function ensureDeviceSecret(storage = globalThis.localStorage) {
  const existing = storage?.getItem(DEVICE_SECRET_KEY);
  if (existing) return existing;
  const secret = randomHex(32);
  storage?.setItem(DEVICE_SECRET_KEY, secret);
  return secret;
}
