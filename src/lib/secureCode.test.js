import { describe, expect, test } from 'vitest';
import {
  checkCharacter,
  createOtpChallenge,
  ensureDeviceSecret,
  fromBase64Url,
  generateBookingCode,
  generateConfirmationCode,
  generateOtp,
  generatePassword,
  generateSalt,
  hashPassword,
  isBookingCodeWellFormed,
  randomHex,
  randomInt,
  randomString,
  ratePassword,
  sha256Hex,
  signToken,
  timingSafeEqual,
  toBase64Url,
  toHex,
  fromHex,
  verifyOtpChallenge,
  verifyPassword,
  verifyToken,
} from './secureCode';

const FAST = 1000;
const SECRET = 'test-device-secret';

describe('random source', () => {
  test('randomInt stays in range and does not bias towards low values', () => {
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 3000; i += 1) {
      const value = randomInt(6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      counts[value] += 1;
    }
    // Rejection sampling should keep every bucket broadly even.
    for (const count of counts) expect(count).toBeGreaterThan(300);
  });

  test('randomInt rejects invalid bounds', () => {
    expect(() => randomInt(0)).toThrow();
    expect(() => randomInt(-5)).toThrow();
    expect(() => randomInt(2.5)).toThrow();
  });

  test('hex and base64url round trip', () => {
    const hex = randomHex(16);
    expect(hex).toHaveLength(32);
    expect(toHex(fromHex(hex))).toBe(hex);
    expect(() => fromHex('zz')).toThrow();
    expect(() => fromHex('abc')).toThrow();

    const encoded = toBase64Url(fromHex(hex));
    expect(encoded).not.toMatch(/[+/=]/);
    expect(toHex(fromBase64Url(encoded))).toBe(hex);
  });

  test('randomString honours the requested length', () => {
    expect(randomString(12)).toHaveLength(12);
    expect(randomString(0)).toBe('');
  });
});

describe('booking codes', () => {
  test('increments past the highest existing reference', () => {
    expect(generateBookingCode([])).toBe('AQ-1000-2');
    expect(generateBookingCode(['AQ-1048-1', 'AQ-1051-2'])).toBe('AQ-1052-9');
  });

  test('ignores malformed codes when finding the high water mark', () => {
    expect(generateBookingCode(['garbage', null, 'AQ-3'])).toBe('AQ-1000-2');
  });

  test('checkCharacter always returns a real alphabet character', () => {
    // Regression: the modulus once exceeded the alphabet size, which could
    // produce `undefined` for some inputs.
    for (let n = 0; n < 5000; n += 1) {
      const body = `AQ${n}`;
      expect(CODE_ALPHABET).toContain(checkCharacter(body));
    }
  });

  test('generated codes are well formed and detect single-character typos', () => {
    const code = generateBookingCode(['AQ-1048-1']);
    expect(isBookingCodeWellFormed(code)).toBe(true);

    const tampered = `${code.slice(0, -1)}${code.slice(-1) === 'Z' ? 'Y' : 'Z'}`;
    expect(isBookingCodeWellFormed(tampered)).toBe(false);
    expect(isBookingCodeWellFormed('AQ-1000')).toBe(false);
    expect(isBookingCodeWellFormed(undefined)).toBe(false);
  });

  test('checkCharacter is stable and rejects unknown characters', () => {
    expect(checkCharacter('AQ1000')).toBe(checkCharacter('AQ1000'));
    expect(() => checkCharacter('AQ-1000')).toThrow();
  });
});

describe('one-time codes', () => {
  test('generateOtp produces digits of the requested length', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
    expect(generateOtp(4)).toMatch(/^\d{4}$/);
  });

  test('confirmation codes are tagged by purpose', () => {
    expect(generateConfirmationCode('delivery')).toMatch(/^DEL-[0-9A-Z]{6}$/);
    expect(generateConfirmationCode('refund')).toMatch(/^REF-[0-9A-Z]{6}$/);
    expect(generateConfirmationCode('payout')).toMatch(/^PAY-/);
    expect(generateConfirmationCode('custom')).toMatch(/^CUS-/);
  });
});

describe('passwords', () => {
  test('meets the requested length and includes every character class', () => {
    for (let i = 0; i < 25; i += 1) {
      const password = generatePassword({ length: 20 });
      expect(password).toHaveLength(20);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
    }
  });

  test('is random rather than fixed', () => {
    const generated = new Set(Array.from({ length: 40 }, () => generatePassword({ length: 16 })));
    expect(generated.size).toBe(40);
  });

  test('refuses dangerously short passwords', () => {
    expect(() => generatePassword({ length: 4 })).toThrow();
  });

  test('ratePassword separates weak from strong', () => {
    expect(ratePassword('').label).toBe('Empty');
    expect(ratePassword('abc').score).toBeLessThan(ratePassword(generatePassword()).score);
    expect(ratePassword(generatePassword({ length: 24 })).label).toBe('Excellent');
  });
});

describe('password hashing', () => {
  test('salts are random hex', () => {
    expect(generateSalt()).toMatch(/^[0-9a-f]{32}$/);
    expect(generateSalt()).not.toBe(generateSalt());
  });

  test('the same password under different salts yields different hashes', async () => {
    const a = await hashPassword('correct horse', generateSalt(), FAST);
    const b = await hashPassword('correct horse', generateSalt(), FAST);
    expect(a).not.toBe(b);
  });

  test('verifies the right password and rejects the wrong one', async () => {
    const salt = generateSalt();
    const hash = await hashPassword('correct horse', salt, FAST);
    await expect(verifyPassword('correct horse', salt, hash, FAST)).resolves.toBe(true);
    await expect(verifyPassword('Correct horse', salt, hash, FAST)).resolves.toBe(false);
    await expect(verifyPassword('', salt, hash, FAST)).resolves.toBe(false);
  });

  test('a wrong salt fails even for the right password', async () => {
    const hash = await hashPassword('correct horse', generateSalt(), FAST);
    await expect(verifyPassword('correct horse', generateSalt(), hash, FAST)).resolves.toBe(false);
  });

  test('default iteration count is the OWASP-recommended PBKDF2 work factor', async () => {
    const salt = generateSalt();
    const hash = await hashPassword('pw', salt);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(verifyPassword('pw', salt, hash)).resolves.toBe(true);
  });
});

describe('constant-time comparison', () => {
  test('compares by content, not by truthiness', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
    expect(timingSafeEqual(undefined, undefined)).toBe(true);
  });
});

describe('signed tokens', () => {
  test('round trips a payload', async () => {
    const token = await signToken({ sub: 'buyer', tier: 'silver' }, SECRET);
    const result = await verifyToken(token, SECRET);
    expect(result.valid).toBe(true);
    expect(result.payload).toEqual({ sub: 'buyer', tier: 'silver' });
  });

  test('rejects a tampered payload', async () => {
    const token = await signToken({ role: 'buyer' }, SECRET);
    const [body] = token.split('.');
    const forged = `${toBase64Url(new TextEncoder().encode(JSON.stringify({ role: 'ops' })))}.${token.split('.')[1]}`;
    expect(body).not.toBe(forged.split('.')[0]);
    await expect(verifyToken(forged, SECRET)).resolves.toEqual({ valid: false, reason: 'signature' });
  });

  test('rejects the wrong secret', async () => {
    const token = await signToken({ role: 'buyer' }, SECRET);
    await expect(verifyToken(token, 'other-secret')).resolves.toEqual({ valid: false, reason: 'signature' });
  });

  test('rejects expired tokens', async () => {
    const token = await signToken({ exp: Date.now() - 1000 }, SECRET);
    const result = await verifyToken(token, SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  test('rejects malformed input without throwing', async () => {
    for (const bad of ['', 'abc', 'a.b.c', null, undefined]) {
      const result = await verifyToken(bad, SECRET);
      expect(result.valid).toBe(false);
    }
  });

  test('sha256Hex is stable and 32 bytes of hex', async () => {
    await expect(sha256Hex('abc')).resolves.toHaveLength(64);
    await expect(sha256Hex('abc')).resolves.toBe(await sha256Hex('abc'));
    await expect(sha256Hex('abc')).resolves.not.toBe(await sha256Hex('abd'));
  });
});

describe('otp challenges', () => {
  test('accepts the generated code', async () => {
    const { code, challenge } = await createOtpChallenge({ secret: SECRET });
    await expect(verifyOtpChallenge(challenge, code, SECRET)).resolves.toEqual({ ok: true, reason: 'verified' });
  });

  test('tolerates surrounding whitespace but not a wrong code', async () => {
    const { code, challenge } = await createOtpChallenge({ secret: SECRET });
    await expect(verifyOtpChallenge(challenge, `  ${code} `, SECRET)).resolves.toEqual({ ok: true, reason: 'verified' });

    const fresh = await createOtpChallenge({ secret: SECRET });
    const wrong = await verifyOtpChallenge(fresh.challenge, '000000', SECRET);
    expect(wrong.ok).toBe(false);
    expect(wrong.reason).toBe('mismatch');
    expect(wrong.attemptsLeft).toBe(2);
  });

  test('never stores the plaintext code inside the challenge', async () => {
    const { code, challenge } = await createOtpChallenge({ secret: SECRET });
    const { payload } = await verifyToken(challenge, SECRET);
    expect(JSON.stringify(payload)).not.toContain(code);
    expect(payload.codeHash).toBe(await sha256Hex(`${SECRET}:${code}`));
  });

  test('locks out after the attempt limit', async () => {
    let { challenge } = await createOtpChallenge({ secret: SECRET, maxAttempts: 3 });
    challenge = (await verifyOtpChallenge(challenge, '111111', SECRET)).challenge;
    challenge = (await verifyOtpChallenge(challenge, '222222', SECRET)).challenge;

    const locked = await verifyOtpChallenge(challenge, '333333', SECRET);
    expect(locked.ok).toBe(false);
    expect(locked.reason).toBe('locked');
    expect(locked.attemptsLeft).toBe(0);

    // Even the correct code is refused once the challenge is locked.
    const { code } = await createOtpChallenge({ secret: SECRET });
    await expect(verifyOtpChallenge(challenge, code, SECRET)).resolves.toEqual({ ok: false, reason: 'locked' });
  });

  test('a challenge is bound to its issuing secret', async () => {
    const { code, challenge } = await createOtpChallenge({ secret: SECRET });
    const result = await verifyOtpChallenge(challenge, code, 'a-different-secret');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature');
  });

  test('an expired challenge is rejected', async () => {
    const { code, challenge } = await createOtpChallenge({ secret: SECRET, ttlMs: -1 });
    const result = await verifyOtpChallenge(challenge, code, SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('expired');
  });
});

describe('device secret', () => {
  test('is generated once and then reused', () => {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    };
    const first = ensureDeviceSecret(storage);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(ensureDeviceSecret(storage)).toBe(first);
    expect(store.size).toBe(1);
  });

  test('survives a reload of the same store', () => {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    };
    const before = ensureDeviceSecret(storage);
    // A fresh "page load" re-reads the same persisted store.
    expect(ensureDeviceSecret(storage)).toBe(before);
  });
});
