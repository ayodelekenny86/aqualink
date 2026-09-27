import { useCallback, useMemo, useState } from 'react';
import { readValue, writeValue } from '../lib/storage';
import {
  DEFAULT_PRICING,
  DEFAULT_SPLIT,
  allocate,
  formatCedi,
  quotePrice,
  validateSplit,
} from '../lib/money';

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

export default function AdminPricingConsole({ onNotice, onPricingChange }) {
  const [stored] = useState(readStored);
  const [pricing, setPricing] = useState(stored.pricing);
  const [split, setSplit] = useState(stored.split);
  const [errors, setErrors] = useState({});

  const update = useCallback((field, raw) => {
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

  function save() {
    if (splitError) {
      onNotice?.('Fix the revenue split before saving.');
      return;
    }
    writeValue(`${STORAGE_KEY}.pricing`, pricing);
    writeValue(`${STORAGE_KEY}.split`, split);
    onPricingChange?.(pricing, split);
    onNotice?.('Pricing and revenue split published. New orders use these figures.');
  }

  function reset() {
    setPricing(DEFAULT_PRICING);
    setSplit(DEFAULT_SPLIT);
    setErrors({});
    writeValue(`${STORAGE_KEY}.pricing`, DEFAULT_PRICING);
    writeValue(`${STORAGE_KEY}.split`, DEFAULT_SPLIT);
    onPricingChange?.(DEFAULT_PRICING, DEFAULT_SPLIT);
    onNotice?.('Pricing reset to the default plan.');
  }

  return (
    <section className="admin-pricing panel" aria-label="Pricing and revenue control">
      <div className="panel-title">
        <div>
          <span className="section-kicker">PRICING &amp; REVENUE CONTROL</span>
          <h2>You set the price and the split.</h2>
          <p>Buyers always see the discounted price. Surge and revenue shares apply underneath it.</p>
        </div>
        <div className="admin-pricing-actions">
          <button className="outline-button" type="button" onClick={reset}>Reset to default</button>
          <button className="primary-button" type="button" onClick={save}>Publish pricing</button>
        </div>
      </div>

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
              onChange={(event) => setPricing({ ...pricing, surgeReason: event.target.value })}
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
  );
}

export { readStored as readAdminPricing };
