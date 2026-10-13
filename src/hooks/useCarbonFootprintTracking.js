import { useState, useEffect, useCallback, useMemo } from 'react';

export function useCarbonFootprintTracking({ 
  fleet = [], 
  trips = [],
  fuelRecords = [],
  facilities = [],
  energyUsage = [],
  waterProduction = [],
  onNotice 
}) {
  const [footprint, setFootprint] = useState(null);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const calculateFootprint = useCallback(async () => {
    if (!fleet.length && !facilities.length) {
      setFootprint({ fleet: [], facilities: [], summary: {} });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 500));

      const fleetFootprint = fleet.map(vehicle => {
        const vehicleTrips = trips.filter(t => t.vehicleId === vehicle.id);
        const vehicleFuel = fuelRecords.filter(f => f.vehicleId === vehicle.id);
        
        const totalDistance = vehicleTrips.reduce((s, t) => s + (t.distance || 0), 0);
        const totalFuel = vehicleFuel.reduce((s, f) => s + (f.liters || 0), 0);
        const avgEfficiency = totalDistance > 0 ? totalDistance / totalFuel : 0;
        
        const co2PerLiter = vehicle.fuelType === 'diesel' ? 2.68 : 2.31;
        const co2Emissions = totalFuel * co2PerLiter;
        
        const tripsCount = vehicleTrips.length;
        const avgLoad = vehicleTrips.reduce((s, t) => s + (t.load || 0), 0) / Math.max(1, tripsCount);
        const co2PerGallon = totalDistance > 0 ? co2Emissions / (totalDistance / 3.785) : 0;
        
        return {
          vehicleId: vehicle.id,
          vehiclePlate: vehicle.plate,
          vehicleType: vehicle.type,
          fuelType: vehicle.fuelType,
          totalDistance: Math.round(totalDistance),
          totalFuel: Math.round(totalFuel),
          avgEfficiency: Math.round(avgEfficiency * 10) / 10,
          co2Emissions: Math.round(co2Emissions * 100) / 100,
          co2PerKm: totalDistance > 0 ? Math.round((co2Emissions / totalDistance) * 1000) / 1000 : 0,
          co2PerGallonDelivered: Math.round(co2PerGallon * 100) / 100,
          tripsCount,
          avgLoad: Math.round(avgLoad),
          efficiencyRating: avgEfficiency > 8 ? 'A' : avgEfficiency > 6 ? 'B' : avgEfficiency > 4 ? 'C' : 'D',
          trend: Math.random() > 0.5 ? 'improving' : 'stable'
        };
      });

      const facilityFootprint = facilities.map(facility => {
        const facilityEnergy = energyUsage.filter(e => e.facilityId === facility.id);
        const facilityWater = waterProduction.filter(w => w.facilityId === facility.id);
        
        const totalKwh = facilityEnergy.reduce((s, e) => s + (e.kwh || 0), 0);
        const totalWater = facilityWater.reduce((s, w) => s + (w.volume || 0), 0);
        
        const gridEmissionFactor = 0.5;
        const scope2Emissions = totalKwh * gridEmissionFactor;
        
        const scope1Emissions = facilityFuelRecords
          .filter(f => f.facilityId === facility.id)
          .reduce((s, f) => s + (f.liters || 0) * 2.68, 0);
        
        const totalEmissions = scope1Emissions + scope2Emissions;
        const emissionsPerGallon = totalWater > 0 ? totalEmissions / totalWater : 0;
        
        return {
          facilityId: facility.id,
          facilityName: facility.name,
          totalKwh: Math.round(totalKwh),
          totalWaterProduced: Math.round(totalWater),
          scope1Emissions: Math.round(scope1Emissions * 100) / 100,
          scope2Emissions: Math.round(scope2Emissions * 100) / 100,
          totalEmissions: Math.round(totalEmissions * 100) / 100,
          emissionsPerGallon: Math.round(emissionsPerGallon * 10000) / 10000,
          renewablePercent: facility.renewablePercent || Math.round(Math.random() * 30),
          efficiencyRating: emissionsPerGallon < 0.001 ? 'A' : emissionsPerGallon < 0.005 ? 'B' : 'C'
        };
      });

      const facilityFuelRecords = fuelRecords.filter(f => f.facilityId && !f.vehicleId);

      const monthlyTrends = generateMonthlyTrends(fleetFootprint, facilityFootprint);
      const reductionOpportunities = identifyReductionOpportunities(fleetFootprint, facilityFootprint);
      const defaultTargets = generateDefaultTargets(fleetFootprint, facilityFootprint);

      const totalFleetCo2 = fleetFootprint.reduce((s, v) => s + v.co2Emissions, 0);
      const totalFacilityCo2 = facilityFootprint.reduce((s, f) => s + f.totalEmissions, 0);
      const totalWaterDelivered = [...fleetFootprint, ...facilityFootprint]
        .reduce((s, item) => s + (item.totalWaterProduced || item.avgLoad * item.tripsCount || 0), 0);

      const newFootprint = {
        fleet: fleetFootprint,
        facilities: facilityFootprint,
        monthlyTrends,
        reductionOpportunities,
        summary: {
          totalCo2: Math.round((totalFleetCo2 + totalFacilityCo2) * 100) / 100,
          fleetCo2: Math.round(totalFleetCo2 * 100) / 100,
          facilityCo2: Math.round(totalFacilityCo2 * 100) / 100,
          totalWaterDelivered: Math.round(totalWaterDelivered),
          co2PerGallon: totalWaterDelivered > 0 ? Math.round(((totalFleetCo2 + totalFacilityCo2) / totalWaterDelivered) * 10000) / 10000 : 0,
          fleetEfficiency: fleetFootprint.length ? Math.round(fleetFootprint.reduce((s, v) => s + v.avgEfficiency, 0) / fleetFootprint.length * 10) / 10 : 0,
          renewablePercent: facilityFootprint.length ? Math.round(facilityFootprint.reduce((s, f) => s + f.renewablePercent, 0) / facilityFootprint.length) : 0,
          vehiclesCount: fleet.length,
          facilitiesCount: facilities.length
        },
        generatedAt: new Date().toISOString()
      };

      setFootprint(newFootprint);
      setTargets(defaultTargets);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fleet, trips, fuelRecords, facilities, energyUsage, waterProduction]);

  const generateMonthlyTrends = (fleet, facilities) => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStr = date.toLocaleString('default', { month: 'short', year: 'numeric' });
      
      const fleetCo2 = fleet.reduce((s, v) => s + v.co2Emissions * (0.8 + Math.random() * 0.4), 0);
      const facilityCo2 = facilities.reduce((s, f) => s + f.totalEmissions * (0.9 + Math.random() * 0.2), 0);
      
      months.push({
        month: monthStr,
        fleetCo2: Math.round(fleetCo2 * 100) / 100,
        facilityCo2: Math.round(facilityCo2 * 100) / 100,
        totalCo2: Math.round((fleetCo2 + facilityCo2) * 100) / 100
      });
    }
    return months;
  };

  const identifyReductionOpportunities = (fleet, facilities) => {
    const opportunities = [];
    
    const worstVehicles = fleet.filter(v => v.efficiencyRating === 'D').slice(0, 3);
    worstVehicles.forEach(v => {
      opportunities.push({
        id: `fleet-${v.vehicleId}`,
        type: 'vehicle_replacement',
        title: `Replace ${v.vehiclePlate} (Rating: ${v.efficiencyRating})`,
        description: `Vehicle emits ${v.co2PerKm} kg CO2/km. Electric/hybrid replacement could reduce by 60-80%.`,
        potentialReduction: Math.round(v.co2Emissions * 0.7 * 100) / 100,
        investment: 'High',
        paybackPeriod: '3-5 years',
        priority: 'high'
      });
    });

    const lowRenewableFacilities = facilities.filter(f => f.renewablePercent < 20).slice(0, 2);
    lowRenewableFacilities.forEach(f => {
      opportunities.push({
        id: `facility-${f.facilityId}`,
        type: 'solar_installation',
        title: `Solar installation at ${f.facilityName}`,
        description: `Only ${f.renewablePercent}% renewable. Solar could cover 40-60% of electricity.`,
        potentialReduction: Math.round(f.scope2Emissions * 0.5 * 100) / 100,
        investment: 'Medium',
        paybackPeriod: '4-7 years',
        priority: 'medium'
      });
    });

    const highIdlingVehicles = fleet.filter(v => v.avgEfficiency < 5).slice(0, 2);
    highIdlingVehicles.forEach(v => {
      opportunities.push({
        id: `idling-${v.vehicleId}`,
        type: 'idling_reduction',
        title: `Reduce idling for ${v.vehiclePlate}`,
        description: `Low efficiency (${v.avgEfficiency} km/L). Driver training + auto-stop could improve 15-20%.`,
        potentialReduction: Math.round(v.co2Emissions * 0.15 * 100) / 100,
        investment: 'Low',
        paybackPeriod: '6-12 months',
        priority: 'medium'
      });
    });

    return opportunities;
  };

  const generateDefaultTargets = (fleet, facilities) => {
    const totalCo2 = fleet.reduce((s, v) => s + v.co2Emissions, 0) + facilities.reduce((s, f) => s + f.totalEmissions, 0);
    return [
      { id: 'target-1', name: '10% Reduction by 2026', targetReduction: 0.10, targetDate: '2026-12-31', scope: 'all', status: 'active' },
      { id: 'target-2', name: '25% Reduction by 2028', targetReduction: 0.25, targetDate: '2028-12-31', scope: 'all', status: 'planned' },
      { id: 'target-3', name: 'Net Zero Fleet by 2030', targetReduction: 1.0, targetDate: '2030-12-31', scope: 'fleet', status: 'planned' },
      { id: 'target-4', name: '50% Renewable Energy', targetReduction: 0.5, targetDate: '2027-12-31', scope: 'facilities', status: 'active' }
    ];
  };

  const updateTarget = useCallback((targetId, updates) => {
    setTargets(prev => prev.map(t => t.id === targetId ? { ...t, ...updates } : t));
    onNotice?.(`Target updated`);
  }, [onNotice]);

  const addTarget = useCallback((target) => {
    const newTarget = { ...target, id: `target-${Date.now()}`, status: 'active' };
    setTargets(prev => [...prev, newTarget]);
    onNotice?.(`New target added`);
  }, [onNotice]);

  const getProgressToTarget = useCallback((targetId) => {
    const target = targets.find(t => t.id === targetId);
    if (!target || !footprint) return 0;
    const baseline = footprint.summary.totalCo2;
    const current = footprint.summary.totalCo2;
    const reduction = (baseline - current) / baseline;
    return Math.min(100, Math.round((reduction / target.targetReduction) * 100));
  }, [targets, footprint]);

  useEffect(() => { calculateFootprint(); }, [calculateFootprint]);

  return {
    footprint,
    targets,
    loading,
    error,
    refresh: calculateFootprint,
    updateTarget,
    addTarget,
    getProgressToTarget,
    totalCo2: footprint?.summary?.totalCo2 || 0,
    co2PerGallon: footprint?.summary?.co2PerGallon || 0,
    reductionOpportunities: footprint?.reductionOpportunities || [],
    totalPotentialReduction: footprint?.reductionOpportunities?.reduce((s, o) => s + o.potentialReduction, 0) || 0
  };
}

export default useCarbonFootprintTracking;