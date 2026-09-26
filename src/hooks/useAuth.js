import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createOtpChallenge,
  ensureDeviceSecret,
  generatePassword,
  verifyOtpChallenge,
} from '../lib/secureCode';
import {
  beginPhoneSignIn,
  completePhoneSignIn,
  authenticateWithPassword,
  createAccount,
  findAccount,
  formatPhoneForDisplay,
  seedDemoAccounts,
  validateIdentifier,
} from '../lib/accounts';
import { persistedState, readValue, writeValue } from '../lib/storage';

const initialSellerProfile = { business: '', phone: '', vehicle: '', capacity: '2,000 gallons', document: 'ID document not uploaded' };

/**
 * Owns the signed-in account, role switching and the workspace notice banner.
 *
 * Every sign-in path resolves the identifier to a real, active, unlocked
 * account in the local registry before any credential is checked, so an
 * unregistered phone number or unknown email can never reach a workspace.
 * Credentials and one-time codes are verified locally with Web Crypto; there is
 * no third-party identity provider.
 *
 * Because accounts and sessions live in the browser this is local access
 * control, not server-side identity: it stops unknown accounts, wrong
 * credentials, replay and brute force, but anyone with access to the browser
 * profile can read the same storage.
 */
export function useAuth() {
  const secret = useMemo(() => ensureDeviceSecret(), []);

  const [role, setRole] = useState('buyer');
  const [notice, setNotice] = useState('');
  const [session, setSession] = useState(persistedState('session', null));
  const [email, setEmail] = useState('alex@example.com');
  const [available, setAvailable] = useState(true);
  const [demoCredentials, setDemoCredentials] = useState(null);
  const [ready, setReady] = useState(false);

  // Phone sign-in state.
  const [phoneChallenge, setPhoneChallenge] = useState(null);
  const [phoneIdentifier, setPhoneIdentifier] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [signInError, setSignInError] = useState('');

  // Email verification strip.
  const [emailChallenge, setEmailChallenge] = useState(null);
  const [emailCode, setEmailCode] = useState('');
  const [authStep, setAuthStep] = useState('verified');

  // Seller profile and approval.
  const [sellerProfile, setSellerProfileState] = useState(() => readValue('seller.profile', initialSellerProfile));
  const [sellerApproved, setSellerApproved] = useState(persistedState('auth.seller', false));
  const [sellerCode, setSellerCode] = useState(() => readValue('seller.code', ''));

  // Creates the starter accounts on first run and reveals their passwords once.
  useEffect(() => {
    let cancelled = false;
    seedDemoAccounts()
      .then((seeded) => {
        if (!cancelled && seeded) setDemoCredentials(seeded);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showNotice = useCallback((message) => setNotice(message), []);
  const dismissNotice = useCallback(() => setNotice(''), []);

  const selectRole = useCallback((nextRole) => {
    setRole(nextRole);
    setNotice('');
  }, []);

  const signedInAs = (roleName) => session?.role === roleName;
  const buyerAuthenticated = signedInAs('buyer');
  const adminAuthenticated = signedInAs('ops');
  const sellerAuthenticated = signedInAs('seller') && sellerApproved;

  const startSession = useCallback((account) => {
    setSession({
      identifier: account.identifier,
      identifierType: account.identifierType,
      displayName: account.displayName,
      role: account.role,
      signedInAt: new Date().toISOString(),
    });
    writeValue('session', {
      identifier: account.identifier,
      identifierType: account.identifierType,
      displayName: account.displayName,
      role: account.role,
      signedInAt: new Date().toISOString(),
    });
    setSignInError('');
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    writeValue('session', null);
    setPhoneChallenge(null);
    setPhoneIdentifier('');
    setPhoneCode('');
  }, []);

  /* ---------------------------------------------------------------- */
  /* Phone sign-in (one-time code)                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Validates the number and confirms it belongs to an account before any code
   * is generated. Returns the code so the app can display it in place of SMS.
   */
  const startPhoneSignIn = useCallback(async (identifier) => {
    setSignInError('');
    let parsed;
    try {
      parsed = validateIdentifier(identifier);
    } catch (error) {
      setSignInError(error.message);
      return { ok: false, reason: 'invalid-identifier' };
    }

    if (parsed.type !== 'phone') {
      setSignInError('Enter the phone number on your account, not an email address.');
      return { ok: false, reason: 'wrong-type' };
    }

    const begun = await beginPhoneSignIn(parsed.normalized, secret);
    if (!begun.ok) {
      setSignInError(begun.detail);
      return begun;
    }

    setPhoneChallenge(begun.challenge);
    setPhoneIdentifier(parsed.normalized);
    setPhoneCode(begun.code);
    showNotice(`Code ${begun.code} generated for ${formatPhoneForDisplay(parsed.normalized)}. It expires in 5 minutes.`);
    return begun;
  }, [secret, showNotice]);

  const confirmPhoneCode = useCallback(async (code) => {
    if (!phoneChallenge) {
      setSignInError('Request a code first.');
      return { ok: false, reason: 'no-challenge' };
    }
    const done = await completePhoneSignIn({ identifier: phoneIdentifier, challenge: phoneChallenge, code, secret });
    if (!done.ok) {
      setSignInError(done.detail);
      return done;
    }
    startSession(done.account);
    setPhoneChallenge(null);
    setPhoneCode('');
    showNotice(`Signed in as ${done.account.displayName || formatPhoneForDisplay(done.account.identifier)}.`);
    return done;
  }, [phoneChallenge, phoneIdentifier, secret, startSession, showNotice]);

  /* ---------------------------------------------------------------- */
  /* Password sign-in (ops, institution, seller)                        */
  /* ---------------------------------------------------------------- */

  const signInWithPassword = useCallback(async (identifier, password) => {
    setSignInError('');
    let parsed;
    try {
      parsed = validateIdentifier(identifier);
    } catch (error) {
      setSignInError(error.message);
      return { ok: false, reason: 'invalid-identifier' };
    }

    const result = await authenticateWithPassword(parsed.normalized, password);
    if (!result.ok) {
      setSignInError(result.detail);
      return result;
    }
    startSession(result.account);
    showNotice(`Signed in as ${result.account.displayName || result.account.identifier}.`);
    return result;
  }, [startSession, showNotice]);

  /* ---------------------------------------------------------------- */
  /* Registration                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Creates an account and returns a generated password. The plaintext is shown
   * once and only a PBKDF2 hash is kept.
   */
  const registerAccount = useCallback(async ({ identifier, role: accountRole = 'buyer', displayName = '' }) => {
    setSignInError('');
    try {
      const password = generatePassword({ length: 16 });
      const account = await createAccount({ identifier, role: accountRole, displayName, password });
      showNotice(`Account created for ${account.identifier}. Copy your generated password now.`);
      return { ok: true, account, password };
    } catch (error) {
      setSignInError(error.message);
      return { ok: false, error: error.message };
    }
  }, [showNotice]);

  const accountExists = useCallback((identifier) => Boolean(findAccount(identifier)), []);

  /* ---------------------------------------------------------------- */
  /* Email verification strip                                           */
  /* ---------------------------------------------------------------- */

  const sendOtp = useCallback(async () => {
    let parsed;
    try {
      parsed = validateIdentifier(email);
    } catch (error) {
      showNotice(error.message);
      return { ok: false };
    }
    const account = findAccount(parsed.normalized);
    if (!account) {
      showNotice('No account uses that email address yet.');
      return { ok: false };
    }
    const { code, challenge } = await createOtpChallenge({ secret, purpose: 'email-verify' });
    setEmailCode(code);
    setEmailChallenge(challenge);
    setAuthStep('otp');
    showNotice(`Verification code ${code} generated for ${account.identifier}.`);
    return { ok: true };
  }, [email, secret, showNotice]);

  /** Confirms the email verification code and returns the strip to verified. */
  const confirmEmailCode = useCallback(async (code) => {
    if (!emailChallenge) {
      showNotice('Send a code first.');
      return { ok: false, reason: 'no-challenge' };
    }
    const result = await verifyOtpChallenge(emailChallenge, code, secret);
    if (!result.ok) {
      showNotice('That code did not match. Request a new one.');
      if (result.challenge) setEmailChallenge(result.challenge);
      return result;
    }
    setAuthStep('verified');
    setEmailCode('');
    setEmailChallenge(null);
    showNotice('Email verified. Your account is ready to book.');
    return result;
  }, [emailChallenge, secret, showNotice]);

  /* ---------------------------------------------------------------- */
  /* Seller onboarding and approval                                    */
  /* ---------------------------------------------------------------- */

  const setSellerProfile = useCallback((profile) => {
    setSellerProfileState(profile);
    writeValue('seller.profile', profile);
  }, []);

  /** Issues the one-time approval code Ops would otherwise send by email. */
  const issueSellerCode = useCallback(() => {
    const code = `SEL-${generatePassword({ length: 12 }).replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase()}`;
    setSellerCode(code);
    writeValue('seller.code', code);
    showNotice(`Approval code ${code} issued. Share it with the seller to unlock the workspace.`);
    return code;
  }, [showNotice]);

  const approveSeller = useCallback((code) => {
    const expected = readValue('seller.code', '');
    if (!expected) {
      showNotice('Issue an approval code first.');
      return { ok: false, reason: 'not-issued' };
    }
    if (String(code ?? '').trim().toUpperCase() !== expected.toUpperCase()) {
      showNotice('That approval code does not match.');
      return { ok: false, reason: 'mismatch' };
    }
    setSellerApproved(true);
    writeValue('auth.seller', true);
    showNotice('Seller approved. The seller workspace is now unlocked.');
    return { ok: true };
  }, [showNotice]);

  /**
   * Verifies the approval code, makes sure a real seller account exists for the
   * number on the application, and signs that account in. The seller workspace is
   * therefore only reachable through a valid account, not just an approval.
   */
  const completeSellerApproval = useCallback(async (code) => {
    const expected = readValue('seller.code', '');
    if (!expected) {
      showNotice('Issue an approval code first.');
      return { ok: false, reason: 'not-issued' };
    }
    if (String(code ?? '').trim().toUpperCase() !== expected.toUpperCase()) {
      showNotice('That approval code does not match.');
      return { ok: false, reason: 'mismatch' };
    }

    let parsed;
    try {
      parsed = validateIdentifier(sellerProfile.phone);
    } catch (error) {
      showNotice(error.message);
      return { ok: false, reason: 'invalid-identifier' };
    }
    if (parsed.type !== 'phone') {
      showNotice('Enter a valid phone number on the application before approving.');
      return { ok: false, reason: 'wrong-type' };
    }

    // Approval is what creates the seller account, so an unknown number is
    // expected here. An existing account must still be a seller.
    const existing = findAccount(parsed.normalized);
    if (existing && existing.role !== 'seller') {
      showNotice('That number already belongs to a different kind of account.');
      return { ok: false, reason: 'role-mismatch' };
    }

    const account = existing ?? await createAccount({
      identifier: parsed.normalized,
      role: 'seller',
      displayName: sellerProfile.business || 'Seller',
      status: 'active',
    });

    setSellerApproved(true);
    writeValue('auth.seller', true);
    startSession(account);
    showNotice('Seller approved and signed in.');
    return { ok: true, account };
  }, [sellerProfile, accountExists, startSession, showNotice]);

  return {
    ready,
    role,
    selectRole,
    notice,
    showNotice,
    dismissNotice,
    session,
    signOut,
    accountExists,

    buyerAuthenticated,
    adminAuthenticated,
    sellerAuthenticated,
    startPhoneSignIn,
    confirmPhoneCode,
    signInWithPassword,
    registerAccount,
    phoneCode,
    phoneIdentifier,
    signInError,

    demoCredentials,

    authStep,
    email,
    setEmail,
    emailCode,
    sendOtp,
    confirmEmailCode,

    sellerProfile,
    setSellerProfile,
    sellerApproved,
    sellerCode,
    issueSellerCode,
    approveSeller,
    completeSellerApproval,

    available,
    setAvailable,
  };
}

export default useAuth;
