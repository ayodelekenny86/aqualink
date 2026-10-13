import { useState, useEffect, useCallback, useMemo } from 'react';

export function useRevenueLeakDetection({ 
  orders = [], 
  payments = [],
  invoices = [],
  deliveries = [],
  customers = [],
  pricing = {},
  onNotice 
}) {
  const [leaks, setLeaks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const detectLeaks = useCallback(async () => {
    if (!orders.length && !payments.length) {
      setLeaks({ leaks: [], summary: {} });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 500));

      const detectedLeaks = [];

      const unpaidInvoices = invoices.filter(i => i.status === 'unpaid' || i.status === 'overdue');
      if (unpaidInvoices.length > 0) {
        const totalUnpaid = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0);
        detectedLeaks.push({
          id: 'leak-unpaid',
          type: 'unpaid_invoices',
          severity: totalUnpaid > 50000 ? 'critical' : totalUnpaid > 10000 ? 'high' : 'medium',
          title: 'Unpaid/Overdue Invoices',
          description: `${unpaidInvoices.length} invoices totaling GH₵${totalUnpaid.toLocaleString()} unpaid`,
          estimatedLoss: totalUnpaid,
          affectedCustomers: unpaidInvoices.map(i => i.customerId).filter(Boolean),
          count: unpaidInvoices.length,
          recommendations: ['Send payment reminders', 'Escalate to collections', 'Offer payment plans'],
          detectedAt: new Date().toISOString()
        });
      }

      const partialDeliveries = deliveries.filter(d => d.deliveredVolume < d.orderedVolume * 0.95);
      if (partialDeliveries.length > 0) {
        const lostVolume = partialDeliveries.reduce((s, d) => s + (d.orderedVolume - d.deliveredVolume), 0);
        const lostRevenue = lostVolume * (pricing.perGallon || 0.02);
        detectedLeaks.push({
          id: 'leak-partial',
          type: 'partial_delivery',
          severity: lostRevenue > 10000 ? 'high' : 'medium',
          title: 'Partial Deliveries Not Billed',
          description: `${partialDeliveries.length} deliveries with ${lostVolume.toLocaleString()} gal shortfall`,
          estimatedLoss: Math.round(lostRevenue * 100) / 100,
          affectedOrders: partialDeliveries.map(d => d.orderId),
          count: partialDeliveries.length,
          recommendations: ['Bill for actual delivered volume', 'Investigate delivery discrepancies', 'Update delivery confirmation process'],
          detectedAt: new Date().toISOString()
        });
      }

      const pricingErrors = orders.filter(o => {
        const expectedPrice = pricing.perGallon || 0.02;
        const actualPrice = o.totalAmount / o.volume;
        return Math.abs(actualPrice - expectedPrice) / expectedPrice > 0.1;
      });
      if (pricingErrors.length > 0) {
        const totalDiscrepancy = pricingErrors.reduce((s, o) => {
          const expectedPrice = pricing.perGallon || 0.02;
          return s + Math.abs((o.totalAmount / o.volume) - expectedPrice) * o.volume;
        }, 0);
        detectedLeaks.push({
          id: 'leak-pricing',
          type: 'pricing_errors',
          severity: totalDiscrepancy > 5000 ? 'high' : 'medium',
          title: 'Pricing Discrepancies',
          description: `${pricingErrors.length} orders with pricing deviations >10%`,
          estimatedLoss: Math.round(totalDiscrepancy * 100) / 100,
          affectedOrders: pricingErrors.map(o => o.id),
          count: pricingErrors.length,
          recommendations: ['Audit pricing rules', 'Validate invoice calculations', 'Implement automated price validation'],
          detectedAt: new Date().toISOString()
        });
      }

      const failedPayments = payments.filter(p => p.status === 'failed' || p.status === 'declined');
      if (failedPayments.length > 0) {
        const failedAmount = failedPayments.reduce((s, p) => s + (p.amount || 0), 0);
        detectedLeaks.push({
          id: 'leak-payments',
          type: 'failed_payments',
          severity: failedAmount > 20000 ? 'critical' : failedAmount > 5000 ? 'high' : 'medium',
          title: 'Failed/Declined Payments',
          description: `${failedPayments.length} failed payments totaling GH₵${failedAmount.toLocaleString()}`,
          estimatedLoss: failedAmount,
          affectedCustomers: failedPayments.map(p => p.customerId).filter(Boolean),
          count: failedPayments.length,
          recommendations: ['Retry failed payments', 'Contact customers for alternative payment', 'Update payment methods'],
          detectedAt: new Date().toISOString()
        });
      }

      const duplicateOrders = findDuplicateOrders(orders);
      if (duplicateOrders.length > 0) {
        const duplicateRevenue = duplicateOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
        detectedLeaks.push({
          id: 'leak-duplicates',
          type: 'duplicate_orders',
          severity: 'medium',
          title: 'Potential Duplicate Orders',
          description: `${duplicateOrders.length} orders with similar patterns detected`,
          estimatedLoss: Math.round(duplicateRevenue * 100) / 100,
          affectedOrders: duplicateOrders.map(o => o.id),
          count: duplicateOrders.length,
          recommendations: ['Review order approval workflow', 'Implement duplicate detection', 'Consolidate duplicate deliveries'],
          detectedAt: new Date().toISOString()
        });
      }

      const unbilledServices = orders.filter(o => o.status === 'delivered' && !invoices.find(i => i.orderId === o.id));
      if (unbilledServices.length > 0) {
        const unbilledAmount = unbilledServices.reduce((s, o) => s + (o.totalAmount || 0), 0);
        detectedLeaks.push({
          id: 'leak-unbilled',
          type: 'unbilled_deliveries',
          severity: unbilledAmount > 10000 ? 'high' : 'medium',
          title: 'Delivered but Unbilled Orders',
          description: `${unbilledServices.length} delivered orders without invoices`,
          estimatedLoss: unbilledAmount,
          affectedOrders: unbilledServices.map(o => o.id),
          count: unbilledServices.length,
          recommendations: ['Auto-generate invoices on delivery', 'Reconcile deliveries with billing', 'Set up billing alerts'],
          detectedAt: new Date().toISOString()
        });
      }

      const subscriptionLeaks = detectSubscriptionLeaks(customers, invoices);
      if (subscriptionLeaks.length > 0) {
        detectedLeaks.push(...subscriptionLeaks);
      }

      const totalEstimatedLoss = detectedLeaks.reduce((s, l) => s + l.estimatedLoss, 0);
      const criticalCount = detectedLeaks.filter(l => l.severity === 'critical').length;
      const highCount = detectedLeaks.filter(l => l.severity === 'high').length;

      const newLeaks = {
        leaks: detectedLeaks,
        summary: {
          totalLeaks: detectedLeaks.length,
          totalEstimatedLoss: Math.round(totalEstimatedLoss * 100) / 100,
          criticalCount,
          highCount,
          mediumCount: detectedLeaks.filter(l => l.severity === 'medium').length,
          lowCount: detectedLeaks.filter(l => l.severity === 'low').length,
          byType: detectedLeaks.reduce((acc, l) => {
            acc[l.type] = (acc[l.type] || 0) + 1;
            return acc;
          }, {}),
          topLeaks: detectedLeaks.sort((a, b) => b.estimatedLoss - a.estimatedLoss).slice(0, 5)
        },
        generatedAt: new Date().toISOString()
      };

      setLeaks(newLeaks);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, payments, invoices, deliveries, customers, pricing]);

  const findDuplicateOrders = (orders) => {
    const duplicates = [];
    const seen = new Map();
    orders.forEach(o => {
      const key = `${o.customerId}-${o.volume}-${o.facilityId}-${new Date(o.createdAt).toDateString()}`;
      if (seen.has(key)) {
        duplicates.push(o);
      } else {
        seen.set(key, o);
      }
    });
    return duplicates;
  };

  const detectSubscriptionLeaks = (customers, invoices) => {
    const leaks = [];
    const subscriptionCustomers = customers.filter(c => c.subscriptionId);
    subscriptionCustomers.forEach(c => {
      const customerInvoices = invoices.filter(i => i.customerId === c.id);
      const expectedMonthly = c.subscriptionAmount || 0;
      const actualMonthly = customerInvoices.length > 0 
        ? customerInvoices.reduce((s, i) => s + (i.amount || 0), 0) / customerInvoices.length 
        : 0;
      if (expectedMonthly > 0 && actualMonthly < expectedMonthly * 0.8) {
        leaks.push({
          id: `leak-sub-${c.id}`,
          type: 'subscription_underbilling',
          severity: 'medium',
          title: `Subscription Underbilling: ${c.name}`,
          description: `Expected GH₵${expectedMonthly}/mo, billing GH₵${Math.round(actualMonthly)}/mo`,
          estimatedLoss: Math.round((expectedMonthly - actualMonthly) * 12 * 100) / 100,
          affectedCustomers: [c.id],
          count: 1,
          recommendations: ['Review subscription terms', 'Update billing configuration', 'Contact customer'],
          detectedAt: new Date().toISOString()
        });
      }
    });
    return leaks;
  };

  const getLeaksByType = useCallback((type) => {
    return leaks?.leaks?.filter(l => l.type === type) || [];
  }, [leaks]);

  const getLeaksBySeverity = useCallback((severity) => {
    return leaks?.leaks?.filter(l => l.severity === severity) || [];
  }, [leaks]);

  const markLeakResolved = useCallback((leakId) => {
    setLeaks(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        leaks: prev.leaks.map(l => l.id === leakId ? { ...l, resolved: true, resolvedAt: new Date().toISOString() } : l)
      };
    });
    onNotice?.(`Leak ${leakId} marked resolved`);
  }, [onNotice]);

  const getTotalRecoverable = useCallback(() => {
    return leaks?.leaks
      ?.filter(l => !l.resolved)
      .reduce((s, l) => s + l.estimatedLoss, 0) || 0;
  }, [leaks]);

  useEffect(() => { detectLeaks(); }, [detectLeaks]);

  return {
    leaks,
    loading,
    error,
    refresh: detectLeaks,
    getLeaksByType,
    getLeaksBySeverity,
    markLeakResolved,
    getTotalRecoverable,
    totalEstimatedLoss: leaks?.summary?.totalEstimatedLoss || 0,
    criticalCount: leaks?.summary?.criticalCount || 0,
    highCount: leaks?.summary?.highCount || 0,
    totalLeaks: leaks?.summary?.totalLeaks || 0
  };
}

export default useRevenueLeakDetection;