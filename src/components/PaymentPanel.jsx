import { useEffect, useMemo, useState } from 'react';
import {
  buildReceipt,
  downloadReceipt,
  initialisePayment,
  listReceipts,
  referenceFromLocation,
  saveReceipt,
  verifyPayment,
} from '../lib/payments';
import { formatCedi } from '../lib/money';

/**
 * Mobile-money checkout via Paystack, and receipts.
 *
 * The flow is a redirect, not a fake inline confirm:
 *
 *   1. Ask the server to create a transaction. It returns a Paystack URL and
 *      `status: 'pending'`.
 *   2. Send the browser to Paystack, where the customer authorises the charge.
 *   3. Paystack sends them back to `/#/payment/return?reference=...`.
 *   4. On return, ask the server what happened. The server queries Paystack and
 *      compares the result to the stored order; only that answer can set the
 *      receipt.
 *
 * If the buyer closes the tab at step 2, or Paystack declines, the order stays
 * unpaid and the panel says so. There is no path here that marks an order paid
 * because a timer elapsed.
 */
export default function PaymentPanel({ order, onPaid, showNotice }) {
  const [email, setEmail] = useState(order?.email ?? '');
  const [provider, setProvider] = useState('paystack');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [history, setHistory] = useState(() => listReceipts());

  const isPaid = order?.status === 'Paid' || Boolean(receipt);
  const chargedMinor = order?.chargedMinor ?? 0;
  const serviceChargeMinor = order?.buyerServiceCharge ?? 0;

  // Handle the return leg of the redirect. Keyed on the reference so a repeat
  // render does not re-query Paystack for the same transaction.
  const returnReference = useMemo(() => referenceFromLocation(), []);
  const [checkedReference, setCheckedReference] = useState('');

  useEffect(() => {
    if (!returnReference || returnReference === checkedReference || !order) return;
    setCheckedReference(returnReference);
    setBusy(true);
    setError('');

    verifyPayment({ reference: returnReference })
      .then((result) => {
        if (!result.settled) {
          // Explicitly not settled, which covers declined, abandoned, and
          // "the amount did not match". Never reported as success.
          setNotice(`Payment not completed (${result.reason ?? 'no confirmation'}). Nothing was taken.`);
          return;
        }
        // The server names the order it settled. The panel can be showing a
        // different one — the workspace picks whichever order is still
        // outstanding — and a receipt built from the wrong order would name
        // the wrong reference, location and amount on a document the customer
        // keeps. The money is genuinely paid either way; only the paperwork
        // would be false.
        const settledId = result.orderId ?? order.id ?? order.code;
        if (settledId && (order.id ?? order.code) !== settledId) {
          setNotice(`Payment of ${formatCedi(result.amountMinor ?? 0)} was received for order ${settledId}. Open that order to download its receipt.`);
          return;
        }
        const built = buildReceipt({ order, payment: result, breakdown: result.breakdown });
        saveReceipt(built);
        setReceipt(built);
        setHistory(listReceipts());
        onPaid?.(order.id, built);
        showNotice?.('Payment confirmed. Receipt ready.');
      })
      .catch((caught) => setError(caught.message))
      .finally(() => setBusy(false));
  }, [returnReference, checkedReference, order, onPaid, showNotice]);

  if (!order) {
    return (
      <section className="payment-panel panel" aria-label="Payment">
        <h2>Checkout</h2>
        <p className="empty-feed">Place a booking to pay for it.</p>
      </section>
    );
  }

  async function handlePay(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const initiated = await initialisePayment({ orderId: order.id ?? order.code, email, provider });

      if (initiated.alreadyPaid) {
        setNotice('This order is already paid.');
        return;
      }
      // Hand the browser to the chosen provider. No further outcome is assumed
      // here; the return leg above decides what happened.
      window.location.assign(initiated.authorizationUrl);
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  }

  return (
    <section className="payment-panel panel" aria-label="Payment and receipts">
      <div className="panel-title">
        <div>
          <span className="section-kicker">PAYMENT</span>
          <h2>Pay with mobile money</h2>
        </div>
        {isPaid ? <span className="mode-pill live">Paid</span> : <span className="mode-pill pending">Unpaid</span>}
      </div>

      <dl className="payment-summary">
        <div><dt>Order value</dt><dd>{formatCedi(order.grossMinor ?? 0)}</dd></div>
        {/* Only shown when a charge is actually configured. The default plan has
            none, because the customer pays the discounted price inclusive, and a
            GH¢0.00 line under "Order value" reads like a fee they were charged. */}
        {serviceChargeMinor > 0 && (
          <div><dt>Service charge</dt><dd>{formatCedi(serviceChargeMinor)}</dd></div>
        )}
        <div className="total"><dt>You pay</dt><dd>{formatCedi(chargedMinor)}</dd></div>
      </dl>

      {isPaid ? (
        <p className="demo-notice" role="status">This order is paid. A receipt is below.</p>
      ) : (
        <form className="payment-form" onSubmit={handlePay}>
          <label>
            Email for the receipt
            <input
              aria-label="Receipt email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Payment method
            <select
              aria-label="Payment provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              disabled={busy}
            >
              <option value="paystack">Paystack — MTN, Telecel, ATMo, card</option>
              <option value="flutterwave">Flutterwave — MTN Mobile Money, card, bank transfer</option>
            </select>
          </label>
          <p className="form-hint">
            Both providers are live on this deployment and each needs its own key set in the
            Supabase dashboard. The one you pick here is the gateway the money actually flows
            through; the server asks that provider whether money arrived, and only that answer
            can mark the order paid.
          </p>
          <button className="primary-button full" type="submit" disabled={busy}>
            {busy ? 'Working…' : `Pay ${formatCedi(chargedMinor)}`}
          </button>
        </form>
      )}

      {error && <p className="gate-error" role="alert">{error}</p>}
      {notice && <p className="form-hint" role="status">{notice}</p>}

      {receipt && (
        <div className="receipt-card" role="status">
          <h3>Receipt {receipt.reference}</h3>
          <dl>
            <div><dt>Total charged</dt><dd>{receipt.totalCharged}</dd></div>
            <div><dt>Water seller</dt><dd>{receipt.sellerShare}</dd></div>
            <div><dt>Driver</dt><dd>{receipt.driverShare}</dd></div>
            <div><dt>AquaLink</dt><dd>{receipt.platformShare}</dd></div>
          </dl>
          <button className="outline-button" type="button" onClick={() => downloadReceipt(receipt)}>
            Download receipt ↓
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="receipt-history">
          <h3>Past receipts</h3>
          <ul>
            {history.slice(0, 5).map((row) => (
              <li key={row.reference}>
                <span>{row.reference} · {row.totalCharged}</span>
                <button className="text-button" type="button" onClick={() => downloadReceipt(row)}>Download</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
