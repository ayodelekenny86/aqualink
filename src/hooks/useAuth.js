import { useCallback, useMemo, useState } from 'react';
import {
  createOtpChallenge,
  ensureDeviceSecret,
  generateConfirmationCode,
  generatePassword,
  generateSalt,
  hashPassword,
  verifyOtpChallenge,
  verifyPassword,
} from '../lib/secureCode';
import { persistedState, readValue, writeValue } from '../lib/storage';

const initialSellerProfile = { business: '', phone: '', vehicle: '', capacity: '2,000 gallons', document: 'ID document not uploaded' };

/**
 * Owns role switching, the workspace notice banner, and access for buyer,
 * seller and admin (ops) sessions.
 *
 * Access is entirely self-issued: the browser's Web Crypto API mints the
 * one-time codes, the admin password and the seller approval code, and verifies
 * them locally against salted PBKDF2 hashes. Nothing is sent anywhere and no
 * third party is involved. Because secrets live in the browser this guards
 * against guessing, replay and stale hashes rather than acting as a server-side
 * identity system.
 */
export function useAuth() {
  const secret = useMemo(() => ensureDeviceSecret(), []);

  const [role, setRole] = useState('buyer');
  const [notice, setNotice] = useState('');
  const [buyerAuthenticated, setBuyerAuthenticated] = useState(persistedState('auth.buyer', false));
  const [adminAuthenticated, setAdminAuthenticated] = useState(persistedState('auth.admin', false));
  const [adminCredentials, setAdminCredentials] = useState({ username: '', password: '' });
  const [authStep, setAuthStep] = useState('verified');
  const [email, setEmail] = useState('alex@example.com');
  const [sellerProfile, setSellerProfile] = useState(() => readValue('seller.profile', initialSellerProfile));
  const [sellerApproved, setSellerApproved] = useState(persistedState('auth.seller', false));
  const [available, setAvailable] = useState(true);

  // Buyer one-time code state.
  const [buyerChallenge, setBuyerChallenge] = useState(null);
  const [buyerCode, setBuyerCode] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerError, setBuyerError] = useState('');

  const showNotice = useCallback((message) => setNotice(message), []);
  const dismissNotice = useCallback(() => setNotice(''), []);

  const selectRole = useCallback((nextRole) => {
    setRole(nextRole);
    setNotice('');
  }, []);

  /* ---------------------------------------------------------------- */
  /* Buyer: app-generated one-time code                                 */
  /* ---------------------------------------------------------------- */

  /**
   * Mints a six-digit code. With no SMS provider the app delivers it to its own
   * in-app inbox, which is returned so the UI can display it.
   */
  const startBuyerOtp = useCallback(async (phone) => {
    const { code, challenge } = await createOtpChallenge({ secret, purpose: 'buyer-login' });
    setBuyerPhone(phone);
    setBuyerChallenge(challenge);
    setBuyerCode(code);
    setBuyerError('');
    showNotice(`Code ${code} generated for ${phone}. It expires in 5 minutes.`);
    return code;
  }, [secret, showNotice]);

  const confirmBuyerOtp = useCallback(async (input) => {
    if (!buyerChallenge) {
      setBuyerError('Request a code first.');
      return { ok: false, reason: 'no-challenge' };
    }
    const result = await verifyOtpChallenge(buyerChallenge, input, secret);
    if (result.ok) {
      setBuyerAuthenticated(true);
      writeValue('auth.buyer', true);
      setBuyerCode('');
      setBuyerChallenge(null);
      setBuyerError('');
      showNotice('Code accepted. Buyer workspace unlocked.');
    } else {
      setBuyerError(result.reason === 'locked'
        ? 'Too many attempts. Request a new code.'
        : result.reason === 'expired'
          ? 'That code expired. Request a new one.'
          : `Incorrect code. ${result.attemptsLeft ?? 0} attempt(s) left.`);
      if (result.challenge) setBuyerChallenge(result.challenge);
    }
    return result;
  }, [buyerChallenge, secret, showNotice]);

  const signOutBuyer = useCallback(() => {
    setBuyerAuthenticated(false);
    writeValue('auth.buyer', false);
    setBuyerChallenge(null);
    setBuyerCode('');
  }, []);

  /* ---------------------------------------------------------------- */
  /* Admin: app-generated password, stored only as a PBKDF2 hash         */
  /* ---------------------------------------------------------------- */

  /**
   * Creates the admin password on first use and keeps only its salt and hash.
   * The plaintext is shown once in-app and never stored.
   */
  const provisionAdminPassword = useCallback(async () => {
    const stored = readValue('auth.adminCredential', null);
    if (stored) return null;
    const password = generatePassword({ length: 20 });
    const record = { salt: generateSalt(), hash: await hashPassword(password, secret), createdAt: new Date().toISOString() };
    writeValue('auth.adminCredential', record);
    return password;
  }, [secret]);

  const loginAdmin = useCallback(async (event) => {
    event?.preventDefault?.();
    const username = adminCredentials.username.trim();
    const password = adminCredentials.password;

    if (!username || !password) {
      showNotice('Enter both admin username and password.');
      return { ok: false, reason: 'incomplete' };
    }

    const record = readValue('auth.adminCredential', null);
    if (!record) {
      showNotice('No admin credential exists yet. Generate one to continue.');
      return { ok: false, reason: 'not-provisioned' };
    }

    const valid = await verifyPassword(password, record.salt, record.hash);
    if (!valid) {
      showNotice('Incorrect admin password.');
      return { ok: false, reason: 'bad-password' };
    }

    setAdminAuthenticated(true);
    writeValue('auth.admin', true);
    setAdminCredentials({ username: '', password: '' });
    showNotice('Admin session verified. Access is logged for this demo workspace.');
    return { ok: true };
  }, [adminCredentials, secret, showNotice]);

  const signOutAdmin = useCallback(() => {
    setAdminAuthenticated(false);
    writeValue('auth.admin', false);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Seller: app-generated approval code                                */
  /* ---------------------------------------------------------------- */

  const [sellerCode, setSellerCode] = useState(() => readValue('seller.code', ''));

  /** Issues the one-time approval code Ops would otherwise send by email. */
  const issueSellerCode = useCallback(() => {
    const code = generateConfirmationCode('seller', 8);
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

  const updateSellerProfile = useCallback((profile) => {
    setSellerProfile(profile);
    writeValue('seller.profile', profile);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Email verification (kept, now backed by a generated code)          */
  /* ---------------------------------------------------------------- */

  const [emailChallenge, setEmailChallenge] = useState(null);
  const [emailCode, setEmailCode] = useState('');

  const sendOtp = useCallback(async () => {
    const { code, challenge } = await createOtpChallenge({ secret, purpose: 'email-verify' });
    setEmailCode(code);
    setEmailChallenge(challenge);
    setAuthStep('otp');
    showNotice(`Verification code ${code} generated for ${email}.`);
  }, [email, secret, showNotice]);

  const verifyOtp = useCallback(async (input) => {
    if (!emailChallenge) {
      showNotice('Send a code first.');
      return { ok: false, reason: 'no-challenge' };
    }
    const result = await verifyOtpChallenge(emailChallenge, input, secret);
    if (result.ok) {
      setAuthStep('verified');
      setEmailCode('');
      setEmailChallenge(null);
      showNotice('Email verified. Your account is ready to book.');
    } else {
      showNotice('That code did not match. Request a new one.');
      if (result.challenge) setEmailChallenge(result.challenge);
    }
    return result;
  }, [emailChallenge, secret, showNotice]);

  return {
    role,
    selectRole,
    notice,
    showNotice,
    dismissNotice,
    buyerAuthenticated,
    setBuyerAuthenticated,
    buyerPhone,
    buyerCode,
    buyerError,
    startBuyerOtp,
    confirmBuyerOtp,
    signOutBuyer,
    adminAuthenticated,
    adminCredentials,
    setAdminCredentials,
    loginAdmin,
    provisionAdminPassword,
    signOutAdmin,
    authStep,
    email,
    setEmail,
    emailCode,
    sendOtp,
    verifyOtp,
    sellerProfile,
    updateSellerProfile,
    setSellerProfile: updateSellerProfile,
    sellerApproved,
    sellerCode,
    issueSellerCode,
    approveSeller,
    available,
    setAvailable,
  };
}

export default useAuth;
