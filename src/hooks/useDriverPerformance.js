import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, replaceAll } from '../lib/collections';
import { formatCedi } from '../lib/money';

const STORAGE_KEY = 'driver_performance';

function generateId(prefix = 'dp') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function calculateEfficiencyScore(metrics) {
  const weights = {
    onTimeRate: 0.3,
    completionRate: 0.25,
    avgRating: 0.2,
    ordersPerHour: 0.15,
    fuelEfficiency: 0.1,
  };
  
  const normalized = {
    onTimeRate: metrics.onTimeRate || 0,
    completionRate: metrics.completionRate || 0,
    avgRating: (metrics.avgRating || 0) / 5,
    ordersPerHour: Math.min(1, (metrics.ordersPerHour || 0) / 4),
    fuelEfficiency: Math.min(1, (metrics.fuelEfficiency || 0) / 15),
  };
  
  const score = Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + (normalized[key] || 0) * weight;
  }, 0);
  
  return Math.round(score * 100);
}

function calculateDriverMetrics(driver, orders, driverLocations) {
  const driverOrders = orders.filter(o => o.driverId === driver.id);
  const completed = driverOrders.filter(o => o.status === 'Delivered');
  const total = driverOrders.length;
  
  if (total === 0) {
    return {
      driverId: driver.id,
      driverName: driver.name,
      totalOrders: 0,
      completedOrders: 0,
      onTimeRate: 0,
      completionRate: 0,
      avgRating: 0,
      avgDeliveryTime: 0,
      ordersPerHour: 0,
      totalRevenue: 0,
      totalDistance: 0,
      fuelEfficiency: 0,
      efficiencyScore: 0,
      tier: 'New',
      trends: { weekly: [], monthly: [] },
    };
  }
  
  const onTime = completed.filter(o => {
    const promised = new Date(o.promisedAt || o.createdAt);
    promised.setHours(promised.getHours() + 2);
    return new Date(o.deliveredAt) <= promised;
  }).length;
  
  const ratings = completed.filter(o => o.rating).map(o => o.rating);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  
  const deliveryTimes = completed.map(o => {
    const start = new Date(o.assignedAt || o.createdAt).getTime();
    const end = new Date(o.deliveredAt).getTime();
    return (end - start) / (1000 * 60);
  });
  const avgDeliveryTime = deliveryTimes.length ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length : 0;
  
  const hoursWorked = driverOrders.reduce((sum, o) => {
    const start = new Date(o.assignedAt || o.createdAt).getTime();
    const end = new Date(o.deliveredAt || Date.now()).getTime();
    return sum + (end - start) / (1000 * 60 * 60);
  }, 0) || 1;
  
  const totalRevenue = completed.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalDistance = completed.reduce((sum, o) => sum + (o.distance || 0), 0);
  
  const location = driverLocations[driver.id];
  const fuelUsed = location?.fuelUsed || totalDistance * 0.1;
  const fuelEfficiency = fuelUsed > 0 ? totalDistance / fuelUsed : 0;
  
  const metrics = {
    driverId: driver.id,
    driverName: driver.name,
    totalOrders: total,
    completedOrders: completed.length,
    onTimeRate: onTime / completed.length,
    completionRate: completed.length / total,
    avgRating,
    avgDeliveryTime: Math.round(avgDeliveryTime),
    ordersPerHour: completed.length / hoursWorked,
    totalRevenue,
    totalDistance: Math.round(totalDistance),
    fuelEfficiency: Math.round(fuelEfficiency * 10) / 10,
    efficiencyScore: 0,
    tier: '',
    trends: { weekly: [], monthly: [] },
  };
  
  metrics.efficiencyScore = calculateEfficiencyScore(metrics);
  
  if (metrics.efficiencyScore >= 85) metrics.tier = 'Elite';
  else if (metrics.efficiencyScore >= 70) metrics.tier = 'Pro';
  else if (metrics.efficiencyScore >= 55) metrics.tier = 'Standard';
  else metrics.tier = 'Needs Improvement';
  
  return metrics;
}

function getTierColor(tier) {
  const colors = {
    'Elite': '#10b981',
    'Pro': '#3b82f6',
    'Standard': '#f59e0b',
    'Needs Improvement': '#ef4444',
    'New': '#6b7280',
  };
  return colors[tier] || colors['New'];
}

function generateWeeklyTrends(orders, driverId, weeks = 4) {
  const trends = [];
  const now = new Date();
  
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (i + 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    const weekOrders = orders.filter(o => {
      const date = new Date(o.createdAt);
      return o.driverId === driverId && date >= weekStart && date <= weekEnd;
    });
    
    const completed = weekOrders.filter(o => o.status === 'Delivered');
    const revenue = completed.reduce((sum, o) => sum + (o.total || 0), 0);
    
    trends.push({
      week: weekStart.toISOString().split('T')[0],
      label: `Week ${weeks - i}`,
      orders: weekOrders.length,
      completed: completed.length,
      revenue: Math.round(revenue),
      rating: completed.filter(o => o.rating).reduce((sum, o) => sum + o.rating, 0) / Math.max(1, completed.filter(o => o.rating).length) || 0,
    });
  }
  
  return trends;
}

function generateLeaderboard(drivers, orders, driverLocations, limit = 10) {
  return drivers
    .map(driver => calculateDriverMetrics(driver, orders, driverLocations))
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
    .slice(0, limit)
    .map((d, i) => ({ ...d, rank: i + 1 }));
}

function identifyCoachingOpportunities(metrics) {
  const opportunities = [];
  
  if (metrics.onTimeRate < 0.8) {
    opportunities.push({
      type: 'punctuality',
      severity: 'high',
      message: 'On-time rate below 80%. Review route planning and departure times.',
      action: 'Assign mentor or optimize morning routes',
    });
  }
  
  if (metrics.completionRate < 0.9) {
    opportunities.push({
      type: 'completion',
      severity: 'high',
      message: 'Completion rate below 90%. Investigate failed deliveries.',
      action: 'Review cancellation reasons and customer communication',
    });
  }
  
  if (metrics.avgRating < 4.0) {
    opportunities.push({
      type: 'service',
      severity: 'medium',
      message: 'Average rating below 4.0. Focus on customer interaction.',
      action: 'Schedule customer service training',
    });
  }
  
  if (metrics.ordersPerHour < 1.5) {
    opportunities.push({
      type: 'efficiency',
      severity: 'medium',
      message: 'Less than 1.5 orders/hour. Optimize route sequencing.',
      action: 'Provide route optimization tools',
    });
  }
  
  if (metrics.fuelEfficiency < 8) {
    opportunities.push({
      type: 'fuel',
      severity: 'low',
      message: 'Fuel efficiency below 8 km/L. Check vehicle maintenance.',
      action: 'Schedule vehicle inspection',
    });
  }
  
  return opportunities;
}

export function useDriverPerformance({ drivers = [], orders = [], driverLocations = {}, onNotice }) {
  const [metrics, setMetrics] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [coachingAlerts, setCoachingAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const historical = stored ? JSON.parse(stored) : [];
      const allOrders = [...historical, ...orders].filter(o => o.status !== 'Cancelled');
      
      const driverMetrics = {};
      drivers.forEach(driver => {
        driverMetrics[driver.id] = calculateDriverMetrics(driver, allOrders, driverLocations);
      });
      
      const lb = generateLeaderboard(drivers, allOrders, driverLocations);
      const alerts = [];
      
      Object.values(driverMetrics).forEach(m => {
        const ops = identifyCoachingOpportunities(m);
        if (ops.length > 0) {
          alerts.push({ driverId: m.driverId, driverName: m.driverName, opportunities: ops });
        }
      });
      
      setMetrics(driverMetrics);
      setLeaderboard(lb);
      setCoachingAlerts(alerts);
      setLastUpdated(new Date().toISOString());
      
      const eliteCount = lb.filter(d => d.tier === 'Elite').length;
      const needsImprovement = lb.filter(d => d.tier === 'Needs Improvement').length;
      onNotice?.(`Driver performance updated: ${eliteCount} Elite, ${needsImprovement} need coaching`);
    } catch (error) {
      console.error('Driver performance error:', error);
      onNotice?.('Failed to calculate driver performance', 'error');
    } finally {
      setLoading(false);
    }
  }, [drivers, orders, driverLocations, onNotice]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getDriverMetrics = useCallback((driverId) => {
    return metrics[driverId] || null;
  }, [metrics]);

  const getLeaderboard = useCallback((tier) => {
    if (!tier) return leaderboard;
    return leaderboard.filter(d => d.tier === tier);
  }, [leaderboard]);

  const getCoachingAlerts = useCallback((severity) => {
    if (!severity) return coachingAlerts;
    return coachingAlerts.map(a => ({
      ...a,
      opportunities: a.opportunities.filter(o => o.severity === severity),
    })).filter(a => a.opportunities.length > 0);
  }, [coachingAlerts]);

  const recordOrder = useCallback((order) => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const historical = stored ? JSON.parse(stored) : [];
    historical.push({ ...order, createdAt: order.createdAt || new Date().toISOString() });
    const recent = historical.slice(-1000);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    refresh();
  }, [refresh]);

  const getTierColor = useCallback((tier) => getTierColor(tier), []);

  return {
    metrics,
    leaderboard,
    coachingAlerts,
    loading,
    lastUpdated,
    refresh,
    getDriverMetrics,
    getLeaderboard,
    getCoachingAlerts,
    recordOrder,
    getTierColor,
    formatCedi,
  };
}