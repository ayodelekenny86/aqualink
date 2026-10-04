/**
 * Volume conversion between the units the app and the fleet roster use.
 *
 * This exists because the conversion was open-coded in three places, and all
 * three had the same defect: `Number.parseInt('2,000 gallons', 10)` stops at the
 * comma and returns **2**, not 2000. A booking form option is written with a
 * thousands separator, so every "2,000 gallons" order was recorded as 2 gallons
 * — 8 litres on the wire, and a capacity check that happily assigned a
 * truck with a 2-gallon tank to a 2,000-gallon delivery.
 *
 * One helper, one parse, and a test that pins the separator case, so the unit
 * bug cannot be reintroduced in a fourth place.
 */

export const LITRES_PER_GALLON = 3.785411784;
export const GALLONS_PER_LITRE = 1 / LITRES_PER_GALLON;

/**
 * Read a volume out of a display label such as "2,000 gallons" or "2,000 gal".
 *
 * Thousands separators, decimal points and stray whitespace are all tolerated,
 * because the label is rendered text rather than a number. Anything that is not
 * a positive number yields 0, which every caller already treats as "no volume
 * recorded" rather than as a figure.
 */
export function gallonsFromLabel(label) {
  if (typeof label === 'number') return Number.isFinite(label) && label > 0 ? label : 0;
  const cleaned = String(label ?? '').replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/** Litres for a display label. Zero when the label holds no usable number. */
export function litresFromLabel(label) {
  return Math.round(gallonsFromLabel(label) * LITRES_PER_GALLON);
}

/**
 * Litres for an order.
 *
 * `volumeLitres` is the authoritative field — it is what the server stored and
 * what came back from `/orders`. `volume` is the display string written alongside
 * it ("2,000 gal"). Preferring the display string is how this view ended up
 * treating 2 as a litre count and scoring it at half a gallon.
 */
export function litresForOrder(order) {
  if (!order) return 0;
  if (Number.isFinite(order.volumeLitres) && order.volumeLitres > 0) return order.volumeLitres;
  return litresFromLabel(order.volume);
}

/** Gallons for an order, for anything scored against fleet capacity. */
export function gallonsForOrder(order) {
  if (!order) return 0;
  if (Number.isFinite(order.volumeLitres) && order.volumeLitres > 0) return order.volumeLitres * GALLONS_PER_LITRE;
  return gallonsFromLabel(order.volume);
}