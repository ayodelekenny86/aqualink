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

/**
 * The statuses this app actually writes, in the order they happen.
 *
 * The previous list used `Placed` and `Accepted`, neither of which any code path
 * ever sets — the real values are `Awaiting payment` and `Assigned`. Because the
 * timeline is derived by looking the current status up in this list, those two
 * names meant the lookup always missed and every order rendered as step 0,
 * "Order placed · In progress", from booking through to delivery.
 */
const FLOW = [
  { status: 'Awaiting payment', label: 'Order placed' },
  { status: 'Assigned', label: 'Driver accepted' },
  { status: 'Picked Up', label: 'Picked up' },
  { status: 'En Route', label: 'Out for delivery' },
  { status: 'Delivered', label: 'Delivered' },
];

function currentStep(order) {
  const index = FLOW.findIndex((step) => step.status === order?.status);
  return index === -1 ? 0 : index;
}

export default function OrderDetailModal({ order, onClose, viewerRole = 'buyer', onShowNotice }) {
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

  // Who this order detail is being read by decides who the contact buttons dial.
  // A buyer wants their driver; a driver or seller wants the buyer; ops wants
  // whoever they need to reach. The old prop was `onContactBuyer`, passed from
  // App as a bare identifier (`onContactBuyer` with no value), which is `true` —
  // so the check passed by accident and the buyer was shown a "Message buyer"
  // button labelled for themselves.
  const viewerIsBuyer = viewerRole === 'buyer';
  const contact = viewerIsBuyer
    ? {
        phone: order.driverPhone,
        whatsapp: order.driverWhatsapp,
        name: order.driverName ?? 'your driver',
        label: 'Message driver',
      }
    : {
        phone: order.buyerPhone,
        whatsapp: order.buyerWhatsapp ?? order.whatsapp,
        name: order.buyerName ?? 'buyer',
        label: 'Message buyer',
      };

  const hasContact = Boolean(contact.phone || contact.whatsapp);

  const message = orderMessage({
    code: order.code ?? order.id,
    location: order.location,
    volume: order.volume,
    status: order.status,
    eta: order.eta,
  });

  // A message from the buyer to the driver reads differently from the same
  // template the other way round. `orderMessage` opens with "this is your
  // AquaLink delivery driver", which is wrong in the buyer's mouth.
  const contactMessage = viewerIsBuyer
    ? [
        'Hello, this is AquaLink. I have ordered water delivery.',
        `Order: ${order.code ?? order.id}`,
        order.location ? `Deliver to: ${order.location}` : '',
        order.volume ? `Volume: ${order.volume}` : '',
        order.status ? `Status: ${order.status}` : '',
      ].filter(Boolean).join('\n')
    : message;

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
          {order.sellerName && <div><dt>Seller</dt><dd>{order.sellerName}</dd></div>}
        </dl>

        {/* The delivery code, shown to whoever can read the order while the
            delivery is in progress. It is what the driver types at the door to
            confirm the water actually changed hands, so it has to be readable on
            the buyer's phone. It is cleared the moment the order is delivered. */}
        {order.confirmCode && order.status !== 'Delivered' && (
          <section className="order-delivery-code" aria-label="Delivery code">
            <p className="section-kicker">{viewerIsBuyer ? 'YOUR DELIVERY CODE' : 'DELIVERY CODE'}</p>
            <strong data-testid="delivery-code">{order.confirmCode}</strong>
            <small>
              {viewerIsBuyer
                ? 'Show this to your driver. They type it to complete the delivery.'
                : 'Read this to the buyer and enter it to complete the delivery.'}
            </small>
          </section>
        )}

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
          {hasContact ? (
            <ContactButtons
              phone={contact.phone}
              whatsapp={contact.whatsapp}
              name={contact.name}
              message={contactMessage}
              label={contact.label}
            />
          ) : (
            <ContactButtons message={contactMessage} label="Contact support" />
          )}
          {onShowNotice && <button type="button" className="outline-button" onClick={() => onShowNotice(`Share link copied for ${order.code ?? order.id}.`)}>Share order</button>}
        </footer>
      </div>
    </div>
  );
}
