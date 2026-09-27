import { useCallback } from 'react';
import { formatCedi } from '../lib/money';
import { summarise } from '../lib/summary';

/**
 * Build the ops report from orders that exist.
 *
 * This used to return a fixed object: a demand table for East Legon and Osu with
 * invented percentages, "GH₵4,820 pending", "GH₵1,240 at risk". An ops user
 * downloading that got numbers that came from nowhere, which is worse than no
 * report. Demand is now counted from real order locations, and the money fields
 * are sums over actual orders.
 */
export const buildReport = (kind, region, orders = []) => {
  const summary = summarise(orders);

  // Group real orders by the locality part of their address, so the demand table
  // reflects where orders actually are rather than a hardcoded shortlist.
  const byArea = new Map();
  for (const order of orders) {
    const area = String(order.location ?? '').split(',')[0].trim() || 'Unspecified';
    byArea.set(area, (byArea.get(area) ?? 0) + 1);
  }
  const total = orders.length || 1;
  const demand = [...byArea.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([area, count]) => ({
      area,
      orders: count,
      share: `${Math.round((count / total) * 100)}%`,
    }));

  return {
    report: kind,
    generatedAt: new Date().toISOString(),
    region,
    hasData: orders.length > 0,
    demand,
    orderCount: summary.totalCount,
    paidCount: summary.paidCount,
    // Money is summed in integer pesewas and only formatted for display, so an
    // export never contains a string where a number belongs.
    paymentsPendingMinor: summary.unpaidMinor,
    paymentsPending: formatCedi(summary.unpaidMinor),
    collectedMinor: summary.chargedMinor,
    collected: formatCedi(summary.chargedMinor),
    platformCommissionMinor: summary.platformCommissionMinor,
    interventions: summary.unpaidCount > 0
      ? `${summary.unpaidCount} order(s) awaiting payment`
      : 'No outstanding orders',
  };
};

const downloadJson = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Owns the ops reporting flow: building a region-scoped report from real orders
 * and triggering the browser download.
 */
export function useReports({ region, orders = [], onNotice }) {
  const downloadReport = useCallback((kind) => {
    const report = buildReport(kind, region, orders);
    const filename = `aqualink-${kind.toLowerCase().replaceAll(' ', '-')}-${region.toLowerCase()}.json`;
    downloadJson(filename, report);
    onNotice(`${kind} report downloaded for ${region}.`);
  }, [region, orders, onNotice]);

  return { downloadReport };
}

export default useReports;
