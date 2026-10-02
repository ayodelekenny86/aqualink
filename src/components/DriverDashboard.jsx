/**
 * The driver app.
 *
 * A driver's whole job on this platform is: see what is available, claim it,
 * tell the buyer where he is, and close the delivery against the code the buyer
 * holds. This screen is those four things and nothing else.
 *
 * The WhatsApp link is on every job card rather than buried in a menu, because
 * the moment a driver needs it is at a gate with a full tank and no signal to
 * open a settings page.
 */

import { useMemo, useState } from 'react';
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
} from '../lib/driver';

const STATUS_CLASS = {
  'Awaiting payment': 'status-awaiting',
  Assigned: 'status-assigned',
  'Picked Up': 'status-pickedup',
  'En Route': 'status-enroute',
  Delivered: 'status-delivered',
};

function Stepper({ status }) {
  const current = stepIndex(status);
  // An order awaiting payment has not entered the progression at all, so no
  // steps are shown rather than a row of greyed-out ones implying a plan.
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

function DriverJobCard({ order, onAccept, onAdvance, onComplete, onReject, busyOrderId }) {
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
  const [showCompleted, setShowCompleted] = useState(false);

  const driver = useMemo(
    () => resolveDriver(driverIdentifier, fleetDrivers),
    [driverIdentifier, fleetDrivers],
  );

  const mine = useMemo(() => driverOrders(driver, orders), [driver, orders]);
  const stats = useMemo(() => driverStats(driver, orders), [driver, orders]);

  const available = mine.filter((order) => order.status === 'Awaiting payment');
  const active = mine.filter((order) => ['Assigned', 'Picked Up', 'En Route'].includes(order.status));
  const completed = mine.filter((order) => order.status === 'Delivered');

  // A registered driver who is not on the fleet roster has no jobs by
  // definition. Saying so plainly is better than rendering an empty feed that
  // looks like a quiet day.
  if (!driver) {
    // A Google or Facebook driver signed in with an email, which dispatch
    // matches by phone. Offer to link the driver phone (the one Ops registered)
    // so resolveDriver can find them on the roster. If the account is local but
    // still not rostered, there is nothing to link.
    const isSocialDriver = driverIdentifier?.includes('@') && linkDriverPhone;
    if (!isSocialDriver) {
      return (
        <section className="access-gate panel" data-testid="driver-not-rostered">
          <span className="access-lock">⚑</span>
          <p className="eyebrow">Driver workspace</p>
          <h1>Not on the driver roster yet.</h1>
          <p>
            This account is signed in as a driver, but its number is not on the fleet roster, so no
            deliveries can be assigned to it. AquaLink Ops adds drivers to the roster before their
            first job.
          </p>
          <p><strong>Signed in as</strong> {driverName || driverIdentifier || 'this account'}</p>
        </section>
      );
    }

    return (
      <section className="access-gate panel" data-testid="driver-link-phone">
        <span className="access-lock">⇢</span>
        <p className="eyebrow">Link your driver phone</p>
        <h1>Sign in to see your deliveries.</h1>
        <p>
          You signed in with an email address. AquaLink matches drivers to deliveries by
          phone number, so enter the driver phone Ops registered for you.
        </p>
        <form
          className="driver-link-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const input = event.target.elements.driverPhone;
            const result = await linkDriverPhone(input.value.trim());
            if (!result?.ok) {
              showNotice(result?.error || 'Could not link that phone number.');
            }
          }}
        >
          <input
            aria-label="Driver phone number"
            name="driverPhone"
            placeholder="e.g. 0545009046"
            inputMode="tel"
          />
          <button className="primary-button full" type="submit">Link phone →</button>
        </form>
      </section>
    );
  }

  return (
    <div className="driver-workspace">
      <div className="page-header">
        <div>
          <p className="section-kicker">DRIVER WORKSPACE · {driver.base?.split(',')[0]?.toUpperCase() || 'ACCRA'}</p>
          <h1>Hello, {driverName?.split(' ')[0] || driver.name}.</h1>
          <p>Claim a job, tell the buyer you are on the way, and close it with their code.</p>
        </div>
        {onRefresh && (
          <button
            className="outline-button driver-refresh"
            type="button"
            aria-label="Refresh driver feed"
            onClick={onRefresh}
          >
            ↻ Refresh
          </button>
        )}
      </div>

      <div className="driver-stats-bar">
        <article><span>AVAILABLE</span><strong>{stats.available}</strong><small>Waiting to be claimed</small></article>
        <article><span>ACTIVE</span><strong>{stats.active}</strong><small>Jobs in progress</small></article>
        <article><span>COMPLETED</span><strong>{stats.completed}</strong><small>Delivered all time</small></article>
        <article className="driver-earnings"><span>EARNED</span><strong>{formatCedi(stats.earningsMinor)}</strong><small>Your share of delivered jobs</small></article>
      </div>

      <section className="panel driver-feed">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">ACTIVE DELIVERIES</span>
            <h2>{active.length} in progress</h2>
          </div>
        </div>

        {active.length === 0 ? (
          <p className="empty-feed">No deliveries in progress. Claim one from the available feed below.</p>
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

      <section className="panel driver-feed">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">AVAILABLE NEAR YOU</span>
            <h2>{available.length} to claim</h2>
          </div>
        </div>

        {available.length === 0 ? (
          <p className="empty-feed">
            Nothing available right now. New orders appear here as soon as they are paid.
          </p>
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

      <section className="panel driver-feed">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">COMPLETED</span>
            <h2>{completed.length} delivered</h2>
          </div>
          <button className="outline-button" type="button" onClick={() => setShowCompleted(!showCompleted)}>
            {showCompleted ? 'Hide' : 'Show'}
          </button>
        </div>
        {showCompleted && (
          completed.length === 0 ? (
            <p className="empty-feed">No completed deliveries yet.</p>
          ) : (
            <div className="driver-job-list">
              {completed.slice(0, 15).map((order) => (
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
    </div>
  );
}