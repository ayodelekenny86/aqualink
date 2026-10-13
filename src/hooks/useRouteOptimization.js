import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, replaceAll } from '../lib/collections';

const STORAGE_KEY = 'route_optimizations';

const ZONES = [
  { id: 'zone_accra_central', name: 'Accra Central', center: { lat: 5.6037, lng: -0.1870 }, radius: 8 },
  { id: 'zone_accra_east', name: 'Accra East', center: { lat: 5.6500, lng: -0.1000 }, radius: 10 },
  { id: 'zone_accra_west', name: 'Accra West', center: { lat: 5.5500, lng: -0.2500 }, radius: 12 },
  { id: 'zone_kumasi', name: 'Kumasi', center: { lat: 6.6885, lng: -1.6244 }, radius: 15 },
  { id: 'zone_tema', name: 'Tema', center: { lat: 5.6698, lng: -0.0166 }, radius: 10 },
  { id: 'zone_takoradi', name: 'Takoradi', center: { lat: 4.8844, lng: -1.7555 }, radius: 12 },
];

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function estimateTravelTime(distanceKm, avgSpeedKmh = 30) {
  return Math.round((distanceKm / avgSpeedKmh) * 60);
}

function solveTSPNearestNeighbor(locations, startLocation) {
  if (locations.length <= 1) return locations;
  
  const unvisited = [...locations];
  const route = [];
  let current = startLocation;
  
  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    
    unvisited.forEach((loc, idx) => {
      const dist = haversineDistance(current.lat, current.lng, loc.lat, loc.lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = idx;
      }
    });
    
    const next = unvisited.splice(nearestIdx, 1)[0];
    route.push({ ...next, distanceFromPrevious: nearestDist, travelTime: estimateTravelTime(nearestDist) });
    current = next;
  }
  
  return route;
}

function assignOrdersToZones(orders, driverPositions) {
  const zoneAssignments = {};
  
  ZONES.forEach(zone => {
    zoneAssignments[zone.id] = {
      zoneId: zone.id,
      zoneName: zone.name,
      pendingOrders: [],
      activeOrders: [],
      availableDrivers: [],
      busyDrivers: [],
      totalDistance: 0,
      estimatedTime: 0,
    };
  });
  
  orders.forEach(order => {
    let bestZone = null;
    let bestDist = Infinity;
    
    ZONES.forEach(zone => {
      if (order.locationLat && order.locationLng) {
        const dist = haversineDistance(zone.center.lat, zone.center.lng, order.locationLat, order.locationLng);
        if (dist < zone.radius && dist < bestDist) {
          bestDist = dist;
          bestZone = zone.id;
        }
      }
    });
    
    if (bestZone) {
      if (order.status === 'Awaiting payment' || order.status === 'Assigned') {
        zoneAssignments[bestZone].pendingOrders.push({ ...order, zoneDistance: bestDist });
      } else if (order.status === 'En Route') {
        zoneAssignments[bestZone].activeOrders.push({ ...order, zoneDistance: bestDist });
      }
    }
  });
  
  Object.entries(driverPositions).forEach(([driverId, pos]) => {
    let bestZone = null;
    let bestDist = Infinity;
    
    ZONES.forEach(zone => {
      const dist = haversineDistance(zone.center.lat, zone.center.lng, pos.lat, pos.lng);
      if (dist < bestDist) {
        bestDist = dist;
        bestZone = zone.id;
      }
    });
    
    if (bestZone && pos.status === 'online') {
      zoneAssignments[bestZone].availableDrivers.push({ driverId, ...pos, zoneDistance: bestDist });
    } else if (bestZone && pos.status === 'on_job') {
      zoneAssignments[bestZone].busyDrivers.push({ driverId, ...pos, zoneDistance: bestDist });
    }
  });
  
  return zoneAssignments;
}

function generateOptimizations(zoneAssignments, driverPositions) {
  const optimizations = [];
  
  Object.values(zoneAssignments).forEach(zone => {
    if (zone.pendingOrders.length > 0 && zone.availableDrivers.length > 0) {
      zone.availableDrivers.forEach(driver => {
        const ordersForDriver = zone.pendingOrders.slice(0, Math.min(3, zone.pendingOrders.length));
        if (ordersForDriver.length === 0) return;
        
        const startLoc = { lat: driver.lat, lng: driver.lng };
        const locations = ordersForDriver.map(o => ({
          ...o,
          lat: o.locationLat || zone.center.lat + (Math.random() - 0.5) * 0.1,
          lng: o.locationLng || zone.center.lng + (Math.random() - 0.5) * 0.1,
        }));
        
        const optimizedRoute = solveTSPNearestNeighbor(locations, startLoc);
        const totalDistance = optimizedRoute.reduce((sum, stop) => sum + (stop.distanceFromPrevious || 0), 0);
        const totalTime = optimizedRoute.reduce((sum, stop) => sum + (stop.travelTime || 0), 0);
        
        const originalDistance = ordersForDriver.reduce((sum, o) => sum + haversineDistance(startLoc.lat, startLoc.lng, o.locationLat || zone.center.lat, o.locationLng || zone.center.lng), 0);
        const savings = originalDistance - totalDistance;
        
        if (savings > 0.5) {
          optimizations.push({
            id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            zoneId: zone.zoneId,
            zoneName: zone.zoneName,
            driverId: driver.driverId,
            driverName: driver.name,
            optimizedOrders: optimizedRoute.map((stop, idx) => ({
              orderId: stop.id || stop.code,
              sequence: idx + 1,
              location: stop.location,
              lat: stop.lat,
              lng: stop.lng,
              distanceFromPrevious: stop.distanceFromPrevious,
              travelTime: stop.travelTime,
              volume: stop.volume,
              value: stop.chargedMinor,
            })),
            totalDistance: Math.round(totalDistance * 100) / 100,
            totalTime,
            originalDistance: Math.round(originalDistance * 100) / 100,
            distanceSaved: Math.round(savings * 100) / 100,
            timeSaved: Math.round((originalDistance - totalDistance) / 30 * 60),
            createdAt: new Date().toISOString(),
            status: 'pending',
          });
        }
      });
    }
  });
  
  return optimizations;
}

function generateRebalancingSuggestions(zoneAssignments) {
  const suggestions = [];
  
  Object.values(zoneAssignments).forEach(zone => {
    const utilization = zone.availableDrivers.length > 0 
      ? (zone.pendingOrders.length / zone.availableDrivers.length) * 100 
      : zone.pendingOrders.length > 0 ? 999 : 0;
    
    if (utilization > 150 && zone.availableDrivers.length > 0) {
      suggestions.push({
        id: `rebal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'redistribute_drivers',
        fromZone: zone.zoneId,
        fromZoneName: zone.zoneName,
        reason: `High utilization (${Math.round(utilization)}%): ${zone.pendingOrders.length} orders, ${zone.availableDrivers.length} drivers`,
        suggestedAction: 'Move 1-2 drivers to adjacent zones',
        priority: utilization > 200 ? 'high' : 'medium',
        createdAt: new Date().toISOString(),
      });
    }
    
    if (zone.pendingOrders.length > 0 && zone.availableDrivers.length === 0) {
      suggestions.push({
        id: `rebal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'no_drivers',
        zoneId: zone.zoneId,
        zoneName: zone.zoneName,
        reason: `${zone.pendingOrders.length} pending orders with no available drivers`,
        suggestedAction: 'Activate surge pricing or recall drivers from nearby zones',
        priority: 'critical',
        createdAt: new Date().toISOString(),
      });
    }
    
    if (zone.availableDrivers.length > zone.pendingOrders.length * 2) {
      suggestions.push({
        id: `rebal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'excess_drivers',
        zoneId: zone.zoneId,
        zoneName: zone.zoneName,
        reason: `Low utilization: ${zone.availableDrivers.length} drivers for ${zone.pendingOrders.length} orders`,
        suggestedAction: 'Redeploy excess drivers to high-demand zones',
        priority: 'low',
        createdAt: new Date().toISOString(),
      });
    }
  });
  
  return suggestions;
}

export function useRouteOptimization({ 
  orders = [], 
  driverPositions = {}, 
  onNotice 
}) {
  const [optimizationQueue, setOptimizationQueue] = useState(() => list(STORAGE_KEY));
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [autoRebalanceEnabled, setAutoRebalanceEnabled] = useState(false);
  const [surgeMode, setSurgeMode] = useState(false);
  const [lastOptimization, setLastOptimization] = useState(null);
  const [loading, setLoading] = useState(false);

  const zoneLoads = useMemo(() => {
    const assignments = assignOrdersToZones(orders, driverPositions);
    return Object.values(assignments).map(zone => ({
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      pendingOrders: zone.pendingOrders.length,
      activeOrders: zone.activeOrders.length,
      availableDrivers: zone.availableDrivers.length,
      busyDrivers: zone.busyDrivers.length,
      utilization: zone.availableDrivers.length > 0 
        ? Math.round((zone.pendingOrders.length / zone.availableDrivers.length) * 100)
        : zone.pendingOrders.length > 0 ? 999 : 0,
      pressure: zone.pendingOrders.length > zone.availableDrivers.length * 2 ? 'critical' :
                zone.pendingOrders.length > zone.availableDrivers.length ? 'high' :
                zone.pendingOrders.length > 0 ? 'normal' : 'low',
    }));
  }, [orders, driverPositions]);

  const driverWorkloads = useMemo(() => {
    return Object.entries(driverPositions).map(([driverId, pos]) => ({
      driverId,
      name: pos.name,
      status: pos.status,
      currentOrders: orders.filter(o => o.driverId === driverId && o.status !== 'Delivered').length,
      location: pos.location,
      lat: pos.lat,
      lng: pos.lng,
      vehicle: pos.vehicle,
      base: pos.base,
    }));
  }, [orders, driverPositions]);

  const fleetSummary = useMemo(() => {
    const onlineDrivers = Object.values(driverPositions).filter(d => d.status === 'online').length;
    const onJobDrivers = Object.values(driverPositions).filter(d => d.status === 'on_job').length;
    const totalPendingOrders = orders.filter(o => o.status === 'Awaiting payment' || o.status === 'Assigned').length;
    const avgZoneUtilization = zoneLoads.length > 0 
      ? Math.round(zoneLoads.reduce((sum, z) => sum + Math.min(z.utilization, 200), 0) / zoneLoads.length)
      : 0;
    return {
      onlineDrivers,
      onJobDrivers,
      totalPendingOrders,
      avgZoneUtilization,
      surgeActive: surgeMode,
    };
  }, [driverPositions, orders, zoneLoads, surgeMode]);

  const rebalancingSuggestions = useMemo(() => {
    const assignments = assignOrdersToZones(orders, driverPositions);
    return generateRebalancingSuggestions(assignments);
  }, [orders, driverPositions]);

  const assignOrder = useCallback((orderId, driverId) => {
    onNotice?.(`Order ${orderId} assigned to driver ${driverId}`);
  }, [onNotice]);

  const autoAssignAll = useCallback(() => {
    const assignments = assignOrdersToZones(orders, driverPositions);
    let assigned = 0;
    
    Object.values(assignments).forEach(zone => {
      zone.pendingOrders.forEach((order, idx) => {
        if (idx < zone.availableDrivers.length) {
          const driver = zone.availableDrivers[idx];
          assignOrder(order.id, driver.driverId);
          assigned++;
        }
      });
    });
    
    onNotice?.(`Auto-assigned ${assigned} orders`);
    return assigned;
  }, [orders, driverPositions, assignOrder, onNotice]);

  const optimizeRoutes = useCallback(() => {
    setLoading(true);
    const assignments = assignOrdersToZones(orders, driverPositions);
    const newOptimizations = generateOptimizations(assignments, driverPositions);
    
    setOptimizationQueue(prev => [...prev, ...newOptimizations]);
    replaceAll(STORAGE_KEY, [...optimizationQueue, ...newOptimizations]);
    setLastOptimization(new Date().toISOString());
    setLoading(false);
    
    onNotice?.(`Generated ${newOptimizations.length} route optimizations`);
    return newOptimizations;
  }, [orders, driverPositions, optimizationQueue, onNotice]);

  const applyOptimization = useCallback((optimizationId) => {
    const opt = optimizationQueue.find(o => o.id === optimizationId);
    if (!opt) return;
    
    opt.optimizedOrders.forEach((stop, idx) => {
      assignOrder(stop.orderId, opt.driverId);
    });
    
    setOptimizationQueue(prev => prev.map(o => 
      o.id === optimizationId ? { ...o, status: 'applied', appliedAt: new Date().toISOString() } : o
    ));
    replaceAll(STORAGE_KEY, optimizationQueue.map(o => 
      o.id === optimizationId ? { ...o, status: 'applied', appliedAt: new Date().toISOString() } : o
    ));
    
    onNotice?.(`Applied optimization for driver ${opt.driverName}`);
  }, [optimizationQueue, assignOrder, onNotice]);

  const applyRebalancing = useCallback((suggestion) => {
    onNotice?.(`Rebalancing action: ${suggestion.suggestedAction}`);
  }, [onNotice]);

  const refreshLoads = useCallback(() => {
    onNotice?.('Zone loads refreshed');
  }, [onNotice]);

  const activateSurge = useCallback((enabled) => {
    setSurgeMode(enabled);
    onNotice?.(enabled ? 'Surge pricing activated' : 'Surge pricing deactivated');
  }, [onNotice]);

  return {
    zoneLoads,
    driverWorkloads,
    optimizationQueue,
    rebalancingSuggestions,
    autoAssignEnabled,
    setAutoAssignEnabled,
    autoRebalanceEnabled,
    setAutoRebalanceEnabled,
    surgeMode,
    activateSurge,
    fleetSummary,
    assignOrder,
    autoAssignAll,
    optimizeRoutes,
    applyOptimization,
    applyRebalancing,
    refreshLoads,
    lastOptimization,
    loading,
  };
}

export default useRouteOptimization;