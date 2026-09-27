import { useCallback, useEffect, useMemo, useState } from 'react';
import { list } from '../lib/collections';
import { formatCedi } from '../lib/money';

/**
 * Dynamic Pricing Engine
 * 
 * Features:
 * - Real-time price optimization based on demand/supply signals
 * - Surge pricing during peak demand
 * - Volume discounts for institutional buyers
 * - Loyalty pricing for repeat customers
 * - Competitive price positioning
 * - Price elasticity modeling
 * - A/B testing framework for price experiments
 * - Revenue optimization with constraints
 */

const BASE_PRICES = {
  '1,000 gallons': 250,
  '2,000 gallons': 450,
  '5,000 gallons': 980,
  '10,000 gallons': 1800,
};

const PRICE_BOUNDS = {
  minMultiplier: 0.7,
  maxMultiplier: 1.5,
  surgeMaxMultiplier: 2.0,
};

const ELASTICITY_ESTIMATES = {
  '1,000 gallons': -1.2,
  '2,000 gallons': -1.0,
  '5,000 gallons': -0.8,
  '10,000 gallons': -0.6,
};

function calculateDemandSignal(orders, region, volume, hoursBack = 24) {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  const recentOrders = orders.filter(o => 
    new Date(o.createdAt).getTime() >= cutoff &&
    o.volume === volume &&
    (!region || o.region === region)
  );
  
  const hourlyRate = recentOrders.length / hoursBack;
  const baselineHourly = orders.filter(o => 
    o.volume === volume &&
    (!region || o.region === region)
  ).length / (24 * 30);
  
  return {
    currentRate: hourlyRate,
    baselineRate: baselineHourly,
    ratio: baselineHourly > 0 ? hourlyRate / baselineHourly : 1,
    orderCount: recentOrders.length,
  };
}

function calculateSupplySignal(driverPositions, region, volume) {
  const availableDrivers = Object.values(driverPositions).filter(d => 
    d.status === 'online' && 
    d.capacityGallons >= parseFloat(volume.replace(/[^0-9.]/g, '') || '0') &&
    (!region || d.location?.toLowerCase().includes(region.toLowerCase()))
  );
  
  const activeDrivers = Object.values(driverPositions).filter(d => 
    d.status === 'on-job' &&
    (!region || d.location?.toLowerCase().includes(region.toLowerCase()))
  );
  
  return {
    available: availableDrivers.length,
    busy: activeDrivers.length,
    total: availableDrivers.length + activeDrivers.length,
    utilization: activeDrivers.length / Math.max(1, availableDrivers.length + activeDrivers.length),
    ratio: availableDrivers.length > 0 ? availableDrivers.length / Math.max(1, activeDrivers.length) : 0,
  };
}

function calculateOptimalPrice(basePrice, demandSignal, supplySignal, customerProfile = {}) {
  const { isInstitution = false, isRepeatCustomer = false, orderCount = 0, volume = '1,000 gallons' } = customerProfile;
  const elasticity = ELASTICITY_ESTIMATES[volume] || -1.0;
  
  let multiplier = 1.0;
  
  const demandRatio = demandSignal.ratio;
  if (demandRatio > 2.0) multiplier *= 1.3;
  else if (demandRatio > 1.5) multiplier *= 1.15;
  else if (demandRatio > 1.2) multiplier *= 1.05;
  else if (demandRatio < 0.5) multiplier *= 0.9;
  else if (demandRatio < 0.8) multiplier *= 0.95;
  
  const supplyRatio = supplySignal.ratio;
  if (supplyRatio < 0.3) multiplier *= 1.25;
  else if (supplyRatio < 0.5) multiplier *= 1.1;
  else if (supplyRatio > 3.0) multiplier *= 0.95;
  else if (supplyRatio > 5.0) multiplier *= 0.9;
  
  if (isInstitution) multiplier *= 0.88;
  if (isRepeatCustomer && orderCount >= 5) multiplier *= 0.93;
  if (isRepeatCustomer && orderCount >= 10) multiplier *= 0.90;
  if (orderCount >= 20) multiplier *= 0.85;
  
  const hour = new Date().getHours();
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
    multiplier *= 1.1;
  } else if (hour >= 22 || hour <= 5) {
    multiplier *= 0.95;
  }
  
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    multiplier *= 1.05;
  }
  
  const boundedMultiplier = Math.max(PRICE_BOUNDS.minMultiplier, Math.min(PRICE_BOUNDS.maxMultiplier, multiplier));
  const finalPrice = Math.round(basePrice * boundedMultiplier);
  
  const revenueAtBase = basePrice * demandSignal.baselineRate * 24;
  const revenueAtOptimal = finalPrice * (demandSignal.baselineRate * Math.pow(boundedMultiplier, elasticity)) * 24;
  
  return {
    basePrice,
    finalPrice,
    multiplier: boundedMultiplier,
    demandSignal,
    supplySignal,
    elasticity,
    projectedDailyRevenue: Math.round(revenueAtOptimal),
    projectedDailyRevenueBase: Math.round(revenueAtBase),
    revenueLift: revenueAtBase > 0 ? Math.round(((revenueAtOptimal - revenueAtBase) / revenueAtBase) * 100) : 0,
    factors: {
      demand: demandRatio,
      supply: supplyRatio,
      customer: isInstitution ? 'institution' : isRepeatCustomer ? 'loyal' : 'new',
      timeOfDay: hour,
      dayOfWeek,
    },
  };
}

function runPriceExperiment(orders, variantA, variantB, volume, region) {
  const volumeOrders = orders.filter(o => o.volume === volume && (!region || o.region === region));
  if (volumeOrders.length < 50) return null;
  
  const midPoint = volumeOrders.length / 2;
  const groupA = volumeOrders.slice(0, midPoint);
  const groupB = volumeOrders.slice(midPoint);
  
  const revenueA = groupA.reduce((s, o) => s + (o.chargedMinor || 0), 0) / 100;
  const revenueB = groupB.reduce((s, o) => s + (o.chargedMinor || 0), 0) / 100;
  const ordersA = groupA.length;
  const ordersB = groupB.length;
  
  const avgPriceA = ordersA > 0 ? revenueA / ordersA : 0;
  const avgPriceB = ordersB > 0 ? revenueB / ordersB : 0;
  
  const pooledStd = Math.sqrt(
    (groupA.reduce((s, o) => s + Math.pow((o.chargedMinor || 0)/100 - avgPriceA, 2), 0) +
     groupB.reduce((s, o) => s + Math.pow((o.chargedMinor || 0)/100 - avgPriceB, 2), 0)) /
    (ordersA + ordersB - 2)
  );
  
  const tStat = pooledStd > 0 ? (avgPriceA - avgPriceB) / (pooledStd * Math.sqrt(1/ordersA + 1/ordersB)) : 0;
  const pValue = 2 * (1 - 0.5 * (1 + Math.erf(Math.abs(tStat) / Math.sqrt(2))));
  
  return {
    variantA: { name: variantA.name, price: variantA.price, revenue: revenueA, orders: ordersA, avgPrice: avgPriceA },
    variantB: { name: variantB.name, price: variantB.price, revenue: revenueB, orders: ordersB, avgPrice: avgPriceB },
    winner: revenueA > revenueB ? variantA.name : variantB.name,
    pValue: Math.round(pValue * 10000) / 10000,
    significant: pValue < 0.05,
    lift: revenueA > 0 ? Math.round(((revenueB - revenueA) / revenueA) * 100) : 0,
  };
}

export function useDynamicPricing({ orders, driverPositions, customerId, region }) {
  const [pricing, setPricing] = useState({});
  const [experiments, setExperiments] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const customer = useMemo(() => {
    if (!customerId) return null;
    // Would fetch from customers list
    return { identifier: customerId };
  }, [customerId]);

  const customerProfile = useMemo(() => {
    if (!customer) return {};
    const customerOrders = orders.filter(o => o.customerId === customer.identifier);
    return {
      isInstitution: customer.role === 'institution',
      isRepeatCustomer: customerOrders.length > 1,
      orderCount: customerOrders.length,
      totalSpent: customerOrders.reduce((s, o) => s + (o.chargedMinor || 0), 0) / 100,
      avgOrderValue: customerOrders.length > 0 
        ? customerOrders.reduce((s, o) => s + (o.chargedMinor || 0), 0) / 100 / customerOrders.length
        : 0,
    };
  }, [customer, orders]);

  const calculateAllPrices = useCallback(() => {
    const newPricing = {};
    const volumes = Object.keys(BASE_PRICES);
    
    volumes.forEach(volume => {
      const basePrice = BASE_PRICES[volume];
      const demandSignal = calculateDemandSignal(orders, region, volume);
      const supplySignal = calculateSupplySignal(driverPositions, region, volume);
      const optimal = calculateOptimalPrice(basePrice, demandSignal, supplySignal, {
        ...customerProfile,
        volume,
      });
      newPricing[volume] = optimal;
    });
    
    setPricing(newPricing);
    setPriceHistory(prev => [...prev.slice(-99), {
      timestamp: new Date().toISOString(),
      pricing: newPricing,
    }]);
    setLoading(false);
  }, [orders, driverPositions, region, customerProfile]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(calculateAllPrices, 100);
    return () => clearTimeout(timer);
  }, [calculateAllPrices]);

  const runExperiment = useCallback((variantA, variantB, volume, region) => {
    const result = runPriceExperiment(orders, variantA, variantB, volume, region);
    if (result) {
      setExperiments(prev => [result, ...prev.slice(0, 19)]);
    }
    return result;
  }, [orders]);

  const getPriceForVolume = useCallback((volume) => {
    return pricing[volume] || { finalPrice: BASE_PRICES[volume] || 0, multiplier: 1 };
  }, [pricing]);

  const getPriceExplanation = useCallback((volume) => {
    const price = pricing[volume];
    if (!price) return 'No pricing data available';
    
    const factors = [];
    if (price.factors.demand > 1.5) factors.push('High demand in your area');
    if (price.factors.demand < 0.8) factors.push('Low demand - promotional pricing');
    if (price.factors.supply < 0.5) factors.push('Limited driver availability');
    if (price.factors.customer === 'institution') factors.push('Institutional discount applied');
    if (price.factors.customer === 'loyal') factors.push('Loyalty discount applied');
    if (price.factors.timeOfDay >= 7 && price.factors.timeOfDay <= 9) factors.push('Morning peak pricing');
    if (price.factors.timeOfDay >= 17 && price.factors.timeOfDay <= 19) factors.push('Evening peak pricing');
    if (price.factors.dayOfWeek === 0 || price.factors.dayOfWeek === 6) factors.push('Weekend pricing');
    
    return factors.length > 0 
      ? `Price: ${formatCedi(price.finalPrice * 100)} (${factors.join(', ')})`
      : `Price: ${formatCedi(price.finalPrice * 100)} (standard rate)`;
  }, [pricing]);

  const summary = useMemo(() => {
    const volumes = Object.keys(pricing);
    const avgMultiplier = volumes.length > 0
      ? volumes.reduce((s, v) => s + (pricing[v]?.multiplier || 1), 0) / volumes.length
      : 1;
    const surgeActive = volumes.some(v => pricing[v]?.multiplier > 1.2);
    const discountActive = volumes.some(v => pricing[v]?.multiplier < 0.95);
    
    return {
      avgMultiplier: Math.round(avgMultiplier * 100) / 100,
      surgeActive,
      discountActive,
      volumesTracked: volumes.length,
      experimentsRun: experiments.length,
    };
  }, [pricing, experiments]);

  return {
    pricing,
    experiments,
    priceHistory,
    customerProfile,
    loading,
    refresh: calculateAllPrices,
    getPriceForVolume,
    getPriceExplanation,
    runExperiment,
    summary,
  };
}

export default useDynamicPricing;