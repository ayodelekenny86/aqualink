import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ContactButtons, { orderMessage } from './ContactButtons';
import { formatCedi } from '../lib/money';
import { formatPhoneForDisplay, normalizePhone } from '../lib/accounts';
import {
  DRIVER_STEPS,
  advanceAction,
  driverOrders,
  driverStats,
  resolveDriver,
  stepIndex,
  samePhone,
} from '../lib/driver';
import { list, insert, update, findBy } from '../lib/collections';

const STATUS_CLASS = {
  'Awaiting payment': 'status-awaiting',
  Assigned: 'status-assigned',
  'Picked Up': 'status-pickedup',
  'En Route': 'status-enroute',
  Delivered: 'status-delivered',
};

const TAB_LABELS = [
  { id: 'available', label: 'Available', icon: '⋮' },
  { id: 'active', label: 'Active', icon: '⇢' },
  { id: 'completed', label: 'History', icon: '✓' },
  { id: 'earnings', label: 'Earnings', icon: '₴' },
];

function Stepper({ status }) {
  const current = stepIndex(status);
  if (current < 0) return null;

  return (
    <ol className="driver-stepper" aria-label={`Delivery progress, step ${current + 1} of ${DRIVER_STEPS.length}`}>
      {DRIVER_STEPS.map((step, index) => {
        const isDone = index < current || (index === current && status === 'Delivered');
        return (
          <li key={step.status} className={isDone ? 'done' : index === current ? 'current' : ''}>
            <span className="step-dot" aria-hidden="true">{isDone ? '✓' : index + 1}</span>
            <span className="step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function DriverJobCard({ order, onAccept, onAdvance, onComplete, onReject, busyOrderId, onContact }) {
  const action = advanceAction(order.status);
  const busy = busyOrderId === order.id;
  const message = orderMessage({
    code: order.code ?? order.id,
    location: order.location,
    volume: order.volume,
    status: `I am your driver. Current status: ${order.status}`,
  });

  return (
    <article className="driver-job panel" data-testid={`driver-job-${order.id}`}>
      <div className="driver-job-head">
        <div>
          <strong>{order.code ?? order.id}</strong>
          <small>{order.location || 'No location given'}</small>
        </div>
        <span className={`status ${STATUS_CLASS[order.status] ?? ''}`}>{order.status}</span>
      </div>

      <div className="driver-job-detail">
        <div><span>Volume</span><strong>{order.volume ?? '—'}</strong></div>
        <div><span>Your cut</span><strong>{formatCedi(order.driverReceives ?? 0)}</strong></div>
        <div><span>Buyer</span><strong>{order.buyerName || order.email || 'Buyer'}</strong></div>
        {order.distanceKm && <div><span>Distance</span><strong>{order.distanceKm.toFixed(1)} km</strong></div>}
        {order.eta && <div><span>ETA</span><strong>{order.eta}</strong></div>}
      </div>

      <Stepper status={order.status} />

      <div className="driver-job-actions">
        {order.status === 'Awaiting payment' && (
          <>
            <button className="primary-button" type="button" onClick={() => onAccept(order.id)} disabled={busy}>
              Accept job
            </button>
            <button className="outline-button" type="button" onClick={() => onReject(order.id)} disabled={busy}>
              Skip
            </button>
          </>
        )}
        {action && order.status !== 'En Route' && (
          <button className="primary-button" type="button" onClick={() => onAdvance(order.id, action.status)} disabled={busy}>
            {action.label}
          </button>
        )}
        {order.status === 'En Route' && (
          <button className="primary-button" type="button" onClick={() => onComplete(order.id)} disabled={busy}>
            Enter delivery code
          </button>
        )}
        {order.status === 'Delivered' && (
          <span className="driver-job-done">Delivered. {formatCedi(order.driverReceives ?? 0)} earned.</span>
        )}
        <ContactButtons
          phone={order.buyerPhone}
          name={order.buyerName || 'the buyer'}
          message={message}
          label="Message buyer"
          compact={order.status === 'Delivered'}
        />
      </div>
    </article>
  );
}

function EarningsBreakdown({ driver, orders }) {
  const mine = driverOrders(driver, orders);
  const delivered = mine.filter((o) => o.status === 'Delivered');
  
  const weekly = delivered.filter((o) => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return new Date(o.createdAt || 0) > weekAgo;
  });
  
  const monthly = delivered.filter((o) => {
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return new Date(o.createdAt || 0) > monthAgo;
  });

  const totalEarnings = delivered.reduce((s, o) => s + (o.driverReceives ?? 0), 0);
  const weeklyEarnings = weekly.reduce((s, o) => s + (o.driverReceives ?? 0), 0);
  const monthlyEarnings = monthly.reduce((s, o) => s + (o.driverReceives ?? 0), 0);

  return (
    <section className="panel earnings-breakdown">
      <div className="panel-title">
        <span className="section-kicker">EARNINGS BREAKDOWN</span>
        <h2>{formatCedi(totalEarnings)} total</h2>
      </div>
      <div className="earnings-grid">
        <article className="earnings-card">
          <span>This Week</span>
          <strong>{formatCedi(weeklyEarnings)}</strong>
          <small>{weekly.length} deliveries</small>
        </article>
        <article className="earnings-card">
          <span>This Month</span>
          <strong>{formatCedi(monthlyEarnings)}</strong>
          <small>{monthly.length} deliveries</small>
        </article>
        <article className="earnings-card">
          <span>All Time</span>
          <strong>{formatCedi(totalEarnings)}</strong>
          <small>{delivered.length} deliveries</small>
        </article>
        <article className="earnings-card">
          <span>Avg / Delivery</span>
          <strong>{delivered.length ? formatCedi(Math.round(totalEarnings / delivered.length)) : formatCedi(0)}</strong>
          <small>Per completed job</small>
        </article>
      </div>
      
      <div className="panel-divider" />
      
      <h3>Recent Deliveries</h3>
      <div className="earnings-history">
        {delivered.slice(0, 10).map((order) => (
          <div key={order.id} className="earnings-row">
            <div>
              <strong>{order.code ?? order.id}</strong>
              <small>{new Date(order.createdAt).toLocaleDateString()} · {order.location}</small>
            </div>
            <strong className="positive">{formatCedi(order.driverReceives ?? 0)}</strong>
          </div>
        ))}
        {delivered.length === 0 && <p className="empty-feed">No completed deliveries yet.</p>}
      </div>
    </section>
  );
}

function GPSLocationTracker({ driver, onLocationUpdate, isOnline }) {
  const [location, setLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!isOnline || !('geolocation' in navigator)) return;

    const startTracking = () => {
      setTracking(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newLoc = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: new Date().toISOString(),
          };
          setLocation(newLoc);
          setAccuracy(pos.coords.accuracy);
          onLocationUpdate?.(newLoc);
        },
        (err) => console.warn('GPS error:', err.message),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    };

    startTracking();
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      setTracking(false);
    };
  }, [isOnline, onLocationUpdate]);

  if (!isOnline) return null;

  return (
    <section className="panel gps-tracker">
      <div className="panel-title">
        <span className="section-kicker">LIVE LOCATION</span>
        <h2>{tracking ? '📍 Tracking' : '📍 Paused'}</h2>
      </div>
      <div className="gps-status">
        {location ? (
          <>
            <div className="gps-coords">
              <span>Lat: {location.lat.toFixed(6)}</span>
              <span>Lng: {location.lng.toFixed(6)}</span>
              <span className={`accuracy ${accuracy && accuracy < 50 ? 'good' : accuracy && accuracy < 100 ? 'fair' : 'poor'}`}>
                Accuracy: {accuracy ? Math.round(accuracy) : '—'}m
              </span>
            </div>
            <button className="outline-button" type="button" onClick={() => navigator.clipboard.writeText(`${location.lat},${location.lng}`)}>
              Copy coordinates
            </button>
          </>
        ) : (
          <p className="empty-feed">Acquiring GPS signal…</p>
        )}
      </div>
    </section>
  );
}

export default function DriverDashboard({
  orders,
  fleetDrivers,
  driverIdentifier,
  driverName,
  onAccept,
  onAdvance,
  onComplete,
  onReject,
  showNotice,
  busyOrderId = null,
  linkDriverPhone,
  onRefresh,
}) {
  const [activeTab, setActiveTab] = useState('available');
  const [showCompleted, setShowCompleted] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [lastSync, setLastSync] = useState(Date.now());

  useEffect(() => {
    const handleOnline = () => { setOffline(false); setLastSync(Date.now()); };
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  const driver = useMemo(() => resolveDriver(driverIdentifier, fleetDrivers), [driverIdentifier, fleetDrivers]);
  const mine = useMemo(() => driverOrders(driver, orders), [driver, orders]);
  const stats = useMemo(() => driverStats(driver, orders), [driver, orders]);

  const available = mine.filter((o) => o.status === 'Awaiting payment');
  const active = mine.filter((o) => ['Assigned', 'Picked Up', 'En Route'].includes(o.status));
  const completed = mine.filter((o) => o.status === 'Delivered');

  if (!driver) {
    const isSocialDriver = driverIdentifier?.includes('@') && linkDriverPhone;
    if (!isSocialDriver) {
      return (
        <section className="access-gate panel" data-testid="driver-not-rostered">
          <span className="access-lock">⚑</span>
          <p className="eyebrow">Driver workspace</p>
          <h1>Not on the driver roster yet.</h1>
          <p>This account is signed in as a driver, but its number is not on the fleet roster.</p>
          <p><strong>Signed in as</strong> {driverName || driverIdentifier || 'this account'}</p>
        </section>
      );
    }
    return (
      <section className="access-gate panel" data-testid="driver-link-phone">
        <span className="access-lock">⇢</span>
        <p className="eyebrow">Link your driver phone</p>
        <h1>Sign in to see your deliveries.</h1>
        <p>You signed in with an email. Enter the driver phone Ops registered for you.</p>
        <form className="driver-link-form" onSubmit={async (e) => {
          e.preventDefault();
          const input = e.target.elements.driverPhone;
          const result = await linkDriverPhone(input.value.trim());
          if (!result?.ok) showNotice(result?.error || 'Could not link that phone number.');
        }}>
          <input aria-label="Driver phone number" name="driverPhone" placeholder="e.g. 0545009046" inputMode="tel" />
          <button className="primary-button full" type="submit">Link phone →</button>
        </form>
      </section>
    );
  }

  const tabCounts = useMemo(() => ({
    available: available.length,
    active: active.length,
    completed: completed.length,
    earnings: stats.completed,
  }), [available, active, completed, stats.completed]);

  return (
    <div className="driver-workspace">
      {/* Mobile bottom navigation */}
      <nav className="mobile-bottom-nav" aria-label="Driver tabs">
        {TAB_LABELS.map((tab) => (
          <button
            key={tab.id}
            className={`mobile-nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            type="button"
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="nav-icon" aria-hidden="true">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
            {tabCounts[tab.id] > 0 && <span className="nav-badge" data-testid="nav-badge">{tabCounts[tab.id]}</span>}
          </button>
        ))}
      </nav>

      {/* Offline banner */}
      {offline && (
        <div className="offline-banner" role="alert">
          <span>📴</span>
          <strong>Offline</strong>
          <small>Changes will sync when reconnected. Last sync: {new Date(lastSync).toLocaleTimeString()}</small>
        </div>
      )}

      <div className="page-header">
        <div>
          <p className="section-kicker">DRIVER WORKSPACE · {driver.base?.split(',')[0]?.toUpperCase() || 'ACCRA'}</p>
          <h1>Hello, {driverName?.split(' ')[0] || driver.name}.</h1>
          <p>Claim a job, tell the buyer you are on the way, and close it with their code.</p>
        </div>
        {onRefresh && (
          <button className="outline-button driver-refresh" type="button" aria-label="Refresh driver feed" onClick={onRefresh}>
            ↻ Refresh
          </button>
        )}
      </div>

      {/* Stats bar - always visible */}
      <div className="driver-stats-bar" role="region" aria-label="Driver statistics">
        <article><span>AVAILABLE</span><strong>{stats.available}</strong><small>Waiting to be claimed</small></article>
        <article><span>ACTIVE</span><strong>{stats.active}</strong><small>Jobs in progress</small></article>
        <article><span>COMPLETED</span><strong>{stats.completed}</strong><small>Delivered all time</small></article>
        <article className="driver-earnings"><span>EARNED</span><strong>{formatCedi(stats.earningsMinor)}</strong><small>Your share of delivered jobs</small></article>
      </div>

      {/* GPS Tracker - only on mobile or when active */}
      {active.length > 0 && (
        <GPSLocationTracker 
          driver={driver} 
          isOnline={!offline}
          onLocationUpdate={(loc) => console.log('Driver location:', loc)}
        />
      )}

      {/* Tab panels */}
      {activeTab === 'available' && (
        <section className="panel driver-feed">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">AVAILABLE NEAR YOU</span>
              <h2>{available.length} to claim</h2>
            </div>
          </div>
          {available.length === 0 ? (
            <p className="empty-feed">No available jobs right now. New orders appear here once they are paid.</p>
          ) : (
            <div className="driver-job-list">
              {available.map((order) => (
                <DriverJobCard
                  key={order.id}
                  order={order}
                  onAccept={onAccept}
                  onAdvance={onAdvance}
                  onComplete={onComplete}
                  onReject={onReject}
                  busyOrderId={busyOrderId}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'active' && (
        <section className="panel driver-feed">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">ACTIVE DELIVERIES</span>
              <h2>{active.length} in progress</h2>
            </div>
          </div>
          {active.length === 0 ? (
            <p className="empty-feed">No active deliveries. Claim a job from the available feed to get started.</p>
          ) : (
            <div className="driver-job-list">
              {active.map((order) => (
                <DriverJobCard
                  key={order.id}
                  order={order}
                  onAccept={onAccept}
                  onAdvance={onAdvance}
                  onComplete={onComplete}
                  onReject={onReject}
                  busyOrderId={busyOrderId}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'completed' && (
        <section className="panel driver-feed">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">COMPLETED</span>
              <h2>{completed.length} delivered</h2>
            </div>
            <button className="outline-button" type="button" onClick={() => setShowCompleted(!showCompleted)}>
              {showCompleted ? 'Hide' : 'Show'} history
            </button>
          </div>
          {showCompleted && (
            completed.length === 0 ? (
              <p className="empty-feed">No completed deliveries yet.</p>
            ) : (
              <div className="driver-job-list">
                {completed.slice(0, 20).map((order) => (
                  <DriverJobCard
                    key={order.id}
                    order={order}
                    onAccept={onAccept}
                    onAdvance={onAdvance}
                    onComplete={onComplete}
                    onReject={onReject}
                    busyOrderId={busyOrderId}
                  />
                ))}
              </div>
            )
          )}
        </section>
      )}

      {activeTab === 'earnings' && driver && (
        <EarningsBreakdown driver={driver} orders={orders} />
      )}
    </div>
  );
}