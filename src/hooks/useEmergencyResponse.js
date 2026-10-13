import { useState, useEffect, useCallback, useMemo } from 'react';

export function useEmergencyResponse({ 
  orders = [], 
  drivers = [], 
  facilities = [],
  customers = [],
  weatherAlerts = [],
  onNotice 
}) {
  const [emergencies, setEmergencies] = useState([]);
  const [activeEmergency, setActiveEmergency] = useState(null);
  const [responsePlans, setResponsePlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const detectEmergencies = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 200));

      const detected = [];

      const criticalOrders = orders.filter(o => 
        o.priority === 'emergency' || 
        o.status === 'Emergency' ||
        (o.delayMinutes && o.delayMinutes > 120)
      );

      criticalOrders.forEach(order => {
        const customer = customers.find(c => c.id === order.customerId);
        const facility = facilities.find(f => f.id === order.facilityId);
        
        detected.push({
          id: `emergency-${order.id}`,
          type: 'delivery_critical',
          severity: 'critical',
          title: `Critical Delivery: ${order.id}`,
          description: `Emergency water delivery to ${customer?.name || 'customer'} at ${order.location}`,
          orderId: order.id,
          customerId: order.customerId,
          facilityId: order.facilityId,
          location: order.location,
          coordinates: order.coordinates,
          volume: order.volume,
          priority: order.priority || 'emergency',
          delayMinutes: order.delayMinutes,
          detectedAt: new Date().toISOString(),
          status: 'detected',
          assignedDrivers: [],
          requiredResources: {
            trucks: Math.ceil((order.volume || 5000) / 10000),
            drivers: Math.ceil((order.volume || 5000) / 10000)
          }
        });
      });

      const severeWeather = weatherAlerts.filter(w => 
        w.severity === 'severe' || w.severity === 'extreme'
      );

      severeWeather.forEach(alert => {
        const affectedFacilities = facilities.filter(f => 
          alert.affectedAreas?.some(area => 
            f.location?.toLowerCase().includes(area.toLowerCase())
          )
        );

        if (affectedFacilities.length > 0) {
          detected.push({
            id: `emergency-weather-${alert.id}`,
            type: 'weather_disruption',
            severity: alert.severity === 'extreme' ? 'critical' : 'high',
            title: `Weather Emergency: ${alert.type}`,
            description: `${alert.description}. ${affectedFacilities.length} facilities affected.`,
            alertId: alert.id,
            affectedFacilities: affectedFacilities.map(f => f.id),
            affectedAreas: alert.affectedAreas,
            validUntil: alert.validUntil,
            detectedAt: new Date().toISOString(),
            status: 'detected',
            requiredResources: {
              trucks: affectedFacilities.length,
              drivers: affectedFacilities.length * 2,
              backupSources: affectedFacilities.length
            }
          });
        }
      });

      const facilityIssues = facilities.filter(f => 
        f.status === 'offline' || f.status === 'maintenance' || f.capacity < 0.3
      );

      facilityIssues.forEach(facility => {
        const pendingOrders = orders.filter(o => 
          o.facilityId === facility.id && 
          ['Pending', 'Assigned', 'En Route'].includes(o.status)
        );

        if (pendingOrders.length > 0) {
          detected.push({
            id: `emergency-facility-${facility.id}`,
            type: 'facility_failure',
            severity: facility.status === 'offline' ? 'critical' : 'high',
            title: `Facility Issue: ${facility.name}`,
            description: `${facility.name} is ${facility.status}. ${pendingOrders.length} orders affected.`,
            facilityId: facility.id,
            facilityName: facility.name,
            facilityStatus: facility.status,
            affectedOrders: pendingOrders.map(o => o.id),
            detectedAt: new Date().toISOString(),
            status: 'detected',
            requiredResources: {
              trucks: pendingOrders.length,
              drivers: pendingOrders.length,
              alternateFacilities: facilities.filter(f => f.id !== facility.id && f.status === 'online').length
            }
          });
        }
      });

      const driverShortages = facilities.flatMap(facility => {
        const facilityDrivers = drivers.filter(d => d.facilityId === facility.id && d.status === 'available');
        const facilityOrders = orders.filter(o => 
          o.facilityId === facility.id && 
          ['Pending', 'Assigned'].includes(o.status)
        );
        
        if (facilityOrders.length > facilityDrivers.length * 2) {
          return [{
            id: `emergency-driver-${facility.id}`,
            type: 'driver_shortage',
            severity: 'high',
            title: `Driver Shortage at ${facility.name}`,
            description: `${facilityOrders.length} pending orders but only ${facilityDrivers.length} drivers available`,
            facilityId: facility.id,
            facilityName: facility.name,
            pendingOrders: facilityOrders.length,
            availableDrivers: facilityDrivers.length,
            deficit: facilityOrders.length - facilityDrivers.length * 2,
            detectedAt: new Date().toISOString(),
            status: 'detected',
            requiredResources: {
              drivers: facilityOrders.length - facilityDrivers.length * 2
            }
          }];
        }
        return [];
      });

      detected.push(...driverShortages);

      setEmergencies(detected);
      
      if (detected.length > 0 && !activeEmergency) {
        const highestPriority = detected.reduce((a, b) => 
          (a.severity === 'critical' && b.severity !== 'critical') ? a :
          (b.severity === 'critical' && a.severity !== 'critical') ? b :
          (a.type === 'delivery_critical' ? a : b)
        );
        setActiveEmergency(highestPriority);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, drivers, facilities, customers, weatherAlerts, activeEmergency]);

  const generateResponsePlan = useCallback(async (emergencyId) => {
    const emergency = emergencies.find(e => e.id === emergencyId);
    if (!emergency) return null;

    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 300));

      const availableDrivers = drivers.filter(d => d.status === 'available');
      const nearbyDrivers = availableDrivers.filter(d => {
        if (!emergency.coordinates || !d.location) return true;
        const dist = calculateDistance(
          emergency.coordinates.lat, emergency.coordinates.lng,
          d.location.lat, d.location.lng
        );
        return dist <= 50;
      });

      const plan = {
        id: `plan-${emergencyId}`,
        emergencyId,
        emergencyType: emergency.type,
        createdAt: new Date().toISOString(),
        steps: [],
        assignedDrivers: [],
        resources: { ...emergency.requiredResources },
        estimatedResolution: null,
        status: 'draft'
      };

      if (emergency.type === 'delivery_critical') {
        const trucksNeeded = emergency.requiredResources.trucks;
        const assigned = nearbyDrivers.slice(0, trucksNeeded).map((d, i) => ({
          driverId: d.id,
          driverName: d.name,
          role: i === 0 ? 'primary' : 'support',
          eta: Math.round(15 + Math.random() * 30),
          route: emergency.location
        }));

        plan.assignedDrivers = assigned;
        plan.steps = [
          { step: 1, action: 'Dispatch primary driver to facility', assignee: assigned[0]?.driverName, eta: '5 min', status: 'pending' },
          { step: 2, action: 'Load emergency water supply', assignee: 'Facility operator', eta: '10 min', status: 'pending' },
          { step: 3, action: 'Dispatch to customer location', assignee: assigned[0]?.driverName, eta: `${assigned[0]?.eta || 20} min`, status: 'pending' },
          { step: 4, action: 'Confirm delivery and customer sign-off', assignee: assigned[0]?.driverName, eta: '5 min', status: 'pending' }
        ];
        plan.estimatedResolution = Math.max(...assigned.map(d => d.eta)) + 20;
      }

      if (emergency.type === 'weather_disruption') {
        const backupSources = facilities.filter(f => 
          f.status === 'online' && 
          !emergency.affectedFacilities?.includes(f.id)
        ).slice(0, emergency.requiredResources.backupSources);

        plan.steps = [
          { step: 1, action: 'Activate backup water sources', assignee: 'Operations manager', eta: '15 min', status: 'pending' },
          { step: 2, action: 'Reroute pending deliveries to backup sources', assignee: 'Dispatch team', eta: '20 min', status: 'pending' },
          { step: 3, action: 'Notify affected customers of delays', assignee: 'Customer service', eta: '10 min', status: 'pending' },
          { step: 4, action: 'Monitor weather updates', assignee: 'Operations', eta: 'Ongoing', status: 'pending' }
        ];
        plan.resources.backupSources = backupSources.map(s => s.id);
        plan.estimatedResolution = 60;
      }

      if (emergency.type === 'facility_failure') {
        const alternateFacilities = facilities.filter(f => 
          f.id !== emergency.facilityId && f.status === 'online'
        ).slice(0, 3);

        plan.steps = [
          { step: 1, action: 'Identify alternate facilities', assignee: 'Operations manager', eta: '10 min', status: 'pending' },
          { step: 2, action: 'Transfer pending orders to alternates', assignee: 'Dispatch team', eta: '15 min', status: 'pending' },
          { step: 3, action: 'Coordinate driver reassignments', assignee: 'Fleet manager', eta: '10 min', status: 'pending' },
          { step: 4, action: 'Update customers on new delivery ETAs', assignee: 'Customer service', eta: '10 min', status: 'pending' }
        ];
        plan.resources.alternateFacilities = alternateFacilities.map(f => f.id);
        plan.estimatedResolution = 45;
      }

      if (emergency.type === 'driver_shortage') {
        const offDutyDrivers = drivers.filter(d => 
          d.status === 'off_duty' && d.facilityId === emergency.facilityId
        ).slice(0, emergency.requiredResources.drivers);

        plan.steps = [
          { step: 1, action: 'Call in off-duty drivers', assignee: 'Fleet manager', eta: '15 min', status: 'pending' },
          { step: 2, action: 'Redistribute orders among available drivers', assignee: 'Dispatch team', eta: '10 min', status: 'pending' },
          { step: 3, action: 'Prioritize critical deliveries', assignee: 'Operations', eta: '5 min', status: 'pending' },
          { step: 4, action: 'Request mutual aid from nearby facilities', assignee: 'Operations manager', eta: '20 min', status: 'pending' }
        ];
        plan.resources.calledInDrivers = offDutyDrivers.map(d => d.id);
        plan.estimatedResolution = 40;
      }

      setResponsePlans(prev => [...prev.filter(p => p.emergencyId !== emergencyId), plan]);
      
      setEmergencies(prev => prev.map(e => 
        e.id === emergencyId ? { ...e, status: 'responding', responsePlanId: plan.id } : e
      ));

      onNotice?.(`Emergency response plan generated for ${emergency.title}`);
      return plan;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [emergencies, drivers, facilities]);

  const executeResponsePlan = useCallback(async (planId) => {
    const plan = responsePlans.find(p => p.id === planId);
    if (!plan) return false;

    setResponsePlans(prev => prev.map(p => 
      p.id === planId ? { ...p, status: 'executing', startedAt: new Date().toISOString() } : p
    ));

    setEmergencies(prev => prev.map(e => 
      e.id === plan.emergencyId ? { ...e, status: 'responding' } : e
    ));

    onNotice?.(`Executing emergency response plan for ${plan.emergencyType}`);
    return true;
  }, [responsePlans, onNotice]);

  const resolveEmergency = useCallback(async (emergencyId, resolutionNotes) => {
    setEmergencies(prev => prev.map(e => 
      e.id === emergencyId ? { 
        ...e, 
        status: 'resolved', 
        resolvedAt: new Date().toISOString(),
        resolutionNotes
      } : e
    ));

    const plan = responsePlans.find(p => p.emergencyId === emergencyId);
    if (plan) {
      setResponsePlans(prev => prev.map(p => 
        p.id === plan.id ? { ...p, status: 'completed', completedAt: new Date().toISOString() } : p
      ));
    }

    if (activeEmergency?.id === emergencyId) {
      const remaining = emergencies.filter(e => e.id !== emergencyId && e.status !== 'resolved');
      setActiveEmergency(remaining[0] || null);
    }

    onNotice?.(`Emergency resolved: ${emergencies.find(e => e.id === emergencyId)?.title}`);
  }, [emergencies, responsePlans, activeEmergency, onNotice]);

  useEffect(() => { detectEmergencies(); }, [detectEmergencies]);

  const getActiveEmergencies = useCallback(() => {
    return emergencies.filter(e => e.status !== 'resolved');
  }, [emergencies]);

  const getEmergencyById = useCallback((id) => {
    return emergencies.find(e => e.id === id) || null;
  }, [emergencies]);

  const getResponsePlan = useCallback((emergencyId) => {
    return responsePlans.find(p => p.emergencyId === emergencyId) || null;
  }, [responsePlans]);

  return {
    emergencies,
    activeEmergency,
    responsePlans,
    loading,
    error,
    refresh: detectEmergencies,
    generateResponsePlan,
    executeResponsePlan,
    resolveEmergency,
    getActiveEmergencies,
    getEmergencyById,
    getResponsePlan,
    activeCount: emergencies.filter(e => e.status !== 'resolved').length,
    criticalCount: emergencies.filter(e => e.severity === 'critical' && e.status !== 'resolved').length
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

export default useEmergencyResponse;