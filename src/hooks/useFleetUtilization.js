import { useState, useEffect, useMemo, useCallback } from 'react';

const USE_MOCK = typeof window !== 'undefined' && (!window.__SUPABASE_URL__ || !window.__SUPABASE_ANON_KEY__);

export function useFleetUtilization({ fleetDrivers = [], orders = [], driverLocations = {}, onNotice }) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const utilization = useMemo(() => {
    const drivers = fleetDrivers.length > 0 ? fleetDrivers : getDefaultFleet();
    
    return drivers.map(driver => {
      const driverOrders = orders.filter(o => o.driverId === driver.id);
      const completedOrders = driverOrders.filter(o => o.status === 'Delivered');
      const activeOrders = driverOrders.filter(o => ['Assigned', 'En Route'].includes(o.status));
      const pendingOrders = driverOrders.filter(o => o.status === 'Pending' || o.status === 'Confirmed');
      
      const location = driverLocations[driver.id] || {};
      const totalDistance = completedOrders.reduce((sum, o) => sum + (o.distance || 0), 0);
      const totalVolume = completedOrders.reduce((sum, o) => sum + (o.volume || 0), 0);
      const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.chargedMinor || o.total || 0), 0);
      
      const avgDeliveryTime = completedOrders.length > 0 
        ? completedOrders.reduce((sum, o) => sum + (o.deliveryTime || 0), 0) / completedOrders.length 
        : 0;
      
      const onTimeDeliveries = completedOrders.filter(o => 
        o.actualDeliveryTime && o.expectedDeliveryTime && new Date(o.actualDeliveryTime) <= new Date(o.expectedDeliveryTime)
      ).length;
      const onTimeRate = completedOrders.length > 0 ? (onTimeDeliveries / completedOrders.length) * 100 : 100;
      
      const workingHours = calculateWorkingHours(driver, completedOrders);
      const ordersPerHour = workingHours > 0 ? completedOrders.length / workingHours : 0;
      const utilizationRate = workingHours > 0 ? Math.min(100, (workingHours / 8) * 100) : 0;
      
      const fuelEfficiency = totalDistance > 0 ? (totalVolume / totalDistance) * 100 : 0;
      const revenuePerKm = totalDistance > 0 ? totalRevenue / totalDistance : 0;
      const revenuePerHour = workingHours > 0 ? totalRevenue / workingHours : 0;
      
      const idleHours = Math.max(0, 8 - workingHours);
      const capacityUtilization = driver.capacityGallons > 0 ? (totalVolume / (driver.capacityGallons * completedOrders.length)) * 100 : 0;
      
      let efficiencyScore = 0;
      efficiencyScore += Math.min(30, onTimeRate * 0.3);
      efficiencyScore += Math.min(25, utilizationRate * 0.25);
      efficiencyScore += Math.min(20, ordersPerHour * 5);
      efficiencyScore += Math.min(15, capacityUtilization * 0.15);
      efficiencyScore += Math.min(10, revenuePerHour / 100);
      
      let tier = 'Needs Improvement';
      if (efficiencyScore >= 85) tier = 'Elite';
      else if (efficiencyScore >= 70) tier = 'Pro';
      else if (efficiencyScore >= 50) tier = 'Standard';
      
      return {
        driverId: driver.id,
        driverName: driver.name,
        vehicle: driver.vehicle,
        base: driver.base,
        status: driver.status,
        totalOrders: driverOrders.length,
        completedOrders: completedOrders.length,
        activeOrders: activeOrders.length,
        pendingOrders: pendingOrders.length,
        totalDistance: Math.round(totalDistance),
        totalVolume,
        totalRevenue,
        avgDeliveryTime: Math.round(avgDeliveryTime),
        onTimeRate: Math.round(onTimeRate),
        workingHours: Math.round(workingHours * 10) / 10,
        idleHours: Math.round(idleHours * 10) / 10,
        ordersPerHour: Math.round(ordersPerHour * 10) / 10,
        utilizationRate: Math.round(utilizationRate),
        capacityUtilization: Math.round(capacityUtilization),
        fuelEfficiency: Math.round(fuelEfficiency * 10) / 10,
        revenuePerKm: Math.round(revenuePerKm),
        revenuePerHour: Math.round(revenuePerHour),
        efficiencyScore: Math.round(efficiencyScore),
        tier,
        location: location.location || 'Unknown',
        lastUpdate: location.updatedAt || null,
      };
    });
  }, [fleetDrivers, orders, driverLocations]);

  const fleetSummary = useMemo(() => {
    const total = utilization.length;
    const online = utilization.filter(d => d.status === 'online').length;
    const onJob = utilization.filter(d => d.activeOrders > 0).length;
    const idle = utilization.filter(d => d.status === 'online' && d.activeOrders === 0).length;
    const offline = total - online;
    
    const totalOrders = utilization.reduce((sum, d) => sum + d.completedOrders, 0);
    const totalDistance = utilization.reduce((sum, d) => sum + d.totalDistance, 0);
    const totalVolume = utilization.reduce((sum, d) => sum + d.totalVolume, 0);
    const totalRevenue = utilization.reduce((sum, d) => sum + d.totalRevenue, 0);
    const avgOnTimeRate = total > 0 ? Math.round(utilization.reduce((sum, d) => sum + d.onTimeRate, 0) / total) : 0;
    const avgUtilization = total > 0 ? Math.round(utilization.reduce((sum, d) => sum + d.utilizationRate, 0) / total) : 0;
    const avgEfficiency = total > 0 ? Math.round(utilization.reduce((sum, d) => sum + d.efficiencyScore, 0) / total) : 0;
    const avgOrdersPerHour = total > 0 ? Math.round((utilization.reduce((sum, d) => sum + d.ordersPerHour, 0) / total) * 10) / 10 : 0;
    
    const eliteCount = utilization.filter(d => d.tier === 'Elite').length;
    const proCount = utilization.filter(d => d.tier === 'Pro').length;
    const standardCount = utilization.filter(d => d.tier === 'Standard').length;
    const needsImprovementCount = utilization.filter(d => d.tier === 'Needs Improvement').length;

    return {
      total,
      online,
      onJob,
      idle,
      offline,
      totalOrders,
      totalDistance,
      totalVolume,
      totalRevenue,
      avgOnTimeRate,
      avgUtilization,
      avgEfficiency,
      avgOrdersPerHour,
      tierDistribution: { elite: eliteCount, pro: proCount, standard: standardCount, needsImprovement: needsImprovementCount },
    };
  }, [utilization]);

  const zoneUtilization = useMemo(() => {
    const zones = {};
    orders.filter(o => ['Pending', 'Confirmed', 'Assigned', 'En Route'].includes(o.status)).forEach(order => {
      const zone = order.zone || 'zone_1';
      const driver = fleetDrivers.find(d => d.id === order.driverId);
      if (!zones[zone]) {
        zones[zone] = { zoneId: zone, zoneName: getZoneName(zone), pendingOrders: 0, activeOrders: 0, assignedDrivers: new Set(), totalVolume: 0 };
      }
      zones[zone].pendingOrders += ['Pending', 'Confirmed'].includes(order.status) ? 1 : 0;
      zones[zone].activeOrders += ['Assigned', 'En Route'].includes(order.status) ? 1 : 0;
      if (driver) zones[zone].assignedDrivers.add(driver.id);
      zones[zone].totalVolume += order.volume || 0;
    });
    
    return Object.values(zones).map(zone => ({
      ...zone,
      assignedDrivers: zone.assignedDrivers.size,
      utilization: zone.assignedDrivers.size > 0 ? Math.round((zone.activeOrders / zone.assignedDrivers.size) * 100) : 0,
      pressure: zone.activeOrders > zone.assignedDrivers.size * 2 ? 'high' : zone.activeOrders > zone.assignedDrivers.size ? 'medium' : 'low',
    }));
  }, [orders, fleetDrivers]);

  const recommendations = useMemo(() => {
    const recs = [];
    
    utilization.forEach(driver => {
      if (driver.tier === 'Needs Improvement' && driver.status === 'online') {
        recs.push({
          id: `fleet_${driver.driverId}_performance`,
          type: 'performance',
          priority: 'high',
          driverId: driver.driverId,
          driverName: driver.driverName,
          title: `${driver.driverName} needs performance improvement`,
          description: `Efficiency score: ${driver.efficiencyScore}, On-time rate: ${driver.onTimeRate}%`,
          action: 'Schedule coaching session and review route assignments',
        });
      }
      
      if (driver.idleHours > 4 && driver.status === 'online') {
        recs.push({
          id: `fleet_${driver.driverId}_idle`,
          type: 'idle',
          priority: 'medium',
          driverId: driver.driverId,
          driverName: driver.driverName,
          title: `${driver.driverName} has high idle time`,
          description: `${driver.idleHours} idle hours today`,
          action: 'Assign pending orders or rebalance zone',
        });
      }
      
      if (driver.utilizationRate > 95) {
        recs.push({
          id: `fleet_${driver.driverId}_overworked`,
          type: 'overworked',
          priority: 'medium',
          driverId: driver.driverId,
          driverName: driver.driverName,
          title: `${driver.driverName} at ${driver.utilizationRate}% utilization`,
          description: 'Risk of burnout or quality issues',
          action: 'Reduce workload or add support driver',
        });
      }
    });
    
    zoneUtilization.forEach(zone => {
      if (zone.pressure === 'high') {
        recs.push({
          id: `fleet_zone_${zone.zoneId}`,
          type: 'zone_pressure',
          priority: 'high',
          zoneId: zone.zoneId,
          zoneName: zone.zoneName,
          title: `${zone.zoneName} under high pressure`,
          description: `${zone.activeOrders} active orders, ${zone.assignedDrivers} drivers`,
          action: 'Redirect drivers from low-pressure zones',
        });
      }
    });
    
    return recs.sort((a, b) => (b.priority === 'high' ? 3 : b.priority === 'medium' ? 2 : 1) - (a.priority === 'high' ? 3 : a.priority === 'medium' ? 2 : 1));
  }, [utilization, zoneUtilization, fleetDrivers]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      onNotice?.('Fleet utilization updated');
    }, 500);
  }, [onNotice]);

  const formatCedi = useCallback((amount) => {
    return `GH₵${(amount / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, []);

  return {
    utilization,
    fleetSummary,
    zoneUtilization,
    recommendations,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  };
}

function getDefaultFleet() {
  return [
    { id: 'd1', name: 'Kwame Asante', vehicle: 'Tanker 5000L', base: 'Accra', status: 'online', capacityGallons: 5000 },
    { id: 'd2', name: 'Ama Osei', vehicle: 'Tanker 3000L', base: 'Accra', status: 'online', capacityGallons: 3000 },
    { id: 'd3', name: 'Kofi Mensah', vehicle: 'Tanker 5000L', base: 'Kumasi', status: 'online', capacityGallons: 5000 },
    { id: 'd4', name: 'Esi Boateng', vehicle: 'Tanker 2000L', base: 'Tema', status: 'offline', capacityGallons: 2000 },
    { id: 'd5', name: 'Yaw Nkrumah', vehicle: 'Tanker 3000L', base: 'Accra', status: 'online', capacityGallons: 3000 },
  ];
}

function calculateWorkingHours(driver, completedOrders) {
  if (completedOrders.length === 0) return 0;
  const totalMinutes = completedOrders.reduce((sum, o) => sum + (o.deliveryTime || 30), 0);
  return totalMinutes / 60;
}

function getZoneName(zoneId) {
  const names = {
    zone_1: 'Accra Central',
    zone_2: 'Accra North',
    zone_3: 'Accra East',
    zone_4: 'Kumasi Central',
    zone_5: 'Tema Port',
    zone_6: 'Ho Municipal',
  };
  return names[zoneId] || zoneId;
}

export default useFleetUtilization;