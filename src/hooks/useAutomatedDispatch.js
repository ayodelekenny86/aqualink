import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, replaceAll } from '../lib/collections';
import { formatCedi } from '../lib/money';

const STORAGE_KEY = 'automated_dispatch';

function generateId(prefix = 'ad') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function calculateMatchScore(order, driver, driverLocations, zoneLoads) {
  const location = driverLocations[driver.id];
  if (!location || !location.lat || !location.lng) return 0;
  
  const orderLat = order.lat || 5.6037;
  const orderLng = order.lng || -0.1870;
  const distance = haversineDistance(location.lat, location.lng, orderLat, orderLng);
  
  const distanceScore = Math.max(0, 1 - distance / 50);
  
  const zoneLoad = zoneLoads[order.zone] || 0;
  const capacityScore = Math.max(0, 1 - zoneLoad / 10);
  
  const driverMetrics = driver.metrics || {};
  const performanceScore = (driverMetrics.efficiencyScore || 50) / 100;
  
  const vehicleMatch = order.requiresTruck && driver.vehicleType !== 'truck' ? 0 : 1;
  const vehicleScore = vehicleMatch ? 1 : 0.3;
  
  const currentOrders = driver.currentOrders || 0;
  const workloadScore = Math.max(0, 1 - currentOrders / 5);
  
  const timeSinceLastOrder = location.lastOrderTime 
    ? (Date.now() - new Date(location.lastOrderTime).getTime()) / (1000 * 60)
    : 60;
  const availabilityScore = Math.min(1, timeSinceLastOrder / 30);
  
  const weights = {
    distance: 0.3,
    capacity: 0.15,
    performance: 0.2,
    vehicle: 0.15,
    workload: 0.1,
    availability: 0.1,
  };
  
  const score = 
    distanceScore * weights.distance +
    capacityScore * weights.capacity +
    performanceScore * weights.performance +
    vehicleScore * weights.vehicle +
    workloadScore * weights.workload +
    availabilityScore * weights.availability;
  
  return {
    score: Math.round(score * 100),
    factors: {
      distance: Math.round(distanceScore * 100),
      capacity: Math.round(capacityScore * 100),
      performance: Math.round(performanceScore * 100),
      vehicle: Math.round(vehicleScore * 100),
      workload: Math.round(workloadScore * 100),
      availability: Math.round(availabilityScore * 100),
    },
    distance: Math.round(distance * 10) / 10,
  };
}

function findBestDriver(order, availableDrivers, driverLocations, zoneLoads) {
  const scored = availableDrivers
    .map(driver => ({
      driver,
      ...calculateMatchScore(order, driver, driverLocations, zoneLoads),
    }))
    .filter(m => m.score > 30)
    .sort((a, b) => b.score - a.score);
  
  return scored[0] || null;
}

function autoDispatchOrders(pendingOrders, availableDrivers, driverLocations, zoneLoads, config = {}) {
  const { maxDistance = 25, minScore = 50, batchSize = 10 } = config;
  
  const sortedOrders = [...pendingOrders].sort((a, b) => {
    const priority = { 'Urgent': 3, 'High': 2, 'Normal': 1, 'Low': 0 };
    return (priority[b.priority] || 1) - (priority[a.priority] || 1);
  });
  
  const assignments = [];
  const usedDrivers = new Set();
  
  for (const order of sortedOrders.slice(0, batchSize)) {
    const available = availableDrivers.filter(d => !usedDrivers.has(d.id));
    if (available.length === 0) break;
    
    const match = findBestDriver(order, available, driverLocations, zoneLoads);
    
    if (match && match.score >= minScore && match.distance <= maxDistance) {
      assignments.push({
        orderId: order.id,
        driverId: match.driver.id,
        driverName: match.driver.name,
        score: match.score,
        distance: match.distance,
        factors: match.factors,
        timestamp: new Date().toISOString(),
        status: 'assigned',
      });
      usedDrivers.add(match.driver.id);
    }
  }
  
  return assignments;
}

function generateDispatchPlan(orders, drivers, driverLocations, zoneLoads, config = {}) {
  const pending = orders.filter(o => 
    ['Pending', 'Confirmed', 'Assigned'].includes(o.status) && !o.driverId
  );
  
  const available = drivers.filter(d => 
    d.status === 'Online' && 
    (d.currentOrders || 0) < (d.maxOrders || 5)
  );
  
  const assignments = autoDispatchOrders(pending, available, driverLocations, zoneLoads, config);
  
  const unassigned = pending.filter(o => !assignments.some(a => a.orderId === o.id));
  const idleDrivers = available.filter(d => !assignments.some(a => a.driverId === d.id));
  
  return {
    assignments,
    unassigned: unassigned.map(o => ({
      orderId: o.id,
      reason: available.length === 0 ? 'No drivers online' : 'No suitable match found',
      priority: o.priority,
      zone: o.zone,
    })),
    idleDrivers: idleDrivers.map(d => ({
      driverId: d.id,
      driverName: d.name,
      currentOrders: d.currentOrders || 0,
      location: driverLocations[d.id],
    })),
    stats: {
      totalPending: pending.length,
      assigned: assignments.length,
      unassigned: unassigned.length,
      availableDrivers: available.length,
      utilizationRate: available.length > 0 ? assignments.length / available.length : 0,
    },
  };
}

function optimizeRouteSequence(driverId, orders, driverLocations) {
  const location = driverLocations[driverId];
  if (!location || orders.length <= 1) return orders;
  
  const remaining = [...orders];
  const optimized = [];
  let currentLat = location.lat;
  let currentLng = location.lng;
  
  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    
    remaining.forEach((order, idx) => {
      const dist = haversineDistance(
        currentLat, currentLng,
        order.lat || 5.6037, order.lng || -0.1870
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = idx;
      }
    });
    
    const next = remaining.splice(nearestIdx, 1)[0];
    optimized.push({ ...next, sequence: optimized.length + 1, estimatedTravel: nearestDist });
    currentLat = next.lat || 5.6037;
    currentLng = next.lng || -0.1870;
  }
  
  return optimized;
}

export function useAutomatedDispatch({ 
  orders = [], 
  drivers = [], 
  driverLocations = {}, 
  zoneLoads = {},
  config = {},
  onNotice 
}) {
  const [dispatchPlan, setDispatchPlan] = useState(null);
  const [dispatchHistory, setDispatchHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoMode, setAutoMode] = useState(false);
  const [intervalId, setIntervalId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const history = stored ? JSON.parse(stored) : [];
      
      const plan = generateDispatchPlan(orders, drivers, driverLocations, zoneLoads, config);
      
      setDispatchPlan(plan);
      setDispatchHistory(history.slice(-50));
      setLastUpdated(new Date().toISOString());
      
      onNotice?.(`Dispatch plan generated: ${plan.assignments.length} assigned, ${plan.unassigned.length} pending`);
    } catch (error) {
      console.error('Automated dispatch error:', error);
      onNotice?.('Failed to generate dispatch plan', 'error');
    } finally {
      setLoading(false);
    }
  }, [orders, drivers, driverLocations, zoneLoads, config, onNotice]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (autoMode) {
      const id = setInterval(refresh, 60000);
      setIntervalId(id);
      return () => clearInterval(id);
    } else if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
  }, [autoMode, refresh, intervalId]);

  const executeDispatch = useCallback(async (assignments = null) => {
    const toExecute = assignments || dispatchPlan?.assignments || [];
    
    if (toExecute.length === 0) {
      onNotice?.('No assignments to execute', 'warning');
      return { success: 0, failed: 0 };
    }
    
    const results = { success: 0, failed: 0, details: [] };
    
    for (const assignment of toExecute) {
      try {
        const order = orders.find(o => o.id === assignment.orderId);
        const driver = drivers.find(d => d.id === assignment.driverId);
        
        if (!order || !driver) {
          results.failed++;
          results.details.push({ orderId: assignment.orderId, error: 'Order or driver not found' });
          continue;
        }
        
        const stored = localStorage.getItem(STORAGE_KEY);
        const history = stored ? JSON.parse(stored) : [];
        history.push({
          ...assignment,
          executedAt: new Date().toISOString(),
          order: { id: order.id, customer: order.customer, total: order.total },
          driver: { id: driver.id, name: driver.name },
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-100)));
        
        results.success++;
        results.details.push({ orderId: assignment.orderId, status: 'dispatched' });
      } catch (error) {
        results.failed++;
        results.details.push({ orderId: assignment.orderId, error: error.message });
      }
    }
    
    setDispatchHistory(prev => [...prev, ...results.details.filter(d => d.status === 'dispatched')].slice(-50));
    refresh();
    
    onNotice?.(`Dispatch executed: ${results.success} successful, ${results.failed} failed`);
    return results;
  }, [dispatchPlan, orders, drivers, refresh, onNotice]);

  const optimizeDriverRoute = useCallback((driverId) => {
    const driverOrders = orders.filter(o => o.driverId === driverId && ['Assigned', 'En Route'].includes(o.status));
    return optimizeRouteSequence(driverId, driverOrders, driverLocations);
  }, [orders, driverLocations]);

  const getOrderRecommendations = useCallback((orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return [];
    
    const available = drivers.filter(d => 
      d.status === 'Online' && (d.currentOrders || 0) < (d.maxOrders || 5)
    );
    
    return available
      .map(driver => ({
        driver,
        ...calculateMatchScore(order, driver, driverLocations, zoneLoads),
      }))
      .filter(m => m.score > 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [orders, drivers, driverLocations, zoneLoads]);

  const setConfig = useCallback((newConfig) => {
    const updated = { ...config, ...newConfig };
    return updated;
  }, [config]);

  return {
    dispatchPlan,
    dispatchHistory,
    loading,
    lastUpdated,
    autoMode,
    setAutoMode,
    refresh,
    executeDispatch,
    optimizeDriverRoute,
    getOrderRecommendations,
    setConfig,
    config,
    formatCedi,
  };
}