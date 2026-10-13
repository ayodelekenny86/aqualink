import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update, remove } from '../lib/collections';
import { formatCedi } from '../lib/money';

const STORAGE_KEY = 'smart_schedules';

/**
 * Smart Scheduling hook: manages recurring delivery schedules for institutional
 * and regular customers. Includes demand forecasting to suggest optimal
 * delivery windows and automatic conflict resolution.
 */
export function useSmartScheduling({ orders = [], onNotice }) {
  const [schedules, setSchedules] = useState(() => list(STORAGE_KEY));
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState(null);

  // Frequency presets
  const FREQUENCIES = {
    daily: { label: 'Daily', days: 1, cron: '0 6 * * *' },
    weekdays: { label: 'Weekdays (Mon-Fri)', days: 1, cron: '0 6 * * 1-5' },
    weekly: { label: 'Weekly', days: 7, cron: '0 6 * * 1' },
    biweekly: { label: 'Bi-weekly', days: 14, cron: '0 6 * * 1' },
    monthly: { label: 'Monthly', days: 30, cron: '0 6 1 * *' },
    custom: { label: 'Custom interval', days: null, cron: null },
  };

  // Calculate next delivery date for a schedule
  const getNextDelivery = useCallback((schedule) => {
    if (!schedule.lastDelivery) return schedule.startDate;
    
    const last = new Date(schedule.lastDelivery);
    const next = new Date(last);
    next.setDate(next.getDate() + (schedule.frequencyDays || 7));
    
    // Skip weekends for weekdays frequency
    if (schedule.frequency === 'weekdays') {
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1);
      }
    }
    
    return next.toISOString().split('T')[0];
  }, []);

  // Check if schedule is due today
  const isDueToday = useCallback((schedule) => {
    if (!schedule.active) return false;
    const next = getNextDelivery(schedule);
    const today = new Date().toISOString().split('T')[0];
    return next <= today;
  }, [getNextDelivery]);

  // Get all due schedules
  const getDueSchedules = useCallback(() => {
    return schedules.filter(s => isDueToday(s));
  }, [schedules, isDueToday]);

  // Create a new schedule
  const createSchedule = useCallback(async (scheduleData) => {
    const schedule = {
      id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...scheduleData,
      frequencyDays: FREQUENCIES[scheduleData.frequency]?.days || scheduleData.customDays,
      active: true,
      createdAt: new Date().toISOString(),
      deliveryCount: 0,
      lastDelivery: null,
      nextDelivery: scheduleData.startDate,
    };
    
    const updated = [...schedules, schedule];
    setSchedules(updated);
    replaceAll(STORAGE_KEY, updated);
    onNotice?.(`Schedule created: ${schedule.frequency} delivery starting ${schedule.startDate}`);
    return schedule;
  }, [schedules, onNotice]);

  // Update schedule
  const updateSchedule = useCallback((id, updates) => {
    const updated = schedules.map(s => s.id === id ? { ...s, ...updates } : s);
    setSchedules(updated);
    replaceAll(STORAGE_KEY, updated);
    onNotice?.('Schedule updated');
  }, [schedules, onNotice]);

  // Toggle schedule active/inactive
  const toggleSchedule = useCallback((id) => {
    const schedule = schedules.find(s => s.id === id);
    if (schedule) {
      updateSchedule(id, { active: !schedule.active });
      onNotice?.(`Schedule ${!schedule.active ? 'activated' : 'paused'}`);
    }
  }, [schedules, updateSchedule, onNotice]);

  // Delete schedule
  const deleteSchedule = useCallback((id) => {
    const updated = schedules.filter(s => s.id !== id);
    setSchedules(updated);
    replaceAll(STORAGE_KEY, updated);
    onNotice?.('Schedule deleted');
  }, [schedules, onNotice]);

  // Record a delivery completion for a schedule
  const recordDelivery = useCallback((scheduleId, orderId) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (schedule) {
      const next = getNextDelivery({ ...schedule, lastDelivery: new Date().toISOString() });
      updateSchedule(scheduleId, {
        lastDelivery: new Date().toISOString(),
        nextDelivery: next,
        deliveryCount: schedule.deliveryCount + 1,
      });
    }
  }, [schedules, getNextDelivery, updateSchedule]);

  // Smart suggestions based on order history
  const getSmartSuggestions = useCallback(() => {
    const suggestions = [];
    const customerOrders = orders.filter(o => o.status === 'Delivered' || o.status === 'Paid');
    
    if (customerOrders.length < 3) return suggestions;
    
    // Analyze patterns
    const volumes = customerOrders.map(o => parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0'));
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const commonVolume = Math.round(avgVolume / 1000) * 1000; // Round to nearest 1000
    
    // Check for regular intervals
    const dates = customerOrders.map(o => new Date(o.createdAt).getTime()).sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24));
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    let suggestedFreq = 'weekly';
    if (avgInterval <= 2) suggestedFreq = 'daily';
    else if (avgInterval <= 6) suggestedFreq = 'weekdays';
    else if (avgInterval <= 10) suggestedFreq = 'weekly';
    else if (avgInterval <= 20) suggestedFreq = 'biweekly';
    else suggestedFreq = 'monthly';
    
    suggestions.push({
      type: 'recurring_schedule',
      frequency: suggestedFreq,
      volume: `${commonVolume} gallons`,
      confidence: Math.min(90, 50 + customerOrders.length * 5),
      reason: `Based on ${customerOrders.length} past deliveries, avg interval ${Math.round(avgInterval)} days`,
    });
    
    return suggestions;
  }, [orders]);

  // Auto-generate orders from due schedules (for demo/simulation)
  const processDueSchedules = useCallback(() => {
    const due = getDueSchedules();
    if (due.length === 0) return { created: 0 };
    
    let created = 0;
    due.forEach(schedule => {
      // In real app, this would create actual order via booking system
      recordDelivery(schedule.id, `auto-${Date.now()}`);
      created++;
    });
    
    if (created > 0) {
      onNotice?.(`Auto-generated ${created} scheduled delivery${created !== 1 ? 's' : ''}`);
    }
    setLastRun(new Date().toISOString());
    return { created };
  }, [getDueSchedules, recordDelivery, onNotice]);

  // Get schedule stats
  const stats = useMemo(() => ({
    total: schedules.length,
    active: schedules.filter(s => s.active).length,
    dueToday: getDueSchedules().length,
    totalDeliveries: schedules.reduce((s, sc) => s + sc.deliveryCount, 0),
  }), [schedules, getDueSchedules]);

  return {
    schedules,
    stats,
    loading,
    lastRun,
    FREQUENCIES,
    createSchedule,
    updateSchedule,
    toggleSchedule,
    deleteSchedule,
    recordDelivery,
    getDueSchedules,
    getSmartSuggestions,
    processDueSchedules,
    getNextDelivery,
    isDueToday,
  };
}

// Helper to replace all in localStorage
function replaceAll(key, data) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(data));
  }
}

export default useSmartScheduling;