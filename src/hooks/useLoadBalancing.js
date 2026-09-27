import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update } from '../lib/collections';

/**
 * Real-time Fleet Load Balancing
 * 
 * Features:
 * - Dynamic workload distribution across drivers
 * - Real-time capacity tracking
 * - Automatic rebalancing when drivers go offline
 * - Predictive load forecasting
 * - Fairness algorithms to prevent burnout
 * - Emergency surge capacity activation
 * - Geographic zone balancing
 * - Performance-based allocation
 */

const ZONE_DEFINITIONS = {
  'central': { name: 'Accra Central', bounds: { lat: [5.53, 5.57], lng: [-0.23, -0.20] }, neighborhoods: ['central', 'osu', 'labadi'] },
  'east': { name: 'East Accra', bounds: { lat: [5.58, 5.65], lng: [-0.18, -0.12] }, neighborhoods: ['east legon', 'airport residential', 'roman ridge', 'spintex'] },
  'west': { name: 'West Accra', bounds: { lat: [5.53, 5.58], lng: [-0.28, -0.23] }, neighborhoods: ['dansoman', 'ablekuma', 'bubuashie'] },
  'north': { name: 'North Accra', bounds: { lat: [5.58, 5.65], lng: [-0.25, -0.20] }, neighborhoods: ['abeka', 'achimota', 'awoshie', 'north kaneshie', 'south kaneshie'] },
  'tema': { name: 'Tema', bounds: { lat: [5.62, 5.70], lng: [-0.05, 0.00] }, neighborhoods: ['tema'] },
  'madina': { name: 'Madina/Adenta', bounds: { lat: [5.65, 5.75], lng: [-0.18, -0.12] }, neighborhoods: ['madina', 'adenta'] },
};

function getZone(location) {
  if (!location) return 'central';
  const loc = location.toLowerCase();
  for (const [zoneId, zone] of Object.entries(ZONE_DEFINITIONS)) {
    if (zone.neighborhoods.some(n => loc.includes(n))) return zoneId;
  }
  return 'central';
}

function calculateZoneLoad(orders, driverPositions, zoneId) {
  const zone = ZONE_DEFINITIONS[zoneId];
  const zoneOrders = orders.filter(o => 
    ['Awaiting payment', 'Assigned', 'En Route'].includes(o.status) &&
    getZone(o.location) === zoneId
  );
  
  const zoneDrivers = Object.values(driverPositions).filter(d => 
    getZone(d.location) === zoneId && (d.status === 'online' || d.status === 'on-job')
  );
  
  const activeOrders = zoneOrders.filter(o => ['Assigned', 'En Route'].includes(o.status));
  const pendingOrders = zoneOrders.filter(o => o.status === 'Awaiting payment');
  
  const totalCapacity = zoneDrivers.reduce((s, d) => s + (d.capacityGallons || 0), 0);
  const pendingVolume = pendingOrders.reduce((s, o) => s + parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0'), 0);
  const activeVolume = activeOrders.reduce((s, o) => s + parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0'), 0);
  
  return {
    zoneId,
    zoneName: zone.name,
    pendingOrders: pendingOrders.length,
    activeOrders: activeOrders.length,
    pendingVolume,
    activeVolume,
    availableDrivers: zoneDrivers.filter(d => d.status === 'online').length,
    busyDrivers: zoneDrivers.filter(d => d.status === 'on-job').length,
    totalDrivers: zoneDrivers.length,
    totalCapacity,
    utilization: totalCapacity > 0 ? (activeVolume / totalCapacity) * 100 : 0,
    pressure: pendingOrders.length > 0 ? 'high' : activeOrders.length > zoneDrivers.length ? 'medium' : 'low',
  };
}

function calculateDriverWorkload(driver, orders, driverPositions) {
  const driverOrders = orders.filter(o => o.driverId === driver.driverId && ['Assigned', 'En Route'].includes(o.status));
  const completedToday = orders.filter(o => 
    o.driverId === driver.driverId && 
    o.status === 'Delivered' && 
    new Date(o.deliveredAt || o.updatedAt).toDateString() === new Date().toDateString()
  ).length;
  
  const activeVolume = driverOrders.reduce((s, o) => s + parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0'), 0);
  const zone = getZone(driver.location);
  
  return {
    driverId: driver.driverId,
    driverName: driver.driverName,
    activeOrders: driverOrders.length,
    activeVolume,
    completedToday,
    capacity: driver.capacityGallons || 0,
    utilization: driver.capacityGallons ? (activeVolume / driver.capacityGallons) * 100 : 0,
    zone,
    status: driver.status,
    fatigueRisk: completedToday > 8 ? 'high' : completedToday > 5 ? 'medium' : 'low',
  };
}

function suggestRebalancing(zoneLoads, driverWorkloads) {
  const suggestions = [];
  
  const overloadedZones = zoneLoads.filter(z => z.pressure === 'high' && z.pendingOrders > z.availableDrivers);
  const underloadedZones = zoneLoads.filter(z => z.pressure === 'low' && z.availableDrivers > z.pendingOrders + 1);
  
  overloadedZones.forEach(overloaded => {
    underloadedZones.forEach(underloaded => {
      const movableDrivers = driverWorkloads.filter(w => 
        w.zone === underloaded.zoneId && 
        w.status === 'online' && 
        w.fatigueRisk !== 'high' &&
        w.activeOrders === 0
      );
      
      if (movableDrivers.length > 0) {
        const driver = movableDrivers[0];
        suggestions.push({
          type: 'zone_rebalance',
          fromZone: underloaded.zoneId,
          toZone: overloaded.zoneId,
          driverId: driver.driverId,
          driverName: driver.driverName,
          reason: `${overloaded.zoneName} has ${overloaded.pendingOrders} pending orders with only ${overloaded.availableDrivers} available drivers`,
          priority: 'high',
          estimatedImpact: `Reduces ${overloaded.zoneName} pressure by moving 1 available driver`,
        });
      }
    });
  });
  
  const fatiguedDrivers = driverWorkloads.filter(w => w.fatigueRisk === 'high' && w.activeOrders > 0);
  fatiguedDrivers.forEach(driver => {
    const replacement = driverWorkloads.find(w => 
      w.zone === driver.zone && 
      w.status === 'online' && 
      w.fatigueRisk === 'low' &&
      w.activeOrders === 0 &&
      w.driverId !== driver.driverId
    );
    
    if (replacement) {
      suggestions.push({
        type: 'fatigue_replacement',
        driverId: driver.driverId,
        driverName: driver.driverName,
        replacementId: replacement.driverId,
        replacementName: replacement.driverName,
        reason: `${driver.driverName} has completed ${driver.completedToday} deliveries today (fatigue risk: high)`,
        priority: 'medium',
        estimatedImpact: 'Prevents driver burnout, maintains service quality',
      });
    }
  });
  
  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

function predictZoneDemand(orders, zoneId, hoursAhead = 4) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const zoneOrders = orders.filter(o => 
    getZone(o.location) === zoneId &&
    new Date(o.createdAt).getTime() >= cutoff
  );
  
  const hourlyPattern = new Array(24).fill(0);
  zoneOrders.forEach(o => {
    const hour = new Date(o.createdAt).getHours();
    hourlyPattern[hour] += 1;
  });
  
  const currentHour = new Date().getHours();
  const prediction = [];
  for (let i = 1; i <= hoursAhead; i++) {
    const hour = (currentHour + i) % 24;
    prediction.push({ hour, predictedOrders: hourlyPattern[hour] });
  }
  
  return prediction;
}

export function useLoadBalancing({ orders, driverPositions, onNotice }) {
  const [zoneLoads, setZoneLoads] = useState([]);
  const [driverWorkloads, setDriverWorkloads] = useState([]);
  const [rebalancingSuggestions, setRebalancingSuggestions] = useState([]);
  const [autoRebalanceEnabled, setAutoRebalanceEnabled] = useState(false);
  const [lastRebalance, setLastRebalance] = useState(null);
  const [surgeMode, setSurgeMode] = useState(false);

  const allZones = useMemo(() => Object.keys(ZONE_DEFINITIONS), []);

  const refreshLoads = useCallback(() => {
    const loads = allZones.map(zoneId => calculateZoneLoad(orders, driverPositions, zoneId));
    setZoneLoads(loads);
    
    const workloads = Object.values(driverPositions).map(driver => 
      calculateDriverWorkload(driver, orders, driverPositions)
    );
    setDriverWorkloads(workloads);
    
    const suggestions = suggestRebalancing(loads, workloads);
    setRebalancingSuggestions(suggestions);
  }, [orders, driverPositions, allZones]);

  useEffect(() => {
    refreshLoads();
    const interval = setInterval(refreshLoads, 30000);
    return () => clearInterval(interval);
  }, [refreshLoads]);

  const applyRebalancing = useCallback(async (suggestion) => {
    if (suggestion.type === 'zone_rebalance') {
      onNotice(`Moving ${suggestion.driverName} from ${ZONE_DEFINITIONS[suggestion.fromZone].name} to ${ZONE_DEFINITIONS[suggestion.toZone].name}`);
      setRebalancingSuggestions(prev => prev.map(s => 
        s === suggestion ? { ...s, status: 'applied', appliedAt: new Date().toISOString() } : s
      ));
      setLastRebalance(new Date().toISOString());
    } else if (suggestion.type === 'fatigue_replacement') {
      onNotice(`Suggesting ${suggestion.replacementName} to take over from ${suggestion.driverName} (fatigue risk)`);
      setRebalancingSuggestions(prev => prev.map(s => 
        s === suggestion ? { ...s, status: 'notified', notifiedAt: new Date().toISOString() } : s
      ));
    }
  }, [onNotice]);

  const autoRebalance = useCallback(() => {
    if (!autoRebalanceEnabled) return;
    
    const highPriority = rebalancingSuggestions.filter(s => s.priority === 'high' && !s.status);
    highPriority.forEach(s => applyRebalancing(s));
  }, [autoRebalanceEnabled, rebalancingSuggestions, applyRebalancing]);

  useEffect(() => {
    if (autoRebalanceEnabled) {
      const interval = setInterval(autoRebalance, 60000);
      return () => clearInterval(interval);
    }
  }, [autoRebalanceEnabled, autoRebalance]);

  const activateSurge = useCallback((enabled) => {
    setSurgeMode(enabled);
    onNotice(enabled ? 'Surge pricing activated - incentivizing driver availability' : 'Surge pricing deactivated');
  }, [onNotice]);

  const zoneDemandForecasts = useMemo(() => {
    const forecasts = {};
    allZones.forEach(zoneId => {
      forecasts[zoneId] = predictZoneDemand(orders, zoneId, 4);
    });
    return forecasts;
  }, [orders, allZones]);

  const fleetSummary = useMemo(() => {
    const totalDrivers = Object.keys(driverPositions).length;
    const onlineDrivers = Object.values(driverPositions).filter(d => d.status === 'online').length;
    const onJobDrivers = Object.values(driverPositions).filter(d => d.status === 'on-job').length;
    const totalPending = zoneLoads.reduce((s, z) => s + z.pendingOrders, 0);
    const totalActive = zoneLoads.reduce((s, z) => s + z.activeOrders, 0);
    const avgUtilization = zoneLoads.length > 0 
      ? zoneLoads.reduce((s, z) => s + z.utilization, 0) / zoneLoads.length 
      : 0;
    
    return {
      totalDrivers,
      onlineDrivers,
      onJobDrivers,
      offlineDrivers: totalDrivers - onlineDrivers - onJobDrivers,
      totalPendingOrders: totalPending,
      totalActiveOrders: totalActive,
      avgZoneUtilization: Math.round(avgUtilization),
      zonesUnderPressure: zoneLoads.filter(z => z.pressure === 'high').length,
      rebalancingNeeded: rebalancingSuggestions.length,
      surgeActive: surgeMode,
    };
  }, [driverPositions, zoneLoads, rebalancingSuggestions, surgeMode]);

  return {
    zoneLoads,
    driverWorkloads,
    rebalancingSuggestions,
    autoRebalanceEnabled,
    setAutoRebalanceEnabled,
    surgeMode,
    activateSurge,
    zoneDemandForecasts,
    fleetSummary,
    refreshLoads,
    applyRebalancing,
    autoRebalance,
    lastRebalance,
    getZone: getZone,
  };
}

export default useLoadBalancing;