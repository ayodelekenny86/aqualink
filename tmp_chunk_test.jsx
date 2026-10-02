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

  const { aiOpen, toggleAi, closeAi, aiInput, setAiInput, aiMessages, askAi } = useAquaAi({
    language,
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

  return (
    <div className="app-shell">
      {/* The mobile tab bar is always in the DOM and hidden with CSS above the
          breakpoint, rather than being mounted from a media query. A JS width
          check would render nothing for the first frame on a phone and shift
          the layout, and it cannot know the width before layout anyway. */}
      <nav className="mobile-tabs" aria-label="Workspaces">
        {roles.map(([key, label]) => (
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
          {roles.map(([key, label, description]) => (
            <button className={`role-button ${role === key ? 'active' : ''}`} key={key} type="button" onClick={() => selectRole(key)}>
              <span className={`role-icon ${key}`} aria-hidden="true">{ROLE_ICONS[key]}</span>
              <span><b>{label}</b><small>{description}</small></span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom"><button className="sidebar-link" type="button" onClick={() => showNotice('Help request received. Our support team will call you back shortly.')}><span>?</span>Help & support</button><div className="profile"><span className="avatar">AK</span><span><b>Alex K.</b><small>Accra, Ghana</small></span><span className="more">•••</span></div></div>
      </aside>

      <main className="main-content" id="main">
export default null;
