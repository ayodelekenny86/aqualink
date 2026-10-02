import { beforeEach, describe, expect, test } from 'vitest';
import {
  ACCOUNT_PROVIDERS,
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
  registerAccount,
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
    // `driver` is a first-class role because a driver signs in through this same
    // registry and needs an account to hold a session against. Omitting it made
    // `createAccount({ role: 'driver' })` fail, leaving no way for the driver app
    // to authenticate at all.
    expect(ACCOUNT_ROLES).toEqual(['buyer', 'seller', 'driver', 'institution', 'ops']);
  });

  test('accepts a driver account and can sign it back in', async () => {
    const created = await createAccount({
      identifier: '0545009046',
      password: PASSWORD,
      role: 'driver',
    });
    expect(created.role).toBe('driver');

    const result = await authenticateWithPassword('0545009046', PASSWORD);
    expect(result.ok).toBe(true);
    expect(result.account.role).toBe('driver');
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

describe('account provisioning', () => {
  test('no account is invented on first run', () => {
    // The old behaviour seeded a buyer and an ops account and printed both
    // passwords on the sign-in page, which published a real admin credential to
    // anyone who loaded the app. Nothing may be created implicitly now.
    expect(listAccounts()).toEqual([]);
    expect(readValue('accounts.seeded')).toBeUndefined();
  });

  test('registering creates exactly the one account asked for', async () => {
    await registerAccount({ identifier: '0544007788', role: 'buyer', displayName: 'Ama Serwaa' });
    const accounts = listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].identifier).toBe('+233544007788');
    expect(accounts[0].role).toBe('buyer');
  });

  test('a registered password is hashed, never stored in the clear', async () => {
    await registerAccount({ identifier: 'ops@aqualink.gh', role: 'ops', displayName: 'Operations', password: 'a-long-enough-password' });
    const raw = JSON.stringify(listAccounts());
    expect(raw).not.toContain('a-long-enough-password');
    expect(listAccounts()[0].passwordHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a registered password actually authenticates', async () => {
    await registerAccount({ identifier: 'ops@aqualink.gh', role: 'ops', password: 'a-long-enough-password' });
    await expect(authenticateWithPassword('ops@aqualink.gh', 'a-long-enough-password')).resolves.toMatchObject({ ok: true });
  });
});

describe('provider-backed accounts', () => {
  test('a Google account stores no password at all', async () => {
    const account = await createAccount({
      identifier: 'Ama.Serwaa@Gmail.com',
      role: 'buyer',
      displayName: 'Ama Serwaa',
      provider: 'google',
      providerSubject: '1234567890',
    });

    // A Google account is authenticated by Google. Storing any secret here would
    // be a credential nobody uses but that a reset flow could clobber.
    expect(account.passwordHash).toBeNull();
    expect(account.passwordSalt).toBeNull();
    expect(account.provider).toBe('google');
    expect(account.providerSubject).toBe('1234567890');
  });

  test('a Google email is normalized so sign-in finds the same account', async () => {
    await createAccount({ identifier: 'Ama.Serwaa@Gmail.com', provider: 'google', providerSubject: '1' });
    const found = findAccount('ama.serwaa@gmail.com');
    expect(found).not.toBeNull();
    expect(found.identifier).toBe('ama.serwaa@gmail.com');
  });

  test('a provider account cannot be given a password', async () => {
    // Guards the invariant: password storage is the 'local' provider's job only.
    await expect(createAccount({
      identifier: 'kwame@gmail.com',
      provider: 'google',
      password: 'correct horse battery',
    })).rejects.toThrow(/local accounts may store a password/i);
  });

  test('an unknown provider is rejected', async () => {
    // Deliberately not a member of ACCOUNT_PROVIDERS. This used to name
    // 'facebook', which stopped being an unknown provider when Meta sign-in
    // landed, so the call started succeeding and the test began failing for the
    // wrong reason. The point of the test is that a provider outside the list is
    // refused, so it must use a name that stays outside the list.
    await expect(createAccount({ identifier: 'kwame@gmail.com', provider: 'myspace' }))
      .rejects.toThrow(/unknown sign-in provider/i);
    expect(ACCOUNT_PROVIDERS).toEqual(['local', 'google', 'facebook']);
  });

  test('a local account still owns a hashed password', async () => {
    const account = await createAccount({ identifier: 'kwame@gmail.com', password: 'correct horse battery' });
    expect(account.passwordHash).toBeTruthy();
    expect(account.passwordSalt).toBeTruthy();
    expect(account.passwordHash).not.toContain('correct horse battery');
  });

  test('a Facebook account stores no password at all', async () => {
    const account = await createAccount({
      identifier: 'kwame.asante@gmail.com',
      role: 'buyer',
      displayName: 'Kwame Asante',
      provider: 'facebook',
      providerSubject: '10215478901234567',
    });

    expect(account.passwordHash).toBeNull();
    expect(account.passwordSalt).toBeNull();
    expect(account.provider).toBe('facebook');
    expect(account.providerSubject).toBe('10215478901234567');
  });

  test('a Facebook email is normalized so sign-in finds the same account', async () => {
    await createAccount({ identifier: 'Kwame.Asante@Gmail.com', provider: 'facebook', providerSubject: '1' });
    const found = findAccount('kwame.asante@gmail.com');
    expect(found).not.toBeNull();
    expect(found.identifier).toBe('kwame.asante@gmail.com');
  });

  test('a Facebook account cannot be given a password', async () => {
    await expect(createAccount({
      identifier: 'kwame@gmail.com',
      provider: 'facebook',
      password: 'correct horse battery',
    })).rejects.toThrow(/local accounts may store a password/i);
  });
});
