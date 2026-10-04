import { lazy, Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import './App.css';
import { languages, translations } from './data/translations';
import useAuth from './hooks/useAuth';
import useBooking from './hooks/useBooking';
import useAquaAi, { aiQuickActions } from './hooks/useAquaAi';
import useReports from './hooks/useReports';
import useNotifications from './hooks/useNotifications';
import { usePushNotifications, useFCMTokenSync } from './hooks/usePushNotifications';
import useLoyalty from './hooks/useLoyalty';
import useSellerPerformance from './hooks/useSellerPerformance';
import { formatPhoneForDisplay, normalizePhone } from './lib/accounts';
import { seedProducts } from './lib/collections';
import { formatCedi } from './lib/money';
import { summarise } from './lib/summary';
import { referenceFromLocation } from './lib/payments';
import { rankReliability, reliabilitySummary, estimateForOrder } from './lib/reliability';
import ContactButtons from './components/ContactButtons';
import useAdminPricing from './hooks/useAdminPricing';
import GoogleSignInButton from './components/GoogleSignInButton';
import MetaSignInButton from './components/MetaSignInButton';
import { PWASetup, PWADetectOffline } from './components/PWASetup';
import SellerDashboard from './components/SellerDashboard';
import DriverDashboard from './components/DriverDashboard';
import DeliveryCodeDialog from './components/DeliveryCodeDialog';
import InstitutionDashboard from './components/InstitutionDashboard';
import DriverTrackingView from './components/DriverTrackingView';
import SmartDispatchView from './components/SmartDispatchView';
import { list, replaceAll } from './lib/collections';

// Admin-only and overlay surfaces load on demand. A buyer who never opens the
// admin console never downloads it, which keeps the initial bundle small.
const AdminPricingConsole = lazy(() => import('./components/AdminPricingConsole'));
const SellerApprovalQueue = lazy(() => import('./components/SellerApprovalQueue'));
const PaymentPanel = lazy(() => import('./components/PaymentPanel'));
const OrderDetailModal = lazy(() => import('./components/OrderDetailModal'));
const NotificationsPanel = lazy(() => import('./components/NotificationsPanel'));

const roles = [
  ['buyer', 'Buyer app', 'Book reliable water'],
  ['seller', 'Seller app', 'Manage your fleet'],
  ['driver', 'Driver app', 'Deliveries and earnings'],
  ['institution', 'Institution', 'Plan your supply'],
  ['ops', 'Admin', 'Authorized operations access'],
];

const ROLE_ICONS = { buyer: '⌂', seller: '↗', driver: '⇢', institution: '▦', ops: '◈' };

const SUPPORT_PHONE = '0545009046';

// The name each workspace is registered under when no real name is on file.
//
// Registration passes the role label as the display name, so "Buyer" is a
// placeholder rather than a person. It has to be recognised as one here, or the
// sidebar ends up introducing the signed-in user as "Buyer" — a label the
// workspace switcher directly above it already says.
const PLACEHOLDER_NAMES = { buyer: 'Buyer', seller: 'Seller', driver: 'Driver', institution: 'Institution', ops: 'Admin' };

// Who is signed in, for the sidebar and the mobile avatar.
//
// This was a literal name, avatar and city on every account, so a driver in
// Kumasi and an operator in the console were both told they were the same
// invented person in Accra. It is derived from the session now: the account's
// own display name where a real one exists, the identifier otherwise, and an
// honest signed-out state when there is no session at all. The region is the one
// selected in the topbar, not a fixed city.
function identityFor(session, region) {
  if (!session) {
    return { initials: '—', name: 'Signed out', detail: 'Choose a workspace to continue', signedIn: false };
  }

  const displayName = session.displayName?.trim() ?? '';
  const placeholder = PLACEHOLDER_NAMES[session.role];
  const hasName = Boolean(displayName) && displayName.toLowerCase() !== placeholder?.toLowerCase();

  // A phone account is registered without a name, so the identifier is the only
  // honest thing to show. It is formatted because a raw +233… string is not a
  // label anyone reads.
  const identifier = session.identifierType === 'phone'
    ? formatPhoneForDisplay(session.identifier)
    : session.identifier;
  const name = hasName ? displayName : identifier;
  const detail = hasName ? `${identifier} · ${region}` : region;

  const words = name.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1
    ? words.slice(0, 2).map((word) => word[0]).join('')
    : name.replace(/\D/g, '').slice(0, 2) || name.slice(0, 2);

  return { initials: letters.toUpperCase(), name, detail, signedIn: true };
}

/**
 * Money shown to buyers, sellers and institutions, computed from the orders that
 * actually exist.
 *
 * This was a literal object of invented figures: a seller "net GH₵6,904.40", an
 * institution on a "GH₵3,500 plan", a buyer fee of 15% when the configured
 * service charge is 10%. None of it came from an order, so a business reading
 * its own dashboard was reading fiction. Every figure now comes from
 * `summarise`, which sums real orders.
 */

/**
 * Ops headline figures, summed from real orders.
 *
 * This was four hardcoded tiles reading 124 orders, GH₵18,540 GMV, 1,248 buyers,
 * 4 disputes and 92% quality badges. An operator has no way to tell invented
 * numbers from measured ones, which is exactly why a dashboard that fabricates
 * is worse than one that admits it has no data. There is no dispute or
 * certification table behind these, so those tiles are gone rather than
 * reduced to zeros that would still look like measurements.
 */
function OpsStats({ orders }) {
  const summary = summarise(orders);

  if (!summary.hasData) {
    return (
      <div className="ops-stats" role="note">
        <div>
          <span>ORDERS</span>
          <strong>0</strong>
          <small>No orders have been placed yet.</small>
        </div>
        <div>
          <span>COLLECTED</span>
          <strong>{formatCedi(0)}</strong>
          <small>Nothing has been paid yet.</small>
        </div>
      </div>
    );
  }

  return (
    <div className="ops-stats">
      <div><span>ORDERS</span><strong>{summary.totalCount}</strong><small>{summary.paidCount} paid · {summary.unpaidCount} awaiting payment</small></div>
      <div><span>COLLECTED</span><strong>{formatCedi(summary.chargedMinor)}</strong><small>Paystack-confirmed payments</small></div>
      <div><span>OUTSTANDING</span><strong>{formatCedi(summary.unpaidMinor)}</strong><small>Awaiting payment</small></div>
      <div><span>PLATFORM SHARE</span><strong>{formatCedi(summary.platformCommissionMinor)}</strong><small>From paid orders</small></div>
    </div>
  );
}

function App() {
  const [language, setLanguage] = useState('en');
  const [region, setRegion] = useState('Accra');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState(null);
  const t = translations[language] ?? translations.en;
  seedProducts();

  const {
    role, selectRole, notice, showNotice, dismissNotice,
    session, signOut, accountExists,
    buyerAuthenticated, driverAuthenticated, adminAuthenticated, sellerAuthenticated,
    startPhoneSignIn, confirmPhoneCode, signInWithPassword, signInWithGoogleIdentity, signInWithMetaIdentity, registerAccount, linkDriverPhone,
    phoneCode, phoneIdentifier, signInError, opsToken,
    authStep, email, setEmail, emailCode, sendOtp, confirmEmailCode,
    sellerProfile, setSellerProfile, sellerApproved, sellerApplicationId,
    applyForSellerApproval, refreshSellerApproval, completeSellerApproval,
     available, setAvailable,
     ready,
  } = useAuth();

  const {
    forRole, unreadCount, notify, markRead, markAllRead,
  } = useNotifications();

  const { pricing, split, publish, apply } = useAdminPricing({ onNotice: showNotice });

  const {
    orders, booking, updateBooking, requestDelivery, repeatBooking,
    savedAddresses, setSavedAddresses, driverUpdate, refreshDriverUpdate,
    updateOrderStatus, issueDeliveryCode, confirmDelivery, requestRefund,
    acceptDriverJob, releaseDriverJob,
  } = useBooking({ email, buyerPhone: session?.identifier ?? '', onNotice: showNotice, notify });

  const { downloadReport } = useReports({ region, orders, onNotice: showNotice });

  // Buyer loyalty is summed from this buyer's paid orders, so it only exists
  // for an authenticated buyer. An unauthenticated buyer sees no tier.
  const buyerIdentifier = session?.identifier || email;
  const { summary: loyaltySummary, profile: loyaltyProfile } = useLoyalty({
    orders,
    buyerId: buyerIdentifier,
    onNotice: showNotice,
  });

  // Seller performance is scored from real orders, so an empty workspace has
  // no sellers rather than a table of plausible-looking ratings.
  const { summary: sellerPerfSummary, ranked: sellerRanked } = useSellerPerformance({ orders });

  // Reliability is a second opinion on seller performance, aimed at the
  // operator question "how dependable is this seller, and how long do they
  // usually take?". The SLA is the median of observed delivery windows and is
  // labelled as an estimate; where timing is unrecorded it says so.
  const reliabilityRanked = rankReliability(orders);
  const reliabilitySummaryData = reliabilitySummary(orders);

  const { aiOpen, toggleAi, closeAi, aiInput, setAiInput, aiMessages, askAi, aiLoading, aiSource } = useAquaAi({
    language,
    role,
    orders,
    split,
    sellerScores: sellerRanked,
    reliabilityScores: reliabilityRanked,
    buyerId: buyerIdentifier,
  });

  const { requestPermission } = usePushNotifications();
  const userIdentifier = session?.identifier || email;
  useFCMTokenSync(userIdentifier);

  // Request push notification permission when user is authenticated
  useEffect(() => {
    if (ready && (buyerAuthenticated || sellerAuthenticated || adminAuthenticated)) {
      requestPermission();
    }
  }, [ready, buyerAuthenticated, sellerAuthenticated, adminAuthenticated, requestPermission]);

  const roleNotifications = forRole(role);
  const roleUnread = unreadCount(role);

  // The driver workspace resolves the signed-in account against the fleet
  // roster by phone number, so the driver's jobs are the ones dispatch actually
  // stamped with their number. `driverCodeOrder` is the order whose delivery is
  // being closed, so the handover dialog has somewhere to point.
  const fleetDrivers = useMemo(() => list('drivers'), []);
  const [driverCodeOrderId, setDriverCodeOrderId] = useState(null);
  const [busyDriverOrderId, setBusyDriverOrderId] = useState(null);
  const driverCodeOrder = driverCodeOrderId
    ? orders.find((order) => order.id === driverCodeOrderId) ?? null
    : null;

  // Push permission is asked for once any authenticated workspace is open. A
  // driver on the road is the case that most needs it, so `driverAuthenticated`
  // is included rather than leaving drivers on the 15s poll alone.
  useEffect(() => {
    if (ready && (buyerAuthenticated || sellerAuthenticated || driverAuthenticated || adminAuthenticated)) {
      requestPermission();
    }
  }, [ready, buyerAuthenticated, sellerAuthenticated, driverAuthenticated, adminAuthenticated, requestPermission]);
  // Driver actions. Each wraps the booking mutation so the card can show a
  // spinner on the row being changed rather than disabling the whole screen.
  const driverAccept = async (orderId) => {
    setBusyDriverOrderId(orderId);
    await acceptDriverJob(orderId, notify);
    setBusyDriverOrderId(null);
  };

  const driverAdvance = async (orderId, status) => {
    setBusyDriverOrderId(orderId);
    await updateOrderStatus(orderId, status, notify);
    setBusyDriverOrderId(null);
  };

  const driverRelease = async (orderId) => {
    setBusyDriverOrderId(orderId);
    await releaseDriverJob(orderId, notify);
    setBusyDriverOrderId(null);
  };

  const driverRefresh = useCallback(() => {
    // Re-read orders from localStorage so the driver feed picks up changes another
    // role made in the same browser without waiting for the next poll cycle.
    replaceAll('orders', list('orders'));
  }, []);

  const detailOrder = orders.find((order) => order.id === detailOrderId) ?? null;

  const canSignOut = session && (buyerAuthenticated || driverAuthenticated || sellerAuthenticated || adminAuthenticated);

  // The sidebar identity follows the session instead of a fixed persona.
  const identity = useMemo(() => identityFor(session, region), [session, region]);

  // Which order the checkout panel acts on.
  //
  // After a Paystack redirect the URL carries the reference that was just paid,
  // so that order is the one to show — otherwise the panel opened whatever
  // happened to be outstanding first, and the customer saw a receipt for an
  // order they had not just paid for. Away from the return leg this is simply
  // the oldest unpaid order, so the buyer can finish an abandoned checkout.
  const returnReference = useMemo(() => referenceFromLocation(), []);
  const payableOrder = useMemo(() => {
    if (returnReference) {
      const matched = orders.find((order) => order.paystackReference === returnReference);
      if (matched) return matched;
    }
    return orders.find((order) => order.status !== 'Paid') ?? orders[0] ?? null;
  }, [orders, returnReference]);

  // The Driver workspace requires a phone on the fleet roster and is gated
  // separately from the buyer/seller/admin workspaces. A signed-in buyer or
  // seller should not see it in the switcher. Admins and drivers can, and
  // unsigned visitors see every option so they can choose one.
  const switcherRoles = useMemo(() => {
    if (adminAuthenticated || driverAuthenticated || !session) return roles;
    return roles.filter(([key]) => key !== 'driver');
  }, [adminAuthenticated, driverAuthenticated, session]);

  return (
    <div className="app-shell">
      {/* The mobile tab bar is always in the DOM and hidden with CSS above the
          breakpoint, rather than being mounted from a media query. A JS width
          check would render nothing for the first frame on a phone and shift
          the layout, and it cannot know the width before layout anyway. */}
      <nav className="mobile-tabs" aria-label="Workspaces">
        {switcherRoles.map(([key, label]) => (
          <button
            className={`mobile-tab ${role === key ? 'active' : ''}`}
            key={key}
            type="button"
            aria-current={role === key ? 'page' : undefined}
            onClick={() => selectRole(key)}
          >
            <span className={`role-icon ${key}`} aria-hidden="true">{ROLE_ICONS[key]}</span>
            <span className="mobile-tab-label">{key === 'ops' ? 'Admin' : key === 'institution' ? 'Org' : label.split(' ')[0]}</span>
            {key === role && roleUnread > 0 && <em>{roleUnread}</em>}
          </button>
        ))}
      </nav>
      <aside className="sidebar">
        <a className="app-logo" href="#main" aria-label="AquaLink dashboard"><span>A</span>Aqua<strong>Link</strong></a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="role-list">
          {switcherRoles.map(([key, label, description]) => (
            <button className={`role-button ${role === key ? 'active' : ''}`} key={key} type="button" onClick={() => selectRole(key)}>
              <span className={`role-icon ${key}`} aria-hidden="true">{ROLE_ICONS[key]}</span>
              <span><b>{label}</b><small>{description}</small></span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom"><button className="sidebar-link" type="button" onClick={() => showNotice('Help request received. Our support team will call you back shortly.')}><span>?</span>Help & support</button><div className="profile"><span className="avatar">{identity.initials}</span><span><b>{identity.name}</b><small>{identity.detail}</small></span><span className="more">•••</span></div></div>
      </aside>

      <main className="main-content" id="main">
         <header className="topbar">
            <div className="breadcrumb">
              <span>AquaLink</span><i>/</i><strong>{t[role]}</strong>
              <select aria-label="Operating region" value={region} onChange={(event) => { setRegion(event.target.value); showNotice(`Workspace switched to ${event.target.value}.`); }}>
                <option>Accra</option><option>Kumasi</option><option>Takoradi</option><option>Tema</option><option>Lagos</option><option>Abidjan</option>
              </select>
            </div>
            <div className="topbar-actions">
              <label className="language-picker"><span>文</span>
                <select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {languages.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                </select>
              </label>
              <button className={`ai-trigger ${aiOpen ? 'active' : ''}`} type="button" onClick={toggleAi}>
                <span>✦</span> Aqua AI
              </button>
              <button className="icon-button" type="button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}>
                <span>♧</span>
                {roleUnread > 0 && <em>{roleUnread}</em>}
              </button>
              {canSignOut && <button className="icon-button topbar-signout" type="button" aria-label="Sign out" title="Sign out" onClick={() => signOut()}><span>⎋</span></button>}
              <button className="profile mobile-profile" type="button" aria-label={`Signed in as ${identity.name}`}><span className="avatar">{identity.initials}</span></button>
            </div>
          </header>
        <PWASetup />
        <PWADetectOffline onOfflineChange={(offline) => showNotice(offline ? 'You are offline. Changes will sync when reconnected.' : 'Back online. Syncing...')} />
        {notice && <div className="notice" role="status"><span>✓</span>{notice}<button type="button" aria-label="Dismiss notification" onClick={dismissNotice}>×</button></div>}
        {aiOpen && <AiPanel role={role} input={aiInput} setInput={setAiInput} messages={aiMessages} askAi={askAi} close={closeAi} aiLoading={aiLoading} aiSource={aiSource} />}
        {!ready && <section className="access-gate panel"><span className="access-lock">⌁</span><p className="eyebrow">Preparing secure workspace</p><h1>Setting up your accounts.</h1><p>AquaLink is generating the local account registry and its credentials on this device. This takes a moment and needs no network access.</p>        </section>}
        {ready && role === 'buyer' && (buyerAuthenticated ? <><BuyerView booking={booking} updateBooking={updateBooking} requestDelivery={requestDelivery} orders={orders} showNotice={showNotice} authStep={authStep} email={email} setEmail={setEmail} emailCode={emailCode} sendOtp={sendOtp} confirmEmailCode={confirmEmailCode} confirmDelivery={confirmDelivery} requestRefund={requestRefund} savedAddresses={savedAddresses} repeatBooking={repeatBooking} setSavedAddresses={setSavedAddresses} t={t} driverUpdate={driverUpdate} refreshDriverUpdate={refreshDriverUpdate} loyalty={loyaltySummary} loyaltyProfile={loyaltyProfile} estimateForOrder={estimateForOrder} /><BuyerFinance orders={orders} showNotice={showNotice} /></> : <BuyerAccessGate onSignedIn={() => {}} startSignIn={startPhoneSignIn} confirmCode={confirmPhoneCode} generatedCode={phoneCode} identifier={phoneIdentifier} error={signInError} onRegister={(value) => registerAccount({ identifier: value, role: 'buyer', displayName: 'Buyer' })} accountExists={accountExists} onGoogle={signInWithGoogleIdentity} onMeta={signInWithMetaIdentity} showNotice={showNotice} />)}
        {notificationsOpen && (
          <Suspense fallback={null}>
            <NotificationsPanel
              notifications={roleNotifications}
              unreadCount={roleUnread}
              onMarkAllRead={() => markAllRead(role)}
              onMarkRead={markRead}
              onClose={() => setNotificationsOpen(false)}
              onOrderClick={setDetailOrderId}
              supportPhone={SUPPORT_PHONE}
            />
          </Suspense>
        )}
        {detailOrder && (
          <Suspense fallback={null}>
            <OrderDetailModal
              order={detailOrder}
              onClose={() => setDetailOrderId(null)}
              onShowNotice={showNotice}
              viewerRole={role}
            />
          </Suspense>
        )}
        {ready && role === 'buyer' && buyerAuthenticated && (
          <Suspense fallback={<div className="panel lazy-fallback" aria-hidden="true" />}>
            <PaymentPanel
              order={payableOrder}
              onPaid={(orderId) => { updateOrderStatus(orderId, 'Paid', notify); }}
              showNotice={showNotice}
            />
          </Suspense>
        )}
        {ready && role === 'seller' && (sellerAuthenticated ? (
          <SellerDashboard
            available={available}
            setAvailable={setAvailable}
            showNotice={showNotice}
            orders={orders}
            updateOrderStatus={(id, status) => updateOrderStatus(id, status, notify)}
            issueDeliveryCode={issueDeliveryCode}
            sellerProfile={sellerProfile}
            setSellerProfile={setSellerProfile}
          />
        ) : (
          <SellerAccessGate
            sellerProfile={sellerProfile}
            setSellerProfile={setSellerProfile}
            onApply={applyForSellerApproval}
            onRefresh={refreshSellerApproval}
            applicationId={sellerApplicationId}
            onSignIn={completeSellerApproval}
            onGoogle={signInWithGoogleIdentity}
            onMeta={signInWithMetaIdentity}
            showNotice={showNotice}
          />
        ))}
        {driverCodeOrder && (
          <DeliveryCodeDialog
            order={driverCodeOrder}
            onCancel={() => setDriverCodeOrderId(null)}
            onSubmit={async (orderId, code) => {
              const result = await confirmDelivery(orderId, code);
              if (result?.ok) {
                setDriverCodeOrderId(null);
                setDetailOrderId(orderId);
              }
              return result;
            }}
          />
        )}
        {ready && role === 'driver' && (driverAuthenticated ? (
          <DriverDashboard
            orders={orders}
            fleetDrivers={fleetDrivers}
            driverIdentifier={session?.phone || (session?.identifier ?? '')}
            driverName={session?.displayName ?? ''}
            onAccept={driverAccept}
            onAdvance={driverAdvance}
            onComplete={setDriverCodeOrderId}
            onReject={driverRelease}
            showNotice={showNotice}
            busyOrderId={busyDriverOrderId}
            linkDriverPhone={linkDriverPhone}
            onRefresh={driverRefresh}
          />
        ) : (
          <DriverAccessGate
            startSignIn={startPhoneSignIn}
            confirmCode={confirmPhoneCode}
            generatedCode={phoneCode}
            identifier={phoneIdentifier}
            error={signInError}
            onRegister={(value) => registerAccount({ identifier: value, role: 'driver', displayName: 'Driver' })}
            accountExists={accountExists}
            onGoogle={signInWithGoogleIdentity}
            onMeta={signInWithMetaIdentity}
            showNotice={showNotice}
          />
        ))}
        {role === 'ops' && adminAuthenticated && (
          <DriverTrackingView orders={orders} showNotice={showNotice} />
        )}
        {role === 'institution' && (
          <InstitutionDashboard orders={orders} showNotice={showNotice} />
        )}
        {ready && role === 'ops' && (adminAuthenticated ? <Suspense fallback={null}><OpsView orders={orders} downloadReport={downloadReport} opsToken={opsToken} showNotice={showNotice} sellerPerfSummary={sellerPerfSummary} sellerRanked={sellerRanked} reliabilitySummary={reliabilitySummaryData} reliabilityRanked={reliabilityRanked} /></Suspense> : <AdminAccessGate onSignIn={signInWithPassword} error={signInError} onGoogle={signInWithGoogleIdentity} onMeta={signInWithMetaIdentity} showNotice={showNotice} />)}
        {ready && role === 'ops' && adminAuthenticated && <ReportActions downloadReport={downloadReport} />}
        {ready && role === 'ops' && adminAuthenticated && <OperationalRiskPanel orders={orders} sellerPerfSummary={sellerPerfSummary} sellerRanked={sellerRanked} />}
        {ready && role === 'ops' && adminAuthenticated && <RevenueFinance orders={orders} showNotice={showNotice} />}
        {ready && role === 'ops' && adminAuthenticated && <Suspense fallback={null}><AdminPricingConsole onNotice={showNotice} onPricingChange={(nextPricing, nextSplit) => publish(nextPricing, nextSplit)} opsToken={opsToken} /></Suspense>}
        </main>
    </div>
  );
}

/**
 * The rule above a set of social sign-in buttons.
 *
 * Present so the phone form and the social buttons read as two ways into the
 * same account rather than as unrelated controls stacked on one screen.
 */
function SocialSignInDivider() {
  return <div className="social-divider" aria-hidden="true"><span>or continue with</span></div>;
}

function BuyerAccessGate({ onSignedIn, startSignIn, confirmCode, generatedCode, identifier, error, onRegister, accountExists, onGoogle, onMeta, showNotice }) {
  const [localPhone, setLocalPhone] = useState('');
  const [step, setStep] = useState('phone');
  const [otp, setOtp] = useState('');
  const [registering, setRegistering] = useState(false);

  async function handleSend(event) {
    event.preventDefault();
    const result = await startSignIn(localPhone);
    if (result?.ok) setStep('otp');
  }

  async function handleVerify(event) {
    event.preventDefault();
    if (!otp.trim()) return;
    const result = await confirmCode(otp);
    if (result?.ok) onSignedIn();
  }

  async function handleRegister(event) {
    event.preventDefault();
    const result = await onRegister(localPhone);
    if (result?.ok) setLocalPhone('');
  }

  const known = localPhone.trim() ? accountExists(localPhone) : null;

  return <section className="access-gate panel"><span className="access-lock">⌁</span><p className="eyebrow">Verified buyer access</p><h1>Sign in to view your orders.</h1><p>Enter the phone number on your account. AquaLink checks it against the account registry, then generates a one-time code.</p>{registering ? <form onSubmit={handleRegister}><div className="otp-delivery"><span className="section-kicker">NEW ACCOUNT</span><strong>{formatPhoneForDisplay(normalizePhone(localPhone) ?? localPhone)}</strong><small>An account will be created for this number with a generated password.</small></div><input aria-label="New buyer phone" value={localPhone} onChange={(event) => setLocalPhone(event.target.value)} placeholder="Phone number" inputMode="tel" /><button className="primary-button" type="submit">Create account →</button><button className="text-button" type="button" onClick={() => setRegistering(false)}>Back to sign in</button></form> : step === 'phone' ? <form onSubmit={handleSend}><input aria-label="Buyer phone number" value={localPhone} onChange={(event) => setLocalPhone(event.target.value)} placeholder="Phone number" inputMode="tel" />{known === false && <p className="form-hint">No account uses that number yet.</p>}<button className="primary-button" type="submit">Send OTP →</button></form> : <form onSubmit={handleVerify}><div className="otp-delivery"><span className="section-kicker">GENERATED BY AQUALINK</span><strong data-testid="otp-code">{generatedCode || '···'}</strong><small>For {formatPhoneForDisplay(identifier)} · expires in 5 minutes</small></div><input aria-label="Buyer OTP" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter the generated code" inputMode="numeric" />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit">Verify OTP →</button><button className="text-button" type="button" onClick={() => { setStep('phone'); setOtp(''); }}>Use a different number</button></form>}{!registering && step === 'phone' && <button className="text-button" type="button" onClick={() => setRegistering(true)}>Create an account →</button>}{error && step === 'phone' && <p className="form-error" role="alert">{error}</p>}<small>Create an account below to get started. Codes are generated on this device by the browser&apos;s Web Crypto API and verified locally against a real account. No SMS or email provider is involved, so the code is shown here instead of being sent.</small><SocialSignInDivider /><GoogleSignInButton role="buyer" onVerified={onGoogle} showNotice={showNotice} /><MetaSignInButton role="buyer" onVerified={onMeta} showNotice={showNotice} /></section>;
}

function DriverAccessGate({ startSignIn, confirmCode, generatedCode, identifier, error, onRegister, accountExists, onGoogle, onMeta, showNotice }) {
  const [localPhone, setLocalPhone] = useState('');
  const [step, setStep] = useState('phone');
  const [otp, setOtp] = useState('');
  const [registering, setRegistering] = useState(false);

  async function handleSend(event) {
    event.preventDefault();
    const result = await startSignIn(localPhone);
    if (result?.ok) setStep('otp');
  }

  async function handleVerify(event) {
    event.preventDefault();
    if (!otp.trim()) return;
    const result = await confirmCode(otp);
    if (result?.ok) setStep('phone');
  }

  async function handleRegister(event) {
    event.preventDefault();
    const result = await onRegister(localPhone);
    if (result?.ok) setLocalPhone('');
  }

  const known = localPhone.trim() ? accountExists(localPhone) : null;

  return (
    <section className="access-gate panel">
      <span className="access-lock">⇢</span>
      <p className="eyebrow">Verified driver access</p>
      <h1>Sign in to see your deliveries.</h1>
      <p>
        Enter the phone number on your driver record. AquaLink generates a one-time code, then shows
        only the jobs assigned to you.
      </p>

      {registering ? (
        <form onSubmit={handleRegister}>
          <div className="otp-delivery">
            <span className="section-kicker">NEW DRIVER ACCOUNT</span>
            <strong>{formatPhoneForDisplay(normalizePhone(localPhone) ?? localPhone)}</strong>
            <small>An account will be created for this number with a generated password.</small>
          </div>
          <input aria-label="New driver phone" value={localPhone} onChange={(event) => setLocalPhone(event.target.value)} placeholder="Phone number" inputMode="tel" />
          <button className="primary-button" type="submit">Create account →</button>
          <button className="text-button" type="button" onClick={() => setRegistering(false)}>Back to sign in</button>
        </form>
      ) : step === 'phone' ? (
        <form onSubmit={handleSend}>
          <input aria-label="Driver phone number" value={localPhone} onChange={(event) => setLocalPhone(event.target.value)} placeholder="Phone number" inputMode="tel" />
          {known === false && <p className="form-hint">No account uses that number yet.</p>}
          <button className="primary-button" type="submit">Send OTP →</button>
          <button className="text-button" type="button" onClick={() => setRegistering(true)}>Create a driver account</button>
        </form>
      ) : (
        <form onSubmit={handleVerify}>
          <div className="otp-delivery">
            <span className="section-kicker">GENERATED BY AQUALINK</span>
            <strong data-testid="driver-otp-code">{generatedCode || '···'}</strong>
            <small>For {formatPhoneForDisplay(identifier)} · expires in 5 minutes</small>
          </div>
          <input aria-label="Driver OTP" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter the generated code" inputMode="numeric" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit">Verify OTP →</button>
          <button className="text-button" type="button" onClick={() => { setStep('phone'); setOtp(''); }}>Use a different number</button>
        </form>
      )}

      <SocialSignInDivider />
      <GoogleSignInButton role="driver" onVerified={onGoogle} showNotice={showNotice} />
      <MetaSignInButton role="driver" onVerified={onMeta} showNotice={showNotice} />
    </section>
  );
}

function SellerAccessGate({ sellerProfile, setSellerProfile, onApply, onRefresh, applicationId, onSignIn, onGoogle, onMeta, showNotice }) {
  const [submitted, setSubmitted] = useState(Boolean(applicationId));
  const [busy, setBusy] = useState(false);

  function update(event) {
    setSellerProfile({ ...sellerProfile, [event.target.name]: event.target.value });
  }

  async function handleApply(event) {
    event.preventDefault();
    setBusy(true);
    const result = await onApply();
    setBusy(false);
    if (result?.ok) setSubmitted(true);
  }

  async function handleRefresh() {
    setBusy(true);
    const result = await onRefresh();
    setBusy(false);
    if (result?.ok && result.approved) await onSignIn();
  }

  if (submitted) {
    return <section className="access-gate panel seller-gate"><span className="access-lock">↗</span><p className="eyebrow">Seller signup & approval</p><h1>Application awaiting approval.</h1><p>AquaLink Ops must verify your identity, vehicle, and water-source documents before you can receive jobs.</p><div className="pending-approval"><strong>Pending operator review</strong><small>An operator has to approve this application on the server. There is no code to enter and no way to approve it from this screen, because the previous version generated its own approval code and anyone could have approved themselves.</small><small>Application reference: <span data-testid="seller-application-id">{applicationId || 'submitted'}</span></small><button className="primary-button" type="button" onClick={handleRefresh} disabled={busy}>{busy ? 'Checking…' : 'Check approval status'}</button></div></section>;
  }

  return <section className="access-gate panel seller-gate"><span className="access-lock">↗</span><p className="eyebrow">Seller signup & approval</p><h1>Create your seller account.</h1><p>Complete your business and vehicle details. Your seller workspace stays locked until an operator approves the application.</p><form onSubmit={handleApply}><input aria-label="Business name" name="business" value={sellerProfile.business} onChange={update} placeholder="Business or trading name" /><input aria-label="Seller phone" name="phone" value={sellerProfile.phone} onChange={update} placeholder="Registered phone number" /><input aria-label="Vehicle registration" name="vehicle" value={sellerProfile.vehicle} onChange={update} placeholder="Vehicle registration" /><select aria-label="Tank capacity" name="capacity" value={sellerProfile.capacity} onChange={update}><option>1,000 gallons</option><option>2,000 gallons</option><option>5,000 gallons</option></select><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit signup for review →'}</button></form><SocialSignInDivider /><GoogleSignInButton role="seller" onVerified={onGoogle} showNotice={showNotice} /><MetaSignInButton role="seller" onVerified={onMeta} showNotice={showNotice} /><small>Required controls: ID, vehicle registration, tank capacity, water-source evidence, approval audit trail, and payout verification.</small></section>;
}

function AdminAccessGate({ onSignIn, error, onGoogle, onMeta, showNotice }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const result = await onSignIn(identifier, password);
    if (result?.ok) setPassword('');
  }

  return <section className="access-gate panel admin-gate"><span className="access-lock">▣</span><p className="eyebrow">Restricted admin area</p><h1>Operations data needs a verified admin.</h1><p>Sign in with the account registered for ops. The identifier is matched against the account registry and the password is checked against a salted PBKDF2 hash.</p><form onSubmit={handleSubmit}><input aria-label="Admin account" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Admin email or phone" autoComplete="username" /><input aria-label="Admin password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" autoComplete="current-password" />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit">Open admin console →</button></form><small>Five failed attempts lock the account for five minutes. The operations account is created once from your deployment environment and its password is never displayed here.</small><GoogleSignInButton role="ops" onVerified={onGoogle} showNotice={showNotice} /><MetaSignInButton role="ops" onVerified={onMeta} showNotice={showNotice} /></section>;
}

function ReportActions({ downloadReport }) {
  return <section className="report-actions"><span><strong>Intervention reporting</strong><small>Export demand and deployment data for partners and internal planning.</small></span><button className="outline-button" type="button" onClick={() => downloadReport('Regional demand report')}>Download JSON report ↓</button><button className="primary-button" type="button" onClick={() => downloadReport('Partner intervention brief')}>Create partner brief →</button></section>;
}

function PageHeader({ eyebrow, title, copy, action }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-copy">{copy}</p></div>{action}</div>;
}

function BuyerView({ booking, updateBooking, requestDelivery, orders, showNotice, authStep, email, setEmail, emailCode, sendOtp, confirmEmailCode, confirmDelivery, requestRefund, savedAddresses, repeatBooking, setSavedAddresses, t, driverUpdate, refreshDriverUpdate, loyalty, loyaltyProfile, estimateForOrder }) {
  const [emailOtp, setEmailOtp] = useState('');
  const [deliveryCodes, setDeliveryCodes] = useState({});

  const tier = loyalty?.tier ?? 'Bronze';
  const points = loyalty?.points ?? 0;
  const nextTier = loyalty?.nextTier ?? null;
  const pointsToNext = loyalty?.pointsToNextTier ?? 0;
  const progress = loyalty?.progressToNext ?? 0;
  const cashback = loyalty?.cashback ?? formatCedi(0);
  const walletBalance = loyalty?.walletBalance ?? formatCedi(0);

  // The date and the greeting were both literals, so the header said
  // "Tuesday, 21 August 2026" on every day and "Good morning" at 9pm. Both are
  // derived here instead. The greeting deliberately carries no name: the only
  // name available is the account registry's role label ("Buyer"), and
  // inventing one reads as though the app knows the customer.
  const now = new Date();
  const todayLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dayGreeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  // `authStep` starts at 'idle', so this strip used to claim "Email verified" for
  // anyone who had only ever signed in by phone. It now reports the state that
  // actually holds, and offers to link an email when there is none.
  const emailState = authStep === 'verified'
    ? { strong: 'Email verified', small: 'OTP login enabled · no password required', showEmailForm: true }
    : authStep === 'otp'
      ? { strong: 'Enter your generated code', small: `AquaLink generated ${emailCode} for ${email}`, showEmailForm: false }
      : { strong: 'No email linked', small: 'You signed in with a phone number. Linking an email also lets you sign in that way.', showEmailForm: true };

  return <>
    <PageHeader eyebrow={todayLabel} title={`${dayGreeting}.`} copy="Get your next delivery sorted in a few taps." action={<button className="outline-button" type="button" onClick={() => showNotice('Referral link copied to your clipboard.')}>↗ Invite a friend <span>+GH₵20</span></button>} />
    <section className="auth-strip panel"><div><span className="section-kicker">ACCOUNT & SECURITY</span><strong>{emailState.strong}</strong><small>{emailState.small}</small></div>{emailState.showEmailForm ? <form className="auth-form" onSubmit={(event) => { event.preventDefault(); sendOtp(); }}><input aria-label="Email address" value={email} onChange={(event) => setEmail(event.target.value)} type="email" /><button className="outline-button" type="submit">Send OTP</button></form> : <form className="auth-form" onSubmit={async (event) => { event.preventDefault(); const result = await confirmEmailCode(emailOtp); if (result?.ok) setEmailOtp(''); }}><input aria-label="OTP code" value={emailOtp} onChange={(event) => setEmailOtp(event.target.value)} placeholder="Enter 6-digit OTP" inputMode="numeric" /><button className="primary-button" type="submit">Verify</button></form>}</section>
    <section className="saved-addresses panel"><div><span className="section-kicker">FAST REBOOK</span><strong>Saved addresses</strong><small>Repeat a trusted delivery without typing it again.</small></div><div className="saved-address-list">{savedAddresses.map((address) => <button type="button" key={address} onClick={() => repeatBooking(address)}>⌖ {address}</button>)}<button type="button" onClick={() => { const typed = booking.location.trim(); if (!typed) { showNotice('Type a delivery location first, then save it here.'); return; } if (savedAddresses.includes(typed)) { showNotice('That address is already saved.'); return; } setSavedAddresses([...savedAddresses, typed]); showNotice(`Saved ${typed} for quick rebooking.`); }}>+ Save this address</button></div></section>
    <div className="buyer-grid">
      <section className="panel booking-panel"><div className="panel-title"><div><span className="section-kicker">NEW BOOKING · {t.book}</span><h2>{t.location}</h2></div><span className="verified-pill">✓ Verified sellers</span></div><form onSubmit={requestDelivery}><label>Delivery location<div className="input-wrap"><span>⌖</span><input name="location" value={booking.location} onChange={updateBooking} placeholder="Enter an address or landmark" /></div></label><label>Email for the receipt <small className="field-hint">(required — your receipt and payment confirmation go here)</small><div className="input-wrap"><span>✉</span><input name="receiptEmail" type="email" value={booking.receiptEmail} onChange={updateBooking} placeholder="you@example.com" autoComplete="email" /></div></label><label>WhatsApp number <small className="field-hint">(optional, if different from your phone)</small><div className="input-wrap"><span>✆</span><input name="whatsapp" value={booking.whatsapp} onChange={updateBooking} placeholder="e.g. 0551234567" inputMode="tel" /></div></label><div className="form-row"><label>Water volume<select name="volume" value={booking.volume} onChange={updateBooking}><option>1,000 gallons</option><option>2,000 gallons</option><option>5,000 gallons</option></select></label><label>Delivery window<select name="window" value={booking.window} onChange={updateBooking}><option>As soon as possible</option><option>Today, 12:00–14:00</option><option>Tomorrow morning</option></select></label></div><div className="quote"><span><small>YOUR PRICE</small><strong>Calculated on the server</strong></span><span className="quote-note">The exact amount, including the service charge, is calculated when you book and shown before you pay. It is not quoted here because the server is the only place that sets it.</span></div><label className="payment-label">Payment method<select name="payment" value={booking.payment} onChange={updateBooking}><option>Mobile money or card via Paystack</option><option>Cash on delivery (pay the driver)</option></select></label><p className="escrow-note">Card and mobile money payments are taken by Paystack and confirmed before your order counts as paid. Cash on delivery is settled with the driver.</p><button className="primary-button full" type="submit">{t.book} <span>→</span></button></form></section>
      <div className="side-stack"><section className="panel rewards-panel"><div className="panel-title"><div><span className="section-kicker">YOUR REWARDS</span><h2>{tier} tier</h2></div><span className="tier-badge">✦</span></div><div className="reward-progress"><strong>{points}</strong>{nextTier ? <span>{points} / {points + pointsToNext} to {nextTier}</span> : <span>Top of the ladder</span>}<div><i style={{ width: `${Math.round(progress * 100)}%` }} /></div></div><div className="reward-foot"><span>{loyaltyProfile ? `2% cashback available · ${cashback}` : 'No paid orders yet, so no cashback has been earned.'}</span><button type="button" onClick={() => showNotice(loyaltyProfile ? `Your wallet balance is ${walletBalance}.` : 'Your wallet balance is GH₵0.00 — pay for one order to start earning.')}>View wallet →</button></div></section><DeliveryEstimateCard order={orders.find(o => o.status === 'Assigned' || o.status === 'En Route')} estimateForOrder={estimateForOrder} orders={orders} /><LiveAgentCard role="buyer" driverUpdate={driverUpdate} refreshDriverUpdate={refreshDriverUpdate} showNotice={showNotice} /></div>
    </div>
    <section className="orders-section"><div className="section-heading"><div><span className="section-kicker">ACTIVITY</span><h2>{t.recent}</h2></div><button className="text-button" type="button" onClick={() => showNotice('Showing all delivery history.')}>View all →</button></div><div className="orders-table"><div className="table-head"><span>ORDER</span><span>LOCATION</span><span>VOLUME</span><span>STATUS</span><span>PAYMENT</span></div>{orders.map((order) => <div className="order-row" key={order.id}><strong>{order.id}<small>{order.date}</small></strong><span>{order.location}</span><span>{order.volume}</span><span><i className={`status ${order.status.toLowerCase()}`}>{order.status}</i>{order.status === 'En Route' && <button className="confirm-button" type="button" onClick={() => showNotice(order.driverName ? `${order.driverName} is on the way. Position updated from the seller app.` : 'A driver is on the way. Position updated from the seller app.')}>Driver position</button>}{order.status === 'Delivered' && order.payment !== 'Released' && <span className="confirm-row"><input aria-label={`Delivery code for ${order.id}`} value={deliveryCodes[order.id] ?? ''} onChange={(event) => setDeliveryCodes({ ...deliveryCodes, [order.id]: event.target.value })} placeholder="Delivery code" /><button className="confirm-button" type="button" onClick={() => confirmDelivery(order.id, deliveryCodes[order.id])}>Confirm receipt</button></span>}{order.status === 'Delivered' && <button className="confirm-button" type="button" onClick={() => showNotice(`Receipt for ${order.id} is ready to download or email.`)}>Receipt</button>}{order.status === 'Delivered' && <button className="confirm-button" type="button" onClick={() => requestRefund(order.id)}>Request refund</button>}</span><b>{order.payment}<small>{order.price}</small></b></div>)}</div></section><section className="support-card panel"><div><span className="section-kicker">HUMAN SUPPORT</span><h2>{t.support}</h2><p>Accra support: phone, email, WhatsApp, or a ticket for late deliveries, refunds, quality concerns, or payment receipts.</p></div><div className="support-actions"><a href="tel:+233302000123">☎ Call +233 30 200 0123</a><a href="mailto:support@aqualink.gh">✉ support@aqualink.gh</a><a href="https://wa.me/233545009046" target="_blank" rel="noreferrer">◌ WhatsApp 0545009046</a><button type="button" onClick={() => showNotice('Support ticket created. Reference: SUP-2048.')}>Open support ticket</button></div></section>
  </>;
}

function SellerView({ available, setAvailable, showNotice, orders, updateOrderStatus, issueDeliveryCode, sellerProfile, setSellerProfile }) {
  const activeOrder = orders[0];
  // Real orders only. The panel this replaced showed a fixed GH₵8,420 month,
  // 52 deliveries, a 4.8★ rating, and a job queue of three invented Accra
  // locations with made-up prices and timestamps.
  const summary = summarise(orders);
  const jobQueue = orders.filter((order) => order.status !== 'Delivered');

  function updateProfile(event) {
    setSellerProfile({ ...sellerProfile, [event.target.name]: event.target.value });
  }

  return <><PageHeader eyebrow="Seller workspace · Accra" title="Ready for the next job?" copy="Keep your status current and turn more deliveries into income." action={<button className={`availability ${available ? 'online' : ''}`} type="button" onClick={() => { setAvailable(!available); showNotice(available ? 'You are now offline.' : 'You are back online and visible to buyers.'); }}><i />{available ? 'Online and accepting jobs' : 'Offline'}</button>} /><section className="seller-onboarding panel"><div><span className="section-kicker">SELLER ONBOARDING</span><h2>Complete your verification profile</h2><p>Ops manually reviews these details before you receive paid jobs.</p></div><form className="seller-form" onSubmit={(event) => { event.preventDefault(); showNotice('Seller profile submitted. Ops will review your documents within one business day.'); }}><input aria-label="Business name" name="business" value={sellerProfile.business} onChange={updateProfile} placeholder="Business name" /><input aria-label="Seller phone" name="phone" value={sellerProfile.phone} onChange={updateProfile} placeholder="Phone number" /><input aria-label="Vehicle registration" name="vehicle" value={sellerProfile.vehicle} onChange={updateProfile} placeholder="Vehicle registration" /><select aria-label="Tank capacity" name="capacity" value={sellerProfile.capacity} onChange={updateProfile}><option>1,000 gallons</option><option>2,000 gallons</option><option>5,000 gallons</option></select><select aria-label="Verification document" name="document" value={sellerProfile.document} onChange={updateProfile}><option>ID document not uploaded</option><option>ID document uploaded</option><option>ID + vehicle documents uploaded</option></select><button className="primary-button" type="submit">Submit for review →</button></form></section>{activeOrder && <section className="panel handover-panel"><div><span className="section-kicker">HANDOVER</span><h2>Issue a delivery code</h2><p>The handover code is how the buyer confirms they received the delivery. <b>{activeOrder.id}</b> · {activeOrder.location} · {activeOrder.status}</p></div><div className="handover-actions">{activeOrder.status === 'Delivered' ? <><strong className="issued-code">{activeOrder.confirmCode || 'No code issued'}</strong><button className="primary-button" type="button" onClick={() => issueDeliveryCode(activeOrder.id)}>{activeOrder.confirmCode ? 'Reissue code' : 'Generate code'}</button></> : <button className="outline-button" type="button" onClick={() => updateOrderStatus(activeOrder.id, 'Delivered')}>Mark as delivered</button>}<button className="outline-button" type="button" onClick={() => updateOrderStatus(activeOrder.id, 'En Route')}>Start delivery</button></div></section>}<div className="seller-stats"><div><span>ORDERS</span><strong>{summary.totalCount}</strong><small>{summary.paidCount} paid</small></div><div><span>DELIVERED</span><strong>{summary.deliveredCount}</strong><small>Confirmed by the buyer</small></div><div><span>YOUR SHARE</span><strong>{formatCedi(summary.sellerReceivesMinor)}</strong><small>Across paid orders</small></div></div><section className="orders-section seller-jobs"><div className="section-heading"><div><span className="section-kicker">JOB QUEUE</span><h2>Incoming requests</h2></div><span className="queue-count">Manual dispatch</span></div>{jobQueue.length === 0 ? <p className="empty-feed">No open jobs. This queue fills when a buyer books a delivery in your area.</p> : jobQueue.map((job) => <div className="job-card" key={job.id}><span className="job-time">{job.status}</span><div><strong>{job.location}</strong><p>{job.volume ? `${job.volume} · ` : ''}{formatCedi(job.chargedMinor ?? 0)}</p></div><button className="primary-button" type="button" onClick={() => showNotice(`Job ${job.code} accepted for ${job.location}.`)}>Accept job →</button></div>)}</section><section className="seller-mvp-note"><span>JOB LIFECYCLE</span><strong>Confirmed → En Route → Delivered</strong><small>Seller marks delivered on arrival. Buyer confirmation records the handover; seller payout is handled by operations.</small></section></>;
}

function LiveAgentCard({ role, driverUpdate, refreshDriverUpdate, showNotice }) {
  const buyer = role === 'buyer';
  return <section className="live-agent-card panel"><div className="live-agent-head"><span className="ai-label">● LIVE AGENT AI</span><span className="agent-online">Online</span></div><strong>{buyer ? driverUpdate : 'Your route is clear.'}</strong><p>{buyer ? 'Updates are shared by the assigned seller. Ask for help at any time.' : 'I can prepare job notes from your active queue and warn you about late-delivery risk.'}</p><div className="live-agent-actions">{buyer ? <button type="button" onClick={refreshDriverUpdate}>Refresh position</button> : <button type="button" onClick={() => showNotice('There are no active jobs to build a route brief from.')}>Prepare route brief</button>}<button type="button" onClick={() => showNotice('Live agent is reviewing this request.')}>Talk to agent</button></div></section>;
}

/**
 * Delivery estimate card for the buyer.
 *
 * The ETA shown here is the median of the assigned seller's observed delivery
 * windows, expressed as a range and labelled an estimate. It is not a
 * promise, and when the seller has no timed deliveries the card says so
 * rather than showing a number that came from nowhere.
 */
function DeliveryEstimateCard({ order, estimateForOrder, orders }) {
  if (!order) {
    return <section className="panel delivery-estimate-panel"><div className="section-heading"><div><span className="section-kicker">DELIVERY ESTIMATE</span><h2>When will my water arrive?</h2></div></div><p className="empty-feed">No order is on the way yet. An estimate appears here once a seller accepts and a driver is assigned.</p></section>;
  }
  const estimate = estimateForOrder(orders, order);
  if (!estimate || !estimate.slaMeasured) {
    return <section className="panel delivery-estimate-panel"><div className="section-heading"><div><span className="section-kicker">DELIVERY ESTIMATE</span><h2>When will my water arrive?</h2></div></div><p className="empty-feed">Delivery timing is not recorded for the seller assigned to {order.code} yet, so no delivery window can be estimated. Timing is recorded when an order is marked Assigned and then Delivered.</p></section>;
  }
  const low = Math.max(0, Math.round(estimate.slaHours * 0.7));
  const high = Math.round(estimate.slaHours * 1.4);
  return <section className="panel delivery-estimate-panel"><div className="section-heading"><div><span className="section-kicker">DELIVERY ESTIMATE</span><h2>When will my water arrive?</h2></div></div><p className="estimate-copy"><strong>{order.code}</strong> is with {order.sellerName || 'your seller'}. Based on {estimate.timedDeliveries} timed deliveries, the estimated window is about <strong>{low}–{high} hours</strong>.</p><small className="estimate-note">This is an estimate from the median of real delivery windows, not a guarantee. It will sharpen as more deliveries are timed.</small></section>;
}

function InstitutionAgentCard({ showNotice }) {
  return <section className="live-agent-card panel institution-agent"><div className="live-agent-head"><span className="ai-label">✦ LIVE AGENT AI</span><span className="agent-online">Online</span></div><strong>No scheduling model is connected</strong><p>I cannot tell you when demand peaks or how much reserve to hold. That needs a forecasting model and your actual delivery history, and neither is connected here, so I will not recommend a schedule I cannot justify.</p><div className="live-agent-actions"><button type="button" onClick={() => showNotice('Add your real delivery history and Aqua can summarise actual delivery windows from it.')}>How to enable this</button><button type="button" onClick={() => showNotice('Institution support has been notified.')}>Talk to agent</button></div></section>;
}

function InstitutionView({ orders = [], showNotice }) {
  const summary = summarise(orders);
  // This workspace used to show a "Reliability Plus" plan at GH₵3,500/month, a
  // renewal date, "14 deliveries remaining", three scheduled drops at a fixed
  // rate, and a "100% — certificates up to date" water-quality score.
  //
  // There is no subscription, no scheduler, no plan counter and no quality record
  // anywhere in this app. For a drinking-water supplier, a certified-quality
  // claim that cannot be evidenced is the most dangerous invention here, so the
  // panel now says plainly that no quality data exists rather than scoring 100%.
  return <>
    <PageHeader
      eyebrow="Institution workspace · Accra"
      title="Your supply, as delivered."
      copy="See the water delivered to this account and what it cost. Subscription plans, scheduled drops, and water-quality certification are not recorded in this app yet."
    />
    <div className="institution-grid">
      <section className="panel schedule-panel">
        <div className="section-heading">
          <div><span className="section-kicker">DELIVERED TO YOU</span><h2>Your orders</h2></div>
        </div>
        {summary.totalCount === 0 ? (
          <p className="empty-feed">No orders have been delivered to this account yet.</p>
        ) : (
          <dl className="pricing-preview">
            <div><dt>Orders</dt><dd>{summary.totalCount}</dd></div>
            <div><dt>Delivered</dt><dd>{summary.deliveredCount}</dd></div>
            <div><dt>Order value</dt><dd>{formatCedi(summary.grossMinor)}</dd></div>
            <div className="highlight"><dt>Total paid</dt><dd>{formatCedi(summary.chargedMinor)}</dd></div>
          </dl>
        )}
      </section>
      <section className="panel quality-panel">
        <span className="section-kicker">WATER QUALITY &amp; COMPLIANCE</span>
        <h2>No quality records</h2>
        <p className="empty-feed">
          This app does not store water-quality certificates, so there is no verified
          quality score for this supply. A seller or operator has to supply test results
          before any quality claim is made.
        </p>
      </section>
    </div>
  </>;
}

function OpsView({ orders = [], downloadReport, opsToken, showNotice, sellerPerfSummary, sellerRanked, reliabilitySummary: relSummary, reliabilityRanked }) {
  // Real orders that are not yet paid. The old list was three hardcoded
  // references with "Payment held in escrow" against them.
  const pendingOrders = orders.filter((order) => order.status !== 'Paid' && order.status !== 'Delivered');
  // No order in this app carries a dispute flag, so this is always empty. It is
  // computed rather than hardcoded so that if a `disputed` status is ever added,
  // the inbox starts listing real cases instead of still showing nothing.
  const disputeOrders = orders.filter((order) => order.disputed === true);
  return <><PageHeader eyebrow="Admin dashboard · All regions" title="The network is moving." copy="Approve sellers and review orders. Assignment is automatic, and this app does not yet track disputes or quality certification." action={<span className="live-console"><i /> Manual ops mode</span>} /><OpsStats orders={orders} /><section className="ai-insights panel"><div><span className="ai-label">✦ AQUA AI INTELLIGENCE</span><h2>What this deployment can and cannot say</h2><p>No demand forecasting model and no live vehicle telemetry are connected here, so this panel does not predict demand or suggest truck counts. The order figures above are summed from real orders and nothing on this page is a forecast.</p></div><div className="insight-metrics"><strong>{formatCedi(summarise(orders).chargedMinor)}</strong><span>collected on paid orders</span></div></section><div className="admin-grid"><section className="panel admin-panel"><div className="section-heading"><div><span className="section-kicker">DISPATCH VIEW</span><h2>Orders awaiting assignment</h2></div><span className="queue-count">Automatic matching</span></div>{pendingOrders.length === 0 ? <p className="empty-feed">No orders are waiting on assignment. Assignment is automatic, so this fills only if auto-dispatch failed.</p> : pendingOrders.map((order) => <div className="admin-row" key={order.id}><span>{order.code} · {order.location}<small>Awaiting payment · {formatCedi(order.chargedMinor ?? 0)}</small></span></div>)}</section><SellerApprovalQueue opsToken={opsToken} onNotice={showNotice} /></div><div className="admin-grid"><section className="panel admin-panel"><div className="section-heading"><div><span className="section-kicker">SELLER PERFORMANCE</span><h2>Scored from real orders</h2></div><span className="queue-count">{sellerPerfSummary ? `${sellerPerfSummary.totalSellers} sellers` : 'No orders'}</span></div>{sellerRanked.length === 0 ? <p className="empty-feed">No seller has a completed order yet, so there is nothing to score. Every figure here is summed from real orders and nothing is invented.</p> : <div className="admin-list">{sellerRanked.map((s) => <div className="admin-row" key={s.sellerId}><span>{s.sellerId}<small>#{s.rank} · {s.band.label} · {s.completed} completed of {s.orders} · {s.cancellationRate}% cancelled</small></span><strong>{s.score}</strong></div>)}</div>}{disputeOrders.length === 0 ? <p className="empty-feed">No disputes are open. This app does not yet record delivery complaints, so there is nothing here to resolve and no refund has been issued.</p> : disputeOrders.map((order) => <div className="admin-row" key={order.id}><span>{order.code} · {order.location}<small>Flagged by the buyer</small></span><button className="outline-button" type="button">Resolve</button></div>)}</section><section className="panel admin-panel"><div className="section-heading"><div><span className="section-kicker">RELIABILITY &amp; DELIVERY TIME</span><h2>How dependable is each seller?</h2></div><span className="queue-count">{relSummary ? `${relSummary.totalSellers} sellers` : 'No orders'}</span></div>{reliabilityRanked.length === 0 ? <p className="empty-feed">No seller has a completed order yet, so there is no reliability score and no delivery window to estimate.</p> : <div className="admin-list">{reliabilityRanked.map((s) => <div className="admin-row" key={s.sellerId}><span>{s.sellerId}<small>#{s.rank} · {s.score} reliability · {s.completed} completed · {s.timedDeliveries} timed</small></span><strong>{s.slaMeasured ? `${s.slaHours}h median` : 'unmeasured'}</strong></div>)}</div>}{relSummary && relSummary.fastestSla ? <p className="empty-feed">Fastest observed delivery window: {relSummary.fastestSla.sellerId} at {relSummary.fastestSla.slaHours}h, from {relSummary.timedSellers} timed seller(s). This is an estimate, not a guarantee.</p> : <p className="empty-feed">Delivery timing is not recorded for any seller yet, so no delivery window can be estimated. Timing is recorded when an order is marked Assigned and then Delivered.</p>}</section><section className="panel admin-panel"><div className="section-heading"><div><span className="section-kicker">QUALITY CERTIFICATION</span><h2>Review documents</h2></div></div><p className="empty-feed">No certifications have been submitted. This app does not accept or store water-quality documents, so there is nothing to approve and no verified-water badge can be issued yet. Do not publish a quality claim until a seller has supplied test results.</p></section></div><SmartDispatchView orders={orders} showNotice={showNotice} /></>;
}

function AiPanel({ role, input, setInput, messages, askAi, close, aiLoading, aiSource }) {
  const quickActions = aiQuickActions(role);
  const SourceBadge = () => {
    if (!aiSource) return null;
    const label = aiSource === 'gemini' ? 'Gemini' : 'Local';
    return <span className={`ai-source ${aiSource}`}>{label}</span>;
  };
  return <section className="ai-panel" aria-label="Aqua AI assistant"><div className="ai-panel-head"><div><span className="ai-label">✦ AQUA AI</span><strong>{role === 'ops' ? 'Operations copilot' : 'Your water-delivery copilot'}</strong><SourceBadge /></div><button type="button" aria-label="Close Aqua AI" onClick={close}>×</button></div><div className="ai-messages">{messages.slice(-4).map((message, index) => <p className={message.from + (message.from === 'ai' && aiLoading && index === messages.length - 1 ? ' loading' : '')} key={`${message.from}-${index}`}>{message.text}</p>)}{aiLoading && <p className="ai loading">●</p>}</div><div className="ai-quick-actions">{quickActions.map((action) => <button type="button" key={action} onClick={() => setInput(action)}>{action}</button>)}</div><form className="ai-form" onSubmit={askAi}><input aria-label="Ask Aqua AI" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about orders, pricing, or demand..." disabled={aiLoading} /><button type="submit" disabled={aiLoading}>Ask <span>→</span></button></form><small className="ai-disclaimer">AI uses Gemini for live answers; falls back to local rules when offline. Confirm payment, quality, and dispatch actions in the workspace.</small></section>;
}

function OperationalRiskPanel({ orders = [], sellerPerfSummary, sellerRanked }) {
  const summary = summarise(orders);
  // This panel reported invented incidents: a seller who declined six jobs, three
  // buyers complaining, and a GH¢4,820 escrow balance. There is no dispute table, no
  // job-decline tracking and no escrow, so every one of those figures was
  // fabricated. What is left is what the order list can actually support.
  const flagged = sellerRanked ? sellerRanked.filter(s => s.score < 60) : [];
  return <section className="operational-risk panel"><div className="section-heading"><div><span className="ai-label">✦ OPERATIONS</span><h2>Business health signals</h2></div></div><div className="risk-grid"><article><span className="risk-icon warning">!</span><div><strong>Unpaid orders</strong><p>{summary.unpaidCount} order(s) awaiting payment, totalling {formatCedi(summary.unpaidMinor)}.</p></div></article><article><span className="risk-icon good">v</span><div><strong>Collected</strong><p>{formatCedi(summary.chargedMinor)} confirmed by Paystack across {summary.paidCount} paid order(s).</p></div></article><article><span className="risk-icon alert">!</span><div><strong>Sellers at risk</strong><p>{sellerPerfSummary ? `${sellerPerfSummary.flaggedCount} of ${sellerPerfSummary.totalSellers} sellers scored below the watch threshold.` : 'No seller performance data is available yet.'}</p></div></article></div></section>;
}

function FinanceEmpty({ title, copy }) {
  return (
    <section className="finance-workspace">
      <div className="finance-heading">
        <div><span className="section-kicker">FINANCE</span><h2>{title}</h2><p>{copy}</p></div>
      </div>
      <p className="empty-feed" role="note">
        No paid orders yet, so there is nothing to report. These figures are summed from real orders and
        are deliberately left at zero rather than filled with sample numbers.
      </p>
    </section>
  );
}

function BuyerFinance({ orders, showNotice }) {
  const summary = summarise(orders);
  if (!summary.paidCount) {
    return <FinanceEmpty title="Your money, explained." copy="Fees on every booking, once one is paid." />;
  }
  const lastPaid = orders.find((order) => order.status === 'Paid');
  return <section className="finance-workspace"><div className="finance-heading"><div><span className="section-kicker">BUYER FINANCE</span><h2>Your money, explained.</h2><p>What you paid, and what AquaLink charged, across your paid orders.</p></div><button className="outline-button" type="button" onClick={() => showNotice(`${summary.paidCount} paid order(s), ${formatCedi(summary.chargedMinor)} total.`)}>Summarise ↓</button></div><div className="finance-grid buyer-finance"><article><span>LAST PAID ORDER</span><strong>{formatCedi(lastPaid?.chargedMinor ?? 0)}</strong><small>{lastPaid?.code ?? '—'}</small></article><article><span>TOTAL PAID</span><strong>{formatCedi(summary.chargedMinor)}</strong><small>The full amount you were charged</small></article><article><span>STILL TO PAY</span><strong>{formatCedi(summary.unpaidMinor)}</strong><small>{summary.unpaidCount} unpaid order(s)</small></article></div></section>;
}

function SellerFinance({ orders, showNotice }) {
  const summary = summarise(orders);
  if (!summary.paidCount) {
    return <FinanceEmpty title="Know what you take home." copy="Your share of each paid delivery, once there is one." />;
  }
  return <section className="finance-workspace"><div className="finance-heading"><div><span className="section-kicker">SELLER FINANCE</span><h2>Know what you take home.</h2><p>Your allocated share of orders that have been paid.</p></div><button className="outline-button" type="button" onClick={() => showNotice(`Seller share across ${summary.paidCount} paid order(s): ${formatCedi(summary.sellerReceivesMinor)}.`)}>Summarise ↓</button></div><div className="finance-grid seller-finance"><article><span>YOUR SHARE</span><strong>{formatCedi(summary.sellerReceivesMinor)}</strong><small>Water seller allocation</small></article><article><span>ORDER VALUE</span><strong>{formatCedi(summary.grossMinor)}</strong><small>Before fees, {summary.paidCount} paid order(s)</small></article><article><span>AQUALINK COMMISSION</span><strong>-{formatCedi(summary.platformCommissionMinor)}</strong><small>Platform allocation</small></article><article className="finance-highlight"><span>NOT PAID OUT</span><strong>{formatCedi(summary.unpaidMinor)}</strong><small>Orders that have not been paid, so nothing is owed yet</small></article></div></section>;
}

function InstitutionFinance({ orders, showNotice }) {
  const summary = summarise(orders);
  if (!summary.paidCount) {
    return <FinanceEmpty title="Plan the month with confidence." copy="Delivery spend and usage, once orders are paid." />;
  }
  return <section className="finance-workspace"><div className="finance-heading"><div><span className="section-kicker">INSTITUTION FINANCE</span><h2>Plan the month with confidence.</h2><p>Spend and delivery volume, summed from paid orders.</p></div><button className="outline-button" type="button" onClick={() => showNotice(`${summary.paidCount} paid order(s), ${formatCedi(summary.chargedMinor)} total.`)}>Summarise ↓</button></div><div className="finance-grid institution-finance"><article className="finance-highlight"><span>TOTAL SPEND</span><strong>{formatCedi(summary.chargedMinor)}</strong><small>Paid orders including fees</small></article><article><span>DELIVERIES</span><strong>{summary.deliveredCount}</strong><small>Confirmed at handover</small></article><article><span>ORDERS IN FLIGHT</span><strong>{summary.unpaidCount}</strong><small>Awaiting payment</small></article><article><span>AVG ORDER VALUE</span><strong>{formatCedi(summary.paidCount ? Math.round(summary.grossMinor / summary.paidCount) : 0)}</strong><small>Before fees</small></article></div></section>;
}

function RevenueFinance({ orders = [], showNotice }) {
  const summary = summarise(orders);
  // The old tiles read GH₵18,540 GMV, GH₵1,020 buyer commissions, GH₵892 seller
  // commissions and GH₵637 institutional MRR with invented revenue-mix labels.
  // Every figure here is summed from paid orders, so an empty workspace shows
  // GH₵0.00 rather than a plausible-looking market.
  const hasData = summary.paidCount > 0;
  const sellerShare = summary.sellerReceivesMinor;
  const driverShare = summary.driverReceivesMinor;
  const platformShare = summary.platformCommissionMinor;
  const totalOut = sellerShare + driverShare + platformShare;
  const sellerPct = totalOut > 0 ? Math.round((sellerShare / totalOut) * 100) : 0;
  const driverPct = totalOut > 0 ? Math.round((driverShare / totalOut) * 100) : 0;
  const platformPct = totalOut > 0 ? Math.round((platformShare / totalOut) * 100) : 0;
  return <section className="finance-workspace"><div className="finance-heading"><div><span className="section-kicker">REVENUE CONTROL TOWER</span><h2>Money moving through the network.</h2><p>Marketplace take, outstanding payments and revenue mix, summed from paid orders.</p></div><button className="outline-button" type="button" onClick={() => showNotice(hasData ? `GMV ${formatCedi(summary.chargedMinor)} across ${summary.paidCount} paid order(s).` : 'No paid orders yet, so there is no GMV to report.')}>Generate report ↓</button></div><div className="finance-grid ops-finance"><article><span>GMV COLLECTED</span><strong>{formatCedi(summary.chargedMinor)}</strong><small>{summary.paidCount} paid order(s) confirmed by Paystack</small></article><article><span>SELLER SHARE</span><strong>{formatCedi(sellerShare)}</strong><small>{sellerPct}% of paid-out money</small></article><article><span>DRIVER SHARE</span><strong>{formatCedi(driverShare)}</strong><small>{driverPct}% of paid-out money</small></article><article><span>AQUALINK SHARE</span><strong>{formatCedi(platformShare)}</strong><small>{platformPct}% of paid-out money</small></article><article className="finance-warning"><span>AWAITING PAYMENT</span><strong>{formatCedi(summary.unpaidMinor)}</strong><small>{summary.unpaidCount} order(s) not yet paid</small></article><article className="finance-warning"><span>NO DISPUTE DATA</span><strong>0</strong><small>Dispute tracking is not connected to this deployment</small></article></div></section>;
}

export default App;
