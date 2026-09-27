import { useState } from 'react';
import ContactButtons, { orderMessage } from './ContactButtons';

/**
 * Driver workspace.
 *
 * A driver sees two feeds: unclaimed jobs they can accept in one tap, and the
 * jobs they are currently carrying through the handover steps. Advancing an
 * order emits a notification for the buyer, so the two roles stay in step even
 * though there is no server pushing events.
 */

const NEXT_STEP = {
  Accepted: { status: 'Picked Up', label: 'Picked Up' },
  'Picked Up': { status: 'En Route', label: 'Start Delivery' },
};

const TABS = [
  ['available', 'Available jobs'],
  ['active', 'Active deliveries'],
  ['completed', 'Completed'],
];

export default function DriverView({ orders, onAccept, onAdvance, onComplete, driver, showNotice }) {
  const [tab, setTab] = useState('available');
  const [codes, setCodes] = useState({});

  const available = orders.filter((order) => !order.driverName && ['Placed', 'Confirmed'].includes(order.status));
  const active = orders.filter((order) => order.driverName && order.status !== 'Delivered');
  const completed = orders.filter((order) => order.status === 'Delivered');

  const feeds = { available, active, completed };
  const feed = feeds[tab] ?? [];
  const stats = [
    ['Available', available.length],
    ['Active', active.length],
    ['Completed', completed.length],
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <p className="section-kicker">DRIVER APP · {driver?.region ?? 'Accra'}</p>
          <h1>Ready for the next drop?</h1>
          <p className="page-copy">Accept a job, run the handover steps, and message the buyer directly.</p>
        </div>
        <span className="availability online"><i />Online</span>
      </header>

      <div className="driver-stats" role="group" aria-label="Driver statistics">
        {stats.map(([label, count]) => (
          <div className="driver-stat" key={label}>
            <span>{label.toUpperCase()}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>

      <div className="driver-tabs" role="tablist" aria-label="Driver feeds">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`driver-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
            <em>{(feeds[key] ?? []).length}</em>
          </button>
        ))}
      </div>

      <section className="driver-feed" aria-label={`${tab} orders`}>
        {feed.length === 0 && (
          <p className="empty-feed">
            {tab === 'available' ? 'No unclaimed jobs right now. New orders appear here automatically.' : 'Nothing here yet.'}
          </p>
        )}

        {feed.map((order) => {
          const message = orderMessage({
            code: order.code ?? order.id,
            location: order.location,
            volume: order.volume,
            status: order.status,
            eta: order.eta,
          });
          const next = NEXT_STEP[order.status];

          return (
            <article className="driver-card panel" key={order.id}>
              <div className="driver-card-main">
                <div>
                  <strong className="driver-code">{order.code ?? order.id}</strong>
                  <span className="driver-location">{order.location}</span>
                  <span className="driver-meta">{order.volume} · {order.price}</span>
                </div>
                <i className={`status ${String(order.status ?? '').toLowerCase().replace(/\s+/g, '-')}`}>{order.status}</i>
              </div>

              <div className="driver-card-actions">
                {!order.driverName && (
                  <button className="primary-button" type="button" onClick={() => onAccept(order.id)}>
                    Accept job
                  </button>
                )}

                {next && (
                  <button className="primary-button" type="button" onClick={() => onAdvance(order.id, next.status)}>
                    {next.label}
                  </button>
                )}

                {order.status === 'En Route' && (
                  <form
                    className="driver-otp"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onComplete(order.id, codes[order.id] ?? '');
                    }}
                  >
                    <label htmlFor={`otp-${order.id}`}>Enter buyer delivery code</label>
                    <div className="driver-otp-row">
                      <input
                        id={`otp-${order.id}`}
                        aria-label={`Delivery code for ${order.code ?? order.id}`}
                        value={codes[order.id] ?? ''}
                        onChange={(event) => setCodes({ ...codes, [order.id]: event.target.value })}
                        placeholder="6-digit code"
                        inputMode="numeric"
                        maxLength={6}
                      />
                      <button className="outline-button" type="submit">Confirm delivery</button>
                    </div>
                  </form>
                )}

                {order.status === 'Delivered' && <span className="driver-done">Delivered · escrow released</span>}

                <ContactButtons
                  phone={order.buyerPhone}
                  name={order.buyerName ?? 'buyer'}
                  message={message}
                  label="WhatsApp buyer"
                />
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

export function DriverAccessGate({ onStartSignIn, onConfirmCode, onRegister, identifier, generatedCode, error, accountExists }) {
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState('phone');
  const [otp, setOtp] = useState('');

  // Register or sign in based on whether the number is already in the registry,
  // rather than reacting to an error code after a failed attempt. Either way the
  // next step is the OTP check, which is what actually opens the workspace.
  const known = phone.trim() ? accountExists?.(phone) : null;

  async function handlePhone(event) {
    event.preventDefault();
    if (!known) await onRegister(phone);
    const result = await onStartSignIn(phone);
    if (result?.ok) setStep('otp');
  }

  async function handleVerify(event) {
    event.preventDefault();
    await onConfirmCode(otp);
  }

  if (step === 'otp') {
    return (
      <section className="access-gate panel driver-gate">
        <span className="access-lock">⇢</span>
        <p className="eyebrow">DRIVER APP · VERIFICATION</p>
        <h1>Enter your driver code.</h1>
        <p>We generated a 6-digit code for {identifier ?? phone}.</p>
        <form onSubmit={handleVerify}>
          <input
            aria-label="Driver OTP"
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
            placeholder="6-digit code"
            inputMode="numeric"
            maxLength={6}
          />
          <button className="primary-button" type="submit">Verify code →</button>
        </form>
        {generatedCode && <p className="generated-code">Code: <b data-testid="otp-code">{generatedCode}</b></p>}
        {error && <p className="gate-error" role="alert">{error}</p>}
        <button className="text-button" type="button" onClick={() => setStep('phone')}>Use a different number</button>
      </section>
    );
  }

  return (
    <section className="access-gate panel driver-gate">
      <span className="access-lock">⇢</span>
      <p className="eyebrow">DRIVER APP</p>
      <h1>Sign in to start driving.</h1>
      <p>Drivers accept jobs, run the handover steps, and release escrow with the buyer&apos;s delivery code.</p>
      <form onSubmit={handlePhone}>
        <input
          aria-label="Driver phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Driver phone number"
          inputMode="tel"
        />
        <button className="primary-button" type="submit">
          {known ? 'Send code →' : 'Register and send code →'}
        </button>
      </form>
      {error && <p className="gate-error" role="alert">{error}</p>}
      <small>
        {phone && !known
          ? 'No driver account on that number yet — submitting will create one.'
          : 'New numbers are registered on first sign-in.'}
      </small>
    </section>
  );
}
