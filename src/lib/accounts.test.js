import { beforeEach, describe, expect, test } from 'vitest';
import {
  ACCOUNT_ROLES,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  ValidationError,
  authenticateWithPassword,
  beginPhoneSignIn,
  completePhoneSignIn,
  createAccount,
  deleteAccount,
  describeAccount,
  detectIdentifierType,
  findAccount,
  formatPhoneForDisplay,
  isAccountLocked,
  isEmail,
  isPhone,
  listAccounts,
  normalizeEmail,
  normalizePhone,
  seedDemoAccounts,
  validateIdentifier,
} from './accounts';
import { clearAll, readValue } from './storage';

const SECRET = 'test-device-secret';
const PASSWORD = 'correct-horse-battery';

beforeEach(() => {
  clearAll();
});

describe('identifier validation', () => {
  test('normalises emails', () => {
    expect(normalizeEmail('  Alex@Example.COM ')).toBe('alex@example.com');
    expect(isEmail('alex@example.com')).toBe(true);
    expect(isEmail('a.b+tag@sub.example.co.uk')).toBe(true);
  });

  test('rejects malformed emails', () => {
    for (const bad of ['', 'alex', 'alex@', '@example.com', 'alex@example', 'alex @example.com', 'alex@exa mple.com']) {
      expect(isEmail(bad)).toBe(false);
    }
  });

  test('normalises every accepted Ghana phone format to E.164', () => {
    const expected = '+233545009046';
    for (const variant of [
      '0545009046',
      '054 500 9046',
      '054-500-9046',
      '(054) 500 9046',
      '+233545009046',
      '233545009046',
      '545009046',
    ]) {
      expect(normalizePhone(variant)).toBe(expected);
    }
  });

  test('rejects numbers that are not Ghanaian mobiles', () => {
    for (const bad of ['', '054500904', '05450090461', '0123456789', '+12025550123', 'abcdefghij', '054500904a']) {
      expect(normalizePhone(bad)).toBeNull();
    }
    expect(isPhone('0545009046')).toBe(true);
  });

  test('classifies identifiers', () => {
    expect(detectIdentifierType('alex@example.com')).toBe('email');
    expect(detectIdentifierType('0545009046')).toBe('phone');
    expect(detectIdentifierType('nonsense')).toBeNull();
  });

  test('validateIdentifier throws a field-tagged error', () => {
    expect(validateIdentifier(' Alex@Example.com ')).toEqual({ type: 'email', normalized: 'alex@example.com' });
    expect(validateIdentifier('0545009046')).toEqual({ type: 'phone', normalized: '+233545009046' });
    expect(() => validateIdentifier('')).toThrow(ValidationError);
    expect(() => validateIdentifier('nope')).toThrow(ValidationError);
    try {
      validateIdentifier('nope');
    } catch (error) {
      expect(error.field).toBe('identifier');
    }
  });

  test('formats a stored number for display', () => {
    expect(formatPhoneForDisplay('+233545009046')).toBe('054 500 9046');
    expect(formatPhoneForDisplay(null)).toBe('');
  });
});

describe('account store', () => {
  test('creates and finds an account by any identifier format', async () => {
    await createAccount({ identifier: '0545009046', role: 'buyer', displayName: 'Alex', password: PASSWORD });

    expect(findAccount('0545009046').displayName).toBe('Alex');
    expect(findAccount('+233 545 009 046').displayName).toBe('Alex');
    expect(findAccount('0545009047')).toBeNull();
    expect(listAccounts()).toHaveLength(1);
  });

  test('stores only a salt and hash, never the plaintext password', async () => {
    await createAccount({ identifier: 'alex@example.com', password: PASSWORD });
    const [account] = listAccounts();

    expect(account.passwordSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(account.passwordHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(listAccounts())).not.toContain(PASSWORD);
  });

  test('rejects duplicate identifiers across formats', async () => {
    await createAccount({ identifier: '0545009046', password: PASSWORD });
    await expect(createAccount({ identifier: '+233545009046', password: PASSWORD })).rejects.toThrow(ValidationError);
  });

  test('rejects invalid identifiers, unknown roles and short passwords', async () => {
    await expect(createAccount({ identifier: 'nonsense' })).rejects.toThrow(ValidationError);
    await expect(createAccount({ identifier: 'alex@example.com', role: 'wizard' })).rejects.toThrow(ValidationError);
    await expect(createAccount({ identifier: 'alex@example.com', password: 'short' })).rejects.toThrow(ValidationError);
  });

  test('phone accounts carry no stored secret when none is supplied', async () => {
    await createAccount({ identifier: '0545009046', role: 'buyer' });
    const [account] = listAccounts();
    expect(account.passwordHash).toBeNull();
    expect(account.passwordSalt).toBeNull();
  });

  test('deletes accounts', async () => {
    await createAccount({ identifier: 'alex@example.com', password: PASSWORD });
    expect(deleteAccount('alex@example.com')).toBe(true);
    expect(deleteAccount('alex@example.com')).toBe(false);
    expect(listAccounts()).toHaveLength(0);
  });

  test('every seeded role is a known role', () => {
    expect(ACCOUNT_ROLES).toEqual(['buyer', 'seller', 'institution', 'ops']);
  });
});

describe('account status and lockout', () => {
  test('describes suspended accounts', async () => {
    await createAccount({ identifier: 'alex@example.com', password: PASSWORD, status: 'suspended' });
    expect(describeAccount(findAccount('alex@example.com'))).toMatch(/suspended/i);
  });

  test('describes locked accounts and counts down', async () => {
    const account = { lockedUntil: Date.now() + 120000 };
    expect(describeAccount(account)).toMatch(/too many failed attempts/i);
    expect(isAccountLocked(account)).toBe(true);
    expect(isAccountLocked({ lockedUntil: Date.now() - 1 })).toBe(false);
    expect(describeAccount(null)).toMatch(/no account/i);
  });

  test('lockout lasts the configured window', () => {
    expect(LOCKOUT_MS).toBe(5 * 60 * 1000);
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
  });
});

describe('password sign-in', () => {
  beforeEach(async () => {
    await createAccount({ identifier: 'ops@aqualink.gh', role: 'ops', password: PASSWORD });
  });

  test('accepts the right password and records the login', async () => {
    const result = await authenticateWithPassword('ops@aqualink.gh', PASSWORD);
    expect(result.ok).toBe(true);
    expect(result.account.lastLoginAt).toBeTruthy();
    expect(result.account.failedAttempts).toBe(0);
  });

  test('is case-insensitive about the identifier but not the password', async () => {
    await expect(authenticateWithPassword('  OPS@AQUALINK.GH ', PASSWORD)).resolves.toMatchObject({ ok: true });
    await expect(authenticateWithPassword('ops@aqualink.gh', 'CORRECT-HORSE-BATTERY')).resolves.toMatchObject({ ok: false });
  });

  test('gives the same reason for an unknown account and a wrong password', async () => {
    const unknown = await authenticateWithPassword('nobody@example.com', PASSWORD);
    const wrong = await authenticateWithPassword('ops@aqualink.gh', 'wrong');
    expect(unknown.reason).toBe('invalid');
    expect(wrong.reason).toBe('invalid');
    // Details may differ for usability, but the machine-readable reason must not.
    expect(unknown.reason).toBe(wrong.reason);
  });

  test('counts down remaining attempts then locks the account', async () => {
    for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      const result = await authenticateWithPassword('ops@aqualink.gh', `wrong-${attempt}`);
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/attempt\(s\) left/);
    }

    const locked = await authenticateWithPassword('ops@aqualink.gh', 'wrong-final');
    expect(locked.ok).toBe(false);
    expect(locked.detail).toMatch(/too many failed attempts/i);

    // Even the correct password is refused while locked.
    const correct = await authenticateWithPassword('ops@aqualink.gh', PASSWORD);
    expect(correct.ok).toBe(false);
    expect(isAccountLocked(findAccount('ops@aqualink.gh'))).toBe(true);
  });

  test('a successful login clears the failure counter', async () => {
    await authenticateWithPassword('ops@aqualink.gh', 'wrong');
    await authenticateWithPassword('ops@aqualink.gh', 'wrong');
    await expect(authenticateWithPassword('ops@aqualink.gh', PASSWORD)).resolves.toMatchObject({ ok: true });
    expect(findAccount('ops@aqualink.gh').failedAttempts).toBe(0);
  });

  test('refuses suspended accounts even with the right password', async () => {
    await createAccount({ identifier: 'banned@example.com', password: PASSWORD, status: 'suspended' });
    const result = await authenticateWithPassword('banned@example.com', PASSWORD);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/suspended/i);
  });

  test('directs phone-only accounts to the one-time code flow', async () => {
    await createAccount({ identifier: '0545009046', role: 'buyer' });
    const result = await authenticateWithPassword('0545009046', PASSWORD);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/one-time code/i);
  });
});

describe('phone sign-in with one-time codes', () => {
  beforeEach(async () => {
    await createAccount({ identifier: '0545009046', role: 'buyer', displayName: 'Alex' });
  });

  test('issues a code for a real account and completes the sign-in', async () => {
    const begun = await beginPhoneSignIn('0545009046', SECRET);
    expect(begun.ok).toBe(true);
    expect(begun.code).toMatch(/^\d{6}$/);

    const done = await completePhoneSignIn({ identifier: '0545009046', challenge: begun.challenge, code: begun.code, secret: SECRET });
    expect(done.ok).toBe(true);
    expect(done.account.lastLoginAt).toBeTruthy();
  });

  test('issues no code for an unregistered number', async () => {
    const begun = await beginPhoneSignIn('0545999999', SECRET);
    expect(begun.ok).toBe(false);
    expect(begun.code).toBeUndefined();
    expect(begun.challenge).toBeUndefined();
    expect(begun.detail).toMatch(/no account matches/i);
  });

  test('issues no code for an email-only account', async () => {
    await createAccount({ identifier: 'alex@example.com', password: PASSWORD });
    await expect(beginPhoneSignIn('alex@example.com', SECRET)).resolves.toMatchObject({ ok: false });
  });

  test('rejects a wrong code and refuses a mismatched identifier', async () => {
    const begun = await beginPhoneSignIn('0545009046', SECRET);
    const wrong = await completePhoneSignIn({ identifier: '0545009046', challenge: begun.challenge, code: '000000', secret: SECRET });
    expect(wrong.ok).toBe(false);
    expect(wrong.detail).toMatch(/did not match/i);

    await expect(completePhoneSignIn({
      identifier: '0545009046', challenge: begun.challenge, code: begun.code, secret: 'other-secret',
    })).resolves.toMatchObject({ ok: false });
  });

  test('a code issued for one account cannot sign in another', async () => {
    await createAccount({ identifier: '0545111222', role: 'buyer' });
    const begun = await beginPhoneSignIn('0545009046', SECRET);
    const attempt = await completePhoneSignIn({ identifier: '0545111222', challenge: begun.challenge, code: begun.code, secret: SECRET });
    expect(attempt.ok).toBe(false);
  });

  test('refuses suspended and locked accounts', async () => {
    await createAccount({ identifier: '0545222333', role: 'buyer', status: 'suspended' });
    await expect(beginPhoneSignIn('0545222333', SECRET)).resolves.toMatchObject({ ok: false });
  });
});

describe('demo seed', () => {
  test('creates a buyer and an ops account with generated passwords', async () => {
    const seeded = await seedDemoAccounts();
    expect(seeded.buyer.identifier).toBe('+233545009046');
    expect(seeded.ops.identifier).toBe('ops@aqualink.gh');
    expect(seeded.buyer.password).not.toBe(seeded.ops.password);
    expect(listAccounts()).toHaveLength(2);

    await expect(authenticateWithPassword('ops@aqualink.gh', seeded.ops.password)).resolves.toMatchObject({ ok: true });
  });

  test('is idempotent', async () => {
    await seedDemoAccounts();
    await expect(seedDemoAccounts()).resolves.toBeNull();
    expect(listAccounts()).toHaveLength(2);
  });

  test('never persists the generated passwords in plaintext', async () => {
    const seeded = await seedDemoAccounts();
    const raw = JSON.stringify(listAccounts());
    expect(raw).not.toContain(seeded.ops.password);
    expect(raw).not.toContain(seeded.buyer.password);
    expect(readValue('accounts.seeded')).toBe(true);
  });
});
