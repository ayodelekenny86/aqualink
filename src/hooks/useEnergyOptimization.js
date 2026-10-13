import { useState, useEffect, useCallback, useMemo } from 'react';

export function useEnergyOptimization({ fleetDrivers = [], orders = [], driverLocations = {}, vehicles = [], onNotice }) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [energyData, setEnergyData] = useState(null);
  const [efficiencyRecommendations, setEfficiencyRecommendations] = useState([]);
  const [evTransitionPlan, setEvTransitionPlan] = useState(null);
  const [carbonFootprint, setCarbonFootprint] = useState(null);

  const formatCedi = (amount) => {
    const cedis = amount / 100;
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 }).format(cedis);
  };

  const generateEnergyData = useCallback(() => {
    const totalDistance = fleetDrivers.reduce((sum, d) => sum + (d.totalDistance || Math.random() * 5000), 0);
    const totalFuelUsed = fleetDrivers.reduce((sum, d) => sum + (d.fuelUsed || Math.random() * 2000), 0);
    const avgFuelEfficiency = totalDistance > 0 ? totalDistance / totalFuelUsed : 12.5;
    const totalFuelCost = totalFuelUsed * 14.50 * 100;
    
    const vehicleBreakdown = (vehicles.length > 0 ? vehicles : [
      { id: 'v1', type: 'tanker', count: 8, avgEfficiency: 8.5, fuelType: 'diesel' },
      { id: 'v2', type: 'pickup', count: 12, avgEfficiency: 12.0, fuelType: 'diesel' },
      { id: 'v3', type: 'van', count: 6, avgEfficiency: 14.5, fuelType: 'petrol' },
      { id: 'v4', type: 'electric', count: 2, avgEfficiency: 0, fuelType: 'electric' },
    ]).map(v => ({
      ...v,
      totalDistance: v.count * (Math.random() * 3000 + 1000),
      totalFuelCost: v.fuelType === 'electric' ? 0 : v.count * (Math.random() * 50000 + 10000) * 100,
      co2Emissions: v.fuelType === 'electric' ? 0 : v.count * (Math.random() * 50 + 20),
    }));

    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      monthlyTrend.push({
        month: date.toISOString().slice(0, 7),
        fuelCost: Math.random() * 80000 + 40000,
        distance: Math.random() * 15000 + 8000,
        efficiency: 10 + Math.random() * 5,
        co2: Math.random() * 200 + 100,
      });
    }

    return {
      totalDistance: Math.round(totalDistance),
      totalFuelUsed: Math.round(totalFuelUsed),
      avgFuelEfficiency: Math.round(avgFuelEfficiency * 10) / 10,
      totalFuelCost: Math.round(totalFuelCost),
      vehicleBreakdown,
      monthlyTrend,
      fleetSize: fleetDrivers.length,
      evCount: vehicleBreakdown.find(v => v.fuelType === 'electric')?.count || 0,
    };
  }, [fleetDrivers, vehicles]);

  const generateRecommendations = useCallback((data) => {
    const recs = [
      {
        id: 'rec_1',
        title: 'Route Consolidation',
        description: 'Combine nearby deliveries to reduce empty return trips by 23%',
        category: 'routing',
        priority: 'high',
        estimatedSavings: data.totalFuelCost * 0.15,
        co2Reduction: data.vehicleBreakdown.reduce((sum, v) => sum + (v.co2Emissions || 0), 0) * 0.15,
        implementation: '2-4 weeks',
        effort: 'medium',
      },
      {
        id: 'rec_2',
        title: 'Driver Eco-Training',
        description: 'Implement fuel-efficient driving techniques (smooth acceleration, optimal speed)',
        category: 'behavior',
        priority: 'high',
        estimatedSavings: data.totalFuelCost * 0.08,
        co2Reduction: data.vehicleBreakdown.reduce((sum, v) => sum + (v.co2Emissions || 0), 0) * 0.08,
        implementation: '1-2 weeks',
        effort: 'low',
      },
      {
        id: 'rec_3',
        title: 'Tire Pressure Monitoring',
        description: 'Install TPMS on all vehicles to maintain optimal tire pressure',
        category: 'maintenance',
        priority: 'medium',
        estimatedSavings: data.totalFuelCost * 0.03,
        co2Reduction: data.vehicleBreakdown.reduce((sum, v) => sum + (v.co2Emissions || 0), 0) * 0.03,
        implementation: '2-3 weeks',
        effort: 'low',
      },
      {
        id: 'rec_4',
        title: 'Electric Vehicle Pilot',
        description: 'Replace 3 diesel tankers with electric for urban routes',
        category: 'electrification',
        priority: 'medium',
        estimatedSavings: data.totalFuelCost * 0.25,
        co2Reduction: data.vehicleBreakdown.reduce((sum, v) => sum + (v.co2Emissions || 0), 0) * 0.35,
        implementation: '6-12 months',
        effort: 'high',
      },
      {
        id: 'rec_5',
        title: 'Idle Reduction Policy',
        description: 'Enforce 3-minute max idle time with automatic engine shutdown',
        category: 'policy',
        priority: 'medium',
        estimatedSavings: data.totalFuelCost * 0.05,
        co2Reduction: data.vehicleBreakdown.reduce((sum, v) => sum + (v.co2Emissions || 0), 0) * 0.05,
        implementation: '1 week',
        effort: 'low',
      },
      {
        id: 'rec_6',
        title: 'Aerodynamic Improvements',
        description: 'Add side skirts and roof fairings to tanker fleet',
        category: 'aerodynamics',
        priority: 'low',
        estimatedSavings: data.totalFuelCost * 0.07,
        co2Reduction: data.vehicleBreakdown.reduce((sum, v) => sum + (v.co2Emissions || 0), 0) * 0.07,
        implementation: '4-6 weeks',
        effort: 'medium',
      },
    ];
    return recs;
  }, []);

  const generateEVTransitionPlan = useCallback((data) => {
    const currentEV = data.evCount;
    const totalFleet = data.fleetSize;
    const dieselVehicles = data.vehicleBreakdown.filter(v => v.fuelType === 'diesel').reduce((sum, v) => sum + v.count, 0);
    
    return {
      currentEV,
      targetEV: Math.ceil(totalFleet * 0.4),
      phases: [
        { phase: 1, timeline: '0-6 months', action: 'Pilot 3 electric vans for urban routes', investment: 45000000, savings: data.totalFuelCost * 0.12 },
        { phase: 2, timeline: '6-18 months', action: 'Replace 5 diesel pickups with electric', investment: 75000000, savings: data.totalFuelCost * 0.20 },
        { phase: 3, timeline: '18-36 months', action: 'Convert 4 tankers to electric/hybrid', investment: 120000000, savings: data.totalFuelCost * 0.35 },
      ],
      totalInvestment: 240000000,
      annualSavings: data.totalFuelCost * 0.45,
      paybackPeriod: 4.2,
      co2ReductionAnnual: data.vehicleBreakdown.reduce((sum, v) => sum + (v.co2Emissions || 0), 0) * 0.45,
      chargingInfrastructure: { needed: 8, existing: 2, cost: 15000000 },
    };
  }, []);

  const generateCarbonFootprint = useCallback((data) => {
    const totalCO2 = data.vehicleBreakdown.reduce((sum, v) => sum + (v.co2Emissions || 0), 0);
    const totalDistance = data.totalDistance;
    
    return {
      totalCO2: Math.round(totalCO2),
      co2PerKm: Math.round(totalCO2 / totalDistance * 1000) / 1000,
      co2PerDelivery: Math.round(totalCO2 / Math.max(1, orders.length) * 100) / 100,
      breakdown: data.vehicleBreakdown.map(v => ({
        type: v.type,
        fuelType: v.fuelType,
        co2: Math.round(v.co2Emissions || 0),
        percentage: Math.round((v.co2Emissions || 0) / totalCO2 * 100),
      })),
      offsets: [
        { project: 'Mangrove Restoration, Volta Region', tons: 150, cost: 750000, verified: true },
        { project: 'Solar Water Pumps, Northern Ghana', tons: 80, cost: 400000, verified: true },
        { project: 'Clean Cookstoves, Rural Communities', tons: 200, cost: 1000000, verified: false },
      ],
      netZeroTarget: 2035,
      currentProgress: 15,
    };
  }, [orders]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      const data = generateEnergyData();
      setEnergyData(data);
      setEfficiencyRecommendations(generateRecommendations(data));
      setEvTransitionPlan(generateEVTransitionPlan(data));
      setCarbonFootprint(generateCarbonFootprint(data));
      setLastUpdated(new Date().toISOString());
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [generateEnergyData, generateRecommendations, generateEVTransitionPlan, generateCarbonFootprint]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      const data = generateEnergyData();
      setEnergyData(data);
      setEfficiencyRecommendations(generateRecommendations(data));
      setEvTransitionPlan(generateEVTransitionPlan(data));
      setCarbonFootprint(generateCarbonFootprint(data));
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      onNotice?.('Energy optimization data refreshed');
    }, 300);
  }, [generateEnergyData, generateRecommendations, generateEVTransitionPlan, generateCarbonFootprint, onNotice]);

  const summary = useMemo(() => {
    if (!energyData) return {};
    const totalSavings = efficiencyRecommendations.reduce((sum, r) => sum + r.estimatedSavings, 0);
    const totalCO2Reduction = efficiencyRecommendations.reduce((sum, r) => sum + r.co2Reduction, 0);
    return {
      avgEfficiency: energyData.avgFuelEfficiency,
      totalFuelCost: energyData.totalFuelCost,
      potentialSavings: totalSavings,
      potentialCO2Reduction: Math.round(totalCO2Reduction),
      evProgress: `${energyData.evCount}/${energyData.fleetSize} EV`,
      evTarget: `${Math.ceil(energyData.fleetSize * 0.4)} by 2027`,
      highPriorityActions: efficiencyRecommendations.filter(r => r.priority === 'high').length,
    };
  }, [energyData, efficiencyRecommendations]);

  return {
    energyData,
    efficiencyRecommendations,
    evTransitionPlan,
    carbonFootprint,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  };
}