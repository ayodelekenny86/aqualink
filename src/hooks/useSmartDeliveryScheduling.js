import { useState, useEffect, useCallback, useMemo } from 'react';

export function useSmartDeliveryScheduling({ 
  orders = [], 
  drivers = [],
  vehicles = [],
  facilities = [],
  trafficData = [],
  timeWindows = [],
  weatherForecast = [],
  customerPreferences = [],
  onNotice 
}) {
  const [schedule, setSchedule] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateSchedule = useCallback(async () => {
    const pendingOrders = orders.filter(o => 
      ['Pending', 'Assigned', 'Scheduled'].includes(o.status) && o.volume > 0
    );
    
    const availableDrivers = drivers.filter(d => d.status === 'available' || d.status === 'on_duty');
    const availableVehicles = vehicles.filter(v => v.status === 'available');

    if (!pendingOrders.length || !availableDrivers.length) {
      setSchedule({ assignments: [], unscheduled: pendingOrders, summary: {} });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 500));

      const sortedOrders = pendingOrders.sort((a, b) => {
        const priorityOrder = { emergency: 0, urgent: 1, express: 2, standard: 3 };
        return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
      });

      const assignments = [];
      const driverSchedules = {};
      availableDrivers.forEach(d => { driverSchedules[d.id] = []; });

      for (const order of sortedOrders) {
        const customerPref = customerPreferences.find(p => p.customerId === order.customerId);
        const preferredWindow = customerPref?.preferredTimeWindow || order.timeWindow;
        const preferredDriver = customerPref?.preferredDriverId;
        
        let bestDriver = null;
        let bestScore = -1;
        let bestStartTime = null;

        for (const driver of availableDrivers) {
          if (preferredDriver && driver.id !== preferredDriver) continue;
          
          const vehicle = availableVehicles.find(v => v.id === driver.vehicleId);
          if (!vehicle || vehicle.capacity < order.volume) continue;
          
          const facility = facilities.find(f => f.id === order.facilityId || f.id === driver.facilityId);
          if (!facility) continue;

          const travelTime = estimateTravelTime(facility, order, trafficData, weatherForecast);
          const serviceTime = Math.ceil(order.volume / 500) * 15;
          
          const earliestStart = preferredWindow?.start 
            ? new Date(`${new Date().toISOString().split('T')[0]}T${preferredWindow.start}`).getTime()
            : Date.now() + 3600000;
          
          const latestEnd = preferredWindow?.end
            ? new Date(`${new Date().toISOString().split('T')[0]}T${preferredWindow.end}`).getTime()
            : Date.now() + 12 * 3600000;

          const existingSchedule = driverSchedules[driver.id];
          let proposedStart = earliestStart;
          
          for (const existing of existingSchedule) {
            if (proposedStart + travelTime + serviceTime > existing.start) {
              proposedStart = existing.end + 15 * 60000;
            }
          }

          const proposedEnd = proposedStart + travelTime + serviceTime;
          
          if (proposedEnd > latestEnd) continue;

          const driverHours = existingSchedule.reduce((s, e) => s + (e.end - e.start), 0) / 3600000;
          if (driverHours + (proposedEnd - proposedStart) / 3600000 > 10) continue;

          const score = calculateAssignmentScore(driver, order, travelTime, serviceTime, customerPref);
          
          if (score > bestScore) {
            bestScore = score;
            bestDriver = driver;
            bestStartTime = proposedStart;
          }
        }

        if (bestDriver) {
          const vehicle = availableVehicles.find(v => v.id === bestDriver.vehicleId);
          const facility = facilities.find(f => f.id === order.facilityId || f.id === bestDriver.facilityId);
          const travelTime = estimateTravelTime(facility, order, trafficData, weatherForecast);
          const serviceTime = Math.ceil(order.volume / 500) * 15;
          const endTime = bestStartTime + travelTime + serviceTime;

          assignments.push({
            orderId: order.id,
            customerId: order.customerId,
            driverId: bestDriver.id,
            driverName: bestDriver.name,
            vehicleId: vehicle.id,
            vehiclePlate: vehicle.plate,
            facilityId: facility.id,
            facilityName: facility.name,
            volume: order.volume,
            priority: order.priority,
            startTime: new Date(bestStartTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            travelTime,
            serviceTime,
            distance: Math.round(travelTime * 30),
            status: 'scheduled',
            customerPreferenceMet: customerPref ? calculatePreferenceMatch(order, bestDriver, bestStartTime, customerPref) : 0
          });

          driverSchedules[bestDriver.id].push({
            orderId: order.id,
            start: bestStartTime,
            end: endTime
          }).sort((a, b) => a.start - b.start);
        }
      }

      const unscheduled = pendingOrders.filter(o => !assignments.find(a => a.orderId === o.id));
      const detectedConflicts = detectConflicts(assignments, driverSchedules);
      setConflicts(detectedConflicts);

      const newSchedule = {
        assignments,
        unscheduled,
        driverSchedules: Object.entries(driverSchedules).map(([driverId, schedule]) => ({
          driverId,
          driverName: availableDrivers.find(d => d.id === driverId)?.name,
          schedule: schedule.sort((a, b) => a.start - b.start),
          totalHours: schedule.reduce((s, e) => s + (e.end - e.start), 0) / 3600000,
          ordersCount: schedule.length
        })),
        conflicts: detectedConflicts,
        summary: {
          totalOrders: pendingOrders.length,
          scheduledOrders: assignments.length,
          unscheduledOrders: unscheduled.length,
          scheduleRate: Math.round((assignments.length / pendingOrders.length) * 100),
          driversUsed: Object.keys(driverSchedules).filter(k => driverSchedules[k].length > 0).length,
          totalDrivers: availableDrivers.length,
          avgPreferenceMatch: assignments.length ? Math.round(assignments.reduce((s, a) => s + a.customerPreferenceMet, 0) / assignments.length) : 0,
          totalDistance: assignments.reduce((s, a) => s + a.distance, 0),
          estimatedRevenue: assignments.reduce((s, a) => s + a.volume * 0.02, 0)
        },
        generatedAt: new Date().toISOString()
      };

      setSchedule(newSchedule);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, drivers, vehicles, facilities, trafficData, timeWindows, weatherForecast, customerPreferences]);

  const estimateTravelTime = (facility, order, traffic, weather) => {
    const baseTime = 30 + Math.random() * 60;
    const trafficMultiplier = traffic.find(t => t.area === order.location?.area)?.congestionLevel || 1.0;
    const weatherMultiplier = weather.find(w => w.area === order.location?.area)?.severity === 'severe' ? 1.3 : 1.0;
    return Math.round(baseTime * trafficMultiplier * weatherMultiplier);
  };

  const calculateAssignmentScore = (driver, order, travelTime, serviceTime, customerPref) => {
    let score = 50;
    if (customerPref?.preferredDriverId === driver.id) score += 30;
    if (driver.rating >= 4.5) score += 10;
    if (driver.experience > 2) score += 5;
    score -= travelTime * 0.2;
    score -= serviceTime * 0.1;
    if (order.priority === 'emergency') score += 20;
    return score;
  };

  const calculatePreferenceMatch = (order, driver, startTime, customerPref) => {
    let match = 0;
    if (customerPref.preferredDriverId === driver.id) match += 40;
    if (customerPref.preferredTimeWindow) {
      const windowStart = new Date(`${new Date().toISOString().split('T')[0]}T${customerPref.preferredTimeWindow.start}`).getTime();
      const windowEnd = new Date(`${new Date().toISOString().split('T')[0]}T${customerPref.preferredTimeWindow.end}`).getTime();
      if (startTime >= windowStart && startTime <= windowEnd) match += 40;
    }
    if (customerPref.preferredVehicleType && driver.vehicleType === customerPref.preferredVehicleType) match += 20;
    return Math.min(100, match);
  };

  const detectConflicts = (assignments, driverSchedules) => {
    const conflicts = [];
    
    Object.entries(driverSchedules).forEach(([driverId, schedule]) => {
      for (let i = 0; i < schedule.length - 1; i++) {
        if (schedule[i].end > schedule[i + 1].start) {
          conflicts.push({
            type: 'overlap',
            driverId,
            order1: schedule[i].orderId,
            order2: schedule[i + 1].orderId,
            overlapMinutes: Math.round((schedule[i].end - schedule[i + 1].start) / 60000),
            severity: 'high'
          });
        }
      }
    });

    assignments.forEach(a => {
      if (a.customerPreferenceMet < 50) {
        conflicts.push({
          type: 'preference_mismatch',
          orderId: a.orderId,
          driverId: a.driverId,
          matchScore: a.customerPreferenceMet,
          severity: 'medium'
        });
      }
    });

    return conflicts;
  };

  const rescheduleOrder = useCallback((orderId, newDriverId, newStartTime) => {
    setSchedule(prev => {
      if (!prev) return prev;
      const newAssignments = prev.assignments.map(a => {
        if (a.orderId === orderId) {
          const driver = drivers.find(d => d.id === newDriverId);
          const vehicle = vehicles.find(v => v.id === driver?.vehicleId);
          const travelTime = a.travelTime;
          const serviceTime = a.serviceTime;
          return {
            ...a,
            driverId: newDriverId,
            driverName: driver?.name,
            vehicleId: vehicle?.id,
            vehiclePlate: vehicle?.plate,
            startTime: new Date(newStartTime).toISOString(),
            endTime: new Date(newStartTime + travelTime + serviceTime).toISOString()
          };
        }
        return a;
      });
      return { ...prev, assignments: newAssignments };
    });
    onNotice?.(`Order ${orderId} rescheduled`);
  }, [drivers, vehicles, onNotice]);

  const addOrderToSchedule = useCallback((orderId, driverId, startTime) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const driver = drivers.find(d => d.id === driverId);
    const vehicle = vehicles.find(v => v.id === driver?.vehicleId);
    const facility = facilities.find(f => f.id === order.facilityId || f.id === driver?.facilityId);
    const travelTime = estimateTravelTime(facility, order, trafficData, weatherForecast);
    const serviceTime = Math.ceil(order.volume / 500) * 15;
    
    setSchedule(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: [...prev.assignments, {
          orderId: order.id,
          customerId: order.customerId,
          driverId: driver.id,
          driverName: driver.name,
          vehicleId: vehicle.id,
          vehiclePlate: vehicle.plate,
          facilityId: facility.id,
          facilityName: facility.name,
          volume: order.volume,
          priority: order.priority,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(startTime + travelTime + serviceTime).toISOString(),
          travelTime,
          serviceTime,
          distance: Math.round(travelTime * 30),
          status: 'scheduled',
          customerPreferenceMet: 0
        }],
        unscheduled: prev.unscheduled.filter(o => o.id !== orderId)
      };
    });
    onNotice?.(`Order ${orderId} added to schedule`);
  }, [orders, drivers, vehicles, facilities, trafficData, weatherForecast, onNotice]);

  const getDriverSchedule = useCallback((driverId) => {
    return schedule?.driverSchedules?.find(d => d.driverId === driverId) || null;
  }, [schedule]);

  const getOrderSchedule = useCallback((orderId) => {
    return schedule?.assignments?.find(a => a.orderId === orderId) || null;
  }, [schedule]);

  useEffect(() => { generateSchedule(); }, [generateSchedule]);

  return {
    schedule,
    conflicts,
    loading,
    error,
    refresh: generateSchedule,
    rescheduleOrder,
    addOrderToSchedule,
    getDriverSchedule,
    getOrderSchedule,
    scheduledCount: schedule?.summary?.scheduledOrders || 0,
    unscheduledCount: schedule?.summary?.unscheduledOrders || 0,
    scheduleRate: schedule?.summary?.scheduleRate || 0,
    conflictCount: conflicts.length,
    highSeverityConflicts: conflicts.filter(c => c.severity === 'high').length
  };
}

export default useSmartDeliveryScheduling;