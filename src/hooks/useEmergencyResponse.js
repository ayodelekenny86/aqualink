import { useState, useEffect, useCallback, useMemo } from 'react';

export function useEmergencyResponse({ 
  orders = [], 
  drivers = [],
  vehicles = [],
  facilities = [],
  incidents = [],
  weatherAlerts = [],
  onNotice 
}) {
  const [activeIncidents, setActiveIncidents] = useState([]);
  const [responsePlans, setResponsePlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const initializeEmergencySystem = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 300));

      const emergencyOrders = orders.filter(o => o.priority === 'emergency' || o.customerType === 'hospital');
      const weatherEmergencies = weatherAlerts.filter(w => w.severity === 'extreme' || w.severity === 'severe');
      
      const incidents = [
        ...emergencyOrders.slice(0, 3).map((order, i) => ({
          id: `incident-${order.id}`,
          type: 'emergency_delivery',
          severity: 'critical',
          title: `Emergency Delivery: ${order.customerId}`,
          description: `${order.volume} gal needed urgently for ${order.customerType}`,
          location: order.location,
          coordinates: order.coordinates,
          status: 'active',
          assignedDriver: null,
          assignedVehicle: null,
          facilityId: order.facilityId,
          requiredVolume: order.volume,
          deadline: new Date(Date.now() + 2 * 3600000).toISOString(),
          createdAt: new Date().toISOString(),
          escalationLevel: 1
        })),
        ...weatherEmergencies.slice(0, 2).map((alert, i) => ({
          id: `incident-weather-${i}`,
          type: 'weather_emergency',
          severity: alert.severity === 'extreme' ? 'critical' : 'high',
          title: `${alert.type} Alert: ${alert.area}`,
          description: alert.description,
          location: alert.area,
          status: 'monitoring',
          affectedSources: alert.affectedSources || [],
          estimatedImpact: alert.estimatedImpact,
          createdAt: new Date().toISOString(),
          escalationLevel: alert.severity === 'extreme' ? 2 : 1
        }))
      ];

      setActiveIncidents(incidents);

      const plans = incidents.map(incident => {
        if (incident.type === 'emergency_delivery') {
          const availableDrivers = drivers.filter(d => d.status === 'available');
          const nearbyDrivers = availableDrivers.slice(0, 3);
          const facility = facilities.find(f => f.id === incident.facilityId);
          
          return {
            incidentId: incident.id,
            type: 'emergency_delivery',
            steps: [
              { step: 1, action: 'Identify nearest available driver', status: 'pending', assignedTo: nearbyDrivers[0]?.id },
              { step: 2, action: 'Dispatch driver to facility', status: 'pending' },
              { step: 3, action: 'Load emergency water supply', status: 'pending' },
              { step: 4, action: 'Deliver to customer location', status: 'pending' },
              { step: 5, action: 'Confirm delivery and document', status: 'pending' }
            ],
            estimatedTime: 90,
            resources: {
              drivers: nearbyDrivers.map(d => ({ id: d.id, name: d.name, distance: Math.round(5 + Math.random() * 20) })),
              vehicles: vehicles.filter(v => v.status === 'available').slice(0, 2).map(v => ({ id: v.id, plate: v.plate, capacity: v.capacity })),
              facility: facility ? { id: facility.id, name: facility.name, availableVolume: facility.availableVolume } : null
            },
            alternatives: [
              { description: 'Reroute from scheduled delivery', timeImpact: '+30 min' },
              { description: 'Source from secondary facility', timeImpact: '+45 min' }
            ]
          };
        } else {
          return {
            incidentId: incident.id,
            type: 'weather_emergency',
            steps: [
              { step: 1, action: 'Assess source water quality impact', status: 'pending' },
              { step: 2, action: 'Activate backup water sources', status: 'pending' },
              { step: 3, action: 'Notify affected customers', status: 'pending' },
              { step: 4, action: 'Deploy emergency treatment if needed', status: 'pending' },
              { step: 5, action: 'Monitor and report status', status: 'pending' }
            ],
            estimatedTime: 120,
            resources: {
              backupSources: facilities.filter(f => f.status === 'active' && f.isBackup).slice(0, 3),
              treatmentCapacity: 'Emergency chlorination available',
              communicationChannels: ['SMS', 'App notification', 'Radio']
            }
          };
        }
      });

      setResponsePlans(plans);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, drivers, vehicles, facilities, incidents, weatherAlerts]);

  const assignResponder = useCallback((incidentId, driverId, vehicleId) => {
    setActiveIncidents(prev => prev.map(inc => 
      inc.id === incidentId ? { ...inc, assignedDriver: driverId, assignedVehicle: vehicleId, status: 'responding' } : inc
    ));
    setResponsePlans(prev => prev.map(plan => 
      plan.incidentId === incidentId ? { ...plan, steps: plan.steps.map(s => s.step === 1 ? { ...s, status: 'in_progress', assignedTo: driverId } : s) } : plan
    ));
    onNotice?.(`Responder assigned to ${incidentId}`);
  }, [onNotice]);

  const updateIncidentStatus = useCallback((incidentId, status) => {
    setActiveIncidents(prev => prev.map(inc => inc.id === incidentId ? { ...inc, status } : inc));
    onNotice?.(`Incident ${incidentId} status: ${status}`);
  }, [onNotice]);

  const completeIncident = useCallback((incidentId) => {
    setActiveIncidents(prev => prev.filter(inc => inc.id !== incidentId));
    setResponsePlans(prev => prev.filter(p => p.incidentId !== incidentId));
    onNotice?.(`Incident ${incidentId} completed`);
  }, [onNotice]);

  const escalateIncident = useCallback((incidentId) => {
    setActiveIncidents(prev => prev.map(inc => 
      inc.id === incidentId ? { ...inc, escalationLevel: inc.escalationLevel + 1, severity: inc.escalationLevel >= 2 ? 'critical' : 'high' } : inc
    ));
    onNotice?.(`Incident ${incidentId} escalated`);
  }, [onNotice]);

  const getResponsePlan = useCallback((incidentId) => {
    return responsePlans.find(p => p.incidentId === incidentId);
  }, [responsePlans]);

  const getActiveIncidents = useCallback(() => {
    return activeIncidents;
  }, [activeIncidents]);

  const getIncidentsBySeverity = useCallback((severity) => {
    return activeIncidents.filter(i => i.severity === severity);
  }, [activeIncidents]);

  useEffect(() => { initializeEmergencySystem(); }, [initializeEmergencySystem]);

  return {
    activeIncidents,
    responsePlans,
    loading,
    error,
    refresh: initializeEmergencySystem,
    assignResponder,
    updateIncidentStatus,
    completeIncident,
    escalateIncident,
    getResponsePlan,
    getActiveIncidents,
    getIncidentsBySeverity,
    criticalCount: activeIncidents.filter(i => i.severity === 'critical').length,
    highCount: activeIncidents.filter(i => i.severity === 'high').length,
    totalActive: activeIncidents.length
  };
}

export default useEmergencyResponse;