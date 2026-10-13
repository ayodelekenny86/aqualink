import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, replaceAll } from '../lib/collections';
import { formatCedi } from '../lib/money';

const STORAGE_KEY = 'predictive_inventory';

const DEFAULT_PRODUCTS = [
  { id: 'water_1000', name: '1,000 gal Purified', unit: 'gallons', category: 'Household' },
  { id: 'water_2000', name: '2,000 gal Purified', unit: 'gallons', category: 'Household' },
  { id: 'water_5000', name: '5,000 gal Purified', unit: 'gallons', category: 'Commercial' },
  { id: 'treated_1000', name: '1,000 gal Treated', unit: 'gallons', category: 'Household' },
  { id: 'sachet_500', name: '500L Sachet', unit: 'litres', category: 'Drinking' },
];

function generateId(prefix = 'inv') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function simpleMovingAverage(values, window = 7) {
  if (values.length < window) return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const recent = values.slice(-window);
  return recent.reduce((a, b) => a + b, 0) / window;
}

function exponentialSmoothing(values, alpha = 0.3) {
  if (values.length === 0) return 0;
  let forecast = values[0];
  for (let i = 1; i < values.length; i++) {
    forecast = alpha * values[i] + (1 - alpha) * forecast;
  }
  return forecast;
}

function detectSeasonality(values, period = 7) {
  if (values.length < period * 2) return { seasonal: false, pattern: [] };
  const seasonal = [];
  for (let i = 0; i < period; i++) {
    const indices = [];
    for (let j = i; j < values.length; j += period) {
      indices.push(values[j]);
    }
    if (indices.length > 1) {
      const avg = indices.reduce((a, b) => a + b, 0) / indices.length;
      seasonal.push(avg);
    } else {
      seasonal.push(indices[0] || 0);
    }
  }
  const overallAvg = values.reduce((a, b) => a + b, 0) / values.length;
  const variation = Math.max(...seasonal) - Math.min(...seasonal);
  return {
    seasonal: variation > overallAvg * 0.2,
    pattern: seasonal.map(v => v / (overallAvg || 1)),
  };
}

function forecastDemand(history, daysAhead = 30) {
  const dailyUsage = history.map(h => h.usage || 0);
  const baseForecast = exponentialSmoothing(dailyUsage);
  const { seasonal, pattern } = detectSeasonality(dailyUsage);
  
  const forecast = [];
  const lastDate = history.length > 0 ? new Date(history[history.length - 1].date) : new Date();
  
  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(lastDate);
    date.setDate(date.getDate() + i + 1);
    let predicted = baseForecast;
    if (seasonal && pattern.length > 0) {
      predicted *= pattern[(pattern.length - 1 + i + 1) % pattern.length] || 1;
    }
    forecast.push({
      date: date.toISOString().split('T')[0],
      predictedUsage: Math.max(0, Math.round(predicted)),
      confidence: Math.max(0.5, 1 - i * 0.02),
    });
  }
  return forecast;
}

function calculateReorderPoint(avgDailyUsage, leadTimeDays, safetyStockDays = 3) {
  return Math.ceil(avgDailyUsage * (leadTimeDays + safetyStockDays));
}

function calculateEOQ(annualDemand, orderCost, holdingCostPerUnit) {
  if (annualDemand <= 0 || holdingCostPerUnit <= 0) return 0;
  return Math.sqrt((2 * annualDemand * orderCost) / holdingCostPerUnit);
}

export function usePredictiveInventory({ 
  sellerProfile, 
  orders = [], 
  driverPositions = {}, 
  forecast = [],
  onNotice 
}) {
  const [inventory, setInventory] = useState(() => list(STORAGE_KEY));
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const saved = list(STORAGE_KEY);
    if (saved.length === 0) {
      const initial = DEFAULT_PRODUCTS.map(p => ({
        id: p.id,
        name: p.name,
        type: p.category.toLowerCase().replace(' ', '_'),
        current: Math.floor(Math.random() * 5000) + 1000,
        minLevel: 500,
        maxLevel: 10000,
        unit: p.unit,
        costPerUnit: Math.floor(Math.random() * 50) + 10,
        dailyUsage: Math.floor(Math.random() * 200) + 50,
        reorderQty: 2000,
        leadTime: 3,
        supplier: 'Main Water Supply Co',
        lastRestocked: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        health: 'healthy',
      }));
      replaceAll(STORAGE_KEY, initial);
      setInventory(initial);
    } else {
      setInventory(saved);
    }
  }, []);

  useEffect(() => {
    const updated = inventory.map(item => {
      const delivered = orders.filter(o => 
        o.status === 'Delivered' && 
        o.volume?.toLowerCase().includes(item.name.split(' ')[0].replace(',', ''))
      );
      const recentUsage = delivered
        .slice(-30)
        .reduce((sum, o) => sum + (parseInt(o.volume) || 0), 0);
      const avgDaily = recentUsage / Math.max(1, delivered.length) || item.dailyUsage;
      const daysRemaining = avgDaily > 0 ? Math.floor(item.current / avgDaily) : 999;
      
      let health = 'healthy';
      if (daysRemaining <= item.leadTime) health = 'critical';
      else if (daysRemaining <= item.leadTime + 2) health = 'warning';
      else if (daysRemaining <= 7) health = 'low';
      
      const reorderPoint = calculateReorderPoint(avgDaily, item.leadTime);
      const needsReorder = item.current <= reorderPoint;
      
      return {
        ...item,
        dailyUsage: Math.round(avgDaily),
        daysRemaining,
        health,
        reorderPoint,
        needsReorder,
        reorderQty: needsReorder ? Math.max(item.reorderQty, reorderPoint * 2 - item.current) : item.reorderQty,
        reorderCost: Math.round((Math.max(item.reorderQty, reorderPoint * 2 - item.current)) * item.costPerUnit),
      };
    });
    
    setInventory(updated);
    replaceAll(STORAGE_KEY, updated);
    
    const newAlerts = updated
      .filter(i => i.health === 'critical' || i.health === 'warning')
      .map(i => ({
        id: `alert_${i.id}`,
        type: i.health === 'critical' ? 'stockout_risk' : 'low_stock',
        itemId: i.id,
        itemName: i.name,
        message: i.health === 'critical' 
          ? `CRITICAL: ${i.name} will run out in ${i.daysRemaining} days (lead time: ${i.leadTime}d)`
          : `WARNING: ${i.name} low (${i.daysRemaining}d remaining)`,
        severity: i.health === 'critical' ? 'critical' : 'warning',
        createdAt: new Date().toISOString(),
      }));
    setAlerts(newAlerts);
  }, [inventory, orders]);

  const recordDelivery = useCallback((job) => {
    const volume = parseInt(job.volume?.replace(/[^\d]/g, '')) || 0;
    setInventory(prev => prev.map(item => {
      if (job.volume?.toLowerCase().includes(item.name.split(' ')[0].replace(',', ''))) {
        return { ...item, current: Math.max(0, item.current - volume) };
      }
      return item;
    }));
  }, []);

  const recordRestock = useCallback((itemId, qty, cost) => {
    setInventory(prev => prev.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            current: item.current + qty, 
            lastRestocked: new Date().toISOString(),
            costPerUnit: cost ? cost / qty : item.costPerUnit,
          }
        : item
    ));
    onNotice?.(`Restocked ${qty} ${itemId}`);
  }, [onNotice]);

  const recordMaintenance = useCallback((equipmentId, type, description, cost, vendor) => {
    setEquipment(prev => prev.map(eq => 
      eq.id === equipmentId
        ? {
            ...eq,
            maintenance: {
              ...eq.maintenance,
              lastService: new Date().toISOString(),
              nextService: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              urgency: 'ok',
            },
            totalMaintenanceCost: eq.totalMaintenanceCost + cost,
            usage: {
              ...eq.usage,
              ...(type === 'scheduled' ? { hours: (eq.usage.hours || 0) + 1 } : {}),
            },
          }
        : eq
    ));
    onNotice?.(`Maintenance recorded for ${equipmentId}`);
  }, [onNotice]);

  const predictions = useMemo(() => {
    return inventory.map(item => {
      const history = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        usage: Math.max(0, item.dailyUsage + (Math.random() - 0.5) * item.dailyUsage * 0.3),
      }));
      const forecastData = forecastDemand(history, 30);
      const totalForecast = forecastData.reduce((sum, d) => sum + d.predictedUsage, 0);
      const annualDemand = item.dailyUsage * 365;
      const eoq = calculateEOQ(annualDemand, 500, item.costPerUnit * 0.2);
      
      return {
        itemId: item.id,
        itemName: item.name,
        currentStock: item.current,
        avgDailyUsage: item.dailyUsage,
        daysOfStock: item.daysRemaining,
        forecast30d: totalForecast,
        forecastData,
        reorderPoint: item.reorderPoint,
        eoq: Math.round(eoq),
        recommendedOrderQty: Math.max(item.reorderQty, Math.round(eoq)),
        stockoutRisk: item.daysRemaining <= item.leadTime ? 'high' : 
                      item.daysRemaining <= item.leadTime + 2 ? 'medium' : 'low',
        costToReorder: Math.round(item.reorderQty * item.costPerUnit),
      };
    });
  }, [inventory, forecast]);

  const lowInventory = inventory.filter(i => i.health === 'critical' || i.health === 'warning');
  const pendingMaintenance = equipment.filter(e => e.maintenance?.urgency === 'overdue' || e.maintenance?.urgency === 'due_soon');
  
  const reorderRecommendations = predictions
    .filter(p => p.stockoutRisk === 'high' || p.stockoutRisk === 'medium')
    .map(p => ({
      itemId: p.itemId,
      itemName: p.itemName,
      currentStock: p.currentStock,
      recommendedQty: p.recommendedOrderQty,
      estimatedCost: p.costToReorder,
      urgency: p.stockoutRisk,
      reason: p.stockoutRisk === 'high' 
        ? `Stockout in ${inventory.find(i => i.id === p.itemId)?.daysRemaining}d, lead time ${inventory.find(i => i.id === p.itemId)?.leadTime}d`
        : `Below reorder point (${p.currentStock}/${p.reorderPoint})`,
    }));

  const summary = {
    itemsTracked: inventory.length,
    totalValue: inventory.reduce((sum, i) => sum + i.current * i.costPerUnit, 0),
    lowStockCount: lowInventory.length,
    criticalCount: inventory.filter(i => i.health === 'critical').length,
    healthyCount: inventory.filter(i => i.health === 'healthy').length,
    pendingMaintenance: pendingMaintenance.length,
    reorderRecommendations: reorderRecommendations.length,
  };

  return {
    inventory,
    equipment,
    lowInventory,
    pendingMaintenance,
    reorderRecommendations,
    predictions,
    alerts,
    summary,
    loading,
    recordDelivery,
    recordRestock,
    recordMaintenance,
  };
}

export default usePredictiveInventory;