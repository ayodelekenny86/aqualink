import { useState, useEffect, useCallback, useMemo } from 'react';

export function useDriverBehavior({ 
  drivers = [], 
  trips = [], 
  vehicles = [],
  fuelRecords = [],
  maintenanceRecords = [],
  onNotice 
}) {
  const [analysis, setAnalysis] = useState(null);
  const [coachingAlerts, setCoachingAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyzeBehavior = useCallback(async () => {
    if (!drivers.length) {
      setAnalysis({ drivers: [], summary: {} });
      setCoachingAlerts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const mockDrivers = drivers.slice(0, 15).map((d, i) => ({
        driverId: d.id || `driver-${i}`,
        driverName: d.name || `Driver ${i + 1}`,
        vehicleId: d.vehicleId,
        vehiclePlate: d.plate || `GT-${1000 + i}`,
        totalTrips: Math.floor(20 + Math.random() * 80),
        totalDistance: Math.floor(500 + Math.random() * 2000),
        totalDuration: Math.floor(1000 + Math.random() * 3000),
        metrics: {
          hardBrakingEvents: Math.floor(Math.random() * 15),
          hardAccelerationEvents: Math.floor(Math.random() * 10),
          speedingEvents: Math.floor(Math.random() * 8),
          idlingMinutes: Math.floor(Math.random() * 120),
          harshEventsPer100km: Math.round((Math.random() * 5) * 10) / 10,
          speedingRate: Math.round(Math.random() * 0.3 * 100) / 100,
          idlingPercent: Math.round(Math.random() * 20 * 10) / 10,
          fuelEfficiency: Math.round((8 + Math.random() * 6) * 10) / 10,
          targetEfficiency: 12
        },
        scores: {
          safety: Math.floor(50 + Math.random() * 50),
          eco: Math.floor(40 + Math.random() * 60),
          overall: Math.floor(45 + Math.random() * 55)
        },
        tier: Math.random() > 0.7 ? 'excellent' : Math.random() > 0.4 ? 'good' : Math.random() > 0.2 ? 'needs_improvement' : 'poor',
        riskFactors: [],
        coachingRecommendations: ['Eco-driving training', 'Speed management'],
        lastTripDate: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
        trend: Math.random() > 0.6 ? 'improving' : Math.random() > 0.3 ? 'stable' : 'declining'
      }));

      const mockCoachingAlerts = mockDrivers
        .filter(d => d.tier === 'poor' || d.scores.safety < 50)
        .map(d => ({
          severity: d.tier === 'poor' ? 'critical' : 'high',
          driverId: d.driverId,
          driverName: d.driverName,
          type: 'safety_critical',
          message: `${d.driverName} has ${d.tier === 'poor' ? 'critical' : 'low'} safety score (${d.scores.safety}/100)`,
          recommendedActions: d.coachingRecommendations,
          metrics: { safetyScore: d.scores.safety, harshEvents: d.metrics.harshEventsPer100km }
        }));

      const summary = {
        totalDrivers: drivers.length,
        excellent: mockDrivers.filter(d => d.tier === 'excellent').length,
        good: mockDrivers.filter(d => d.tier === 'good').length,
        needsImprovement: mockDrivers.filter(d => d.tier === 'needs_improvement').length,
        poor: mockDrivers.filter(d => d.tier === 'poor').length,
        avgSafetyScore: Math.round(mockDrivers.reduce((s, d) => s + d.scores.safety, 0) / mockDrivers.length),
        avgEcoScore: Math.round(mockDrivers.reduce((s, d) => s + d.scores.eco, 0) / mockDrivers.length),
        avgOverallScore: Math.round(mockDrivers.reduce((s, d) => s + d.scores.overall, 0) / mockDrivers.length),
        fleetFuelEfficiency: Math.round(mockDrivers.reduce((s, d) => s + d.metrics.fuelEfficiency, 0) / mockDrivers.length * 10) / 10
      };

      setAnalysis({ drivers: mockDrivers, summary });
      setCoachingAlerts(mockCoachingAlerts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [drivers, trips, vehicles, fuelRecords, maintenanceRecords]);

  const getDriverAnalysis = useCallback((driverId) => {
    return analysis?.drivers?.find(d => d.driverId === driverId) || null;
  }, [analysis]);

  const getCoachingCandidates = useCallback(() => {
    return analysis?.drivers?.filter(d => d.tier === 'needs_improvement' || d.tier === 'poor') || [];
  }, [analysis]);

  const acknowledgeAlert = useCallback((index) => {
    setCoachingAlerts(prev => prev.map((a, i) => i === index ? { ...a, acknowledged: true } : a));
    onNotice?.('Coaching alert acknowledged');
  }, [onNotice]);

  const refresh = useCallback(() => analyzeBehavior(), [analyzeBehavior]);

  useEffect(() => { analyzeBehavior(); }, [analyzeBehavior]);

  return {
    analysis,
    coachingAlerts,
    loading,
    error,
    refresh,
    getDriverAnalysis,
    getCoachingCandidates,
    acknowledgeAlert,
    summary: analysis?.summary,
    criticalAlerts: coachingAlerts.filter(a => a.severity === 'critical'),
    highAlerts: coachingAlerts.filter(a => a.severity === 'high')
  };
}

export default useDriverBehavior;