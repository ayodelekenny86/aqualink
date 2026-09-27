import { useMemo } from 'react';
import { allocate, formatCedi, toMinor, validateSplit, DEFAULT_SPLIT } from '../lib/money';

/**
 * Shows exactly how one order's money divides.
 *
 * The breakdown is rendered from the same `allocate` function that would move
 * the money, so what a customer is shown and what they are charged cannot
 * disagree. Percentages come from the split config rather than being written
 * into the markup, so changing the plan updates every surface at once.
 */

function Row({ label, amountMinor, share, total, tone }) {
  return (
    <div className={`revenue-row ${tone ?? ''}`.trim()}>
      <span>{label}{share !== undefined && <small>{share}%</small>}</span>
      <strong>{formatCedi(amountMinor)}</strong>
      {total !== undefined && <em>of {formatCedi(total)}</em>}
    </div>
  );
}

export default function RevenueBreakdown({ amountCedi = 250, split = DEFAULT_SPLIT, title = 'Where your money goes', role = 'buyer' }) {
  const breakdown = useMemo(() => {
    // A bad split must never reach the screen, so validate before rendering.
    if (!validateSplit(split)) return null;
    return allocate(toMinor(amountCedi), split);
  }, [amountCedi, split]);

  if (!breakdown) return null;

  const { gross, buyerPays, buyerServiceCharge, sellerReceives, driverReceives, companyTake } = breakdown;

  return (
    <section className="revenue-breakdown panel" aria-label="Order revenue breakdown">
      <div className="panel-title">
        <div>
          <span className="section-kicker">REVENUE SPLIT</span>
          <h2>{title}</h2>
        </div>
        <span className="verified-pill">{formatCedi(companyTake)} to AquaLink</span>
      </div>

      <div className="revenue-bar" role="img" aria-label="Revenue distribution">
        <i className="seg seller" style={{ flexGrow: sellerReceives }} title={`Seller ${formatCedi(sellerReceives)}`} />
        <i className="seg driver" style={{ flexGrow: driverReceives }} title={`Driver ${formatCedi(driverReceives)}`} />
        <i className="seg company" style={{ flexGrow: companyTake }} title={`Company ${formatCedi(companyTake)}`} />
      </div>

      <div className="revenue-rows">
        <Row label="Order value" amountMinor={gross} total={buyerPays} />
        <Row label="Buyer service charge" amountMinor={buyerServiceCharge} share={split.buyerServiceCharge} total={buyerPays} tone="fee" />
        <Row label="Total charged to you" amountMinor={buyerPays} />
        <Row label="Water seller receives" amountMinor={sellerReceives} share={split.seller} />
        <Row label="Driver receives" amountMinor={driverReceives} share={split.driver} />
        <Row label="AquaLink keeps" amountMinor={companyTake} share={split.platformCommission + split.buyerServiceCharge} tone="company" />
      </div>

      <small className="revenue-note">
        Escrow holds the seller and driver payouts until delivery is confirmed with the handover code.
        {role === 'driver' && ` Your cut on this order is ${formatCedi(driverReceives)}.`}
        {role === 'seller' && ` Your cut on this order is ${formatCedi(sellerReceives)}.`}
      </small>
    </section>
  );
}
