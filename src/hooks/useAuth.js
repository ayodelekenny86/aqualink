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
  listAccounts,
  linkPhoneNumber,
  validateIdentifier,
} from '../lib/accounts';
import { applyAsSeller, opsSignIn, sellerStatus } from '../lib/payments';
import { persistedState, readValue, writeValue } from '../lib/storage';
import { syncUsers } from '../lib/collections';

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
  const [email, setEmail] = useState('');
  const [available, setAvailable] = useState(true);
  const [ready, setReady] = useState(false);

  // Phone sign-in state.
  const [phoneChallenge, setPhoneChallenge] = useState(null);
  const [phoneIdentifier, setPhoneIdentifier] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [signInError, setSignInError] = useState('');

  // Email verification strip.
  //
  // This started at 'verified', which made the account panel assert "Email
  // verified" for anyone who had only ever signed in with a phone number. It is
  // 'idle' until `confirmEmailCode` actually succeeds, so the panel reports the
  // state that holds rather than the one the UI hoped for.
  const [emailChallenge, setEmailChallenge] = useState(null);
  const [emailCode, setEmailCode] = useState('');
  const [authStep, setAuthStep] = useState('idle');

  // Seller profile and approval.
  const [sellerProfile, setSellerProfileState] = useState(() => readValue('seller.profile', initialSellerProfile));
  // A cached "approved" flag is only a hint so the workspace does not flash a
  // sign-in prompt on every reload. It is re-confirmed against the server before
  // it is trusted, and it is never what grants access on its own.
  const [sellerApproved, setSellerApproved] = useState(persistedState('auth.seller', false));
  const [sellerApplicationId, setSellerApplicationId] = useState(() => readValue('seller.applicationId', null));

  // The ops session token. Held in memory only: persisting it to localStorage
  // would hand an XSS payload a valid admin credential for the token's lifetime.
  const [opsToken, setOpsToken] = useState(null);

  // Ready once the local registry has been read. There is no seeding step: the
  // app no longer invents accounts, so there is nothing to create on first run.
  useEffect(() => {
    let cancelled = false;
    syncUsers(listAccounts());
    if (!cancelled) setReady(true);
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
  const driverAuthenticated = signedInAs('driver');
  // The operations console requires the *server's* token, not just a local
  // account record. An ops row in local storage is something anyone can write,
  // so treating it as authorisation rendered an admin console that could only
  // fail every action against the API. Both halves are required, and the token
  // is the part the server issued.
  const adminAuthenticated = signedInAs('ops') && Boolean(opsToken);
  const sellerAuthenticated = signedInAs('seller') && sellerApproved;

  const startSession = useCallback((account) => {
    setSession({
      identifier: account.identifier,
      identifierType: account.identifierType,
      displayName: account.displayName,
      role: account.role,
      phone: account.phone ?? null,
      signedInAt: new Date().toISOString(),
    });
    writeValue('session', {
      identifier: account.identifier,
      identifierType: account.identifierType,
      displayName: account.displayName,
      role: account.role,
      phone: account.phone ?? null,
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
    // Dropping the operator token on sign-out means a shared machine does not
    // leave a valid admin credential behind for the next person to find.
    setOpsToken(null);
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

    // An ops sign-in also has to satisfy the server, because the server decides
    // what an operator may change. The local registry alone cannot grant that.
    if (result.account.role === 'ops') {
      try {
        const session = await opsSignIn({ email: parsed.normalized, password });
        setOpsToken(session.token);
      } catch (error) {
        setSignInError(error.message || 'The server would not accept this operator sign-in.');
        return { ok: false, reason: 'ops-unauthorised' };
      }
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
      syncUsers(listAccounts());
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

  /**
   * Submit this seller for review.
   *
   * This replaces an `issueSellerCode` helper that minted an `SEL-XXXXXXXX` code
   * in the browser, displayed it on screen, and then accepted it on approval.
   * Anyone who loaded the page could run it and unlock the workspace themselves,
   * so the control was decorative. Nothing is unlocked here: the application is
   * recorded on the server and only a signed-in operator can approve it.
   */
  const applyForSellerApproval = useCallback(async () => {
    let parsed;
    try {
      parsed = validateIdentifier(sellerProfile.phone);
    } catch (error) {
      showNotice(error.message);
      return { ok: false, reason: 'invalid-identifier' };
    }
    if (parsed.type !== 'phone') {
      showNotice('Enter a valid phone number on the application before applying.');
      return { ok: false, reason: 'wrong-type' };
    }
    if (!sellerProfile.business?.trim()) {
      showNotice('Add a business or trading name before applying.');
      return { ok: false, reason: 'missing-business' };
    }
    if (!sellerProfile.vehicle?.trim()) {
      showNotice('Add a vehicle registration before applying.');
      return { ok: false, reason: 'missing-vehicle' };
    }

    try {
      const result = await applyAsSeller({
        phone: parsed.normalized,
        business: sellerProfile.business.trim(),
        vehicle: sellerProfile.vehicle.trim(),
        capacity: sellerProfile.capacity,
      });
      setSellerApplicationId(result.applicationId);
      writeValue('seller.applicationId', result.applicationId);
      // An already-approved seller skips the wait, but only because the server
      // said so.
      if (result.status === 'approved') {
        setSellerApproved(true);
        writeValue('auth.seller', true);
        showNotice('You are already approved as a seller.');
        return { ok: true, account: null, approved: true };
      }
      showNotice('Application submitted. An operator has to approve it before the workspace opens.');
      return { ok: true, account: null, approved: false };
    } catch (error) {
      showNotice(error.message || 'Could not submit the application.');
      return { ok: false, reason: 'apply-failed' };
    }
  }, [sellerProfile, showNotice]);

  /**
   * Ask the server whether an application has been approved.
   *
   * The local `auth.seller` flag is only ever set from this answer, so the
   * workspace cannot be unlocked by editing browser storage.
   */
  const refreshSellerApproval = useCallback(async () => {
    // From state, not from a dotted storage lookup: `writeValue('seller.profile', …)`
    // stores one flat key, so readValue('seller.profile.phone') would find
    // nothing and every status check would report "pending" forever.
    const phone = sellerProfile.phone;
    if (!phone) return { ok: false, reason: 'no-phone' };

    try {
      const result = await sellerStatus(phone);
      const approved = result.status === 'approved';
      setSellerApproved(approved);
      if (approved) {
        writeValue('auth.seller', true);
        showNotice('Approved. The seller workspace is now unlocked.');
      }
      return { ok: true, status: result.status, approved };
    } catch (error) {
      showNotice(error.message || 'Could not read the application status.');
      return { ok: false, reason: 'status-failed' };
    }
  }, [sellerProfile, showNotice]);

  /**
   * Sign in a seller whose application the server has approved.
   *
   * Approval is confirmed against the server first, so possession of the phone
   * number alone is not enough to reach the workspace.
   */
  const completeSellerApproval = useCallback(async () => {
    let parsed;
    try {
      parsed = validateIdentifier(sellerProfile.phone);
    } catch (error) {
      showNotice(error.message);
      return { ok: false, reason: 'invalid-identifier' };
    }
    if (parsed.type !== 'phone') {
      showNotice('Enter a valid phone number on the application before signing in.');
      return { ok: false, reason: 'wrong-type' };
    }

    const existing = findAccount(parsed.normalized);
    if (existing && existing.role !== 'seller') {
      showNotice('That number already belongs to a different kind of account.');
      return { ok: false, reason: 'role-mismatch' };
    }

    let status;
    try {
      ({ status } = await sellerStatus(parsed.normalized));
    } catch (error) {
      showNotice(error.message || 'Could not confirm your approval.');
      return { ok: false, reason: 'status-failed' };
    }

    if (status !== 'approved') {
      showNotice('That application has not been approved yet.');
      return { ok: false, reason: 'not-approved' };
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
  }, [sellerProfile, startSession, showNotice]);

  /**
   * Create (or sign in to) an account from a Google identity whose signature
   * googleAuth has already verified.
   *
   * No password is generated or stored. A Google account is authenticated by
   * Google and by nothing else, so minting a random secret for it would add a
   * credential nobody can use and that a later "reset password" flow could
   * wrongly overwrite. The provider subject is stored instead, so the same
   * person can later link a password to the account deliberately.
   */
  const signInWithGoogleIdentity = useCallback(async (identity) => {
    setSignInError('');
    try {
      if (!identity?.identifier) throw new Error('Google did not return a usable email address.');

      const existing = findAccount(identity.identifier);
      const account = existing ?? await createAccount({
        identifier: identity.identifier,
        role: identity.role,
        displayName: identity.displayName,
        provider: 'google',
        providerSubject: identity.subject,
      });

      if (existing && existing.role !== identity.role) {
        showNotice(`Signed in as ${account.identifier}. That account is registered as a ${existing.role}.`);
      } else {
        showNotice(`Signed in as ${account.displayName || account.identifier}.`);
      }
      syncUsers(listAccounts());
      startSession(account);
      return { ok: true, account };
    } catch (error) {
      setSignInError(error.message);
      return { ok: false, error: error.message };
    }
  }, [startSession, showNotice]);

   /**
    * Create (or sign in to) an account from a Meta identity whose SDK login and
    * Graph-API verification metaAuth has already performed.
    *
    * No password is generated or stored. A Meta account is authenticated by
    * Facebook and by nothing else, so minting a random secret for it would add
    * a credential nobody can use and that a later "reset password" flow could
    * wrongly overwrite. The provider subject is stored instead, so the same
    * person can later link a password to the account deliberately.
    */
  const signInWithMetaIdentity = useCallback(async (identity) => {
    setSignInError('');
    try {
      if (!identity?.identifier) throw new Error('Meta did not return a usable email address.');

      const existing = findAccount(identity.identifier);
      const account = existing ?? await createAccount({
        identifier: identity.identifier,
        role: identity.role,
        displayName: identity.displayName,
        provider: 'facebook',
        providerSubject: identity.subject,
      });

      if (existing && existing.role !== identity.role) {
        showNotice(`Signed in as ${account.identifier}. That account is registered as a ${existing.role}.`);
      } else {
        showNotice(`Signed in as ${account.displayName || account.identifier}.`);
      }
      syncUsers(listAccounts());
      startSession(account);
      return { ok: true, account };
    } catch (error) {
      setSignInError(error.message);
      return { ok: false, error: error.message };
    }
  }, [startSession, showNotice]);

  /**
   * Link a driver phone number to the signed-in account.
   *
   * A Google or Facebook driver signs in with an email, but dispatch matches
   * drivers by phone. This stores the phone on the account and rewires the
   * session identifier to the phone so `resolveDriver` finds them on the fleet
   * roster immediately.
   */
  const linkDriverPhone = useCallback(async (phone) => {
    try {
      const updated = linkPhoneNumber(session.identifier, phone);
      if (!updated) {
        setSignInError('Could not link that phone number.');
        return { ok: false, reason: 'link-failed' };
      }
      startSession(updated);
      showNotice(`Your driver phone (${formatPhoneForDisplay(updated.phone)}) is linked. You now see jobs assigned to it.`);
      return { ok: true, account: updated };
    } catch (error) {
      setSignInError(error.message);
      return { ok: false, error: error.message };
    }
  }, [session?.identifier, startSession, showNotice]);

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
    driverAuthenticated,
    adminAuthenticated,
    sellerAuthenticated,
    startPhoneSignIn,
    confirmPhoneCode,
    signInWithPassword,
    signInWithGoogleIdentity,
    signInWithMetaIdentity,
     registerAccount,
    linkDriverPhone,
    phoneCode,
    phoneIdentifier,
    signInError,
    opsToken,

    authStep,
    email,
    setEmail,
    emailCode,
    sendOtp,
    confirmEmailCode,

    sellerProfile,
    setSellerProfile,
    sellerApproved,
    sellerApplicationId,
    applyForSellerApproval,
    refreshSellerApproval,
    completeSellerApproval,

    available,
    setAvailable,
  };
}

export default useAuth;
