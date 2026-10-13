import { useState, useEffect, useCallback, useMemo } from 'react';

export function useSmartWaterAllocation({ 
  sources = [], 
  orders = [], 
  facilities = [],
  customers = [],
  weatherForecast = [],
  priorityRules = [],
  onNotice 
}) {
  const [allocation, setAllocation] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const optimizeAllocation = useCallback(async () => {
    if (!sources.length || !orders.length) {
      setAllocation({ plan: [], summary: {} });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const pendingOrders = orders.filter(o => 
        ['Pending', 'Assigned'].includes(o.status) && o.volume > 0
      ).sort((a, b) => {
        const priorityOrder = { emergency: 0, hospital: 1, residential: 2, commercial: 3, industrial: 4 };
        return (priorityOrder[a.customerType] || 2) - (priorityOrder[b.customerType] || 2);
      });

      const availableSources = sources.filter(s => s.status === 'active' && s.availableVolume > 0);
      const totalDemand = pendingOrders.reduce((sum, o) => sum + o.volume, 0);
      const totalSupply = availableSources.reduce((sum, s) => sum + s.availableVolume, 0);

      const allocationPlan = [];
      let remainingDemand = { ...pendingOrders.reduce((acc, o) => { acc[o.id] = o.volume; return acc; }, {}) };

      for (const source of availableSources) {
        let sourceRemaining = source.availableVolume;
        const sourceFacility = facilities.find(f => f.id === source.facilityId);
        
        for (const order of pendingOrders) {
          if (remainingDemand[order.id] <= 0 || sourceRemaining <= 0) continue;

          const facility = facilities.find(f => f.id === order.facilityId);
          const distance = facility && sourceFacility ? calculateDistance(
            sourceFacility.location?.lat || 0, sourceFacility.location?.lng || 0,
            facility.location?.lat || 0, facility.location?.lng || 0
          ) : 0;

          const transportCost = distance * (source.transportCostPerKm || 0.5);
          const totalCost = order.volume * (source.costPerGallon || 0.02) + transportCost;

          const allocated = Math.min(remainingDemand[order.id], sourceRemaining);
          
          if (allocated > 0) {
            allocationPlan.push({
              sourceId: source.id,
              sourceName: source.name,
              orderId: order.id,
              customerId: order.customerId,
              customerType: order.customerType,
              facilityId: order.facilityId,
              allocatedVolume: allocated,
              orderVolume: order.volume,
              fulfillmentPercent: Math.round((allocated / order.volume) * 100),
              distance: Math.round(distance),
              transportCost: Math.round(transportCost * 100) / 100,
              unitCost: source.costPerGallon || 0.02,
              totalCost: Math.round(totalCost * 100) / 100,
              priority: order.priority || 'normal',
              qualityScore: source.qualityScore || 85
            });
            
            remainingDemand[order.id] -= allocated;
            sourceRemaining -= allocated;
          }
        }
      }

      const unfulfilledOrders = pendingOrders.filter(o => remainingDemand[o.id] > 0);
      const fulfillmentRate = totalDemand > 0 ? ((totalDemand - unfulfilledOrders.reduce((sum, o) => sum + remainingDemand[o.id], 0)) / totalDemand) * 100 : 100;

      const sourceUtilization = availableSources.map(s => {
        const allocated = allocationPlan.filter(a => a.sourceId === s.id).reduce((sum, a) => sum + a.allocatedVolume, 0);
        return {
          sourceId: s.id,
          sourceName: s.name,
          allocated,
          capacity: s.availableVolume,
          utilizationPercent: Math.round((allocated / s.availableVolume) * 100),
          remainingVolume: s.availableVolume - allocated
        };
      });

      const costAnalysis = {
        totalCost: allocationPlan.reduce((sum, a) => sum + a.totalCost, 0),
        avgCostPerGallon: totalDemand > 0 ? allocationPlan.reduce((sum, a) => sum + a.totalCost, 0) / totalDemand : 0,
        bySource: availableSources.map(s => {
          const sourceAllocations = allocationPlan.filter(a => a.sourceId === s.id);
          return {
            sourceId: s.id,
            sourceName: s.name,
            volume: sourceAllocations.reduce((sum, a) => sum + a.allocatedVolume, 0),
            cost: sourceAllocations.reduce((sum, a) => sum + a.totalCost, 0),
            avgCost: sourceAllocations.length ? sourceAllocations.reduce((sum, a) => sum + a.totalCost, 0) / sourceAllocations.reduce((sum, a) => sum + a.allocatedVolume, 0) : 0
          };
        }),
        byCustomerType: [...new Set(pendingOrders.map(o => o.customerType))].map(type => {
          const typeAllocations = allocationPlan.filter(a => a.customerType === type);
          return {
            customerType: type,
            volume: typeAllocations.reduce((sum, a) => sum + a.allocatedVolume, 0),
            cost: typeAllocations.reduce((sum, a) => sum + a.totalCost, 0),
            avgCost: typeAllocations.length ? typeAllocations.reduce((sum, a) => sum + a.totalCost, 0) / typeAllocations.reduce((sum, a) => sum + a.allocatedVolume, 0) : 0,
            orders: typeAllocations.length
          };
        })
      };

      const weatherImpact = assessWeatherImpact(weatherForecast, availableSources);
      const priorityCompliance = checkPriorityCompliance(allocationPlan, priorityRules);

      const newAllocation = {
        plan: allocationPlan,
        unfulfilledOrders: unfulfilledOrders.map(o => ({
          orderId: o.id,
          customerId: o.customerId,
          requestedVolume: o.volume,
          fulfilledVolume: o.volume - remainingDemand[o.id],
          shortfall: remainingDemand[o.id],
          customerType: o.customerType,
          priority: o.priority
        })),
        sourceUtilization,
        costAnalysis,
        weatherImpact,
        priorityCompliance,
        summary: {
          totalDemand,
          totalSupply,
          totalAllocated: totalDemand - unfulfilledOrders.reduce((sum, o) => sum + remainingDemand[o.id], 0),
          fulfillmentRate: Math.round(fulfillmentRate * 10) / 10,
          totalCost: costAnalysis.totalCost,
          avgCostPerGallon: Math.round(costAnalysis.avgCostPerGallon * 10000) / 10000,
          sourcesUsed: availableSources.filter(s => sourceUtilization.find(u => u.sourceId === s.id && u.allocated > 0)).length,
          unfulfilledCount: unfulfilledOrders.length,
          criticalUnfulfilled: unfulfilledOrders.filter(o => o.priority === 'emergency' || o.customerType === 'hospital').length
        },
        generatedAt: new Date().toISOString()
      };

      setAllocation(newAllocation);
      generateScenarios(availableSources, pendingOrders, facilities);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sources, orders, facilities, customers, weatherForecast, priorityRules]);

  const generateScenarios = useCallback((sources, orders, facilities) => {
    const totalDemand = orders.reduce((sum, o) => sum + o.volume, 0);
    const totalSupply = sources.reduce((sum, s) => sum + s.availableVolume, 0);

    const scenarioList = [
      {
        id: 'current',
        name: 'Current Allocation',
        description: 'Optimized allocation with current supply',
        supplyMultiplier: 1.0,
        demandMultiplier: 1.0,
        estimatedFulfillment: Math.min(100, (totalSupply / totalDemand) * 100)
      },
      {
        id: 'surge_20',
        name: 'Demand Surge +20%',
        description: 'Seasonal demand increase scenario',
        supplyMultiplier: 1.0,
        demandMultiplier: 1.2,
        estimatedFulfillment: Math.min(100, (totalSupply / (totalDemand * 1.2)) * 100)
      },
      {
        id: 'source_failure',
        name: 'Primary Source Failure',
        description: 'Largest source goes offline',
        supplyMultiplier: 0.7,
        demandMultiplier: 1.0,
        estimatedFulfillment: Math.min(100, (totalSupply * 0.7 / totalDemand) * 100)
      },
      {
        id: 'emergency_priority',
        name: 'Emergency Priority Only',
        description: 'Only emergency/hospital orders fulfilled',
        supplyMultiplier: 1.0,
        demandMultiplier: 0.3,
        estimatedFulfillment: 100
      },
      {
        id: 'cost_optimized',
        name: 'Cost Optimized',
        description: 'Minimize transport + source costs',
        supplyMultiplier: 1.0,
        demandMultiplier: 1.0,
        estimatedFulfillment: Math.min(100, (totalSupply / totalDemand) * 100)
      }
    ];

    setScenarios(scenarioList);
  }, []);

  const assessWeatherImpact = (forecast, sources) => {
    const impacts = [];
    forecast.forEach(f => {
      if (f.severity === 'severe' || f.severity === 'extreme') {
        sources.forEach(s => {
          if (f.affectedAreas?.some(a => s.location?.includes(a))) {
            impacts.push({
              sourceId: s.id,
              sourceName: s.name,
              weatherType: f.type,
              severity: f.severity,
              impact: f.type === 'heavy_rain' ? 'Quality risk - increased turbidity' : 
                      f.type === 'drought' ? 'Supply reduction risk' : 'Transport disruption',
              estimatedSupplyReduction: f.severity === 'extreme' ? 30 : 15,
              validUntil: f.validUntil
            });
          }
        });
      }
    });
    return impacts;
  };

  const checkPriorityCompliance = (plan, rules) => {
    if (!rules.length) return { compliant: true, violations: [] };
    
    const violations = [];
    rules.forEach(rule => {
      const ruleOrders = plan.filter(a => a.customerType === rule.customerType || a.priority === rule.priority);
      const avgFulfillment = ruleOrders.length 
        ? ruleOrders.reduce((sum, a) => sum + a.fulfillmentPercent, 0) / ruleOrders.length 
        : 100;
      
      if (avgFulfillment < rule.minFulfillment) {
        violations.push({
          rule: rule.name,
          customerType: rule.customerType,
          priority: rule.priority,
          requiredFulfillment: rule.minFulfillment,
          actualFulfillment: Math.round(avgFulfillment),
          severity: avgFulfillment < rule.minFulfillment * 0.5 ? 'critical' : 'high'
        });
      }
    });
    
    return {
      compliant: violations.length === 0,
      violations
    };
  };

  const runScenario = useCallback((scenarioId) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return null;
    
    onNotice?.(`Running scenario: ${scenario.name}`);
    return scenario;
  }, [scenarios, onNotice]);

  const reallocateForEmergency = useCallback((emergencyOrderId) => {
    setAllocation(prev => {
      if (!prev) return prev;
      const newPlan = [...prev.plan];
      const emergencyAllocation = newPlan.find(a => a.orderId === emergencyOrderId);
      if (!emergencyAllocation) return prev;

      emergencyAllocation.priority = 'emergency';
      emergencyAllocation.fulfillmentPercent = 100;
      emergencyAllocation.allocatedVolume = emergencyAllocation.orderVolume;

      return { ...prev, plan: newPlan };
    });
    onNotice?.(`Emergency reallocation for order ${emergencyOrderId}`);
  }, [onNotice]);

  useEffect(() => { optimizeAllocation(); }, [optimizeAllocation]);

  const getSourceAllocation = useCallback((sourceId) => {
    return allocation?.plan?.filter(a => a.sourceId === sourceId) || [];
  }, [allocation]);

  const getOrderAllocation = useCallback((orderId) => {
    return allocation?.plan?.filter(a => a.orderId === orderId) || [];
  }, [allocation]);

  const getUnfulfilledOrders = useCallback(() => {
    return allocation?.unfulfilledOrders || [];
  }, [allocation]);

  return {
    allocation,
    scenarios,
    loading,
    error,
    refresh: optimizeAllocation,
    runScenario,
    reallocateForEmergency,
    getSourceAllocation,
    getOrderAllocation,
    getUnfulfilledOrders,
    fulfillmentRate: allocation?.summary?.fulfillmentRate || 0,
    totalCost: allocation?.summary?.totalCost || 0,
    criticalUnfulfilled: allocation?.summary?.criticalUnfulfilled || 0,
    weatherImpacts: allocation?.weatherImpact || [],
    priorityViolations: allocation?.priorityCompliance?.violations || []
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

export default useSmartWaterAllocation;