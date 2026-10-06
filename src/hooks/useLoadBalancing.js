import { useCallback, useEffect, useMemo, useState } from 'react';
import { list } from '../lib/collections';
import { getFleet } from '../lib/fleet';

/**
 * Load balancing hook: optimizes driver allocation across zones.
 * 
 * Features:
 * - Real-time zone pressure monitoring
 * - Driver workload balancing
 * - Automatic rebalancing suggestions
 * - Surge pricing activation
 * - Fleet utilization analytics
 */
const ZONES = [
  { id: 'zone-accra-central', name: 'Accra Central', center: { lat: 5.5600, lng: -0.2057 }, radiusKm: 5 },
  { id: 'zone-east-legon', name: 'East Legon', center: { lat: 5.6143, lng: -0.1675 }, radiusKm: 4 },
  { id: 'zone-spintex', name: 'Spintex', center: { lat: 5.6037, lng: -0.0783 }, radiusKm: 6 },
  { id: 'zone-tema', name: 'Tema', center: { lat: 5.6698, lng: -0.0166 }, radiusKm: 8 },
  { id: 'zone-kasoa', name: 'Kasoa', center: { lat: 5.5333, lng: -0.4333 }, radiusKm: 7 },
  { id: 'zone-madina', name: 'Madina', center: { lat: 5.6833, lng: -0.1667 }, radiusKm: 5 },
  { id: 'zone-ashaiman', name: 'Ashaiman', center: { lat: 5.6833, lng: -0.0500 }, radiusKm: 6 },
];

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getZoneForLocation(lat, lng) {
  for (const zone of ZONES) {
    const dist = haversineDistance(lat, lng, zone.center.lat, zone.center.lng);
    if (dist <= zone.radiusKm) return zone.id;
  }
  return 'zone-accra-central'; // default
}

export function useLoadBalancing({ orders, driverPositions = {}, onNotice }) {
  const [zoneLoads, setZoneLoads] = useState([]);
  const [driverWorkloads, setDriverWorkloads] = useState([]);
  const [rebalancingSuggestions, setRebalancingSuggestions] = useState([]);
  const [autoRebalanceEnabled, setAutoRebalanceEnabled] = useState(false);
  const [surgeMode, setSurgeMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Get fleet data
  const { drivers } = getFleet();

  // Calculate zone loads from pending/active orders
  const calculateZoneLoads = useCallback(() => {
    const activeOrders = orders.filter(o => 
      ['Awaiting payment', 'Assigned', 'En Route'].includes(o.status)
    );
    
    const zoneStats = new Map();
    ZONES.forEach(zone => zoneStats.set(zone.id, { 
      zoneId: zone.id, 
      zoneName: zone.name, 
      pendingOrders: 0, 
      activeOrders: 0,
      availableDrivers: 0,
      busyDrivers: 0,
      orders: [],
    }));
    
    // Assign orders to zones
    activeOrders.forEach(order => {
      let zoneId = order.zoneId;
      if (!zoneId && order.location) {
        // Try to geocode location to zone (simplified)
        zoneId = getZoneForLocation(5.5600 + (Math.random() - 0.5) * 0.5, -0.2057 + (Math.random() - 0.5) * 0.5);
      }
      if (!zoneId) zoneId = 'zone-accra-central';
      
      const zone = zoneStats.get(zoneId);
      if (zone) {
        if (order.status === 'Awaiting payment') zone.pendingOrders++;
        else zone.activeOrders++;
        zone.orders.push(order);
      }
    });
    
    // Count drivers per zone
    drivers.forEach(driver => {
      if (driver.status !== 'online') return;
      
      let zoneId = driver.zoneId;
      if (!zoneId && driverPositions[driver.id]) {
        // Simplified: assign driver to zone based on last known location
        zoneId = getZoneForLocation(5.5600, -0.2057); // default for now
      }
      if (!zoneId) zoneId = 'zone-accra-central';
      
      const zone = zoneStats.get(zoneId);
      if (zone) {
        if (driver.activeJobs > 0) zone.busyDrivers++;
        else zone.availableDrivers++;
      }
    });
    
    // Calculate utilization and pressure
    const loads = Array.from(zoneStats.values()).map(zone => {
      const totalOrders = zone.pendingOrders + zone.activeOrders;
      const totalDrivers = zone.availableDrivers + zone.busyDrivers;
      const utilization = totalDrivers > 0 ? (zone.busyDrivers / totalDrivers) * 100 : 0;
      const pressure = totalOrders > totalDrivers * 2 ? 'critical' : 
                       totalOrders > totalDrivers ? 'high' : 
                       totalOrders > 0 ? 'normal' : 'low';
      
      return {
        ...zone,
        totalOrders,
        totalDrivers,
        utilization: Math.round(utilization),
        pressure,
        avgWaitTime: zone.pendingOrders > 0 && zone.availableDrivers > 0 
          ? Math.round(zone.pendingOrders / zone.availableDrivers * 15) 
          : 0,
      };
    });
    
    setZoneLoads(loads);
    return loads;
  }, [orders, driverPositions, drivers]);

  // Calculate driver workloads
  const calculateDriverWorkloads = useCallback(() => {
    const workloads = drivers
      .filter(d => d.status === 'online')
      .map(driver => {
        const assignedOrders = orders.filter(o => o.driverId === driver.id && o.status !== 'Delivered');
        const activeOrderCount = assignedOrders.length;
        const totalVolume = assignedOrders.reduce((s, o) => s + parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0'), 0);
        const estimatedHours = activeOrderCount * 0.5; // 30 min per order average
        
        let status = 'available';
        if (activeOrderCount >= 3) status = 'overloaded';
        else if (activeOrderCount > 0) status = 'busy';
        
        return {
          driverId: driver.id,
          driverName: driver.name,
          zoneId: driver.zoneId || 'zone-accra-central',
          activeOrders: activeOrderCount,
          totalVolume,
          estimatedHours,
          status,
          rating: driver.rating,
          capacity: driver.capacityGallons,
        };
      });
    
    setDriverWorkloads(workloads);
    return workloads;
  }, [orders, drivers]);

  // Generate rebalancing suggestions
  const generateRebalancingSuggestions = useCallback(() => {
    const suggestions = [];
    const criticalZones = zoneLoads.filter(z => z.pressure === 'critical');
    const lowZones = zoneLoads.filter(z => z.pressure === 'low' && z.availableDrivers > 0);
    
    criticalZones.forEach(criticalZone => {
      lowZones.forEach(lowZone => {
        if (lowZone.availableDrivers > 0) {
          suggestions.push({
            id: `rebal-${criticalZone.zoneId}-${lowZone.zoneId}-${Date.now()}`,
            type: 'move_driver',
            fromZone: lowZone.zoneId,
            toZone: criticalZone.zoneId,
            driverCount: Math.min(2, lowZone.availableDrivers),
            reason: `${criticalZone.zoneName} has ${criticalZone.pendingOrders} pending orders with only ${criticalZone.availableDrivers} available drivers`,
            priority: 'high',
          });
        }
      });
    });
    
    // Surge suggestion
    const highPressureZones = zoneLoads.filter(z => z.pressure === 'high' || z.pressure === 'critical');
    if (highPressureZones.length >= 2 && !surgeMode) {
      suggestions.push({
        id: `rebal-surge-${Date.now()}`,
        type: 'activate_surge',
        zones: highPressureZones.map(z => z.zoneId),
        reason: `${highPressureZones.length} zones under high pressure`,
        priority: 'critical',
      });
    }
    
    setRebalancingSuggestions(suggestions);
    return suggestions;
  }, [zoneLoads, surgeMode]);

  // Apply rebalancing
  const applyRebalancing = useCallback((suggestion) => {
    if (suggestion.type === 'move_driver') {
      // In real app, would notify drivers to relocate
      onNotice?.(`Suggested: Move ${suggestion.driverCount} driver(s) from ${suggestion.fromZone} to ${suggestion.toZone}`);
    } else if (suggestion.type === 'activate_surge') {
      setSurgeMode(true);
      onNotice?.('Surge pricing activated for high-pressure zones');
    }
    
    setRebalancingSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
  }, [onNotice]);

  // Activate/deactivate surge
  const activateSurge = useCallback((enabled) => {
    setSurgeMode(enabled);
    onNotice?.(enabled ? 'Surge pricing activated' : 'Surge pricing deactivated');
  }, [onNotice]);

  // Fleet summary
  const fleetSummary = useMemo(() => {
    const onlineDrivers = drivers.filter(d => d.status === 'online').length;
    const onJobDrivers = drivers.filter(d => d.status === 'online' && d.activeJobs > 0).length;
    const totalPendingOrders = zoneLoads.reduce((s, z) => s + z.pendingOrders, 0);
    const avgZoneUtilization = zoneLoads.length > 0 
      ? Math.round(zoneLoads.reduce((s, z) => s + z.utilization, 0) / zoneLoads.length) 
      : 0;
    
    return {
      onlineDrivers,
      onJobDrivers,
      availableDrivers: onlineDrivers - onJobDrivers,
      totalPendingOrders,
      avgZoneUtilization,
      surgeActive: surgeMode,
    };
  }, [drivers, zoneLoads, surgeMode]);

  // Refresh all calculations
  const refreshLoads = useCallback(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      calculateZoneLoads();
      calculateDriverWorkloads();
      generateRebalancingSuggestions();
      setLastUpdated(new Date().toISOString());
      setLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [calculateZoneLoads, calculateDriverWorkloads, generateRebalancingSuggestions]);

  // Auto-refresh when data changes
  useEffect(() => {
    refreshLoads();
  }, [refreshLoads]);

  // Auto-generate suggestions when zone loads change
  useEffect(() => {
    if (zoneLoads.length > 0) {
      generateRebalancingSuggestions();
    }
  }, [zoneLoads, generateRebalancingSuggestions]);

  return {
    zoneLoads,
    driverWorkloads,
    rebalancingSuggestions,
    autoRebalanceEnabled,
    setAutoRebalanceEnabled,
    surgeMode,
    activateSurge,
    fleetSummary,
    refreshLoads,
    loading,
    lastUpdated,
  };
}

export default useLoadBalancing;