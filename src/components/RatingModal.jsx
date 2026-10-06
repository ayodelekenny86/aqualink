import { useCallback, useEffect, useRef, useState } from 'react';
import { RATING_CATEGORIES, getCategoryLabel } from '../lib/ratings';
import { trackEvent, EVENTS } from '../lib/analytics';

const STAR_SIZE = 36;
const STAR_GAP = 4;

function Star({ filled, onClick, onKeyDown, index, disabled, 'aria-label': ariaLabel }) {
  return (
    <button
      type="button"
      className={`star ${filled ? 'filled' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onClick(index)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(index);
        }
      }}
      onMouseEnter={() => !disabled && onClick(index, true)}
      aria-label={ariaLabel}
      aria-pressed={filled}
      role="radio"
      tabIndex={disabled ? -1 : 0}
      style={{ fontSize: STAR_SIZE, lineHeight: STAR_SIZE }}
    >
      ★
    </button>
  );
}

function StarRow({ label, value, onChange, disabled, hoverValue, max = 5 }) {
  const stars = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className="rating-row">
      <label className="rating-label">{label}</label>
      <div className="rating-stars" role="radiogroup" aria-label={label}>
        {stars.map((n) => (
          <Star
            key={n}
            index={n}
            filled={hoverValue ? n <= hoverValue : n <= (value || 0)}
            onClick={(idx, isHover) => onChange(idx, isHover)}
            disabled={disabled}
            aria-label={`${label}: ${n} star${n > 1 ? 's' : ''}`}
          />
        ))}
      </div>
      <output className="rating-value" aria-live="polite">
        {hoverValue ? `${hoverValue}/${max}` : value ? `${value}/${max}` : '—'}
      </output>
    </div>
  );
}

export default function RatingModal({
  isOpen,
  onClose,
  onSubmit,
  order,
  sellerName,
  driverName,
  disabled = false,
}) {
  const [overall, setOverall] = useState(0);
  const [hoverOverall, setHoverOverall] = useState(0);
  const [categories, setCategories] = useState({});
  const [hoverCategories, setHoverCategories] = useState({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  const focusRef = useRef(null);
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setOverall(0);
      setCategories({});
      setComment('');
      setError(null);
      setTouched(false);
      setSubmitting(false);
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const handleCategoryChange = useCallback((catId, value, isHover) => {
    if (isHover) {
      setHoverCategories((prev) => ({ ...prev, [catId]: value }));
    } else {
      setCategories((prev) => ({ ...prev, [catId]: value }));
      setHoverCategories((prev) => ({ ...prev, [catId]: 0 }));
      setTouched(true);
    }
  }, []);

  const handleOverallChange = useCallback((value, isHover) => {
    if (isHover) {
      setHoverOverall(value);
    } else {
      setOverall(value);
      setHoverOverall(0);
      setTouched(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!overall) {
      setError('Please select an overall rating');
      focusRef.current?.focus();
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const payload = {
      overall,
      ...categories,
      comment: comment.trim() || undefined,
    };

    try {
      const result = await onSubmit(payload);
      if (result?.ok) {
        trackEvent(EVENTS.RATING_SUBMITTED, { orderId: order?.id, overall });
        onClose();
      } else {
        setError(result?.errors?.[0] || 'Failed to submit rating');
      }
    } catch (err) {
      setError(err.message || 'Failed to submit rating');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="rating-title">
      <div className="modal rating-modal" onClick={(e) => e.stopPropagation()} ref={focusRef} tabIndex={-1}>
        <header className="modal-header">
          <h2 id="rating-title">Rate your delivery</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close rating">
            ✕
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="order-context">
              <strong>Order {order?.id}</strong>
              <span>· {sellerName ? `Seller: ${sellerName}` : ''}{driverName ? ` · Driver: ${driverName}` : ''}</span>
            </div>

            <StarRow
              ref={firstInputRef}
              label="Overall"
              value={overall}
              hoverValue={hoverOverall}
              onChange={handleOverallChange}
              disabled={disabled}
            />

            <fieldset className="rating-categories">
              <legend>Breakdown (optional)</legend>
              {RATING_CATEGORIES.map((cat) => (
                <StarRow
                  key={cat.id}
                  label={cat.label}
                  value={categories[cat.id]}
                  hoverValue={hoverCategories[cat.id]}
                  onChange={(v, h) => handleCategoryChange(cat.id, v, h)}
                  disabled={disabled}
                />
              ))}
            </fieldset>

            <div className="rating-comment">
              <label htmlFor="rating-comment">Your feedback</label>
              <textarea
                id="rating-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What went well? What could be better? (optional)"
                maxLength={1000}
                rows={4}
                disabled={disabled}
              />
              <small className="char-count">{comment.length}/1000</small>
            </div>

            {error && <div className="rating-error" role="alert">{error}</div>}
          </div>
          <footer className="modal-footer">
            <button type="button" className="outline-button" onClick={onClose} disabled={submitting}>
              Skip
            </button>
            <button type="submit" className="primary-button" disabled={submitting || disabled}>
              {submitting ? 'Submitting…' : 'Submit Rating'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}