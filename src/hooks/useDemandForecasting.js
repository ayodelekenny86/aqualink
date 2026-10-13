import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, replaceAll } from '../lib/collections';
import { formatCedi } from '../lib/money';

const STORAGE_KEY = 'demand_forecasting';

const ZONES = [
  { id: 'zone_1', name: 'Central Accra', lat: 5.6037, lng: -0.1870, baseDemand: 120 },
  { id: 'zone_2', name: 'East Legon', lat: 5.6500, lng: -0.1500, baseDemand: 85 },
  { id: 'zone_3', name: 'Spintex', lat: 5.6200, lng: -0.0800, baseDemand: 95 },
  { id: 'zone_4', name: 'Tema', lat: 5.6698, lng: -0.0166, baseDemand: 110 },
  { id: 'zone_5', name: 'Madina', lat: 5.6833, lng: -0.1667, baseDemand: 75 },
  { id: 'zone_6', name: 'Kasoa', lat: 5.5333, lng: -0.4167, baseDemand: 65 },
];

function generateId(prefix = 'df') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function getTimeOfDayBuckets() {
  return [
    { key: 'morning', label: 'Morning (6-10)', hours: [6, 7, 8, 9] },
    { key: 'midday', label: 'Midday (10-14)', hours: [10, 11, 12, 13] },
    { key: 'afternoon', label: 'Afternoon (14-18)', hours: [14, 15, 16, 17] },
    { key: 'evening', label: 'Evening (18-22)', hours: [18, 19, 20, 21] },
    { key: 'night', label: 'Night (22-6)', hours: [22, 23, 0, 1, 2, 3, 4, 5] },
  ];
}

function getDayOfWeekMultiplier(day) {
  const multipliers = [0.9, 1.0, 1.0, 1.1, 1.2, 1.3, 0.8];
  return multipliers[day] || 1.0;
}

function getWeatherMultiplier(weather) {
  if (!weather) return 1.0;
  const w = weather.toLowerCase();
  if (w.includes('rain') || w.includes('storm')) return 1.4;
  if (w.includes('hot') || w.includes('sunny') || w.includes('heat')) return 1.25;
  if (w.includes('cloud')) return 1.0;
  return 1.0;
}

function generateHeatmapData(orders, zones, daysBack = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  
  const recentOrders = orders.filter(o => new Date(o.createdAt) >= cutoff);
  
  const zoneStats = {};
  const timeStats = {};
  const dayStats = {};
  
  recentOrders.forEach(order => {
    const zone = order.zone || 'zone_1';
    const hour = new Date(order.createdAt).getHours();
    const day = new Date(order.createdAt).getDay();
    
    if (!zoneStats[zone]) zoneStats[zone] = { count: 0, revenue: 0, avgOrderValue: 0 };
    zoneStats[zone].count++;
    zoneStats[zone].revenue += order.total || 0;
    
    const bucket = getTimeOfDayBuckets().find(b => b.hours.includes(hour))?.key || 'midday';
    if (!timeStats[bucket]) timeStats[bucket] = { count: 0, revenue: 0 };
    timeStats[bucket].count++;
    timeStats[bucket].revenue += order.total || 0;
    
    if (!dayStats[day]) dayStats[day] = { count: 0, revenue: 0 };
    dayStats[day].count++;
    dayStats[day].revenue += order.total || 0;
  });
  
  Object.keys(zoneStats).forEach(z => {
    zoneStats[z].avgOrderValue = zoneStats[z].revenue / zoneStats[z].count;
  });
  
  return { zoneStats, timeStats, dayStats };
}

function predictZoneDemand(zone, orders, weather, date = new Date()) {
  const zoneInfo = ZONES.find(z => z.id === zone) || { baseDemand: 50 };
  const { zoneStats, timeStats, dayStats } = generateHeatmapData(orders, ZONES);
  
  const hour = date.getHours();
  const day = date.getDay();
  const bucket = getTimeOfDayBuckets().find(b => b.hours.includes(hour))?.key || 'midday';
  
  const zoneMultiplier = (zoneStats[zone]?.count || 0) / Math.max(1, orders.length) * 10 || 1;
  const timeMultiplier = (timeStats[bucket]?.count || 0) / Math.max(1, orders.length) * 5 || 1;
  const dayMultiplier = getDayOfWeekMultiplier(day);
  const weatherMultiplier = getWeatherMultiplier(weather);
  
  const base = zoneInfo.baseDemand * zoneMultiplier * 0.5;
  const predicted = Math.round(base * timeMultiplier * dayMultiplier * weatherMultiplier);
  
  return {
    zone,
    zoneName: zoneInfo.name,
    predictedOrders: Math.max(5, predicted),
    confidence: Math.min(0.95, 0.5 + (zoneStats[zone]?.count || 0) * 0.01),
    factors: {
      historical: zoneMultiplier.toFixed(2),
      timeOfDay: timeMultiplier.toFixed(2),
      dayOfWeek: dayMultiplier.toFixed(2),
      weather: weatherMultiplier.toFixed(2),
    },
    suggestedDrivers: Math.ceil(predicted / 8),
    peakHours: getPeakHoursForZone(zone, timeStats),
  };
}

function getPeakHoursForZone(zone, timeStats) {
  const buckets = getTimeOfDayBuckets();
  return buckets
    .filter(b => (timeStats[b.key]?.count || 0) > 0)
    .sort((a, b) => (timeStats[b.key]?.count || 0) - (timeStats[a.key]?.count || 0))
    .slice(0, 2)
    .map(b => b.label);
}

function forecastWeeklyDemand(orders, weatherForecast = []) {
  const forecasts = [];
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    
    const weather = weatherForecast[i]?.condition || 'clear';
    const dayForecast = ZONES.map(zone => predictZoneDemand(zone.id, orders, weather, date));
    
    forecasts.push({
      date: date.toISOString().split('T')[0],
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      zones: dayForecast,
      totalPredicted: dayForecast.reduce((sum, z) => sum + z.predictedOrders, 0),
      totalDriversNeeded: dayForecast.reduce((sum, z) => sum + z.suggestedDrivers, 0),
    });
  }
  
  return forecasts;
}

function identifyHighPotentialZones(orders, zones) {
  const { zoneStats } = generateHeatmapData(orders, zones);
  
  return zones
    .map(zone => {
      const stats = zoneStats[zone.id];
      const potential = (stats?.count || 0) * (stats?.avgOrderValue || 0);
      const penetration = (stats?.count || 0) / Math.max(1, zone.baseDemand * 30);
      
      return {
        zone: zone.id,
        zoneName: zone.name,
        potential: Math.round(potential),
        penetration: Math.min(1, penetration),
        currentOrders: stats?.count || 0,
        avgOrderValue: stats?.avgOrderValue || 0,
        recommendation: penetration < 0.3 ? 'Expand marketing' : penetration < 0.6 ? 'Optimize routes' : 'Maintain service',
      };
    })
    .sort((a, b) => b.potential - a.potential);
}

export function useDemandForecasting({ orders = [], weather = 'clear', weatherForecast = [], onNotice }) {
  const [heatmapData, setHeatmapData] = useState(null);
  const [weeklyForecast, setWeeklyForecast] = useState([]);
  const [highPotentialZones, setHighPotentialZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const historical = stored ? JSON.parse(stored) : [];
      
      const allOrders = [...historical, ...orders].filter(o => o.status !== 'Cancelled');
      
      const heatmap = generateHeatmapData(allOrders, ZONES);
      const forecast = forecastWeeklyDemand(allOrders, weatherForecast);
      const potential = identifyHighPotentialZones(allOrders, ZONES);
      
      setHeatmapData(heatmap);
      setWeeklyForecast(forecast);
      setHighPotentialZones(potential);
      setLastUpdated(new Date().toISOString());
      
      const currentOrders = allOrders.filter(o => 
        new Date(o.createdAt).toDateString() === new Date().toDateString()
      ).length;
      
      onNotice?.(`Demand forecast updated: ${forecast[0]?.totalPredicted || 0} orders predicted today, ${potential[0]?.zoneName} highest potential`);
    } catch (error) {
      console.error('Demand forecasting error:', error);
      onNotice?.('Failed to generate demand forecast', 'error');
    } finally {
      setLoading(false);
    }
  }, [orders, weather, weatherForecast, onNotice]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getZoneForecast = useCallback((zoneId, date) => {
    return predictZoneDemand(zoneId, orders, weather, new Date(date));
  }, [orders, weather]);

  const getTimeOfDayAnalysis = useCallback(() => {
    if (!heatmapData) return null;
    return heatmapData.timeStats;
  }, [heatmapData]);

  const getDayOfWeekAnalysis = useCallback(() => {
    if (!heatmapData) return null;
    return heatmapData.dayStats;
  }, [heatmapData]);

  const recordOrder = useCallback((order) => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const historical = stored ? JSON.parse(stored) : [];
    historical.push({ ...order, createdAt: order.createdAt || new Date().toISOString() });
    const recent = historical.slice(-1000);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    refresh();
  }, [refresh]);

  return {
    zones: ZONES,
    heatmapData,
    weeklyForecast,
    highPotentialZones,
    loading,
    lastUpdated,
    refresh,
    getZoneForecast,
    getTimeOfDayAnalysis,
    getDayOfWeekAnalysis,
    recordOrder,
    formatCedi,
  };
}