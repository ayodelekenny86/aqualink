import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readValue, writeValue } from '../lib/storage';
import { fetchQuote, updatePricing } from '../lib/payments';
import {
  DEFAULT_PRICING,
  DEFAULT_SPLIT,
  allocate,
  formatCedi,
  quotePrice,
  validateSplit,
} from '../lib/money';
import { getRatings, computeAverages, computeDistribution } from '../lib/ratings';

/**
 * Admin pricing control.
 *
 * The admin owns price formation: list price, the discount shown to buyers, a
 * surge multiplier with a stated reason, and the revenue split. Every field is
 * range-checked as it is typed and the resulting quote updates live, so a
 * misconfigured plan is visible before it reaches a customer rather than
 * discovered in a payout dispute.
 *
 * The split cannot be saved unless it totals 100%. That guard is the whole
 * reason this lives in one component: an operator who divides 300 cedi three
 * ways that do not sum will get an error, not a silent shortfall.
 *
 * Publishing is server-side and operator-authenticated. The previous version
 * only wrote to `localStorage`, so the console looked like it controlled pricing
 * while every order was still priced by untouched server config. `localStorage`
 * is now only a display cache of what the server accepted.
 */

const STORAGE_KEY = 'admin.pricing';

const NUMERIC_FIELDS = {
  listPrice: { min: 0, max: 100000, step: 10, label: 'List price (GH₵)' },
  discountPercent: { min: 0, max: 100, step: 1, label: 'Buyer discount (%)' },
  surgePercent: { min: 0, max: 200, step: 1, label: 'Surge (%)' },
  buyerServiceCharge: { min: 0, max: 50, step: 1, label: 'Buyer service charge (%)' },
  seller: { min: 0, max: 100, step: 1, label: 'Water seller share (%)' },
  driver: { min: 0, max: 100, step: 1, label: 'Driver share (%)' },
  platformCommission: { min: 0, max: 100, step: 1, label: 'AquaLink share (%)' },
};

function readStored() {
  return {
    pricing: { ...DEFAULT_PRICING, ...(readValue(`${STORAGE_KEY}.pricing`, null) ?? {}) },
    split: { ...DEFAULT_SPLIT, ...(readValue(`${STORAGE_KEY}.split`, null) ?? {}) },
  };
}

export default function AdminPricingConsole({ onNotice, onPricingChange, opsToken = null }) {
  const [stored] = useState(readStored);
  const [pricing, setPricing] = useState(stored.pricing);
  const [split, setSplit] = useState(stored.split);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // Set as soon as the operator types. A live-price read can land after they have
  // started editing, and merging the server copy over their input would silently
  // revert their change under the cursor.
  const editingRef = useRef(false);

  const [ratingsSummary, setRatingsSummary] = useState(null);
  const [ratingsByRole, setRatingsByRole] = useState([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);

  const loadRatings = useCallback(async () => {
    setRatingsLoading(true);
    try {
      const ratings = await getRatings();
      setRatingsSummary({
        averages: computeAverages(ratings),
        distribution: computeDistribution(ratings),
        count: ratings.length,
      });
      const roles = { buyer: [], seller: [], driver: [] };
      ratings.forEach((r) => {
        if (r.sellerId) roles.seller.push(r);
        if (r.driverId) roles.driver.push(r);
        if (r.buyerId) roles.buyer.push(r);
      });
      setRatingsByRole(
        Object.entries(roles).map(([role, list]) => ({
          role: role.charAt(0).toUpperCase() + role.slice(1),
          count: list.length,
          average: computeAverages(list)?.overall ?? null,
        }))
      );
    } catch (e) {
      console.warn('Ratings overview failed:', e.message);
    } finally {
      setRatingsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRatings();
  }, [loadRatings]);

  // Show the operator what is actually live, not whatever this browser last
  // cached, so the console cannot be used to edit a price nobody is charged.
  useEffect(() => {
    if (!opsToken) return undefined;
    let cancelled = false;
    (async () => {
      try {
        // Through the shared helper so this honours VITE_API_BASE like every
        // other call, rather than assuming a same-origin /api path.
        const data = await fetchQuote();
        // `pricing` is the stored config; `quote` is the derived breakdown for
        // one order. The console edits the config, so config wins: merging the
        // quote would overwrite the inputs with computed figures.
        const live = data.pricing ?? data.quote;
        if (cancelled || !live || editingRef.current) return;
        setPricing((current) => ({ ...current, ...live }));
        if (data.split) setSplit((current) => ({ ...current, ...data.split }));
      } catch {
        // A read failure must not block editing; the save below is authoritative.
      }
    })();
    return () => { cancelled = true; };
  }, [opsToken]);

  const update = useCallback((field, raw) => {
    editingRef.current = true;
    const rule = NUMERIC_FIELDS[field];
    const value = raw === '' ? 0 : Number(raw);
    const next = field in pricing ? { ...pricing, [field]: value } : { ...split, [field]: value };

    if (Number.isNaN(value)) return;
    if (rule && (value < rule.min || value > rule.max)) {
      setErrors((current) => ({ ...current, [field]: `${rule.label} must be between ${rule.min} and ${rule.max}.` }));
    } else {
      setErrors((current) => {
        const { [field]: _removed, ...rest } = current;
        return rest;
      });
    }

    if (field in pricing) {
      setPricing(next);
      onPricingChange?.(next, split);
    } else {
      setSplit(next);
      onPricingChange?.(pricing, next);
    }
  }, [pricing, split, onPricingChange]);

  const shareTotal = split.seller + split.driver + split.platformCommission;
  const splitError = shareTotal === 100 ? null : `Shares total ${shareTotal}%. They must total exactly 100% before saving.`;

  // Clamp rather than throw, so a half-typed number still renders a quote.
  const quote = useMemo(() => {
    try {
      return quotePrice(pricing);
    } catch {
      return null;
    }
  }, [pricing]);

  const breakdown = useMemo(() => {
    if (!quote) return null;
    try {
      return allocate(quote.totalMinor, split);
    } catch {
      return null;
    }
  }, [quote, split]);

  async function save() {
    if (splitError) {
      onNotice?.('Fix the revenue split before saving.');
      return;
    }
    if (!opsToken) {
      // Refusing is the point. Writing to localStorage and reporting success here
      // is what made this console look authoritative while changing nothing.
      onNotice?.('Sign in as an operator to publish pricing. Prices are set on the server.');
      return;
    }

    setSaving(true);
    try {
      const result = await updatePricing({ pricing, split, token: opsToken });
      // Only mirror to localStorage after the server has accepted the change, so
      // the cache can never show a price the server rejected.
      writeValue(`${STORAGE_KEY}.pricing`, result.pricing ?? pricing);
      writeValue(`${STORAGE_KEY}.split`, result.split ?? split);
      setPricing(result.pricing ?? pricing);
      setSplit(result.split ?? split);
      onPricingChange?.(result.pricing ?? pricing, result.split ?? split);
      onNotice?.('Pricing published. New orders are charged these figures.');
    } catch (error) {
      onNotice?.(error.message || 'The server rejected this pricing change.');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    editingRef.current = true;
    setPricing(DEFAULT_PRICING);
    setSplit(DEFAULT_SPLIT);
    setErrors({});
    onPricingChange?.(DEFAULT_PRICING, DEFAULT_SPLIT);
    onNotice?.('Defaults loaded into the form. Select Publish pricing to make them live.');
  }

  return (
    <>
      <section className="admin-pricing panel" aria-label="Pricing and revenue control">
        <div className="panel-title">
          <div>
            <span className="section-kicker">PRICING &amp; REVENUE CONTROL</span>
            <h2>You set the price and the split.</h2>
            <p>Buyers always see the discounted price. Surge and revenue shares apply underneath it.</p>
          </div>
          <div className="admin-pricing-actions">
            <button className="outline-button" type="button" onClick={reset}>Load defaults</button>
            <button className="primary-button" type="button" onClick={save} disabled={saving}>
            {saving ? 'Publishing…' : 'Publish pricing'}
          </button>
        </div>
      </div>

      {!opsToken && (
        <p className="field-error" role="status">
          You are not signed in as an operator, so pricing cannot be published. This form previews a
          quote only; the price an order is actually charged is decided on the server.
        </p>
      )}

      <div className="pricing-grid">
        <fieldset>
          <legend>Price formation</legend>
          {Object.entries(NUMERIC_FIELDS)
            .filter(([key]) => key in DEFAULT_PRICING)
            .map(([key, rule]) => (
              <label key={key}>
                {rule.label}
                <input
                  type="number"
                  aria-label={rule.label}
                  value={pricing[key]}
                  min={rule.min}
                  max={rule.max}
                  step={rule.step}
                  onChange={(event) => update(key, event.target.value)}
                />
                {errors[key] && <small className="field-error" role="alert">{errors[key]}</small>}
              </label>
            ))}
          <label>
            Surge reason (shown to buyers)
            <input
              type="text"
              aria-label="Surge reason"
              value={pricing.surgeReason}
              maxLength={120}
              placeholder="e.g. Dry season - tanker availability low"
              onChange={(event) => { editingRef.current = true; setPricing({ ...pricing, surgeReason: event.target.value }); }}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Revenue split</legend>
          {Object.entries(NUMERIC_FIELDS)
            .filter(([key]) => key in DEFAULT_SPLIT)
            .map(([key, rule]) => (
              <label key={key}>
                {rule.label}
                <input
                  type="number"
                  aria-label={rule.label}
                  value={split[key]}
                  min={rule.min}
                  max={rule.max}
                  step={rule.step}
                  onChange={(event) => update(key, event.target.value)}
                />
              </label>
            ))}
          <p className={splitError ? 'split-total invalid' : 'split-total'}>
            {splitError ?? `Shares total ${shareTotal}% and balance correctly.`}
          </p>
        </fieldset>

        <fieldset>
          <legend>Live preview for one order</legend>
          {quote && breakdown ? (
            <dl className="pricing-preview">
              <div><dt>List price</dt><dd>{formatCedi(quote.listMinor)}</dd></div>
              <div><dt>After {pricing.discountPercent}% discount</dt><dd>{formatCedi(quote.discounted)}</dd></div>
              {quote.surgeMinor > 0 && <div><dt>Surge ({pricing.surgePercent}%)</dt><dd>{formatCedi(quote.surgeMinor)}</dd></div>}
              <div className="highlight"><dt>Buyer is charged</dt><dd>{formatCedi(breakdown.buyerPays)}</dd></div>
              <div><dt>Water seller receives</dt><dd>{formatCedi(breakdown.sellerReceives)}</dd></div>
              <div><dt>Driver receives</dt><dd>{formatCedi(breakdown.driverReceives)}</dd></div>
              <div><dt>AquaLink keeps</dt><dd>{formatCedi(breakdown.companyTake)}</dd></div>
            </dl>
          ) : (
            <p className="empty-feed">Enter valid numbers to see the quote.</p>
          )}
        </fieldset>
      </div>
    </section>

    <section className="panel" aria-label="Ratings overview">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">NETWORK RATINGS</span>
          <h2>Buyer feedback across the fleet</h2>
        </div>
        <button className="outline-button" type="button" onClick={loadRatings} disabled={ratingsLoading}>
          {ratingsLoading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>
      {ratingsSummary ? (
        <>
          <div className="rating-summary-grid">
            <article className="rating-card overall">
              <span className="rating-card-label">Platform average</span>
              <strong className="rating-card-value">{ratingsSummary.averages.overall ?? '—'}</strong>
              <small>out of 5.0</small>
              <div className="rating-distribution">
                {ratingsSummary.distribution && Object.entries(ratingsSummary.distribution).map(([star, count]) => (
                  <div key={star} className="dist-bar">
                    <span>{star}★</span>
                    <div className="dist-bar-fill" style={{ width: `${ratingsSummary.count ? (count / ratingsSummary.count * 100) : 0}%` }} />
                    <span>{count}</span>
                  </div>
                ))}
              </div>
              <small className="rating-count">{ratingsSummary.count} review{ratingsSummary.count !== 1 ? 's' : ''}</small>
            </article>
            {ratingsSummary.averages && Object.entries(ratingsSummary.averages).filter(([k]) => k !== 'overall' && k !== 'total').map(([cat, value]) => (
              <article key={cat} className="rating-card category">
                <span className="rating-card-label">{cat.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                <strong className="rating-card-value">{value ?? '—'}</strong>
                <small>out of 5.0</small>
              </article>
            ))}
          </div>
          <div className="panel-divider" />
          <div className="panel-title">
            <span className="section-kicker">BY ROLE</span>
            <h2>Who gets rated</h2>
          </div>
          <dl className="ratings-by-role">
            {ratingsByRole.map((entry) => (
              <div key={entry.role}>
                <dt>{entry.role}</dt>
                <dd>
                  <strong>{entry.count} rating{entry.count !== 1 ? 's' : ''}</strong>
                  {entry.average != null ? <small> · {entry.average}/5 average</small> : <small> · no scores yet</small>}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : ratingsLoading ? (
        <p className="empty-feed">Loading ratings…</p>
      ) : (
        <p className="empty-feed">No ratings have been submitted yet.</p>
      )}
    </section>
    </>
  );
}

export { readStored as readAdminPricing };
