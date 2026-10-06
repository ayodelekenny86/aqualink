import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update, remove } from '../lib/collections';

/**
 * Seller inventory hook: manages water stock, equipment, maintenance schedules.
 * 
 * Tracks:
 * - Water inventory levels (tanks, treatment chemicals, packaging)
 * - Equipment health (vehicles, pumps, filters, tanks)
 * - Maintenance schedules and history
 * - Reorder recommendations based on usage forecasts
 */
const INITIAL_INVENTORY = [
  { id: 'inv-water-raw', name: 'Raw Water', type: 'water', unit: 'gallons', current: 15000, dailyUsage: 800, costPerUnit: 0.5, reorderPoint: 3000, reorderQty: 10000, supplier: 'Ghana Water Co.', leadTime: 2 },
  { id: 'inv-water-treated', name: 'Treated Water', type: 'water', unit: 'gallons', current: 8000, dailyUsage: 1200, costPerUnit: 1.2, reorderPoint: 2000, reorderQty: 5000, supplier: 'Internal', leadTime: 0 },
  { id: 'inv-chlorine', name: 'Chlorine Tablets', type: 'chemical', unit: 'kg', current: 50, dailyUsage: 2.5, costPerUnit: 45, reorderPoint: 10, reorderQty: 100, supplier: 'Chemical Supplies Ltd', leadTime: 5 },
  { id: 'inv-bottles-500ml', name: '500ml Bottles', type: 'packaging', unit: 'units', current: 5000, dailyUsage: 300, costPerUnit: 0.8, reorderPoint: 1000, reorderQty: 10000, supplier: 'Packaging Ghana', leadTime: 7 },
  { id: 'inv-bottles-1l', name: '1L Bottles', type: 'packaging', unit: 'units', current: 3000, dailyUsage: 200, costPerUnit: 1.2, reorderPoint: 800, reorderQty: 5000, supplier: 'Packaging Ghana', leadTime: 7 },
  { id: 'inv-caps', name: 'Bottle Caps', type: 'packaging', unit: 'units', current: 10000, dailyUsage: 500, costPerUnit: 0.15, reorderPoint: 2000, reorderQty: 20000, supplier: 'Packaging Ghana', leadTime: 7 },
  { id: 'inv-labels', name: 'Water Labels', type: 'packaging', unit: 'units', current: 8000, dailyUsage: 500, costPerUnit: 0.25, reorderPoint: 1500, reorderQty: 10000, supplier: 'Print Solutions', leadTime: 10 },
];

const INITIAL_EQUIPMENT = [
  { id: 'eq-truck-1', name: 'Delivery Truck #1', type: 'vehicle', assetTag: 'AQ-TRK-001', usage: { km: 45000, hours: 1200 }, maintenance: { kmRemaining: 5000, hoursRemaining: 300, urgency: 'ok', lastService: '2025-01-15', nextService: '2025-07-15' }, totalMaintenanceCost: 12500 },
  { id: 'eq-truck-2', name: 'Delivery Truck #2', type: 'vehicle', assetTag: 'AQ-TRK-002', usage: { km: 78000, hours: 2100 }, maintenance: { kmRemaining: 2000, hoursRemaining: 150, urgency: 'due_soon', lastService: '2024-10-20', nextService: '2025-04-20' }, totalMaintenanceCost: 28400 },
  { id: 'eq-pump-1', name: 'Main Transfer Pump', type: 'pump', assetTag: 'AQ-PMP-001', usage: { hours: 3200 }, maintenance: { hoursRemaining: 800, urgency: 'ok', lastService: '2025-02-01', nextService: '2025-08-01' }, totalMaintenanceCost: 8200 },
  { id: 'eq-pump-2', name: 'Backup Pump', type: 'pump', assetTag: 'AQ-PMP-002', usage: { hours: 1100 }, maintenance: { hoursRemaining: 100, urgency: 'due_soon', lastService: '2024-11-15', nextService: '2025-05-15' }, totalMaintenanceCost: 3100 },
  { id: 'eq-filter-1', name: 'Primary Filtration System', type: 'filter', assetTag: 'AQ-FLT-001', usage: { volume: 500000 }, maintenance: { daysRemaining: 45, urgency: 'ok', lastService: '2025-01-10', nextService: '2025-04-10' }, totalMaintenanceCost: 15600 },
  { id: 'eq-filter-2', name: 'Secondary Filter', type: 'filter', assetTag: 'AQ-FLT-002', usage: { volume: 750000 }, maintenance: { daysRemaining: 5, urgency: 'overdue', lastService: '2024-09-01', nextService: '2025-03-01' }, totalMaintenanceCost: 22800 },
  { id: 'eq-tank-1', name: 'Storage Tank A (10k gal)', type: 'tank', assetTag: 'AQ-TNK-001', usage: { volume: 2000000 }, maintenance: { daysRemaining: 120, urgency: 'ok', lastService: '2024-12-01', nextService: '2025-06-01' }, totalMaintenanceCost: 5400 },
  { id: 'eq-generator', name: 'Backup Generator', type: 'generator', assetTag: 'AQ-GEN-001', usage: { hours: 850 }, maintenance: { hoursRemaining: 150, urgency: 'ok', lastService: '2025-02-15', nextService: '2025-08-15' }, totalMaintenanceCost: 18900 },
];

export function useSellerInventory({ sellerProfile, orders, driverPositions = {}, forecast = [] }) {
  const [inventory, setInventory] = useState(() => {
    const stored = localStorage.getItem('aq_inventory');
    return stored ? JSON.parse(stored) : INITIAL_INVENTORY;
  });
  const [equipment, setEquipment] = useState(() => {
    const stored = localStorage.getItem('aq_equipment');
    return stored ? JSON.parse(stored) : INITIAL_EQUIPMENT;
  });
  const [maintenanceLog, setMaintenanceLog] = useState(() => {
    const stored = localStorage.getItem('aq_maintenance_log');
    return stored ? JSON.parse(stored) : [];
  });
  const [loading, setLoading] = useState(false);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('aq_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('aq_equipment', JSON.stringify(equipment));
  }, [equipment]);

  useEffect(() => {
    localStorage.setItem('aq_maintenance_log', JSON.stringify(maintenanceLog));
  }, [maintenanceLog]);

  // Calculate days remaining for inventory items
  const inventoryWithHealth = useMemo(() => inventory.map(item => {
    const daysRemaining = item.dailyUsage > 0 ? Math.floor(item.current / item.dailyUsage) : 999;
    let health = 'healthy';
    if (daysRemaining <= 3) health = 'critical';
    else if (daysRemaining <= 7) health = 'low';
    else if (daysRemaining <= 14) health = 'warning';
    
    const reorderQty = daysRemaining <= 14 ? item.reorderQty : 0;
    const reorderCost = reorderQty * item.costPerUnit * 100; // in minor units
    
    return { ...item, daysRemaining, health, reorderQty, reorderCost };
  }), [inventory]);

  // Low inventory alerts
  const lowInventory = useMemo(() => 
    inventoryWithHealth.filter(item => item.health === 'low' || item.health === 'critical'),
    [inventoryWithHealth]
  );

  // Pending maintenance
  const pendingMaintenance = useMemo(() => 
    equipment.filter(eq => eq.maintenance.urgency === 'overdue' || eq.maintenance.urgency === 'due_soon'),
    [equipment]
  );

  // Reorder recommendations
  const reorderRecommendations = useMemo(() => 
    inventoryWithHealth
      .filter(item => item.reorderQty > 0)
      .map(item => ({
        itemId: item.id,
        itemName: item.name,
        currentStock: item.current,
        daysRemaining: item.daysRemaining,
        recommendedQty: item.reorderQty,
        estimatedCost: item.reorderCost,
        supplier: item.supplier,
        leadTime: item.leadTime,
        urgency: item.health === 'critical' ? 'urgent' : 'normal',
      })),
    [inventoryWithHealth]
  );

  // Inventory summary
  const summary = useMemo(() => ({
    itemsTracked: inventory.length,
    lowStockCount: lowInventory.length,
    criticalCount: inventoryWithHealth.filter(i => i.health === 'critical').length,
    totalInventoryValue: inventoryWithHealth.reduce((s, i) => s + i.current * i.costPerUnit * 100, 0),
    pendingMaintenanceCount: pendingMaintenance.length,
    overdueMaintenanceCount: equipment.filter(e => e.maintenance.urgency === 'overdue').length,
  }), [inventory, lowInventory, inventoryWithHealth, pendingMaintenance, equipment]);

  // Record a delivery (consumes inventory)
  const recordDelivery = useCallback((order) => {
    const volume = parseFloat(order.volume?.replace(/[^0-9.]/g, '') || '0');
    if (!volume) return;
    
    setInventory(prev => prev.map(item => {
      if (item.type === 'water' && item.name === 'Treated Water') {
        return { ...item, current: Math.max(0, item.current - volume) };
      }
      // Also consume packaging based on order size
      if (item.type === 'packaging') {
        const bottlesNeeded = volume <= 500 ? 1 : volume <= 1000 ? 1 : Math.ceil(volume / 1000);
        if (item.name.includes('500ml') && volume <= 500) {
          return { ...item, current: Math.max(0, item.current - bottlesNeeded) };
        }
        if (item.name.includes('1L') && volume > 500) {
          return { ...item, current: Math.max(0, item.current - bottlesNeeded) };
        }
        if (item.name === 'Bottle Caps' || item.name === 'Water Labels') {
          return { ...item, current: Math.max(0, item.current - bottlesNeeded) };
        }
      }
      return item;
    }));
    
    // Mark order as inventory-recorded
    // In real app, would update order in database
  }, []);

  // Record restock
  const recordRestock = useCallback((itemId, quantity, costPerUnit = null) => {
    setInventory(prev => prev.map(item => {
      if (item.id === itemId) {
        const newCost = costPerUnit !== null ? costPerUnit : item.costPerUnit;
        return { ...item, current: item.current + quantity, costPerUnit: newCost };
      }
      return item;
    }));
  }, []);

  // Record maintenance
  const recordMaintenance = useCallback((equipmentId, type, description, cost, performedBy) => {
    const now = new Date().toISOString();
    
    // Update equipment
    setEquipment(prev => prev.map(eq => {
      if (eq.id === equipmentId) {
        let newMaintenance = { ...eq.maintenance };
        
        if (eq.type === 'vehicle') {
          newMaintenance = {
            ...newMaintenance,
            kmRemaining: 10000,
            hoursRemaining: 500,
            urgency: 'ok',
            lastService: now.split('T')[0],
            nextService: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          };
        } else if (eq.type === 'pump') {
          newMaintenance = {
            ...newMaintenance,
            hoursRemaining: 1000,
            urgency: 'ok',
            lastService: now.split('T')[0],
            nextService: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          };
        } else if (eq.type === 'filter') {
          newMaintenance = {
            ...newMaintenance,
            daysRemaining: 90,
            urgency: 'ok',
            lastService: now.split('T')[0],
            nextService: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          };
        } else if (eq.type === 'generator') {
          newMaintenance = {
            ...newMaintenance,
            hoursRemaining: 250,
            urgency: 'ok',
            lastService: now.split('T')[0],
            nextService: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          };
        } else {
          newMaintenance = {
            ...newMaintenance,
            daysRemaining: 180,
            urgency: 'ok',
            lastService: now.split('T')[0],
            nextService: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          };
        }
        
        return {
          ...eq,
          maintenance: newMaintenance,
          totalMaintenanceCost: eq.totalMaintenanceCost + (cost || 0),
        };
      }
      return eq;
    }));
    
    // Add to log
    setMaintenanceLog(prev => [{
      id: `maint-${Date.now()}`,
      equipmentId,
      type,
      description,
      cost: cost || 0,
      performedBy,
      date: now,
    }, ...prev]);
  }, []);

  // Auto-consume inventory based on completed orders
  useEffect(() => {
    if (!orders?.length) return;
    
    const completedOrders = orders.filter(o => o.status === 'Delivered');
    completedOrders.forEach(order => {
      // Check if already recorded
      const alreadyRecorded = order.inventoryRecorded;
      if (!alreadyRecorded) {
        recordDelivery(order);
      }
    });
  }, [orders, recordDelivery]);

  // Forecast-based reorder suggestions
  const forecastBasedReorders = useMemo(() => {
    if (!forecast?.length) return reorderRecommendations;
    
    // If forecast predicts high demand, increase reorder quantities
    const avgForecastedOrders = forecast.reduce((s, f) => s + (f.predictedOrders || 0), 0) / forecast.length;
    const currentAvgOrders = orders.length > 0 ? orders.length / 30 : 0; // rough estimate
    
    if (avgForecastedOrders > currentAvgOrders * 1.5) {
      return reorderRecommendations.map(r => ({
        ...r,
        recommendedQty: Math.round(r.recommendedQty * 1.5),
        estimatedCost: Math.round(r.estimatedCost * 1.5),
        urgency: 'high',
        reason: 'Demand forecast indicates 50%+ increase',
      }));
    }
    
    return reorderRecommendations;
  }, [forecast, reorderRecommendations, orders]);

  return {
    inventory: inventoryWithHealth,
    equipment,
    lowInventory,
    pendingMaintenance,
    reorderRecommendations: forecastBasedReorders,
    summary,
    loading,
    recordDelivery,
    recordRestock,
    recordMaintenance,
    maintenanceLog,
    refresh: () => setLoading(false), // placeholder
  };
}

export default useSellerInventory;