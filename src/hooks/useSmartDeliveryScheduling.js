import { useState, useEffect, useCallback, useMemo } from 'react';

export function useSmartDeliveryScheduling({ 
  orders = [], 
  drivers = [], 
  vehicles = [],
  facilities = [],
  trafficData = [],
  weatherData = [],
  onNotice 
}) {
  const [schedule, setSchedule] = useState(null);
  const [optimization, setOptimization] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateSchedule = useCallback(async () => {
    if (!orders.length || !drivers.length) {
      setSchedule({ assignments: [], conflicts: [], efficiency: 0 });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const pendingOrders = orders.filter(o => 
        ['Pending', 'Assigned'].includes(o.status) && !o.scheduledAt
      ).sort((a, b) => {
        const priorityOrder = { emergency: 0, urgent: 1, high: 2, normal: 3, low: 4 };
        return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
      });

      const availableDrivers = drivers.filter(d => d.status === 'available');
      const availableVehicles = vehicles.filter(v => v.status === 'available');

      const assignments = [];
      const conflicts = [];
      let driverIndex = 0;

      for (const order of pendingOrders) {
        if (driverIndex >= availableDrivers.length) {
          conflicts.push({
            orderId: order.id,
            type: 'driver_shortage',
            message: `No available drivers for order ${order.id}`,
            severity: 'high'
          });
          continue;
        }

        const driver = availableDrivers[driverIndex];
        const vehicle = availableVehicles.find(v => v.id === driver.vehicleId) || availableVehicles[driverIndex % availableVehicles.length];
        const facility = facilities.find(f => f.id === order.facilityId) || facilities[0];

        const distance = calculateDistance(
          facility.location?.lat || 0, facility.location?.lng || 0,
          order.coordinates?.lat || 0, order.coordinates?.lng || 0
        );

        const trafficFactor = getTrafficFactor(trafficData, order.location, new Date());
        const weatherFactor = getWeatherFactor(weatherData, order.location);
        const adjustedDistance = distance * trafficFactor * weatherFactor;

        const estimatedDuration = Math.round(adjustedDistance / 40 * 60 + 30);
        const startTime = new Date();
        startTime.setMinutes(startTime.getMinutes() + driverIndex * 15);
        const endTime = new Date(startTime.getTime() + estimatedDuration * 60000);

        assignments.push({
          orderId: order.id,
          driverId: driver.id,
          driverName: driver.name,
          vehicleId: vehicle.id,
          vehiclePlate: vehicle.plate,
          facilityId: facility.id,
          facilityName: facility.name,
          customerLocation: order.location,
          customerCoordinates: order.coordinates,
          volume: order.volume,
          priority: order.priority,
          distance: Math.round(adjustedDistance),
          originalDistance: Math.round(distance),
          trafficFactor,
          weatherFactor,
          estimatedDuration,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          status: 'scheduled',
          efficiencyScore: calculateEfficiencyScore(distance, adjustedDistance, order.priority)
        });

        driverIndex++;
      }

      const totalDistance = assignments.reduce((sum, a) => sum + a.distance, 0);
      const totalOriginalDistance = assignments.reduce((sum, a) => sum + a.originalDistance, 0);
      const avgEfficiency = assignments.length 
        ? assignments.reduce((sum, a) => sum + a.efficiencyScore, 0) / assignments.length 
        : 0;

      const newSchedule = {
        assignments,
        conflicts,
        summary: {
          totalOrders: pendingOrders.length,
          scheduledOrders: assignments.length,
          unscheduledOrders: conflicts.length,
          totalDistance,
          totalOriginalDistance,
          distanceSaved: totalOriginalDistance - totalDistance,
          avgEfficiency: Math.round(avgEfficiency),
          estimatedFuelSavings: Math.round((totalOriginalDistance - totalDistance) * 0.25 * 12),
          estimatedTimeSavings: Math.round((totalOriginalDistance - totalDistance) / 40 * 60),
          driverUtilization: availableDrivers.length ? Math.round((assignments.length / availableDrivers.length) * 100) : 0
        },
        generatedAt: new Date().toISOString()
      };

      setSchedule(newSchedule);

      const optimizationResult = optimizeRoutes(assignments, facilities, trafficData, weatherData);
      setOptimization(optimizationResult);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, drivers, vehicles, facilities, trafficData, weatherData]);

  const optimizeRoutes = useCallback((assignments, facilities, trafficData, weatherData) => {
    const facilityGroups = {};
    assignments.forEach(a => {
      if (!facilityGroups[a.facilityId]) facilityGroups[a.facilityId] = [];
      facilityGroups[a.facilityId].push(a);
    });

    const optimizations = Object.entries(facilityGroups).map(([facilityId, facilityAssignments]) => {
      if (facilityAssignments.length < 2) return null;

      const sorted = [...facilityAssignments].sort((a, b) => {
        const distA = calculateDistance(
          a.customerCoordinates?.lat || 0, a.customerCoordinates?.lng || 0,
          b.customerCoordinates?.lat || 0, b.customerCoordinates?.lng || 0
        );
        return distA;
      });

      let optimizedDistance = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        optimizedDistance += calculateDistance(
          sorted[i].customerCoordinates?.lat || 0, sorted[i].customerCoordinates?.lng || 0,
          sorted[i + 1].customerCoordinates?.lat || 0, sorted[i + 1].customerCoordinates?.lng || 0
        );
      }

      const originalDistance = sorted.reduce((sum, a) => sum + a.distance, 0);
      const savings = originalDistance - optimizedDistance;

      return savings > 5 ? {
        facilityId,
        facilityName: sorted[0].facilityName,
        originalDistance: Math.round(originalDistance),
        optimizedDistance: Math.round(optimizedDistance),
        savings: Math.round(savings),
        savingsPercent: Math.round((savings / originalDistance) * 100),
        recommendedSequence: sorted.map(a => a.orderId)
      } : null;
    }).filter(Boolean);

    const totalSavings = optimizations.reduce((sum, o) => sum + o.savings, 0);

    return {
      facilityOptimizations: optimizations,
      totalDistanceSavings: Math.round(totalSavings),
      totalFuelSavings: Math.round(totalSavings * 0.25 * 12),
      totalTimeSavings: Math.round(totalSavings / 40 * 60),
      co2Reduction: Math.round(totalSavings * 0.25 * 2.68),
      generatedAt: new Date().toISOString()
    };
  }, []);

  const applyOptimization = useCallback((facilityId) => {
    const opt = optimization?.facilityOptimizations?.find(o => o.facilityId === facilityId);
    if (!opt) return false;

    setSchedule(prev => {
      if (!prev) return prev;
      const newAssignments = prev.assignments.map(a => {
        if (a.facilityId !== facilityId) return a;
        const newIndex = opt.recommendedSequence.indexOf(a.orderId);
        if (newIndex === -1) return a;
        return { ...a, sequenceIndex: newIndex };
      });
      return { ...prev, assignments: newAssignments };
    });

    onNotice?.(`Route optimization applied for ${opt.facilityName}`);
    return true;
  }, [optimization, onNotice]);

  const rescheduleOrder = useCallback((orderId, newDriverId, newStartTime) => {
    setSchedule(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map(a => 
          a.orderId === orderId 
            ? { ...a, driverId: newDriverId, startTime: newStartTime, status: 'rescheduled' }
            : a
        )
      };
    });
    onNotice?.(`Order ${orderId} rescheduled`);
  }, [onNotice]);

  useEffect(() => { generateSchedule(); }, [generateSchedule]);

  const getDriverSchedule = useCallback((driverId) => {
    return schedule?.assignments?.filter(a => a.driverId === driverId) || [];
  }, [schedule]);

  const getFacilitySchedule = useCallback((facilityId) => {
    return schedule?.assignments?.filter(a => a.facilityId === facilityId) || [];
  }, [schedule]);

  const getOrderSchedule = useCallback((orderId) => {
    return schedule?.assignments?.find(a => a.orderId === orderId) || null;
  }, [schedule]);

  return {
    schedule,
    optimization,
    loading,
    error,
    refresh: generateSchedule,
    applyOptimization,
    rescheduleOrder,
    getDriverSchedule,
    getFacilitySchedule,
    getOrderSchedule,
    scheduledCount: schedule?.assignments?.length || 0,
    conflictCount: schedule?.conflicts?.length || 0,
    efficiency: schedule?.summary?.avgEfficiency || 0,
    distanceSaved: schedule?.summary?.distanceSaved || 0
  };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getTrafficFactor(trafficData, location, time) {
  const hour = time.getHours();
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  const baseFactor = isRushHour ? 1.3 : 1.0;
  const locationTraffic = trafficData.find(t => t.area === location);
  return baseFactor * (locationTraffic?.factor || 1.0);
}

function getWeatherFactor(weatherData, location) {
  const weather = weatherData.find(w => w.area === location);
  if (!weather) return 1.0;
  if (weather.condition === 'heavy_rain') return 1.4;
  if (weather.condition === 'rain') return 1.2;
  if (weather.condition === 'fog') return 1.15;
  if (weather.condition === 'extreme_heat') return 1.1;
  return 1.0;
}

function calculateEfficiencyScore(originalDistance, adjustedDistance, priority) {
  const priorityBonus = { emergency: 20, urgent: 15, high: 10, normal: 5, low: 0 };
  const distanceEfficiency = originalDistance > 0 ? Math.max(0, 100 - ((adjustedDistance - originalDistance) / originalDistance) * 100) : 100;
  return Math.min(100, distanceEfficiency + (priorityBonus[priority] || 0));
}

export default useSmartDeliveryScheduling;