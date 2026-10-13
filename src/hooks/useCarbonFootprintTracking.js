import { useState, useEffect, useCallback, useMemo } from 'react';

export function useCarbonFootprintTracking({ 
  orders = [], 
  drivers = [], 
  vehicles = [],
  routes = [],
  facilities = [],
  onNotice 
}) {
  const [footprint, setFootprint] = useState(null);
  const [targets, setTargets] = useState({
    monthlyReduction: 15,
    annualReduction: 25,
    netZeroTargetYear: 2035
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const calculateFootprint = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 300));

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const monthlyOrders = orders.filter(o => {
        const orderDate = new Date(o.date || o.createdAt);
        return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
      });

      const totalVolume = monthlyOrders.reduce((sum, o) => sum + (o.volume || 0), 0);
      const totalDistance = routes.reduce((sum, r) => sum + (r.distance || 0), 0);
      const totalTrips = routes.length;

      const avgVehicleEmission = vehicles.length
        ? vehicles.reduce((sum, v) => sum + (v.emissionsPerKm || 0.25), 0) / vehicles.length
        : 0.25;

      const fuelEmissions = totalDistance * avgVehicleEmission;
      const facilityEmissions = facilities.reduce((sum, f) => sum + (f.monthlyEmissions || 500), 0);
      const totalEmissions = fuelEmissions + facilityEmissions;

      const emissionsPerGallon = totalVolume > 0 ? totalEmissions / totalVolume : 0;

      const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
        const month = (currentMonth - 11 + i + 12) % 12;
        const year = currentYear - (currentMonth - 11 + i < 0 ? 1 : 0);
        const monthOrders = orders.filter(o => {
          const d = new Date(o.date || o.createdAt);
          return d.getMonth() === month && d.getFullYear() === year;
        });
        const monthVolume = monthOrders.reduce((sum, o) => sum + (o.volume || 0), 0);
        const monthDistance = routes
          .filter(r => {
            const d = new Date(r.date);
            return d.getMonth() === month && d.getFullYear() === year;
          })
          .reduce((sum, r) => sum + (r.distance || 0), 0);
        const monthFuelEmissions = monthDistance * avgVehicleEmission;
        const monthFacilityEmissions = facilities.reduce((sum, f) => sum + (f.monthlyEmissions || 500), 0);
        return {
          month,
          year,
          label: new Date(year, month).toLocaleString('default', { month: 'short' }),
          volume: monthVolume,
          distance: monthDistance,
          emissions: Math.round(monthFuelEmissions + monthFacilityEmissions),
          emissionsPerGallon: monthVolume > 0 ? (monthFuelEmissions + monthFacilityEmissions) / monthVolume : 0
        };
      });

      const byVehicle = vehicles.map(v => {
        const vehicleRoutes = routes.filter(r => r.vehicleId === v.id);
        const vehicleDistance = vehicleRoutes.reduce((sum, r) => sum + (r.distance || 0), 0);
        return {
          vehicleId: v.id,
          name: v.name || v.plate,
          type: v.type,
          fuelType: v.fuelType,
          distance: vehicleDistance,
          emissions: Math.round(vehicleDistance * (v.emissionsPerKm || avgVehicleEmission)),
          trips: vehicleRoutes.length,
          efficiency: v.efficiency || (v.fuelType === 'electric' ? 95 : v.fuelType === 'hybrid' ? 70 : 45)
        };
      });

      const byFacility = facilities.map(f => {
        const facilityOrders = orders.filter(o => o.facilityId === f.id);
        const facilityVolume = facilityOrders.reduce((sum, o) => sum + (o.volume || 0), 0);
        return {
          facilityId: f.id,
          name: f.name,
          volume: facilityVolume,
          emissions: f.monthlyEmissions || 500,
          emissionsPerGallon: facilityVolume > 0 ? (f.monthlyEmissions || 500) / facilityVolume : 0,
          renewableEnergy: f.renewableEnergyPercent || 0,
          hasSolar: f.hasSolar || false
        };
      });

      const byDriver = drivers.map(d => {
        const driverRoutes = routes.filter(r => r.driverId === d.id);
        const driverDistance = driverRoutes.reduce((sum, r) => sum + (r.distance || 0), 0);
        const vehicle = vehicles.find(v => v.id === d.vehicleId);
        return {
          driverId: d.id,
          name: d.name,
          distance: driverDistance,
          emissions: Math.round(driverDistance * (vehicle?.emissionsPerKm || avgVehicleEmission)),
          trips: driverRoutes.length,
          avgEmissionsPerTrip: driverRoutes.length > 0 ? Math.round(driverDistance * (vehicle?.emissionsPerKm || avgVehicleEmission) / driverRoutes.length) : 0
        };
      }).sort((a, b) => b.emissions - a.emissions);

      const reductionOpportunities = [
        {
          id: 'route_optimization',
          title: 'Route Optimization',
          description: 'Optimize delivery routes to reduce distance by 15-20%',
          potentialReduction: Math.round(totalEmissions * 0.18),
          effort: 'medium',
          cost: 'low',
          timeline: '1-2 months',
          status: 'identified'
        },
        {
          id: 'ev_transition',
          title: 'EV Fleet Transition',
          description: 'Replace diesel trucks with electric vehicles',
          potentialReduction: Math.round(fuelEmissions * 0.6),
          effort: 'high',
          cost: 'high',
          timeline: '2-4 years',
          status: 'planning'
        },
        {
          id: 'solar_facilities',
          title: 'Solar-Powered Facilities',
          description: 'Install solar panels at water treatment facilities',
          potentialReduction: Math.round(facilityEmissions * 0.4),
          effort: 'medium',
          cost: 'medium',
          timeline: '6-12 months',
          status: 'feasibility'
        },
        {
          id: 'load_consolidation',
          title: 'Load Consolidation',
          description: 'Combine nearby deliveries to reduce trips',
          potentialReduction: Math.round(fuelEmissions * 0.12),
          effort: 'low',
          cost: 'low',
          timeline: '1 month',
          status: 'pilot'
        },
        {
          id: 'driver_training',
          title: 'Eco-Driving Training',
          description: 'Train drivers on fuel-efficient driving techniques',
          potentialReduction: Math.round(fuelEmissions * 0.08),
          effort: 'low',
          cost: 'low',
          timeline: '2 months',
          status: 'identified'
        }
      ];

      const currentMonthData = monthlyTrend[monthlyTrend.length - 1];
      const previousMonthData = monthlyTrend[monthlyTrend.length - 2];
      const monthOverMonthChange = previousMonthData && previousMonthData.emissions > 0
        ? ((currentMonthData.emissions - previousMonthData.emissions) / previousMonthData.emissions) * 100
        : 0;

      const projectedAnnual = monthlyTrend.reduce((sum, m) => sum + m.emissions, 0);
      const targetAnnual = projectedAnnual * (1 - targets.annualReduction / 100);

      const newFootprint = {
        summary: {
          totalEmissions: Math.round(totalEmissions),
          fuelEmissions: Math.round(fuelEmissions),
          facilityEmissions: Math.round(facilityEmissions),
          totalVolume,
          totalDistance,
          totalTrips,
          emissionsPerGallon: Math.round(emissionsPerGallon * 1000) / 1000,
          monthOverMonthChange: Math.round(monthOverMonthChange * 10) / 10
        },
        monthlyTrend,
        byVehicle,
        byFacility,
        byDriver,
        reductionOpportunities,
        targets,
        projectedAnnual: Math.round(projectedAnnual),
        targetAnnual: Math.round(targetAnnual),
        progressToTarget: targets.annualReduction > 0 
          ? Math.min(100, Math.round((1 - projectedAnnual / targetAnnual) * 100))
          : 0,
        certifications: [
          { name: 'ISO 14064', status: 'pending', progress: 60 },
          { name: 'GHG Protocol', status: 'compliant', progress: 100 },
          { name: 'Carbon Neutral', status: 'planning', progress: 25 }
        ],
        lastCalculated: new Date().toISOString()
      };

      setFootprint(newFootprint);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, drivers, vehicles, routes, facilities, targets]);

  const updateTargets = useCallback((newTargets) => {
    setTargets(prev => ({ ...prev, ...newTargets }));
    onNotice?.('Carbon reduction targets updated');
  }, [onNotice]);

  const markOpportunityStatus = useCallback((opportunityId, status) => {
    setFootprint(prev => prev ? {
      ...prev,
      reductionOpportunities: prev.reductionOpportunities.map(o => 
        o.id === opportunityId ? { ...o, status } : o
      )
    } : null);
    onNotice?.(`Opportunity marked as ${status}`);
  }, [onNotice]);

  useEffect(() => { calculateFootprint(); }, [calculateFootprint]);

  const getVehicleFootprint = useCallback((vehicleId) => {
    return footprint?.byVehicle?.find(v => v.vehicleId === vehicleId) || null;
  }, [footprint]);

  const getFacilityFootprint = useCallback((facilityId) => {
    return footprint?.byFacility?.find(f => f.facilityId === facilityId) || null;
  }, [footprint]);

  const getTopEmitters = useCallback((limit = 5) => {
    return {
      vehicles: footprint?.byVehicle?.slice(0, limit) || [],
      facilities: footprint?.byFacility?.sort((a, b) => b.emissions - a.emissions).slice(0, limit) || [],
      drivers: footprint?.byDriver?.slice(0, limit) || []
    };
  }, [footprint]);

  return {
    footprint,
    targets,
    loading,
    error,
    refresh: calculateFootprint,
    updateTargets,
    markOpportunityStatus,
    getVehicleFootprint,
    getFacilityFootprint,
    getTopEmitters,
    totalEmissions: footprint?.summary?.totalEmissions || 0,
    emissionsPerGallon: footprint?.summary?.emissionsPerGallon || 0,
    progressToTarget: footprint?.progressToTarget || 0,
    reductionOpportunities: footprint?.reductionOpportunities || [],
    monthlyTrend: footprint?.monthlyTrend || []
  };
}

export default useCarbonFootprintTracking;