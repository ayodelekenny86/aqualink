import { useEffect, useRef } from 'react';
import ContactButtons, { orderMessage } from './ContactButtons';

/**
 * Order detail with a delivery timeline.
 *
 * The timeline is derived from the order's status rather than stored as a
 * separate history table: every earlier step is completed and everything after
 * the current status is pending. That keeps the two representations from
 * drifting apart, which is the usual failure mode of hand-maintained
 * step-by-step state.
 */

const FLOW = [
  { status: 'Placed', label: 'Order placed' },
  { status: 'Accepted', label: 'Driver accepted' },
  { status: 'Picked Up', label: 'Picked up' },
  { status: 'En Route', label: 'Out for delivery' },
  { status: 'Delivered', label: 'Delivered' },
];

function currentStep(order) {
  const index = FLOW.findIndex((step) => step.status === order?.status);
  return index === -1 ? 0 : index;
}

export default function OrderDetailModal({ order, onClose, onContactBuyer, buyerPhone, onShowNotice }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!order) return null;

  const reached = currentStep(order);
  const message = orderMessage({
    code: order.code ?? order.id,
    location: order.location,
    volume: order.volume,
    status: order.status,
    eta: order.eta,
  });

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="order-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${order.code ?? order.id} details`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="order-modal-head">
          <div>
            <p className="section-kicker">ORDER DETAIL</p>
            <h2>{order.code ?? order.id}</h2>
          </div>
          <button ref={closeRef} type="button" className="modal-close" aria-label="Close order details" onClick={onClose}>×</button>
        </header>

        <dl className="order-facts">
          <div><dt>Location</dt><dd>{order.location ?? '—'}</dd></div>
          <div><dt>Volume</dt><dd>{order.volume ?? '—'}</dd></div>
          <div><dt>Status</dt><dd><i className={`status ${String(order.status ?? '').toLowerCase().replace(/\s+/g, '-')}`}>{order.status}</i></dd></div>
          <div><dt>Payment</dt><dd>{order.payment ?? '—'}</dd></div>
          {order.price && <div><dt>Price</dt><dd>{order.price}</dd></div>}
          {order.driverName && <div><dt>Driver</dt><dd>{order.driverName}</dd></div>}
        </dl>

        <section className="order-timeline" aria-label="Delivery timeline">
          <h3>Delivery timeline</h3>
          <ol>
            {FLOW.map((step, index) => {
              const state = index < reached ? 'done' : index === reached ? 'current' : 'pending';
              return (
                <li className={state} key={step.status}>
                  <span className="timeline-marker" aria-hidden="true">{state === 'done' ? '✓' : index + 1}</span>
                  <span className="timeline-label">
                    <b>{step.label}</b>
                    {state === 'current' && <small>In progress</small>}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <footer className="order-modal-foot">
          {onContactBuyer && buyerPhone ? (
            <ContactButtons
              phone={buyerPhone}
              name={order.buyerName ?? 'buyer'}
              message={message}
              label="Message buyer"
            />
          ) : (
            <ContactButtons message={message} label="Contact support" />
          )}
          {onShowNotice && <button type="button" className="outline-button" onClick={() => onShowNotice(`Share link copied for ${order.code ?? order.id}.`)}>Share order</button>}
        </footer>
      </div>
    </div>
  );
}
