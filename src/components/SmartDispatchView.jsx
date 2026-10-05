/**
 * AI-powered smart dispatch analysis for the ops console.
 *
 * Combines the deterministic dispatch scorer (proximity, capacity, rating, load)
 * with a Gemini call that can reason about historical patterns, seasonality,
 * and operational context that pure scoring cannot capture.
 *
 * The component degrades gracefully: when the AI function is unreachable it
 * falls back to the scorer-only ranking, so ops always has a recommendation.
 */

import { useMemo, useState } from 'react';
import { assignDriver, assignSeller } from '../lib/dispatch';
import { getFleet } from '../lib/fleet';
import { gallonsForOrder } from '../lib/volume';
import { askAiQuestion, AI_FALLBACK_REASONS, classifyAiFailure } from '../lib/ai';
import { formatCedi } from '../lib/money';

/**
 * Run a focused Gemini query about dispatch for a single order.
 *
 * Returns the AI's recommendation text, or `null` when the server is unreachable,
 * along with the classified reason so the notice can name it. "Not available right
 * now" reads like a transient hiccup; on this deployment the `ai` function is not
 * deployed at all, and an operator reading that should be told to deploy it rather
 * than to try again.
 */
async function getAiDispatchInsight(order, drivers, sellers) {
  try {
    const fleet = [
      `Drivers: ${drivers.map((d) => `${d.name} based in ${d.base}, capacity ${d.capacityGallons}gal, rating ${d.rating}, ${d.activeJobs} active job(s)`).join('; ') || 'none on the roster'}.`,
      `Sellers: ${sellers.map((s) => `${s.name} based in ${s.base}, capacity ${s.capacityGallons}gal, rating ${s.rating}`).join('; ') || 'none on the roster'}.`,
    ].join(' ');

    const { answer } = await askAiQuestion({
      question: `Order ${order.code} for ${order.volume || order.volumeLitres || 'unknown volume'} at ${order.location || 'an unknown location'}. ${fleet} Which driver and which seller should take this order, and why?`,
      role: 'ops',
      orders: [order],
      split: null,
    });
    return { answer, reason: null };
  } catch (error) {
    return { answer: null, reason: classifyAiFailure(error) };
  }
}

export default function SmartDispatchView({ orders, showNotice }) {
  const [loading, setLoading] = useState({});
  const [insights, setInsights] = useState({});
  const { drivers, sellers } = getFleet();

  const dispatchable = useMemo(() => {
    return orders
      .filter((o) => o.status === 'Awaiting payment')
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }, [orders]);

  const ranked = useMemo(() => {
    return dispatchable.map((order) => {
      // The scorer works in gallons; orders carry litres. Normalise once per order
      // so the driver and seller rankings read the same volume.
      //
      // This read `order.volume` — the display string "2,000 gal" — and parsed
      // it, which stops at the comma. A 2,000 gallon order was scored as 2
      // litres, or about half a gallon, so every capacity check in the ranking
      // passed for reasons that had nothing to do with the truck.
      const scored = { ...order, volumeGallons: gallonsForOrder(order) };
      const driver = assignDriver({ order: scored, drivers });
      const seller = assignSeller({ order: scored, sellers });
      return {
        order,
        recommended: driver?.candidate ?? null,
        recommendedSeller: seller?.candidate ?? null,
        driverFactors: driver?.factors ?? {},
      };
    });
  }, [dispatchable, drivers, sellers]);

  const requestInsight = async (order) => {
    setLoading((prev) => ({ ...prev, [order.id]: true }));
    const { answer: insight, reason } = await getAiDispatchInsight(order, drivers, sellers);
    setInsights((prev) => ({ ...prev, [order.id]: insight }));
    setLoading((prev) => ({ ...prev, [order.id]: false }));
    if (!insight) {
      const cause = AI_FALLBACK_REASONS[reason] ?? AI_FALLBACK_REASONS.failed;
      showNotice(`${cause} The scored recommendation below is used instead, and it is computed from real capacity and order data.`);
    }
  };

  if (dispatchable.length === 0) {
    return (
      <section className="panel smart-dispatch">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">SMART DISPATCH</span>
            <h2>No orders awaiting assignment</h2>
          </div>
        </div>
        <p className="empty-feed">All paid orders have been assigned. New bookings appear here for AI review.</p>
      </section>
    );
  }

  return (
    <section className="panel smart-dispatch">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">SMART DISPATCH</span>
          <h2>{dispatchable.length} order(s) awaiting assignment</h2>
        </div>
      </div>

      <div className="dispatch-feed">
        {ranked.map(({ order, recommended, recommendedSeller, driverFactors }) => (
          <article key={order.id} className="dispatch-row panel">
            <div className="dispatch-order-head">
              <strong>{order.code}</strong>
              <small>{order.location}</small>
              <span className="dispatch-volume">{order.volume || `${order.volumeLitres} L`}</span>
              <span className="dispatch-value">{formatCedi(order.chargedMinor ?? 0)}</span>
            </div>

            <div className="dispatch-recommendation">
              <div className="rec-driver">
                <span className="rec-label">Recommended driver</span>
                <span className="rec-value">{recommended?.name || 'No match'} ({recommended?.base || '—'})</span>
                {recommended && (
                  <div className="rec-reason">
                    {(() => {
                      const parts = Object.entries(driverFactors)
                        .filter(([, value]) => value > 0)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, value]) => `${key} ${value}`);
                      return parts.length ? `Scored on ${parts.join(', ')}` : 'No positive score factors recorded';
                    })()}
                  </div>
                )}
              </div>

              <div className="rec-seller">
                <span className="rec-label">Recommended seller</span>
                <span className="rec-value">{recommendedSeller?.name || 'No match'} ({recommendedSeller?.base || '—'})</span>
              </div>

              <button
                className="outline-button ai-dispatch-btn"
                type="button"
                onClick={() => requestInsight(order)}
                disabled={loading[order.id]}
              >
                {loading[order.id] ? 'Thinking…' : insights[order.id] ? 'Insight ready →' : 'AI insight →'}
              </button>
            </div>

            {insights[order.id] && (
              <div className="ai-dispatch-insight">
                <span className="ai-badge">Gemini</span>
                <p>{insights[order.id]}</p>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="dispatch-fleet-summary">
        <article><span>{drivers.length}</span><small>Drivers</small></article>
        <article><span>{drivers.filter((d) => d.status === 'online').length}</span><small>Online</small></article>
        <article><span>{sellers.length}</span><small>Sellers</small></article>
        <article><span>{sellers.filter((s) => s.status === 'online').length}</span><small>Available</small></article>
      </div>
    </section>
  );
}
