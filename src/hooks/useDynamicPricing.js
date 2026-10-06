import { useCallback, useEffect, useMemo, useState } from 'react';
import { list } from '../lib/collections';
import { DEFAULT_PRICING, DEFAULT_SPLIT, priceOrder, quotePrice } from '../lib/money';

/**
 * Dynamic pricing hook: real-time price optimization based on demand, supply, and customer behavior.
 * 
 * Adjusts prices based on:
 * - Time of day / day of week demand patterns
 * - Driver availability (supply)
 * - Customer segment (loyalty, volume)
 * - Regional competition
 * - Inventory levels
 */
export function useDynamicPricing({ orders, driverPositions = {}, customerId, region }) {
  const [pricing, setPricing] = useState({});
  const [experiments, setExperiments] = useState([]);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Base pricing config (would come from server in production)
  const basePricing = useMemo(() => ({
    listPrice: 600, // GHS per 1000 gallons
    discountPercent: 50,
    surgePercent: 0,
    surgeReason: '',
  }), []);

  // Calculate demand intensity from recent orders
  const demandIntensity = useMemo(() => {
    const now = Date.now();
    const last24h = orders.filter(o => now - new Date(o.createdAt).getTime() < 24 * 60 * 60 * 1000);
    const lastHour = orders.filter(o => now - new Date(o.createdAt).getTime() < 60 * 60 * 1000);
    
    const hourlyRate = lastHour.length;
    const dailyRate = last24h.length;
    
    // Normalize: 10 orders/hour = high demand, 1 order/hour = low
    return Math.min(2, hourlyRate / 5);
  }, [orders]);

  // Calculate supply availability
  const supplyAvailability = useMemo(() => {
    const { drivers } = require('../lib/fleet').getFleet();
    const onlineDrivers = drivers.filter(d => d.status === 'online').length;
    const totalCapacity = drivers
      .filter(d => d.status === 'online')
      .reduce((sum, d) => sum + (d.capacityGallons || 1000), 0);
    
    return { onlineDrivers, totalCapacity, utilization: onlineDrivers > 0 ? 1 - (totalCapacity / (onlineDrivers * 5000)) : 1 };
  }, [driverPositions]);

  // Customer profile for personalized pricing
  const buildCustomerProfile = useCallback(() => {
    if (!customerId) return null;
    
    const customerOrders = orders.filter(o => o.customerId === customerId || o.phone === customerId || o.email === customerId);
    if (customerOrders.length === 0) return null;
    
    const totalVolume = customerOrders.reduce((s, o) => s + parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0'), 0);
    const totalRevenue = customerOrders.reduce((s, o) => s + (o.chargedMinor || 0), 0);
    const avgOrderValue = totalRevenue / customerOrders.length;
    const lastOrder = customerOrders.reduce((latest, o) => 
      new Date(o.createdAt) > new Date(latest.createdAt) ? o : latest
    );
    const daysSinceLastOrder = (Date.now() - new Date(lastOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    
    let segment = 'new';
    if (customerOrders.length >= 10 && daysSinceLastOrder < 30) segment = 'vip';
    else if (customerOrders.length >= 5 && daysSinceLastOrder < 60) segment = 'loyal';
    else if (customerOrders.length >= 2) segment = 'regular';
    
    const profile = {
      customerId,
      segment,
      totalOrders: customerOrders.length,
      totalVolume,
      totalRevenue,
      avgOrderValue,
      daysSinceLastOrder,
      preferredVolume: totalVolume / customerOrders.length,
      priceSensitivity: segment === 'vip' ? 'low' : segment === 'loyal' ? 'medium' : 'high',
    };
    
    setCustomerProfile(profile);
    return profile;
  }, [orders, customerId]);

  // Generate dynamic prices for different volumes
  const generatePricing = useCallback(() => {
    const volumes = [500, 1000, 2000, 5000, 10000];
    const newPricing = {};
    
    volumes.forEach(volume => {
      const demandMultiplier = 1 + (demandIntensity * 0.3); // Up to 30% increase
      const supplyMultiplier = supplyAvailability.utilization > 0.8 ? 1.2 : 1; // Up to 20% increase if low supply
      const timeMultiplier = getTimeMultiplier();
      const customerMultiplier = getCustomerMultiplier();
      
      const totalMultiplier = demandMultiplier * supplyMultiplier * timeMultiplier * customerMultiplier;
      const finalMultiplier = Math.min(1.5, Math.max(0.7, totalMultiplier)); // Cap between 0.7x and 1.5x
      
      const quote = quotePrice({
        ...basePricing,
        surgePercent: (finalMultiplier - 1) * 100,
      });
      
      newPricing[volume] = {
        basePrice: quote.discounted / 100, // Convert to major units
        finalPrice: quote.totalMinor / 100,
        multiplier: Number(finalMultiplier.toFixed(2)),
        demandFactor: Number(demandMultiplier.toFixed(2)),
        supplyFactor: Number(supplyMultiplier.toFixed(2)),
        timeFactor: Number(timeMultiplier.toFixed(2)),
        customerFactor: Number(customerMultiplier.toFixed(2)),
      };
    });
    
    setPricing(newPricing);
    return newPricing;
  }, [demandIntensity, supplyAvailability, basePricing]);

  // Time-based multiplier
  const getTimeMultiplier = useCallback(() => {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    
    // Peak hours: 6-9 AM, 5-8 PM
    const isPeakHour = (hour >= 6 && hour <= 9) || (hour >= 17 && hour <= 20);
    // Weekend
    const isWeekend = day === 0 || day === 6;
    
    if (isPeakHour && isWeekend) return 1.15;
    if (isPeakHour) return 1.1;
    if (isWeekend) return 1.05;
    return 1.0;
  }, []);

  // Customer-based multiplier
  const getCustomerMultiplier = useCallback(() => {
    if (!customerProfile) return 1.0;
    
    switch (customerProfile.segment) {
      case 'vip': return 0.9; // 10% discount for VIP
      case 'loyal': return 0.95; // 5% discount
      case 'regular': return 1.0;
      default: return 1.0;
    }
  }, [customerProfile]);

  // Get price for a specific volume
  const getPriceForVolume = useCallback((volume) => {
    const volKey = volumes.find(v => v >= volume) || volumes[volumes.length - 1];
    return pricing[volKey] || { finalPrice: 0, multiplier: 1 };
  }, [pricing]);

  // Get human-readable price explanation
  const getPriceExplanation = useCallback((volume) => {
    const priceData = getPriceForVolume(volume);
    const factors = [];
    
    if (priceData.demandFactor > 1.05) factors.push('High demand in your area');
    if (priceData.supplyFactor > 1.05) factors.push('Limited driver availability');
    if (priceData.timeFactor > 1.05) factors.push('Peak hour pricing');
    if (priceData.customerFactor < 0.95) factors.push('Loyalty discount applied');
    if (priceData.customerFactor > 1.05) factors.push('New customer rate');
    
    return factors.length > 0 ? factors.join('; ') : 'Standard pricing';
  }, [getPriceForVolume]);

  const volumes = [500, 1000, 2000, 5000, 10000];

  // Summary for UI
  const summary = useMemo(() => {
    const prices = Object.values(pricing);
    if (prices.length === 0) return { avgMultiplier: 1, surgeActive: false, discountActive: false };
    
    const avgMultiplier = prices.reduce((s, p) => s + p.multiplier, 0) / prices.length;
    const surgeActive = prices.some(p => p.multiplier > 1.1);
    const discountActive = prices.some(p => p.multiplier < 0.95);
    
    return { avgMultiplier: Number(avgMultiplier.toFixed(2)), surgeActive, discountActive };
  }, [pricing]);

  // Refresh pricing
  const refresh = useCallback(() => {
    setLoading(true);
    buildCustomerProfile();
    const timer = setTimeout(() => {
      generatePricing();
      setLastUpdated(new Date().toISOString());
      setLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [buildCustomerProfile, generatePricing]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A/B testing experiments (placeholder for future)
  const refreshExperiments = useCallback(() => {
    // In production, would fetch from server
    setExperiments([
      { id: 'exp-surge-threshold', name: 'Surge Threshold Test', variant: 'control', status: 'running' },
      { id: 'exp-loyalty-discount', name: 'Loyalty Discount Depth', variant: 'treatment', status: 'running' },
    ]);
  }, []);

  useEffect(() => {
    refreshExperiments();
  }, [refreshExperiments]);

  return {
    pricing,
    experiments,
    customerProfile,
    loading,
    lastUpdated,
    refresh,
    refreshPricing: refresh,
    getPriceForVolume,
    getPriceExplanation,
    summary,
  };
}

export default useDynamicPricing;