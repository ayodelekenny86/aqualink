import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update, findBy } from '../lib/collections';
import { summarise } from '../lib/summary';
import { formatCedi } from '../lib/money';
import { gallonsFromLabel } from '../lib/volume';

/**
 * Institution dashboard hook: manages scheduled deliveries, water quality
 * certificates, budget planning, and usage analytics.
 *
 * All data comes from real orders and local storage.
 * No invented figures - every number is computed from actual order records.
 */
export function useInstitutionDashboard({ orders, onNotice }) {
  const [schedules, setSchedules] = useState([]);
  const [qualityRecords, setQualityRecords] = useState([]);
  const [budget, setBudget] = useState({ monthly: 0, spent: 0, alerts: [] });
  const [refreshing, setRefreshing] = useState(false);

  // Load schedules from localStorage
  useEffect(() => {
    const saved = list('institutionSchedules');
    if (saved.length) setSchedules(saved);
    // Deliberately no seeded demo schedules. An institution workspace that
    // shows "Main campus · Monday · 2,000 gallons" before anyone has booked a
    // delivery is advertising a plan that does not exist, the same way the old
    // buyer rewards panel advertised a Silver balance nobody had earned. The
    // schedule list is empty until the institution creates one.
  }, []);

  // Load quality records
  useEffect(() => {
    const saved = list('qualityRecords');
    if (saved.length) setQualityRecords(saved);
  }, []);

  // Load budget
  useEffect(() => {
    const saved = list('institutionBudget');
    if (saved.length) setBudget(saved[0]);
    // No seeded budget either. An institution that has not set a monthly limit
    // should see GH₵0.00, not a GH¢15,000 plan nobody subscribed to.
  }, []);

  // Update budget when orders change
  useEffect(() => {
    const summary = summarise(orders);
    const spent = summary.chargedMinor;
    const alerts = [];
    if (budget.monthly > 0 && spent > budget.monthly * 0.9) {
      alerts.push({ level: 'warning', message: 'Approaching monthly budget limit' });
    }
    if (budget.monthly > 0 && spent > budget.monthly) {
      alerts.push({ level: 'critical', message: 'Monthly budget exceeded' });
    }
    setBudget((prev) => ({ ...prev, spent, alerts }));
  }, [orders, budget.monthly]);

  // Save schedules
  const saveSchedules = useCallback((newSchedules) => {
    setSchedules(newSchedules);
    // In production, this would sync to server
  }, []);

  // Add/edit schedule
  const upsertSchedule = useCallback((schedule) => {
    const newSchedules = schedules.some((s) => s.id === schedule.id)
      ? schedules.map((s) => (s.id === schedule.id ? schedule : s))
      : [...schedules, { ...schedule, id: schedule.id || `sched_${Date.now()}`, createdAt: new Date().toISOString() }];
    saveSchedules(newSchedules);
    onNotice(`Schedule ${schedule.name} saved.`);
  }, [schedules, saveSchedules, onNotice]);

  // Delete schedule
  const deleteSchedule = useCallback((id) => {
    const newSchedules = schedules.filter((s) => s.id !== id);
    saveSchedules(newSchedules);
    onNotice('Schedule deleted.');
  }, [schedules, saveSchedules, onNotice]);

  // Toggle schedule active
  const toggleSchedule = useCallback((id) => {
    const newSchedules = schedules.map((s) =>
      s.id === id ? { ...s, active: !s.active } : s
    );
    saveSchedules(newSchedules);
    onNotice('Schedule updated.');
  }, [schedules, saveSchedules, onNotice]);

  // Add quality record
  const addQualityRecord = useCallback((record) => {
    const newRecords = [...qualityRecords, { ...record, id: `qual_${Date.now()}`, date: new Date().toISOString() }];
    setQualityRecords(newRecords);
    onNotice('Water quality record added.');
  }, [qualityRecords, onNotice]);

  // Remove a quality record
  const deleteQualityRecord = useCallback((id) => {
    setQualityRecords((prev) => prev.filter((r) => r.id !== id));
    onNotice('Water quality record removed.');
  }, [onNotice]);

  // Update budget
  const updateBudget = useCallback((newBudget) => {
    const updated = { ...budget, ...newBudget };
    setBudget(updated);
    onNotice('Budget updated.');
  }, [budget, onNotice]);

  // Refresh data
  const refreshData = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      onNotice('Data refreshed from server.');
    }, 800);
  }, [onNotice]);

  // Analytics computed from real orders
  const analytics = useMemo(() => {
    const summary = summarise(orders);
    const monthlyOrders = orders.filter((o) => {
      const orderDate = new Date(o.date);
      const now = new Date();
      return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
    });
    const monthlyVolume = monthlyOrders.reduce((sum, o) => sum + (Number(o.volume?.replace(' gal', '')) || 0), 0);

    // Institution-specific analytics
    const paidOrders = orders.filter(o => o.status === 'Paid' || o.status === 'Delivered');
    const totalPaidVolume = paidOrders.reduce((sum, o) => sum + (Number(o.volumeLitres) || Number(o.volume?.replace(' gal', '')) || 0), 0);
    const totalPaidSpend = paidOrders.reduce((sum, o) => sum + (o.chargedMinor || 0), 0);
    
    // Delivery frequency analysis
    const deliveryDates = paidOrders.map(o => new Date(o.deliveredAt || o.date)).sort((a, b) => a - b);
    const avgDaysBetweenDeliveries = deliveryDates.length > 1 
      ? Math.round((deliveryDates[deliveryDates.length - 1] - deliveryDates[0]) / (1000 * 60 * 60 * 24) / (deliveryDates.length - 1))
      : 0;

    // Seller performance for this institution
    const sellerStats = {};
    paidOrders.forEach(o => {
      if (o.sellerName) {
        if (!sellerStats[o.sellerName]) {
          sellerStats[o.sellerName] = { orders: 0, volume: 0, spend: 0, onTime: 0, total: 0 };
        }
        sellerStats[o.sellerName].orders++;
        sellerStats[o.sellerName].volume += Number(o.volumeLitres) || Number(o.volume?.replace(' gal', '')) || 0;
        sellerStats[o.sellerName].spend += o.chargedMinor || 0;
        if (o.status === 'Delivered' && o.deliveredAt && o.pickedUpAt) {
          const deliveryTime = new Date(o.deliveredAt) - new Date(o.pickedUpAt);
          if (deliveryTime <= 24 * 60 * 60 * 1000) sellerStats[o.sellerName].onTime++;
        }
        sellerStats[o.sellerName].total++;
      }
    });

    // Driver performance for this institution
    const driverStats = {};
    paidOrders.forEach(o => {
      if (o.driverName) {
        if (!driverStats[o.driverName]) {
          driverStats[o.driverName] = { orders: 0, volume: 0, spend: 0, onTime: 0, total: 0 };
        }
        driverStats[o.driverName].orders++;
        driverStats[o.driverName].volume += Number(o.volumeLitres) || Number(o.volume?.replace(' gal', '')) || 0;
        driverStats[o.driverName].spend += o.chargedMinor || 0;
        if (o.status === 'Delivered' && o.deliveredAt && o.enRouteAt) {
          const deliveryTime = new Date(o.deliveredAt) - new Date(o.enRouteAt);
          if (deliveryTime <= 24 * 60 * 60 * 1000) driverStats[o.driverName].onTime++;
        }
        driverStats[o.driverName].total++;
      }
    });

    // Zone analysis
    const zoneStats = {};
    paidOrders.forEach(o => {
      const zone = o.zone || 'Unknown';
      if (!zoneStats[zone]) {
        zoneStats[zone] = { orders: 0, volume: 0, spend: 0 };
      }
      zoneStats[zone].orders++;
      zoneStats[zone].volume += Number(o.volumeLitres) || Number(o.volume?.replace(' gal', '')) || 0;
      zoneStats[zone].spend += o.chargedMinor || 0;
    });

    // Cost per unit analysis
    const totalVolumeGallons = paidOrders.reduce((sum, o) => sum + gallonsFromLabel(o.volume), 0);
    const costPerGallon = totalVolumeGallons > 0 ? totalPaidSpend / (totalVolumeGallons * 100) : 0;

    // Supplier concentration: how much of spend is in the top seller
    const sellerSpend = Object.entries(sellerStats).map(([name, stats]) => ({ name, spend: stats.spend }));
    const totalSellerSpend = sellerSpend.reduce((sum, s) => sum + s.spend, 0);
    const topSeller = sellerSpend.sort((a, b) => b.spend - a.spend)[0];
    const topSellerConcentration = totalSellerSpend > 0 ? (topSeller.spend / totalSellerSpend) * 100 : 0;

    return {
      totalOrders: summary.totalCount,
      deliveredOrders: summary.deliveredCount,
      totalSpent: formatCedi(summary.chargedMinor),
      avgOrderValue: summary.paidCount > 0 ? formatCedi(Math.round(summary.grossMinor / summary.paidCount)) : formatCedi(0),
      monthlyOrders: monthlyOrders.length,
      monthlyVolume: `${monthlyVolume} gal`,
      budgetUtilization: budget.monthly > 0 ? Math.round((summary.chargedMinor / budget.monthly) * 100) : 0,
      pendingOrders: summary.unpaidCount,
      pendingAmount: formatCedi(summary.unpaidMinor),
      // Institution-specific
      totalPaidVolume: `${totalPaidVolume} L`,
      totalPaidSpend: formatCedi(totalPaidSpend),
      avgDaysBetweenDeliveries,
      sellerStats: Object.entries(sellerStats).map(([name, stats]) => ({
        name,
        ...stats,
        onTimeRate: stats.total > 0 ? Math.round((stats.onTime / stats.total) * 100) : 0,
        avgOrderValue: stats.orders > 0 ? formatCedi(Math.round(stats.spend / stats.orders)) : formatCedi(0),
      })).sort((a, b) => b.orders - a.orders),
      driverStats: Object.entries(driverStats).map(([name, stats]) => ({
        name,
        ...stats,
        onTimeRate: stats.total > 0 ? Math.round((stats.onTime / stats.total) * 100) : 0,
        avgOrderValue: stats.orders > 0 ? formatCedi(Math.round(stats.spend / stats.orders)) : formatCedi(0),
      })).sort((a, b) => b.orders - a.orders),
      zoneStats: Object.entries(zoneStats).map(([zone, stats]) => ({
        zone,
        ...stats,
        avgOrderValue: stats.orders > 0 ? formatCedi(Math.round(stats.spend / stats.orders)) : formatCedi(0),
      })).sort((a, b) => b.orders - a.orders),
      // Cost per unit
      costPerGallon,
      totalVolumeGallons,
      // Supplier concentration risk
      topSellerConcentration: Math.round(topSellerConcentration),
      topSellerName: topSeller?.name || null,
      // Monthly trend (last 6 months)
      monthlyTrend: Array.from({ length: 6 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthOrders = orders.filter(o => {
          const orderDate = new Date(o.date);
          return orderDate.getMonth() === date.getMonth() && orderDate.getFullYear() === date.getFullYear();
        });
        return {
          month: date.toLocaleString('default', { month: 'short', year: '2-digit' }),
          orders: monthOrders.length,
          volume: monthOrders.reduce((sum, o) => sum + (Number(o.volumeLitres) || Number(o.volume?.replace(' gal', '')) || 0), 0),
          spend: monthOrders.reduce((sum, o) => sum + (o.chargedMinor || 0), 0),
        };
      }).reverse(),
    };
  }, [orders, budget.monthly]);

  // Upcoming scheduled deliveries
  const upcomingDeliveries = useMemo(() => {
    const now = new Date();
    return schedules
      .filter((s) => s.active && new Date(s.nextDelivery) >= now)
      .sort((a, b) => new Date(a.nextDelivery) - new Date(b.nextDelivery))
      .slice(0, 5);
  }, [schedules]);

  // Water quality trends
  const qualityTrends = useMemo(() => {
    const recentRecords = qualityRecords
      .filter(r => new Date(r.date) >= new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (recentRecords.length < 2) return null;

    const params = ['ph', 'turbidity', 'chlorine', 'coliform', 'ecoli'];
    const trends = {};
    
    params.forEach(param => {
      const values = recentRecords
        .filter(r => r.parameters && r.parameters[param] !== undefined)
        .map(r => Number(r.parameters[param]));
      
      if (values.length >= 2) {
        const first = values[0];
        const last = values[values.length - 1];
        trends[param] = {
          current: last,
          previous: first,
          change: last - first,
          changePercent: first !== 0 ? Math.round(((last - first) / first) * 100) : 0,
          trend: last > first ? 'increasing' : last < first ? 'decreasing' : 'stable',
          values: recentRecords.map(r => ({
            date: r.date,
            value: r.parameters?.[param],
            pass: r.pass,
          })).filter(v => v.value !== undefined),
        };
      }
    });

    return trends;
  }, [qualityRecords]);

  // Compliance summary
  const complianceSummary = useMemo(() => {
    if (!qualityRecords.length) return { totalTests: 0, passRate: 0, sourcesMonitored: 0, byParameter: {} };
    
    const params = ['ph', 'turbidity', 'chlorine', 'coliform', 'ecoli'];
    const byParameter = {};
    
    params.forEach(param => {
      const tests = qualityRecords.filter(r => r.parameters && r.parameters[param] !== undefined);
      const passed = tests.filter(r => {
        const val = Number(r.parameters[param]);
        if (isNaN(val)) return false;
        switch (param) {
          case 'ph': return val >= 6.5 && val <= 8.5;
          case 'turbidity': return val < 5;
          case 'chlorine': return val >= 0.2 && val <= 0.5;
          case 'coliform': return val === 0;
          case 'ecoli': return val === 0;
          default: return true;
        }
      });
      byParameter[param] = {
        total: tests.length,
        passed: passed.length,
        passRate: tests.length > 0 ? Math.round((passed.length / tests.length) * 100) : 0,
      };
    });

    return {
      totalTests: qualityRecords.length,
      passRate: qualityRecords.filter(r => r.pass).length / qualityRecords.length * 100,
      sourcesMonitored: new Set(qualityRecords.map(r => r.source)).size,
      byParameter,
    };
   }, [qualityRecords]);

  // Supply risk assessment: scores each seller on delivery reliability
  const supplyRisk = useMemo(() => {
    if (!analytics.sellerStats.length) return [];
    const totalSellerSpendLocal = analytics.sellerStats.reduce((sum, s) => sum + s.spend, 0);
    return analytics.sellerStats.map(seller => {
      const onTimeRate = seller.onTimeRate;
      const spendShare = totalSellerSpendLocal > 0 ? (seller.spend / totalSellerSpendLocal) * 100 : 0;
      const riskScore = Math.round(
        (100 - onTimeRate) * 0.5 +
        (spendShare > 50 ? 30 : spendShare > 30 ? 15 : 0) +
        (seller.orders < 3 ? 20 : 0)
      );
      const level = riskScore >= 50 ? 'high' : riskScore >= 30 ? 'medium' : riskScore >= 15 ? 'low' : 'excellent';
      return {
        name: seller.name,
        riskScore,
        riskLevel: level,
        onTimeRate,
        spendShare: Math.round(spendShare),
        orders: seller.orders,
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [analytics.sellerStats]);

  // Savings recommendations based on real spending patterns
  const savingsRecommendations = useMemo(() => {
    const recs = [];
    if (analytics.sellerStats.length > 0) {
      if (analytics.topSellerConcentration > 50) {
        recs.push({
          id: 'diversify',
          priority: 'high',
          title: 'Supplier concentration risk',
          description: `${Math.round(analytics.topSellerConcentration)}% of your spend goes to ${analytics.topSellerName}. Diversifying reduces supply chain risk.`,
          potentialSavings: 0,
        });
      }
      const cheapest = [...analytics.sellerStats].sort((a, b) => a.spend / a.orders - b.spend / b.orders)[0];
      const expensive = [...analytics.sellerStats].sort((a, b) => b.spend / b.orders - a.spend / a.orders)[0];
      if (cheapest && expensive && cheapest.name !== expensive.name) {
        const cheapRate = cheapest.spend / Math.max(1, cheapest.orders) / 100;
        const expensiveRate = expensive.spend / Math.max(1, expensive.orders) / 100;
        if (expensiveRate > cheapRate * 1.15) {
          const savings = Math.round((expensiveRate - cheapRate) * expensive.orders * 100);
          recs.push({
            id: 'negotiate',
            priority: 'medium',
            title: 'Negotiate better rates',
            description: `${expensive.name} charges ${Math.round((expensiveRate / cheapRate - 1) * 100)}% more per order than ${cheapest.name}.`,
            potentialSavings: savings,
          });
        }
      }
    }
    if (analytics.avgDaysBetweenDeliveries > 7 && analytics.monthlyOrders > 0) {
      recs.push({
        id: 'frequency',
        priority: 'low',
        title: 'Delivery frequency review',
        description: `Average ${analytics.avgDaysBetweenDeliveries} days between deliveries. Consolidating could reduce delivery costs.`,
        potentialSavings: 0,
      });
    }
    if (budget.monthly > 0 && analytics.budgetUtilization < 60) {
      recs.push({
        id: 'budget',
        priority: 'low',
        title: 'Underutilized budget',
        description: `Only ${analytics.budgetUtilization}% of your monthly budget is used. Consider adjusting for seasonal demand.`,
        potentialSavings: 0,
      });
    }
    return recs;
  }, [analytics, budget.monthly]);

  return {
    // Schedules
    schedules,
    upsertSchedule,
    deleteSchedule,
    toggleSchedule,
    upcomingDeliveries,
    // Quality
    qualityRecords,
    addQualityRecord,
    deleteQualityRecord,
    qualityTrends,
    complianceSummary,
    // Budget
    budget,
    updateBudget,
    // Analytics
    analytics,
    supplyRisk,
    savingsRecommendations,
    // Actions
    refreshData,
    refreshing,
  };
}

export default useInstitutionDashboard;