/**
 * Order aggregates.
 *
 * Every figure the app shows about money comes from here, summing the real order
 * list. It lives in its own module so the finance panels, the ops dashboard and
 * the downloadable report cannot each invent their own arithmetic, and so the
 * "what is paid" rule is defined once.
 *
 * Two rules are deliberate:
 *
 *   - Only `Paid` orders count as collected. An order that was created, or that
 *     the server recorded as awaiting payment, has not moved money, so counting
 *     it as revenue would be the same mistake as the demo settlement this
 *     replaced.
 *   - Money is summed in integer pesewas and only formatted at the edges, so no
 *     floating point creeps into a figure that gets exported or reconciled.
 */

export const PAID_STATUS = 'Paid';
export const DELIVERED_STATUS = 'Delivered';

export function summarise(orders = []) {
  const rows = Array.isArray(orders) ? orders : [];
  const paid = rows.filter((order) => order.status === PAID_STATUS);
  const delivered = rows.filter((order) => order.status === DELIVERED_STATUS);
  const unpaid = rows.filter((order) => order.status !== PAID_STATUS && order.status !== DELIVERED_STATUS);

  const sum = (list, field) => list.reduce((total, row) => total + (Number(row[field]) || 0), 0);

  return {
    totalCount: rows.length,
    paidCount: paid.length,
    deliveredCount: delivered.length,
    unpaidCount: unpaid.length,
    grossMinor: sum(rows, 'grossMinor'),
    chargedMinor: sum(paid, 'chargedMinor'),
    serviceChargeMinor: sum(paid, 'buyerServiceCharge'),
    sellerReceivesMinor: sum(paid, 'sellerReceives'),
    driverReceivesMinor: sum(paid, 'driverReceives'),
    platformCommissionMinor: sum(paid, 'platformCommission'),
    unpaidMinor: sum(unpaid, 'chargedMinor'),
    hasData: rows.length > 0,
  };
}
