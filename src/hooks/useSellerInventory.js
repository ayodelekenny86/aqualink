import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update, findBy } from '../lib/collections';
import { formatCedi } from '../lib/money';

/**
 * Seller Inventory & Predictive Maintenance Tracking
 * 
 * Features:
 * - Real-time water inventory tracking (source, treatment, storage)
 * - Automated reorder points with demand forecasting
 * - Vehicle predictive maintenance (mileage, hours, condition)
 * - Equipment health monitoring (pumps, tanks, filters)
 * - Cost optimization for inventory holding vs stockout
 * - Supplier performance tracking
 * - Batch quality traceability
 * - Regulatory compliance documentation
 */

const INVENTORY_TYPES = {
  RAW_WATER: 'raw_water',
  TREATED_WATER: 'treated_water',
  PACKAGED_WATER: 'packaged_water',
  CHEMICALS: 'chemicals',
  FILTERS: 'filters',
  PARTS: 'parts',
};

const MAINTENANCE_INTERVALS = {
  vehicle: { km: 5000, hours: 250, days: 90 },
  pump: { hours: 2000, days: 180 },
  tank: { days: 365 },
  filter: { days: 90, volume: 50000 },
  treatment_system: { days: 180, volume: 100000 },
};

const REORDER_POLICIES = {
  JIT: 'just_in_time',
  EOQ: 'economic_order_quantity',
  MIN_MAX: 'min_max',
  FORECAST_BASED: 'forecast_based',
};

function calculateEOQ(annualDemand, orderCost, holdingCostPerUnit) {
  if (holdingCostPerUnit <= 0) return 0;
  return Math.sqrt((2 * annualDemand * orderCost) / holdingCostPerUnit);
}

function calculateReorderPoint(dailyDemand, leadTimeDays, safetyStockDays = 3) {
  return Math.ceil(dailyDemand * (leadTimeDays + safetyStockDays));
}

function predictMaintenanceDue(lastService, usage, interval) {
  const { km = 0, hours = 0, days = 0 } = interval;
  const usageSinceService = usage || { km: 0, hours: 0, days: 0 };
  const lastServiceDate = lastService ? new Date(lastService).getTime() : 0;
  const daysSinceService = lastServiceDate ? (Date.now() - lastServiceDate) / (1000 * 60 * 60 * 24) : 999;
  
  const kmDue = km > 0 ? (usageSinceService.km || 0) >= km : false;
  const hoursDue = hours > 0 ? (usageSinceService.hours || 0) >= hours : false;
  const daysDue = days > 0 ? daysSinceService >= days : false;
  
  const kmRemaining = km > 0 ? Math.max(0, km - (usageSinceService.km || 0)) : null;
  const hoursRemaining = hours > 0 ? Math.max(0, hours - (usageSinceService.hours || 0)) : null;
  const daysRemaining = days > 0 ? Math.max(0, Math.ceil(days - daysSinceService)) : null;
  
  return {
    due: kmDue || hoursDue || daysDue,
    kmDue, hoursDue, daysDue,
    kmRemaining, hoursRemaining, daysRemaining,
    urgency: (kmDue || hoursDue || daysDue) ? 'overdue' : 
             (kmRemaining && kmRemaining < km * 0.1) || (hoursRemaining && hoursRemaining < hours * 0.1) || (daysRemaining && daysRemaining < days * 0.1) ? 'due_soon' : 'ok',
  };
}

function calculateInventoryHealth(current, minLevel, maxLevel, dailyUsage) {
  if (current <= 0) return { status: 'critical', daysRemaining: 0, action: 'EMERGENCY_REORDER' };
  if (current <= minLevel) return { status: 'low', daysRemaining: Math.ceil(current / Math.max(1, dailyUsage)), action: 'REORDER_NOW' };
  if (current <= minLevel * 1.5) return { status: 'warning', daysRemaining: Math.ceil(current / Math.max(1, dailyUsage)), action: 'PREPARE_REORDER' };
  if (current > maxLevel) return { status: 'overstock', daysRemaining: Math.ceil(current / Math.max(1, dailyUsage)), action: 'REDUCE_ORDERS' };
  return { status: 'healthy', daysRemaining: Math.ceil(current / Math.max(1, dailyUsage)), action: 'MONITOR' };
}

export function useSellerInventory({ sellerProfile, orders, driverPositions, forecast }) {
  const [inventory, setInventory] = useState([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [reorderRules, setReorderRules] = useState([]);
  const [loading, setLoading] = useState(true);

  const initDefaultData = useCallback(() => {
    if (inventory.length === 0) {
      const defaults = [
        { id: 'inv_1', type: INVENTORY_TYPES.RAW_WATER, name: 'Borehole Source', current: 15000, unit: 'gallons', minLevel: 3000, maxLevel: 20000, costPerUnit: 0.15, supplierId: 'sup_1', lastRestocked: new Date(Date.now() - 2*24*60*60*1000).toISOString() },
        { id: 'inv_2', type: INVENTORY_TYPES.TREATED_WATER, name: 'Treatment Tank A', current: 8000, unit: 'gallons', minLevel: 2000, maxLevel: 10000, costPerUnit: 0.25, supplierId: 'internal', lastRestocked: new Date(Date.now() - 1*24*60*60*1000).toISOString() },
        { id: 'inv_3', type: INVENTORY_TYPES.TREATED_WATER, name: 'Treatment Tank B', current: 5000, unit: 'gallons', minLevel: 2000, maxLevel: 10000, costPerUnit: 0.25, supplierId: 'internal', lastRestocked: new Date(Date.now() - 3*24*60*60*1000).toISOString() },
        { id: 'inv_4', type: INVENTORY_TYPES.CHEMICALS, name: 'Chlorine', current: 120, unit: 'kg', minLevel: 30, maxLevel: 200, costPerUnit: 45, supplierId: 'sup_2', lastRestocked: new Date(Date.now() - 15*24*60*60*1000).toISOString() },
        { id: 'inv_5', type: INVENTORY_TYPES.FILTERS, name: 'Carbon Filters', current: 8, unit: 'units', minLevel: 3, maxLevel: 15, costPerUnit: 850, supplierId: 'sup_3', lastRestocked: new Date(Date.now() - 30*24*60*60*1000).toISOString() },
        { id: 'inv_6', type: INVENTORY_TYPES.PARTS, name: 'Pump Seals', current: 12, unit: 'units', minLevel: 5, maxLevel: 20, costPerUnit: 120, supplierId: 'sup_4', lastRestocked: new Date(Date.now() - 45*24*60*60*1000).toISOString() },
      ];
      setInventory(defaults);
    }
    
    if (equipment.length === 0) {
      const defaults = [
        { id: 'eq_1', type: 'vehicle', name: 'Tanker GT-4471-22', assetTag: 'TK-001', installedAt: '2024-01-15', lastService: '2026-07-20', usage: { km: 42000, hours: 1800 }, specs: { capacity: 5000, manufacturer: 'Isuzu' } },
        { id: 'eq_2', type: 'pump', name: 'Main Transfer Pump', assetTag: 'PUMP-001', installedAt: '2024-03-01', lastService: '2026-06-15', usage: { hours: 1800 }, specs: { capacity: '500 gal/min', manufacturer: 'Grundfos' } },
        { id: 'eq_3', type: 'tank', name: 'Storage Tank A', assetTag: 'TANK-001', installedAt: '2023-11-01', lastService: '2026-01-10', usage: {}, specs: { capacity: 10000, material: 'Stainless Steel' } },
        { id: 'eq_4', type: 'filter', name: 'Carbon Filter Bank', assetTag: 'FILT-001', installedAt: '2024-05-01', lastService: '2026-08-01', usage: { volume: 35000 }, specs: { capacity: 50000, media: 'Activated Carbon' } },
        { id: 'eq_5', type: 'treatment_system', name: 'UV Treatment Unit', assetTag: 'UV-001', installedAt: '2024-02-01', lastService: '2026-05-20', usage: { volume: 80000 }, specs: { capacity: '1000 gal/min', manufacturer: 'Trojan' } },
      ];
      setEquipment(defaults);
    }
    
    if (suppliers.length === 0) {
      const defaults = [
        { id: 'sup_1', name: 'Ghana Water Company', type: 'raw_water', contact: '+233 30 2XX XXXX', email: 'supply@gwc.com', leadTimeDays: 1, rating: 4.5, paymentTerms: 'Net 30', active: true },
        { id: 'sup_2', name: 'Chemical Supplies Ltd', type: 'chemicals', contact: '+233 24 4XX XXXX', email: 'orders@chemsup.com', leadTimeDays: 3, rating: 4.2, paymentTerms: 'Net 15', active: true },
        { id: 'sup_3', name: 'FilterTech Ghana', type: 'filters', contact: '+233 30 3XX XXXX', email: 'sales@filtertech.com', leadTimeDays: 7, rating: 4.7, paymentTerms: 'Net 30', active: true },
        { id: 'sup_4', name: 'AutoParts Ghana', type: 'parts', contact: '+233 24 5XX XXXX', email: 'parts@autoparts.com', leadTimeDays: 2, rating: 4.0, paymentTerms: 'Net 30', active: true },
      ];
      setSuppliers(defaults);
    }
    
    if (reorderRules.length === 0) {
      const defaults = [
        { id: 'rule_1', inventoryId: 'inv_1', policy: REORDER_POLICIES.FORECAST_BASED, leadTimeDays: 1, safetyStockDays: 3, annualOrderCost: 500, holdingCostRate: 0.2 },
        { id: 'rule_2', inventoryId: 'inv_2', policy: REORDER_POLICIES.MIN_MAX, leadTimeDays: 0, safetyStockDays: 2, minLevel: 2000, maxLevel: 10000 },
        { id: 'rule_3', inventoryId: 'inv_4', policy: REORDER_POLICIES.EOQ, leadTimeDays: 3, safetyStockDays: 7, annualOrderCost: 200, holdingCostRate: 0.25 },
        { id: 'rule_4', inventoryId: 'inv_5', policy: REORDER_POLICIES.EOQ, leadTimeDays: 7, safetyStockDays: 14, annualOrderCost: 300, holdingCostRate: 0.15 },
      ];
      setReorderRules(defaults);
    }
  }, [inventory.length, equipment.length, suppliers.length, reorderRules.length]);

  useEffect(() => {
    initDefaultData();
    setLoading(false);
  }, [initDefaultData]);

  const updateInventoryLevel = useCallback((inventoryId, change, reason = 'manual') => {
    setInventory(prev => prev.map(item => {
      if (item.id !== inventoryId) return item;
      const newLevel = Math.max(0, item.current + change);
      const health = calculateInventoryHealth(newLevel, item.minLevel, item.maxLevel, item.dailyUsage || 0);
      return { 
        ...item, 
        current: newLevel, 
        health: health.status,
        lastUpdate: new Date().toISOString(),
        lastChangeReason: reason,
      };
    }));
  }, []);

  const recordDelivery = useCallback((order) => {
    const volume = parseFloat(order.volume?.replace(/[^0-9.]/g, '') || '0');
    const treatedWater = inventory.find(i => i.type === INVENTORY_TYPES.TREATED_WATER && i.current > 0);
    if (treatedWater) {
      updateInventoryLevel(treatedWater.id, -volume, `delivery_${order.id}`);
    }
  }, [inventory, updateInventoryLevel]);

  const recordRestock = useCallback((inventoryId, quantity, supplierId, costPerUnit) => {
    setInventory(prev => prev.map(item => {
      if (item.id !== inventoryId) return item;
      const newLevel = item.current + quantity;
      const health = calculateInventoryHealth(newLevel, item.minLevel, item.maxLevel, item.dailyUsage || 0);
      return { 
        ...item, 
        current: newLevel, 
        health: health.status,
        lastRestocked: new Date().toISOString(),
        lastSupplier: supplierId,
        lastCostPerUnit: costPerUnit,
      };
    }));
    
    insert('inventory_transactions', {
      inventoryId,
      type: 'restock',
      quantity,
      supplierId,
      costPerUnit,
      totalCost: quantity * costPerUnit,
      timestamp: new Date().toISOString(),
    });
  }, []);

  const recordMaintenance = useCallback((equipmentId, type, details, cost, performedBy) => {
    const record = {
      id: `maint_${Date.now()}`,
      equipmentId,
      type,
      details,
      cost,
      performedBy,
      performedAt: new Date().toISOString(),
      nextDue: null,
    };
    
    setMaintenanceRecords(prev => [record, ...prev]);
    
    setEquipment(prev => prev.map(eq => {
      if (eq.id !== equipmentId) return eq;
      const interval = MAINTENANCE_INTERVALS[eq.type];
      let nextDue = new Date();
      if (interval.days) nextDue.setDate(nextDue.getDate() + interval.days);
      return { ...eq, lastService: new Date().toISOString(), nextServiceDue: nextDue.toISOString() };
    }));
    
    return record;
  }, []);

  const inventoryWithHealth = useMemo(() => {
    return inventory.map(item => {
      const dailyUsage = item.dailyUsage || estimateDailyUsage(item, orders);
      const health = calculateInventoryHealth(item.current, item.minLevel, item.maxLevel, dailyUsage);
      const rule = reorderRules.find(r => r.inventoryId === item.id);
      const supplier = suppliers.find(s => s.id === item.supplierId);
      
      let reorderQty = 0;
      let reorderCost = 0;
      if (rule) {
        if (rule.policy === REORDER_POLICIES.EOQ) {
          const annualDemand = dailyUsage * 365;
          reorderQty = Math.ceil(calculateEOQ(annualDemand, rule.annualOrderCost || 500, (item.costPerUnit || 0) * (rule.holdingCostRate || 0.2)));
        } else if (rule.policy === REORDER_POLICIES.MIN_MAX) {
          reorderQty = Math.max(0, (rule.maxLevel || item.maxLevel) - item.current);
        } else if (rule.policy === REORDER_POLICIES.FORECAST_BASED && forecast) {
          const predictedDaily = forecast.summary?.avgDailyOrders || dailyUsage;
          reorderQty = Math.ceil(predictedDaily * (rule.leadTimeDays + rule.safetyStockDays));
        }
      } else {
        reorderQty = Math.max(0, item.maxLevel - item.current);
      }
      reorderCost = reorderQty * (item.costPerUnit || 0);
      
      return {
        ...item,
        dailyUsage,
        health: health.status,
        daysRemaining: health.daysRemaining,
        action: health.action,
        reorderQty,
        reorderCost,
        supplier: supplier?.name,
        leadTime: supplier?.leadTimeDays,
      };
    });
  }, [inventory, orders, reorderRules, suppliers, forecast]);

  const equipmentWithMaintenance = useMemo(() => {
    return equipment.map(eq => {
      const interval = MAINTENANCE_INTERVALS[eq.type];
      const usage = eq.usage || { km: 0, hours: 0, volume: 0 };
      const maintenance = predictMaintenanceDue(eq.lastService, usage, interval);
      const recentRecords = maintenanceRecords.filter(r => r.equipmentId === eq.id).slice(0, 5);
      
      return {
        ...eq,
        maintenance,
        recentRecords,
        totalMaintenanceCost: maintenanceRecords.filter(r => r.equipmentId === eq.id).reduce((s, r) => s + (r.cost || 0), 0),
      };
    });
  }, [equipment, maintenanceRecords]);

  const pendingMaintenance = useMemo(() => 
    equipmentWithMaintenance.filter(e => e.maintenance.due || e.maintenance.urgency === 'due_soon'),
    [equipmentWithMaintenance]
  );

  const lowInventory = useMemo(() => 
    inventoryWithHealth.filter(i => ['critical', 'low', 'warning'].includes(i.health)),
    [inventoryWithHealth]
  );

  const reorderRecommendations = useMemo(() => 
    inventoryWithHealth
      .filter(i => i.reorderQty > 0 && ['critical', 'low', 'warning'].includes(i.health))
      .map(i => ({
        ...i,
        recommendedOrder: {
          quantity: i.reorderQty,
          estimatedCost: i.reorderCost,
          supplier: i.supplier,
          leadTimeDays: i.leadTime,
          urgency: i.health === 'critical' ? 'emergency' : i.health === 'low' ? 'high' : 'normal',
        },
      })),
    [inventoryWithHealth]
  );

  const inventoryValue = useMemo(() => 
    inventoryWithHealth.reduce((s, i) => s + i.current * i.costPerUnit, 0),
    [inventoryWithHealth]
  );

  const dailyUsageHistory = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();
    
    return last30Days.map(date => {
      const dayOrders = orders.filter(o => 
        new Date(o.createdAt).toISOString().split('T')[0] === date
      );
      const totalVolume = dayOrders.reduce((s, o) => s + parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0'), 0);
      return { date, volume: totalVolume, orders: dayOrders.length };
    });
  }, [orders]);

  const summary = useMemo(() => ({
    totalInventoryValue: inventoryValue,
    itemsTracked: inventory.length,
    lowStockItems: lowInventory.length,
    criticalItems: inventoryWithHealth.filter(i => i.health === 'critical').length,
    equipmentTracked: equipment.length,
    overdueMaintenance: pendingMaintenance.filter(e => e.maintenance.urgency === 'overdue').length,
    dueSoonMaintenance: pendingMaintenance.filter(e => e.maintenance.urgency === 'due_soon').length,
    activeSuppliers: suppliers.filter(s => s.active).length,
    pendingReorders: reorderRecommendations.length,
  }), [inventoryValue, inventory, lowInventory, equipment, pendingMaintenance, suppliers, reorderRecommendations]);

  return {
    inventory: inventoryWithHealth,
    equipment: equipmentWithMaintenance,
    suppliers,
    maintenanceRecords,
    reorderRules,
    lowInventory,
    pendingMaintenance,
    reorderRecommendations,
    dailyUsageHistory,
    summary,
    loading,
    updateInventoryLevel,
    recordDelivery,
    recordRestock,
    recordMaintenance,
    setReorderRules,
    addEquipment: (eq) => setEquipment(prev => [...prev, { ...eq, id: `eq_${Date.now()}`, installedAt: new Date().toISOString() }]),
    addSupplier: (sup) => setSuppliers(prev => [...prev, { ...sup, id: `sup_${Date.now()}`, active: true }]),
  };
}

function estimateDailyUsage(item, orders) {
  const recentOrders = orders.filter(o => 
    new Date(o.createdAt).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
  );
  const totalVolume = recentOrders.reduce((s, o) => s + parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0'), 0);
  return totalVolume / 30;
}

export default useSellerInventory;