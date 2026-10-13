import { useState, useEffect, useCallback, useMemo } from 'react';

export function useWaterSourceOptimization({ 
  sources = [], 
  orders = [],
  facilities = [],
  weatherData = [],
  qualityTests = [],
  costData = [],
  onNotice 
}) {
  const [optimization, setOptimization] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const optimizeSources = useCallback(async () => {
    if (!sources.length) {
      setOptimization({ sources: [], summary: {} });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const activeSources = sources.filter(s => s.status === 'active');
      const pendingOrders = orders.filter(o => ['Pending', 'Assigned'].includes(o.status));
      const totalDemand = pendingOrders.reduce((s, o) => s + (o.volume || 0), 0);

      const sourceAnalysis = activeSources.map(source => {
        const sourceQuality = qualityTests.filter(t => t.sourceId === source.id).slice(-1);
        const latestQuality = sourceQuality[0];
        const sourceWeather = weatherData.find(w => w.area === source.location?.area);
        const sourceCosts = costData.find(c => c.sourceId === source.id);
        
        const qualityScore = latestQuality ? calculateQualityScore(latestQuality) : 85;
        const weatherRisk = sourceWeather ? assessWeatherRisk(sourceWeather) : 0;
        const costPerGallon = sourceCosts?.costPerGallon || source.costPerGallon || 0.02;
        const transportCost = sourceCosts?.transportCostPerKm || 0.5;
        
        const availableVolume = source.availableVolume || 0;
        const utilizationRate = totalDemand > 0 ? Math.min(1, availableVolume / totalDemand) : 0;
        
        const sustainabilityScore = calculateSustainabilityScore(source, sourceWeather);
        const reliabilityScore = calculateReliabilityScore(source, qualityTests);
        
        const optimizationScore = (
          qualityScore * 0.3 +
          (100 - weatherRisk * 20) * 0.2 +
          (100 - costPerGallon * 5000) * 0.2 +
          utilizationRate * 100 * 0.15 +
          sustainabilityScore * 0.1 +
          reliabilityScore * 0.05
        );

        return {
          sourceId: source.id,
          sourceName: source.name,
          type: source.type,
          location: source.location,
          availableVolume,
          maxCapacity: source.maxCapacity || availableVolume * 1.5,
          qualityScore: Math.round(qualityScore),
          weatherRisk: Math.round(weatherRisk * 10) / 10,
          costPerGallon: Math.round(costPerGallon * 10000) / 10000,
          transportCostPerKm: transportCost,
          sustainabilityScore: Math.round(sustainabilityScore),
          reliabilityScore: Math.round(reliabilityScore),
          optimizationScore: Math.round(optimizationScore * 10) / 10,
          utilizationRate: Math.round(utilizationRate * 100),
          recommendedAllocation: Math.round(availableVolume * Math.min(1, optimizationScore / 100)),
          status: optimizationScore > 80 ? 'optimal' : optimizationScore > 60 ? 'good' : 'needs_review',
          factors: {
            quality: qualityScore,
            weather: 100 - weatherRisk * 20,
            cost: 100 - costPerGallon * 5000,
            utilization: utilizationRate * 100,
            sustainability: sustainabilityScore,
            reliability: reliabilityScore
          }
        };
      }).sort((a, b) => b.optimizationScore - a.optimizationScore);

      const allocationPlan = generateAllocationPlan(sourceAnalysis, pendingOrders, facilities);
      
      const scenarioList = generateScenarios(sourceAnalysis, pendingOrders, totalDemand);

      const newOptimization = {
        sources: sourceAnalysis,
        allocationPlan,
        scenarios: scenarioList,
        summary: {
          totalSources: activeSources.length,
          optimalSources: sourceAnalysis.filter(s => s.status === 'optimal').length,
          totalAvailableVolume: sourceAnalysis.reduce((s, src) => src.availableVolume, 0),
          totalDemand,
          fulfillmentRate: totalDemand > 0 ? Math.round((allocationPlan.reduce((s, a) => s + a.allocatedVolume, 0) / totalDemand) * 100) : 100,
          avgOptimizationScore: Math.round(sourceAnalysis.reduce((s, src) => s + src.optimizationScore, 0) / sourceAnalysis.length * 10) / 10,
          estimatedCost: allocationPlan.reduce((s, a) => s + a.totalCost, 0),
          avgCostPerGallon: totalDemand > 0 ? allocationPlan.reduce((s, a) => s + a.totalCost, 0) / totalDemand : 0,
          sourcesNeedingReview: sourceAnalysis.filter(s => s.status === 'needs_review').length
        },
        generatedAt: new Date().toISOString()
      };

      setOptimization(newOptimization);
      setScenarios(scenarioList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sources, orders, facilities, weatherData, qualityTests, costData]);

  const calculateQualityScore = (test) => {
    let score = 100;
    if (test.ph < 6.5 || test.ph > 8.5) score -= 20;
    if (test.turbidity > 4) score -= 25;
    if (test.chlorine < 0.2 || test.chlorine > 4) score -= 20;
    if (test.tds > 500) score -= 15;
    if (test.bacteria > 0) score -= 30;
    return Math.max(0, score);
  };

  const assessWeatherRisk = (weather) => {
    let risk = 0;
    if (weather.precipitation > 20) risk += 2;
    if (weather.temperature > 30) risk += 1;
    if (weather.windSpeed > 15) risk += 1;
    if (weather.severity === 'severe') risk += 2;
    if (weather.severity === 'extreme') risk += 3;
    return Math.min(5, risk);
  };

  const calculateSustainabilityScore = (source, weather) => {
    let score = 70;
    if (source.type === 'groundwater') score += 10;
    if (source.type === 'spring') score += 15;
    if (source.renewable === true) score += 10;
    if (weather && weather.precipitation > 10) score += 5;
    return Math.min(100, score);
  };

  const calculateReliabilityScore = (source, tests) => {
    const recentTests = tests.filter(t => t.sourceId === source.id).slice(-10);
    if (recentTests.length < 3) return 70;
    const compliantTests = recentTests.filter(t => 
      t.ph >= 6.5 && t.ph <= 8.5 && 
      t.turbidity <= 4 && 
      t.chlorine >= 0.2 && t.chlorine <= 4 &&
      t.bacteria === 0
    ).length;
    return (compliantTests / recentTests.length) * 100;
  };

  const generateAllocationPlan = (sources, orders, facilities) => {
    const plan = [];
    let remainingDemand = orders.reduce((acc, o) => { acc[o.id] = o.volume; return acc; }, {});
    
    for (const source of sources) {
      let sourceRemaining = source.availableVolume;
      for (const order of orders) {
        if (remainingDemand[order.id] <= 0 || sourceRemaining <= 0) continue;
        const facility = facilities.find(f => f.id === order.facilityId);
        const distance = facility && source.location ? calculateDistance(source.location, facility.location) : 10;
        const allocated = Math.min(remainingDemand[order.id], sourceRemaining);
        if (allocated > 0) {
          const transportCost = distance * source.transportCostPerKm;
          const totalCost = allocated * source.costPerGallon + transportCost;
          plan.push({
            sourceId: source.sourceId,
            sourceName: source.sourceName,
            orderId: order.id,
            allocatedVolume: allocated,
            distance: Math.round(distance),
            transportCost: Math.round(transportCost * 100) / 100,
            unitCost: source.costPerGallon,
            totalCost: Math.round(totalCost * 100) / 100
          });
          remainingDemand[order.id] -= allocated;
          sourceRemaining -= allocated;
        }
      }
    }
    return plan;
  };

  const generateScenarios = (sources, orders, totalDemand) => {
    const totalSupply = sources.reduce((s, src) => s + src.availableVolume, 0);
    return [
      { id: 'current', name: 'Current Optimization', supplyMultiplier: 1.0, demandMultiplier: 1.0, estimatedFulfillment: Math.min(100, (totalSupply / totalDemand) * 100) },
      { id: 'drought', name: 'Drought Scenario (-30% supply)', supplyMultiplier: 0.7, demandMultiplier: 1.0, estimatedFulfillment: Math.min(100, (totalSupply * 0.7 / totalDemand) * 100) },
      { id: 'surge', name: 'Demand Surge (+50%)', supplyMultiplier: 1.0, demandMultiplier: 1.5, estimatedFulfillment: Math.min(100, (totalSupply / (totalDemand * 1.5)) * 100) },
      { id: 'quality_crisis', name: 'Quality Crisis (top source offline)', supplyMultiplier: 0.5, demandMultiplier: 1.0, estimatedFulfillment: Math.min(100, (totalSupply * 0.5 / totalDemand) * 100) },
      { id: 'cost_focus', name: 'Cost Minimization', supplyMultiplier: 1.0, demandMultiplier: 1.0, estimatedFulfillment: Math.min(100, (totalSupply / totalDemand) * 100) }
    ];
  };

  const calculateDistance = (loc1, loc2) => {
    if (!loc1?.lat || !loc2?.lat) return 10 + Math.random() * 40;
    const R = 6371;
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLon = (loc2.lng - loc1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const runScenario = useCallback((scenarioId) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;
    onNotice?.(`Running scenario: ${scenario.name}`);
    return scenario;
  }, [scenarios, onNotice]);

  const getSourceDetails = useCallback((sourceId) => {
    return optimization?.sources?.find(s => s.sourceId === sourceId) || null;
  }, [optimization]);

  const getAllocationForOrder = useCallback((orderId) => {
    return optimization?.allocationPlan?.filter(a => a.orderId === orderId) || [];
  }, [optimization]);

  useEffect(() => { optimizeSources(); }, [optimizeSources]);

  return {
    optimization,
    scenarios,
    loading,
    error,
    refresh: optimizeSources,
    runScenario,
    getSourceDetails,
    getAllocationForOrder,
    totalAvailableVolume: optimization?.summary?.totalAvailableVolume || 0,
    fulfillmentRate: optimization?.summary?.fulfillmentRate || 0,
    avgOptimizationScore: optimization?.summary?.avgOptimizationScore || 0,
    estimatedCost: optimization?.summary?.estimatedCost || 0,
    sourcesNeedingReview: optimization?.summary?.sourcesNeedingReview || 0
  };
}

export default useWaterSourceOptimization;