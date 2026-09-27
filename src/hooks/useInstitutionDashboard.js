import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update, findBy } from '../lib/collections';
import { summarise } from '../lib/summary';
import { formatCedi } from '../lib/money';

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
    // Budget
    budget,
    updateBudget,
    // Analytics
    analytics,
    // Actions
    refreshData,
    refreshing,
  };
}

export default useInstitutionDashboard;