import { useCallback, useMemo, useState } from 'react';
import { readValue, writeValue } from '../lib/storage';
import { DEFAULT_PRICING, DEFAULT_SPLIT, allocate, quotePrice, validateSplit } from '../lib/money';

/**
 * Single source of truth for price formation and the revenue split.
 *
 * The admin console writes here and the booking flow reads from here, so a
 * price change reaches buyers on the next order rather than needing to be
 * threaded through every component. A split that does not total 100% is
 * rejected on save, which means `allocate` can never throw at checkout time.
 */

const PRICING_KEY = 'admin.pricing.pricing';
const SPLIT_KEY = 'admin.pricing.split';

function readOrDefault(key, fallback) {
  const stored = readValue(key, null);
  return stored ? { ...fallback, ...stored } : fallback;
}

export default function useAdminPricing({ onNotice } = {}) {
  const [pricing, setPricing] = useState(() => readOrDefault(PRICING_KEY, DEFAULT_PRICING));
  const [split, setSplit] = useState(() => readOrDefault(SPLIT_KEY, DEFAULT_SPLIT));

  const apply = useCallback((nextPricing, nextSplit) => {
    if (nextPricing) setPricing(nextPricing);
    if (nextSplit) setSplit(nextSplit);
  }, []);

  const publish = useCallback((nextPricing, nextSplit) => {
    try {
      validateSplit(nextSplit);
    } catch (error) {
      onNotice?.(error.message);
      return false;
    }
    writeValue(PRICING_KEY, nextPricing);
    writeValue(SPLIT_KEY, nextSplit);
    apply(nextPricing, nextSplit);
    return true;
  }, [apply, onNotice]);

  const reset = useCallback(() => {
    writeValue(PRICING_KEY, DEFAULT_PRICING);
    writeValue(SPLIT_KEY, DEFAULT_SPLIT);
    apply(DEFAULT_PRICING, DEFAULT_SPLIT);
  }, [apply]);

  /** The buyer-facing quote: discounted, surged, and with the fee applied. */
  const quote = useMemo(() => {
    const { totalMinor } = quotePrice(pricing);
    return allocate(totalMinor, split);
  }, [pricing, split]);

  return { pricing, split, setPricing, setSplit, apply, publish, reset, quote };
}
