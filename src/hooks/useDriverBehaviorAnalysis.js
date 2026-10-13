import { useState, useEffect, useCallback, useMemo } from 'react';

export function useDriverBehaviorAnalysis({ 
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
    if (!drivers.length || !trips.length) {
      setAnalysis({ drivers: [], summary: {} });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const driverBehaviors = drivers.map(driver => {
        const driverTrips = trips.filter(t => t.driverId === driver.id);
        const driverVehicle = vehicles.find(v => v.id === driver.vehicleId);
        const driverFuel = fuelRecords.filter(f => f.driverId === driver.id);
        const driverMaintenance = maintenanceRecords.filter(m => m.driverId === driver.id);

        const totalTrips = driverTrips.length;
        const totalDistance = driverTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
        const totalDuration = driverTrips.reduce((sum, t) => sum + (t.duration || 0), 0);

        const hardBrakingEvents = driverTrips.reduce((sum, t) => sum + (t.hardBrakingCount || 0), 0);
        const hardAccelerationEvents = driverTrips.reduce((sum, t) => sum + (t.hardAccelerationCount || 0), 0);
        const speedingEvents = driverTrips.reduce((sum, t) => sum + (t.speedingCount || 0), 0);
        const idlingMinutes = driverTrips.reduce((sum, t) => sum + (t.idlingMinutes || 0), 0);

        const harshEventsPer100km = totalDistance > 0 ? ((hardBrakingEvents + hardAccelerationEvents) / totalDistance) * 100 : 0;
        const speedingRate = totalTrips > 0 ? speedingEvents / totalTrips : 0;
        const idlingPercent = totalDuration > 0 ? (idlingMinutes / totalDuration) * 100 : 0;

        const fuelUsed = driverFuel.reduce((sum, f) => sum + (f.liters || 0), 0);
        const fuelEfficiency = totalDistance > 0 && fuelUsed > 0 ? totalDistance / fuelUsed : 0;
        const targetEfficiency = driverVehicle?.targetEfficiency || 12;
        const efficiencyScore = targetEfficiency > 0 ? Math.min(100, (fuelEfficiency / targetEfficiency) * 100) : 75;

        const safetyScore = calculateSafetyScore({
          harshEventsPer100km,
          speedingRate,
          totalTrips,
          totalDistance
        });

        const ecoScore = calculateEcoScore({
          fuelEfficiency,
          targetEfficiency,
          idlingPercent,
          harshEventsPer100km
        });

        const overallScore = Math.round((safetyScore * 0.6) + (ecoScore * 0.4));

        const behaviorTier = overallScore >= 85 ? 'excellent' : overallScore >= 70 ? 'good' : overallScore >= 55 ? 'needs_improvement' : 'poor';

        const riskFactors = [];
        if (harshEventsPer100km > 3) riskFactors.push({ factor: 'Frequent harsh braking/acceleration', severity: 'high', value: harshEventsPer100km });
        if (speedingRate > 0.2) riskFactors.push({ factor: 'High speeding rate', severity: 'high', value: Math.round(speedingRate * 100) });
        if (idlingPercent > 15) riskFactors.push({ factor: 'Excessive idling', severity: 'medium', value: Math.round(idlingPercent) });
        if (efficiencyScore < 60) riskFactors.push({ factor: 'Poor fuel efficiency', severity: 'medium', value: Math.round(efficiencyScore) });

        const coachingRecommendations = [];
        if (harshEventsPer100km > 2) coachingRecommendations.push('Eco-driving training: smooth acceleration and braking');
        if (speedingRate > 0.15) coachingRecommendations.push('Speed management coaching');
        if (idlingPercent > 10) coachingRecommendations.push('Idling reduction program');
        if (efficiencyScore < 70) coachingRecommendations.push('Fuel efficiency optimization');

        return {
          driverId: driver.id,
          driverName: driver.name,
          vehicleId: driver.vehicleId,
          vehiclePlate: driverVehicle?.plate,
          totalTrips,
          totalDistance: Math.round(totalDistance),
          totalDuration: Math.round(totalDuration),
          metrics: {
            hardBrakingEvents,
            hardAccelerationEvents,
            speedingEvents,
            idlingMinutes: Math.round(idlingMinutes),
            harshEventsPer100km: Math.round(harshEventsPer100km * 10) / 10,
            speedingRate: Math.round(speedingRate * 100) / 100,
            idlingPercent: Math.round(idlingPercent * 10) / 10,
            fuelEfficiency: Math.round(fuelEfficiency * 10) / 10,
            targetEfficiency
          },
          scores: {
            safety: Math.round(safetyScore),
            eco: Math.round(ecoScore),
            overall: overallScore
          },
          tier: behaviorTier,
          riskFactors,
          coachingRecommendations,
          lastTripDate: driverTrips.length ? new Date(Math.max(...driverTrips.map(t => new Date(t.date).getTime()))).toISOString() : null,
          trend: calculateBehaviorTrend(driverTrips)
        };
      });

      const newCoachingAlerts = [];
      driverBehaviors.forEach(d => {
        if (d.tier === 'poor' || d.scores.safety < 50) {
          newCoachingAlerts.push({
            severity: 'critical',
            driverId: d.driverId,
            driverName: d.driverName,
            type: 'safety_critical',
            message: `${d.driverName} has critical safety score (${d.scores.safety}/100)`,
            recommendedActions: d.coachingRecommendations,
            metrics: { safetyScore: d.scores.safety, harshEvents: d.metrics.harshEventsPer100km }
          });
        } else if (d.tier === 'needs_improvement' || d.scores.eco < 60) {
          newCoachingAlerts.push({
            severity: 'high',
            driverId: d.driverId,
            driverName: d.driverName,
            type: 'eco_improvement_needed',
            message: `${d.driverName} needs eco-driving improvement (${d.scores.eco}/100)`,
            recommendedActions: d.coachingRecommendations,
            metrics: { ecoScore: d.scores.eco, fuelEfficiency: d.metrics.fuelEfficiency }
          });
        }
      });

      const summary = {
        totalDrivers: drivers.length,
        excellent: driverBehaviors.filter(d => d.tier === 'excellent').length,
        good: driverBehaviors.filter(d => d.tier === 'good').length,
        needsImprovement: driverBehaviors.filter(d => d.tier === 'needs_improvement').length,
        poor: driverBehaviors.filter(d => d.tier === 'poor').length,
        avgSafetyScore: Math.round(driverBehaviors.reduce((sum, d) => sum + d.scores.safety, 0) / driverBehaviors.length),
        avgEcoScore: Math.round(driverBehaviors.reduce((sum, d) => sum + d.scores.eco, 0) / driverBehaviors.length),
        avgOverallScore: Math.round(driverBehaviors.reduce((sum, d) => sum + d.scores.overall, 0) / driverBehaviors.length),
        totalHarshEvents: driverBehaviors.reduce((sum, d) => sum + d.metrics.hardBrakingEvents + d.metrics.hardAccelerationEvents, 0),
        totalSpeedingEvents: driverBehaviors.reduce((sum, d) => sum + d.metrics.speedingEvents, 0),
        fleetFuelEfficiency: Math.round(driverBehaviors.reduce((sum, d) => sum + d.metrics.fuelEfficiency, 0) / driverBehaviors.length * 10) / 10
      };

      setAnalysis({ drivers: driverBehaviors, summary });
      setCoachingAlerts(newCoachingAlerts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [drivers, trips, vehicles, fuelRecords, maintenanceRecords]);

  const calculateSafetyScore = ({ harshEventsPer100km, speedingRate, totalTrips, totalDistance }) => {
    let score = 100;
    score -= Math.min(40, harshEventsPer100km * 5);
    score -= Math.min(30, speedingRate * 100);
    if (totalDistance < 100) score -= 10;
    return Math.max(0, score);
  };

  const calculateEcoScore = ({ fuelEfficiency, targetEfficiency, idlingPercent, harshEventsPer100km }) => {
    let score = 100;
    if (targetEfficiency > 0) {
      score -= Math.min(40, (1 - fuelEfficiency / targetEfficiency) * 100);
    }
    score -= Math.min(25, idlingPercent * 1.5);
    score -= Math.min(15, harshEventsPer100km * 2);
    return Math.max(0, score);
  };

  const calculateBehaviorTrend = (trips) => {
    if (trips.length < 10) return 'insufficient_data';
    const recent = trips.slice(-5);
    const older = trips.slice(-10, -5);
    const recentHarsh = recent.reduce((sum, t) => sum + (t.hardBrakingCount || 0) + (t.hardAccelerationCount || 0), 0) / recent.length;
    const olderHarsh = older.reduce((sum, t) => sum + (t.hardBrakingCount || 0) + (t.hardAccelerationCount || 0), 0) / older.length;
    if (recentHarsh < olderHarsh * 0.8) return 'improving';
    if (recentHarsh > olderHarsh * 1.2) return 'declining';
    return 'stable';
  };

  const getDriverAnalysis = useCallback((driverId) => {
    return analysis?.drivers?.find(d => d.driverId === driverId) || null;
  }, [analysis]);

  const getCoachingCandidates = useCallback(() => {
    return analysis?.drivers?.filter(d => d.tier === 'needs_improvement' || d.tier === 'poor') || [];
  }, [analysis]);

  const acknowledgeAlert = useCallback((alertIndex) => {
    setCoachingAlerts(prev => prev.filter((_, i) => i !== alertIndex));
    onNotice?.('Coaching alert acknowledged');
  }, [onNotice]);

  useEffect(() => { analyzeBehavior(); }, [analyzeBehavior]);

  return {
    analysis,
    coachingAlerts,
    loading,
    error,
    refresh: analyzeBehavior,
    getDriverAnalysis,
    getCoachingCandidates,
    acknowledgeAlert,
    summary: analysis?.summary || {},
    criticalAlerts: coachingAlerts.filter(a => a.severity === 'critical'),
    highAlerts: coachingAlerts.filter(a => a.severity === 'high')
  };
}

export default useDriverBehaviorAnalysis;