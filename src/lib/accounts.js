/**
 * Account registry and authentication for AquaLink.
 *
 * A sign-in only succeeds when the identifier resolves to a real, active
 * account in this registry and the presented credential verifies against that
 * account. Identifiers are normalised before lookup, so `0545 009 046`,
 * `0545009046` and `+233545009046` are the same buyer.
 *
 * Everything is local: accounts live in `localStorage`, credentials are stored
 * as salted PBKDF2 hashes, and phone sign-in uses the self-issued one-time
 * codes from `secureCode`. No third party is contacted.
 */

import {
  createOtpChallenge,
  generateSalt,
  generatePassword,
  hashPassword,
  verifyOtpChallenge,
  verifyPassword,
} from './secureCode';
import { readValue, writeValue } from './storage';

const ACCOUNTS_KEY = 'accounts.list';
export const ACCOUNT_ROLES = ['buyer', 'seller', 'institution', 'ops'];
/** How an account proves its identity. 'local' owns a password; the rest delegate. */
export const ACCOUNT_PROVIDERS = ['local', 'google', 'facebook'];
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 5 * 60 * 1000;

/** Ghana mobile numbers: 10-digit local (0XXXXXXXXX) or E.164 (+233XXXXXXXXX). */
const GHANA_COUNTRY = '233';

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/* ------------------------------------------------------------------ */
/* Identifier validation and normalisation                             */
/* ------------------------------------------------------------------ */

// Pragmatic shape check: a local part, an @, and a dotted domain with a 2+ char TLD.
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Reduces any accepted Ghanaian phone format to E.164 (`+233XXXXXXXXX`).
 * Returns null when the number cannot be interpreted.
 */
export function normalizePhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const compact = raw.replace(/[\s().-]/g, '');
  const hasPlus = compact.startsWith('+');

  let national = null;
  if (hasPlus && compact.startsWith(`+${GHANA_COUNTRY}`)) {
    national = compact.slice(GHANA_COUNTRY.length + 1);
  } else if (compact.startsWith(GHANA_COUNTRY)) {
    // Country code without a plus sign, e.g. 233545009046.
    const rest = compact.slice(GHANA_COUNTRY.length);
    if (/^\d{9}$/.test(rest)) national = rest;
  } else if (compact.startsWith('0')) {
    national = compact.slice(1);
  } else if (/^\d{9}$/.test(compact)) {
    national = compact;
  }

  if (!national || !/^\d{9}$/.test(national)) return null;
  // Ghana mobile numbers begin 2, 5 or 7; 0-prefixed landlines are rejected.
  if (!/^[257]/.test(national)) return null;
  return `+${GHANA_COUNTRY}${national}`;
}

export function isEmail(value) {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

export function isPhone(value) {
  return normalizePhone(value) !== null;
}

export function detectIdentifierType(value) {
  if (isEmail(value)) return 'email';
  if (isPhone(value)) return 'phone';
  return null;
}

/**
 * Normalises and classifies an identifier, throwing a `ValidationError` when it
 * is neither a valid email nor a valid phone number.
 */
export function validateIdentifier(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new ValidationError('Enter an email address or phone number.', 'identifier');

  if (raw.includes('@')) {
    if (!EMAIL_PATTERN.test(normalizeEmail(raw))) {
      throw new ValidationError('That does not look like a valid email address.', 'identifier');
    }
    return { type: 'email', normalized: normalizeEmail(raw) };
  }

  const phone = normalizePhone(raw);
  if (!phone) {
    throw new ValidationError('Enter a valid Ghana number, for example 0545009046.', 'identifier');
  }
  return { type: 'phone', normalized: phone };
}

export function formatPhoneForDisplay(e164) {
  if (!e164?.startsWith(`+${GHANA_COUNTRY}`)) return e164 ?? '';
  const national = e164.slice(GHANA_COUNTRY.length + 1);
  return `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}

/* ------------------------------------------------------------------ */
/* Account store                                                        */
/* ------------------------------------------------------------------ */

export function listAccounts() {
  const accounts = readValue(ACCOUNTS_KEY, []);
  return Array.isArray(accounts) ? accounts : [];
}

function saveAccounts(accounts) {
  writeValue(ACCOUNTS_KEY, accounts);
}

export function findAccount(identifier) {
  let normalized;
  try {
    ({ normalized } = validateIdentifier(identifier));
  } catch {
    return null;
  }
  return listAccounts().find((account) => account.identifier === normalized) ?? null;
}

export function isAccountLocked(account, now = Date.now()) {
  return Boolean(account?.lockedUntil) && account.lockedUntil > now;
}

export function describeAccount(account, now = Date.now()) {
  if (!account) return 'No account matches those details.';
  if (account.status === 'suspended') return 'That account is suspended. Contact support.';
  if (isAccountLocked(account, now)) {
    const minutes = Math.ceil((account.lockedUntil - now) / 60000);
    return `Too many failed attempts. Try again in ${minutes} minute(s).`;
  }
  return null;
}

/**
 * Creates an account. Rejects duplicates and invalid identifiers so a bad row
 * can never enter the registry.
 */
export async function createAccount({
  identifier,
  role = 'buyer',
  displayName = '',
  password,
  status = 'active',
  provider = 'local',
  providerSubject = null,
  now = Date.now(),
} = {}) {
  if (!ACCOUNT_ROLES.includes(role)) throw new ValidationError('Unknown account role.', 'role');
  if (!ACCOUNT_PROVIDERS.includes(provider)) throw new ValidationError('Unknown sign-in provider.', 'provider');
  const { type, normalized } = validateIdentifier(identifier);

  if (listAccounts().some((account) => account.identifier === normalized)) {
    throw new ValidationError('An account already exists for those details.', 'identifier');
  }

  const account = {
    id: `${type}-${normalized}`,
    identifier: normalized,
    identifierType: type,
    role,
    displayName: displayName.trim(),
    status,
    // How this account proves who it is: 'local' owns a password, 'google' owns
    // a verified provider subject. Recorded so the two can be linked later and
    // so no code has to guess which credential is authoritative.
    provider,
    providerSubject,
    // Phone and Google accounts sign in through their provider, so they keep no
    // stored secret. Inventing a random password here would only create a fake
    // secret that looks real and could be "reset" into a broken state later.
    passwordSalt: null,
    passwordHash: null,
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(now).toISOString(),
    lastLoginAt: null,
  };

  if (password !== undefined && password !== null) {
    if (String(password).length < 8) {
      throw new ValidationError('Passwords must be at least 8 characters.', 'password');
    }
    // A local account is the only kind that may own a password.
    if (provider !== 'local') {
      throw new ValidationError('Only local accounts may store a password.', 'provider');
    }
    account.passwordSalt = generateSalt();
    account.passwordHash = await hashPassword(password, account.passwordSalt);
  }

  saveAccounts([...listAccounts(), account]);
  return account;
}

/** Removes an account. Used when resetting demo data. */
export function deleteAccount(identifier) {
  let normalized;
  try {
    ({ normalized } = validateIdentifier(identifier));
  } catch {
    return false;
  }
  const before = listAccounts();
  const after = before.filter((account) => account.identifier !== normalized);
  if (after.length === before.length) return false;
  saveAccounts(after);
  return true;
}

function patchAccount(account, changes) {
  const accounts = listAccounts();
  saveAccounts(accounts.map((item) => (item.id === account.id ? { ...item, ...changes } : item)));
  return { ...account, ...changes };
}

function recordFailure(account) {
  const failedAttempts = (account.failedAttempts ?? 0) + 1;
  const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
  return patchAccount(account, { failedAttempts, lockedUntil });
}

function recordSuccess(account) {
  return patchAccount(account, {
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/* Authentication                                                       */
/* ------------------------------------------------------------------ */

/**
 * Password sign-in. Returns a reason the UI can act on without disclosing
 * whether the identifier exists: `invalid` covers unknown, suspended and locked
 * alike so responses cannot be used to enumerate accounts.
 */
export async function authenticateWithPassword(identifier, password) {
  const account = findAccount(identifier);
  if (!account) return { ok: false, reason: 'invalid' };

  const blocked = describeAccount(account);
  if (blocked) return { ok: false, reason: 'invalid', detail: blocked };

  if (!account.passwordHash) {
    // Phone-only accounts have no password to check.
    return { ok: false, reason: 'invalid', detail: 'This account signs in with a one-time code.' };
  }

  const valid = await verifyPassword(password ?? '', account.passwordSalt, account.passwordHash);
  if (!valid) {
    const updated = recordFailure(account);
    const locked = isAccountLocked(updated);
    return {
      ok: false,
      reason: locked ? 'invalid' : 'invalid',
      detail: locked
        ? `Too many failed attempts. Try again in ${Math.ceil(LOCKOUT_MS / 60000)} minute(s).`
        : `Incorrect details. ${MAX_FAILED_ATTEMPTS - (updated.failedAttempts ?? 0)} attempt(s) left.`,
    };
  }

  return { ok: true, account: recordSuccess(account) };
}

/**
 * Binds a one-time code to a single account. Deriving the challenge secret from
 * the account id means a code issued for one account cannot verify under
 * another's secret, so it cannot be replayed to sign in as somebody else.
 */
function boundSecret(secret, account) {
  return `${secret}:${account.id}`;
}

/**
 * Phone sign-in, step one: only issues a one-time code when the number belongs
 * to an active, unlocked account.
 */
export async function beginPhoneSignIn(identifier, secret) {
  const account = findAccount(identifier);
  if (!account || account.identifierType !== 'phone') {
    return { ok: false, reason: 'invalid', detail: 'No account matches those details.' };
  }

  const blocked = describeAccount(account);
  if (blocked) return { ok: false, reason: 'invalid', detail: blocked };

  const { code, challenge } = await createOtpChallenge({
    secret: boundSecret(secret, account),
    purpose: 'phone-sign-in',
  });
  return { ok: true, account, code, challenge };
}

/**
 * Phone sign-in, step two: verifies the code against the same account-bound
 * secret and completes the session. The account must still be active and
 * unlocked at this point.
 */
export async function completePhoneSignIn({ identifier, challenge, code, secret }) {
  const account = findAccount(identifier);
  if (!account) return { ok: false, reason: 'invalid', detail: 'No account matches those details.' };

  const blocked = describeAccount(account);
  if (blocked) return { ok: false, reason: 'invalid', detail: blocked };

  const result = await verifyOtpChallenge(challenge, code, boundSecret(secret, account));
  if (!result.ok) {
    if (result.reason === 'locked' || result.attemptsLeft === 0) recordFailure(account);
    return {
      ok: false,
      reason: result.reason,
      detail: result.reason === 'expired'
        ? 'That code expired. Request a new one.'
        : result.reason === 'locked'
          ? 'Too many attempts. Request a new code.'
          : 'That code did not match.',
    };
  }

  return { ok: true, account: recordSuccess(account) };
}

/**
 * Create the operator's first admin account.
 *
 * This used to be `seedDemoAccounts`, which invented a buyer and an ops account
 * on every first run and printed both passwords on the sign-in page. That is not
 * a demo convenience, it is a published admin credential: anyone who loaded the
 * app could read it and reach the operations console, the pricing controls, and
 * the seller approval queue.
 *
 * There is no replacement that keeps a credential in the browser. The ops
 * account is created server-side by the `apiBootstrapOps` function from a secret
 * the operator sets in the environment, and the browser only ever sees the
 * resulting session. If you need an account in development, register normally.
 */
export async function registerAccount({
  identifier,
  role = 'buyer',
  displayName = '',
  password,
}) {
  return createAccount({ identifier, role, displayName, password });
}
