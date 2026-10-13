import { useState, useEffect, useCallback, useMemo } from 'react';

export function useRevenueLeakDetection({ 
  orders = [], 
  payments = [], 
  invoices = [],
  pricing = {},
  drivers = [],
  facilities = [],
  onNotice 
}) {
  const [leaks, setLeaks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const detectLeaks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 300));

      const detectedLeaks = [];

      const unpaidDelivered = orders.filter(o => 
        o.status === 'Delivered' && 
        o.payment !== 'Released' && 
        o.payment !== 'Paid'
      );

      unpaidDelivered.forEach(order => {
        const expectedRevenue = order.price || (order.volume * (pricing.perGallon || 0.02));
        detectedLeaks.push({
          id: `leak-unpaid-${order.id}`,
          type: 'unpaid_delivery',
          severity: 'high',
          title: `Unpaid Delivery: ${order.id}`,
          description: `Order delivered but payment not collected`,
          orderId: order.id,
          customerId: order.customerId,
          expectedRevenue: Math.round(expectedRevenue * 100) / 100,
          daysOutstanding: order.deliveredAt 
            ? Math.ceil((Date.now() - new Date(order.deliveredAt).getTime()) / (1000 * 60 * 60 * 24))
            : 0,
          detectedAt: new Date().toISOString(),
          status: 'detected',
          recommendedAction: 'Send payment reminder and follow up with delivery code verification'
        });
      });

      const priceDiscrepancies = orders.filter(o => {
        const expectedPrice = o.volume * (pricing.perGallon || 0.02);
        return o.price && Math.abs(o.price - expectedPrice) > expectedPrice * 0.05;
      });

      priceDiscrepancies.forEach(order => {
        const expectedPrice = order.volume * (pricing.perGallon || 0.02);
        const difference = order.price - expectedPrice;
        detectedLeaks.push({
          id: `leak-price-${order.id}`,
          type: difference > 0 ? 'overcharge' : 'undercharge',
          severity: Math.abs(difference) > expectedPrice * 0.15 ? 'high' : 'medium',
          title: `${difference > 0 ? 'Overcharge' : 'Undercharge'}: ${order.id}`,
          description: `Order priced at GH₵${order.price.toFixed(2)} vs expected GH₵${expectedPrice.toFixed(2)} (${difference > 0 ? '+' : ''}${difference.toFixed(2)})`,
          orderId: order.id,
          customerId: order.customerId,
          expectedRevenue: Math.round(expectedPrice * 100) / 100,
          actualRevenue: Math.round(order.price * 100) / 100,
          difference: Math.round(difference * 100) / 100,
          detectedAt: new Date().toISOString(),
          status: 'detected',
          recommendedAction: difference > 0 
            ? 'Review pricing - customer may dispute overcharge'
            : 'Revenue leak - investigate pricing error or unauthorized discount'
        });
      });

      const duplicateOrders = [];
      const orderMap = {};
      orders.forEach(o => {
        const key = `${o.customerId}-${o.volume}-${o.location}-${o.date?.split('T')[0]}`;
        if (!orderMap[key]) orderMap[key] = [];
        orderMap[key].push(o);
      });
      Object.values(orderMap).forEach(group => {
        if (group.length > 1) {
          group.slice(1).forEach(dup => {
            detectedLeaks.push({
              id: `leak-duplicate-${dup.id}`,
              type: 'duplicate_order',
              severity: 'medium',
              title: `Possible Duplicate Order: ${dup.id}`,
              description: `Similar order to ${group[0].id} for same customer/volume/location/date`,
              orderId: dup.id,
              customerId: dup.customerId,
              expectedRevenue: 0,
              actualRevenue: dup.price || 0,
              difference: -(dup.price || 0),
              detectedAt: new Date().toISOString(),
              status: 'detected',
              recommendedAction: 'Verify if duplicate - may need to cancel and refund'
            });
          });
        }
      });

      const driverPayoutLeaks = drivers.map(driver => {
        const driverOrders = orders.filter(o => o.driverId === driver.id && o.status === 'Delivered');
        const driverPayments = payments.filter(p => p.driverId === driver.id);
        const expectedPayout = driverOrders.reduce((sum, o) => sum + (o.driverCommission || o.price * 0.15 || 0), 0);
        const actualPayout = driverPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const difference = expectedPayout - actualPayout;
        
        if (difference > 10) {
          return {
            id: `leak-driver-${driver.id}`,
            type: 'driver_underpayment',
            severity: difference > 100 ? 'high' : 'medium',
            title: `Driver Underpayment: ${driver.name}`,
            description: `Expected payout GH₵${expectedPayout.toFixed(2)} vs paid GH₵${actualPayout.toFixed(2)}`,
            driverId: driver.id,
            driverName: driver.name,
            expectedRevenue: Math.round(expectedPayout * 100) / 100,
            actualRevenue: Math.round(actualPayout * 100) / 100,
            difference: Math.round(difference * 100) / 100,
            detectedAt: new Date().toISOString(),
            status: 'detected',
            recommendedAction: 'Process missing driver payment'
          };
        }
        return null;
      }).filter(Boolean);

      detectedLeaks.push(...driverPayoutLeaks);

      const facilityRevenueLoss = facilities.map(facility => {
        const facilityOrders = orders.filter(o => o.facilityId === facility.id);
        const capacityUtilization = facility.dailyCapacity 
          ? facilityOrders.reduce((sum, o) => sum + (o.volume || 0), 0) / (facility.dailyCapacity * 30)
          : 0;
        
        if (capacityUtilization < 0.4 && facilityOrders.length > 0) {
          const lostRevenue = facility.dailyCapacity * (0.4 - capacityUtilization) * 30 * (pricing.perGallon || 0.02);
          return {
            id: `leak-facility-${facility.id}`,
            type: 'underutilized_facility',
            severity: capacityUtilization < 0.2 ? 'high' : 'medium',
            title: `Underutilized Facility: ${facility.name}`,
            description: `Facility at ${Math.round(capacityUtilization * 100)}% capacity - estimated monthly loss GH₵${lostRevenue.toFixed(2)}`,
            facilityId: facility.id,
            facilityName: facility.name,
            expectedRevenue: Math.round(lostRevenue * 100) / 100,
            actualRevenue: 0,
            difference: -Math.round(lostRevenue * 100) / 100,
            utilizationPercent: Math.round(capacityUtilization * 100),
            detectedAt: new Date().toISOString(),
            status: 'detected',
            recommendedAction: 'Consider demand generation campaigns or facility consolidation'
          };
        }
        return null;
      }).filter(Boolean);

      detectedLeaks.push(...facilityRevenueLoss);

      const invoiceDiscrepancies = invoices.filter(inv => {
        const relatedOrders = orders.filter(o => o.invoiceId === inv.id);
        const orderTotal = relatedOrders.reduce((sum, o) => sum + (o.price || 0), 0);
        return Math.abs(inv.amount - orderTotal) > 1;
      });

      invoiceDiscrepancies.forEach(inv => {
        const relatedOrders = orders.filter(o => o.invoiceId === inv.id);
        const orderTotal = relatedOrders.reduce((sum, o) => sum + (o.price || 0), 0);
        detectedLeaks.push({
          id: `leak-invoice-${inv.id}`,
          type: inv.amount > orderTotal ? 'invoice_overcharge' : 'invoice_undercharge',
          severity: 'medium',
          title: `Invoice Mismatch: ${inv.id}`,
          description: `Invoice GH₵${inv.amount.toFixed(2)} vs orders total GH₵${orderTotal.toFixed(2)}`,
          invoiceId: inv.id,
          expectedRevenue: Math.round(orderTotal * 100) / 100,
          actualRevenue: Math.round(inv.amount * 100) / 100,
          difference: Math.round((inv.amount - orderTotal) * 100) / 100,
          detectedAt: new Date().toISOString(),
          status: 'detected',
          recommendedAction: 'Reconcile invoice with order records'
        });
      });

      detectedLeaks.push(...invoiceDiscrepancies);

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const totalLeakAmount = detectedLeaks
        .filter(l => l.difference < 0)
        .reduce((sum, l) => sum + Math.abs(l.difference), 0);

      const totalOverchargeAmount = detectedLeaks
        .filter(l => l.difference > 0)
        .reduce((sum, l) => sum + l.difference, 0);

      const byType = detectedLeaks.reduce((acc, leak) => {
        if (!acc[leak.type]) acc[leak.type] = { count: 0, amount: 0 };
        acc[leak.type].count++;
        acc[leak.type].amount += Math.abs(leak.difference);
        return acc;
      }, {});

      const bySeverity = detectedLeaks.reduce((acc, leak) => {
        if (!acc[leak.severity]) acc[leak.severity] = { count: 0, amount: 0 };
        acc[leak.severity].count++;
        acc[leak.severity].amount += Math.abs(leak.difference);
        return acc;
      }, {});

      setLeaks(detectedLeaks.sort((a, b) => 
        (b.severity === 'critical' ? 3 : b.severity === 'high' ? 2 : 1) - 
        (a.severity === 'critical' ? 3 : a.severity === 'high' ? 2 : 1)
      ));

      setSummary({
        totalLeaks: detectedLeaks.length,
        totalLeakAmount: Math.round(totalLeakAmount * 100) / 100,
        totalOverchargeAmount: Math.round(totalOverchargeAmount * 100) / 100,
        netLeak: Math.round((totalLeakAmount - totalOverchargeAmount) * 100) / 100,
        byType,
        bySeverity,
        criticalCount: detectedLeaks.filter(l => l.severity === 'critical').length,
        highCount: detectedLeaks.filter(l => l.severity === 'high').length,
        mediumCount: detectedLeaks.filter(l => l.severity === 'medium').length,
        lowCount: detectedLeaks.filter(l => l.severity === 'low').length,
        resolvedCount: 0,
        lastScan: new Date().toISOString()
      });

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, payments, invoices, pricing, drivers, facilities]);

  const markResolved = useCallback((leakId, resolutionNotes) => {
    setLeaks(prev => prev.map(l => 
      l.id === leakId ? { ...l, status: 'resolved', resolvedAt: new Date().toISOString(), resolutionNotes } : l
    ));
    setSummary(prev => prev ? { ...prev, resolvedCount: prev.resolvedCount + 1 } : null);
    onNotice?.(`Leak marked as resolved`);
  }, [onNotice]);

  const dismissLeak = useCallback((leakId, reason) => {
    setLeaks(prev => prev.map(l => 
      l.id === leakId ? { ...l, status: 'dismissed', dismissedAt: new Date().toISOString(), dismissReason: reason } : l
    ));
    onNotice?.(`Leak dismissed: ${reason}`);
  }, [onNotice]);

  useEffect(() => { detectLeaks(); }, [detectLeaks]);

  const getLeaksByType = useCallback((type) => {
    return leaks.filter(l => l.type === type);
  }, [leaks]);

  const getLeaksBySeverity = useCallback((severity) => {
    return leaks.filter(l => l.severity === severity);
  }, [leaks]);

  const getUnresolvedLeaks = useCallback(() => {
    return leaks.filter(l => l.status === 'detected');
  }, [leaks]);

  return {
    leaks,
    summary,
    loading,
    error,
    refresh: detectLeaks,
    markResolved,
    dismissLeak,
    getLeaksByType,
    getLeaksBySeverity,
    getUnresolvedLeaks,
    totalLeakAmount: summary?.totalLeakAmount || 0,
    netLeak: summary?.netLeak || 0,
    criticalCount: summary?.criticalCount || 0,
    highCount: summary?.highCount || 0
  };
}

export default useRevenueLeakDetection;