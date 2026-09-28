/**
 * Reliability scoring.
 *
 * This is a second opinion on the seller-performance engine, aimed at the
 * questions an operator actually asks: "is this seller dependable, and how
 * long does a delivery from them usually take?"
 *
 * Every figure is summed from the order list. Where a measurement needs a
 * timestamp the order does not carry, the engine says so instead of
 * substituting a plausible number — an unmeasured on-time rate is reported as
 * unmeasured, never as 100%.
 *
 * The SLA estimate is the honest kind of prediction: it is the median of
 * observed delivery windows, expressed as a range, and it is labelled as an
 * estimate. It is not a promise, and it is not invented.
 */

const ON_TIME_WINDOW_HOURS = 24;

function sellerIdOf(order) {
  return order.sellerId || order.sellerName || null;
}

function numericVolume(order) {
  return parseFloat(String(order.volume ?? '').replace(/[^0-9.]/g, '') || '0');
}

/** Hours between the order being assigned and being delivered, when both
 * timestamps are recorded. Returns null when either is missing. */
export function deliveryWindowHours(order) {
  const start = order.assignedAt ?? order.enRouteAt ?? order.createdAt;
  const end = order.deliveredAt ?? (order.status === 'Delivered' ? order.date : null);
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / (1000 * 60 * 60);
}

/**
 * Score one seller. Returns null when the seller has no orders, so callers can
 * tell "no data" from "scored zero".
 */
export function scoreReliability(orders, sellerId) {
  const mine = orders.filter(o => sellerIdOf(o) === sellerId);
  if (!mine.length) return null;

  const completed = mine.filter(o => o.status === 'Delivered');
  const cancelled = mine.filter(o => o.status === 'Cancelled');
  const windows = completed.map(deliveryWindowHours).filter((v) => v !== null);

  const completionRate = completed.length / mine.length;
  const cancellationRate = cancelled.length / mine.length;
  const onTime = windows.filter((h) => h <= ON_TIME_WINDOW_HOURS);
  const onTimeRate = windows.length > 0 ? onTime.length / windows.length : null;

  const volumeDelivered = completed.reduce((s, o) => s + numericVolume(o), 0);
  const revenue = completed.reduce((s, o) => s + (Number(o.sellerReceives) || 0), 0) / 100;
  const avgOrderValue = completed.length > 0
    ? completed.reduce((s, o) => s + (Number(o.chargedMinor) || 0), 0) / completed.length / 100
    : 0;

  // Normalise against the best performer in the fleet so the scale comes from
  // real orders rather than invented ceilings.
  const maxVolume = Math.max(...orders.map(numericVolume), 0);
  const maxRevenue = Math.max(...orders.map(o => Number(o.sellerReceives) || 0), 0);
  const volumeScore = maxVolume > 0 ? Math.min(1, volumeDelivered / maxVolume) : 0;
  const revenueScore = maxRevenue > 0 ? Math.min(1, revenue * 100 / maxRevenue) : 0;

  // On-time counts only when it can be measured. An unmeasured seller is not
  // rewarded with a perfect score; they get a neutral contribution.
  const onTimeScore = onTimeRate === null ? 0.5 : onTimeRate;

  const raw = (
    completionRate * 0.30 +
    onTimeScore * 0.25 +
    (1 - cancellationRate) * 0.20 +
    volumeScore * 0.15 +
    revenueScore * 0.10
  );
  const score = Math.round(raw * 100);

  // Median delivery window, in hours. Sorted so the middle value is the median
  // regardless of how many deliveries were timed.
  let slaHours = null;
  if (windows.length) {
    const sorted = [...windows].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    slaHours = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return {
    sellerId,
    orders: mine.length,
    completed: completed.length,
    cancelled: cancelled.length,
    completionRate: Math.round(completionRate * 100),
    cancellationRate: Math.round(cancellationRate * 100),
    onTimeRate: onTimeRate === null ? null : Math.round(onTimeRate * 100),
    timedDeliveries: windows.length,
    volumeDelivered: Math.round(volumeDelivered),
    revenue: Math.round(revenue),
    avgOrderValue: Math.round(avgOrderValue),
    score,
    slaHours: slaHours === null ? null : Math.round(slaHours * 10) / 10,
    slaMeasured: windows.length > 0,
  };
}

/** Human-readable SLA text, or a plain statement that it is unmeasured. */
export function describeSla(reliability) {
  if (!reliability) return 'No delivery history to estimate a window.';
  if (!reliability.slaMeasured) {
    return 'Delivery timing is not recorded for this seller yet, so no delivery window can be estimated.';
  }
  const h = reliability.slaHours;
  if (h === null) return 'No timed deliveries to estimate a window.';
  const low = Math.max(0, Math.round(h * 0.7));
  const high = Math.round(h * 1.4);
  return `Estimated delivery window: about ${low}–${high} hours, based on ${reliability.timedDeliveries} timed deliveries.`;
}

/** Rank sellers by reliability score, best first. */
export function rankReliability(orders) {
  const ids = new Set(orders.map(sellerIdOf).filter(Boolean));
  const scored = [];
  ids.forEach((id) => {
    const s = scoreReliability(orders, id);
    if (s) scored.push(s);
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * Estimated delivery window for one order, from the assigned seller's history.
 *
 * Returns null when the order has no seller or the seller has no timed
 * deliveries, so a caller can show "not enough history" instead of a number.
 */
export function estimateForOrder(orders, order) {
  if (!order) return null;
  const sellerId = sellerIdOf(order);
  if (!sellerId) return null;
  const reliability = scoreReliability(orders, sellerId);
  if (!reliability || !reliability.slaMeasured) return null;
  return reliability;
}

export function reliabilitySummary(orders) {
  const ranked = rankReliability(orders);
  if (!ranked.length) return null;
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  const timed = ranked.filter((s) => s.slaMeasured);
  const fastest = timed.length
    ? timed.reduce((a, b) => (a.slaHours < b.slaHours ? a : b))
    : null;
  return {
    totalSellers: ranked.length,
    topSeller: top.sellerId,
    topScore: top.score,
    bottomSeller: bottom.sellerId,
    bottomScore: bottom.score,
    timedSellers: timed.length,
    fastestSla: fastest ? { sellerId: fastest.sellerId, slaHours: fastest.slaHours } : null,
  };
}