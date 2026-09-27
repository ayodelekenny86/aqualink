import { useMemo, useState } from 'react';
import {
  PAYMENT_METHODS,
  buildReceipt,
  downloadReceipt,
  initialisePayment,
  listReceipts,
  paymentMode,
  saveReceipt,
  verifyPayment,
} from '../lib/payments';
import { allocate, formatCedi } from '../lib/money';

/**
 * Mobile-money checkout and receipts.
 *
 * The amount charged is computed here from the same pricing the admin set, so a
 * buyer cannot be shown one figure and charged another. Demo mode is labelled
 * prominently and the resulting receipt carries a "no money was taken" notice,
 * because a demo receipt that looks real is how a business ends up reconciling
 * payments that never happened.
 */
export default function PaymentPanel({ order, pricing, split, onPaid, showNotice }) {
  const [method, setMethod] = useState(PAYMENT_METHODS[0].id);
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [history, setHistory] = useState(() => listReceipts());

  const mode = paymentMode();
  const breakdown = useMemo(() => {
    if (!order) return null;
    const gross = order.grossMinor ?? order.chargedMinor;
    return allocate(gross - Math.round(gross * (split?.buyerServiceCharge ?? 10) / 100), split);
  }, [order, split]);

  if (!order) {
    return <section className="payment-panel panel"><h2>Checkout</h2><p className="empty-feed">Place a booking to pay for it.</p></section>;
  }

  async function handlePay(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const initiated = await initialisePayment({
        orderId: order.code ?? order.id,
        amountMinor: order.chargedMinor,
        network: PAYMENT_METHODS.find((m) => m.id === method)?.network ?? 'mtn',
        accountName,
        accountNumber,
      });

      const settled = await verifyPayment({
        reference: initiated.reference,
        amountMinor: order.chargedMinor,
      });

      if (settled.status !== 'settled') {
        setError('Payment not confirmed. Nothing was taken - please try again.');
        return;
      }

      const built = buildReceipt({ order, breakdown, payment: settled });
      saveReceipt(built);
      setReceipt(built);
      setHistory(listReceipts());
      onPaid?.(order.id, built);
      showNotice?.(settled.simulated ? 'Demo payment settled. No money was taken.' : 'Payment confirmed. Receipt ready.');
    } catch (caught) {
      setError(caught.message);
    } finally {
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
        <span className={`mode-pill ${mode}`}>{mode === 'demo' ? 'Demo mode' : 'Live'}</span>
      </div>

      {mode === 'demo' && (
        <p className="demo-notice" role="note">
          Demo mode: no payments endpoint is configured, so this exercises the full checkout flow without
          taking money. Receipts are watermarked as simulated.
        </p>
      )}

      <dl className="payment-summary">
        <div><dt>Order value</dt><dd>{formatCedi(order.grossMinor ?? 0)}</dd></div>
        <div><dt>Service charge</dt><dd>{formatCedi(breakdown?.buyerServiceCharge ?? 0)}</dd></div>
        <div className="total"><dt>You pay</dt><dd>{formatCedi(order.chargedMinor ?? 0)}</dd></div>
      </dl>

      <form className="payment-form" onSubmit={handlePay}>
        <label>
          Network
          <select aria-label="Payment network" value={method} onChange={(event) => setMethod(event.target.value)}>
            {PAYMENT_METHODS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </label>
        <label>
          Mobile money number
          <input
            aria-label="Mobile money number"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            placeholder="0240000000"
            inputMode="tel"
            autoComplete="off"
          />
        </label>
        <label>
          Account name
          <input
            aria-label="Mobile money account name"
            value={accountName}
            onChange={(event) => setAccountName(event.target.value)}
            placeholder="Name on the MoMo account"
            autoComplete="off"
          />
        </label>
        <button className="primary-button full" type="submit" disabled={busy}>
          {busy ? 'Processing…' : `Pay ${formatCedi(order.chargedMinor ?? 0)}`}
        </button>
      </form>

      {error && <p className="gate-error" role="alert">{error}</p>}

      {receipt && (
        <div className="receipt-card" role="status">
          <h3>Receipt {receipt.reference}</h3>
          {receipt.simulated && <p className="demo-tag">Simulated · no money was taken</p>}
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
