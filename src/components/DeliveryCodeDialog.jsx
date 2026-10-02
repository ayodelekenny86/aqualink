/**
 * Driver-side handover: close a delivery against the code the buyer holds.
 *
 * This is the only path that moves an order to `Delivered` from the driver's
 * side, and it cannot do so without the code. That is deliberate: a driver who
 * can mark water delivered by tapping a button will do so before the tank is
 * full, and nothing downstream would catch it.
 */

import { useEffect, useRef, useState } from 'react';

export default function DeliveryCodeDialog({ order, onCancel, onSubmit }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(event) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!code.trim()) {
      setError('Enter the code the buyer shows you.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await onSubmit(order.id, code.trim());
    setBusy(false);
    // A mismatch is reported here rather than swallowed, so a driver who typed
    // it wrong is not left wondering whether the delivery went through.
    if (result && result.ok === false) {
      setError(result.reason === 'not-handed-over'
        ? 'No delivery code has been issued for this order yet. Ask operations to issue one.'
        : 'That code does not match. Ask the buyer to check it on their phone.');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="order-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Complete delivery for order ${order.code ?? order.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="order-modal-head">
          <div>
            <p className="section-kicker">HANDOVER</p>
            <h2>{order.code ?? order.id}</h2>
          </div>
          <button type="button" className="modal-close" aria-label="Cancel" onClick={onCancel}>×</button>
        </header>

        <p className="page-copy">
          Ask the buyer for the delivery code shown on their order. This is what confirms the
          tank was filled.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            aria-label="Delivery code"
            value={code}
            onChange={(event) => { setCode(event.target.value); setError(''); }}
            placeholder="e.g. DEL-7F3K9Q"
            autoComplete="one-time-code"
            inputMode="text"
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button full" type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Complete delivery'}
          </button>
        </form>
      </div>
    </div>
  );
}