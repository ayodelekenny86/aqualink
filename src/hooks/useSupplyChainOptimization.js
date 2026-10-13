import { useState, useEffect, useMemo, useCallback } from 'react';

const USE_MOCK = typeof window !== 'undefined' && (!window.__SUPABASE_URL__ || !window.__SUPABASE_ANON_KEY__);

const DEFAULT_SUPPLIERS = [
  { id: 's1', name: 'Accra Water Works', type: 'municipal', location: 'Accra Central', capacity: 50000, reliability: 0.95, costPerGallon: 0.12, lastDelivery: '2026-10-10', qualityScore: 92, contractEnd: '2027-12-31' },
  { id: 's2', name: 'Kumasi Springs Ltd', type: 'spring', location: 'Kumasi', capacity: 30000, reliability: 0.88, costPerGallon: 0.15, lastDelivery: '2026-10-09', qualityScore: 95, contractEnd: '2027-06-30' },
  { id: 's3', name: 'Tema Desalination', type: 'desalination', location: 'Tema', capacity: 25000, reliability: 0.92, costPerGallon: 0.22, lastDelivery: '2026-10-10', qualityScore: 90, contractEnd: '2028-03-15' },
  { id: 's4', name: 'Volta River Authority', type: 'municipal', location: 'Ho', capacity: 40000, reliability: 0.90, costPerGallon: 0.10, lastDelivery: '2026-10-08', qualityScore: 88, contractEnd: '2027-09-30' },
];

const DEFAULT_WAREHOUSES = [
  { id: 'w1', name: 'Central Depot', location: 'Accra', capacity: 100000, currentStock: 65000, type: 'storage' },
  { id: 'w2', name: 'North Warehouse', location: 'Kumasi', capacity: 50000, currentStock: 28000, type: 'storage' },
  { id: 'w3', name: 'Coastal Hub', location: 'Tema', capacity: 75000, currentStock: 42000, type: 'storage' },
];

export function useSupplyChainOptimization({ suppliers = [], warehouses = [], orders = [], onNotice }) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const supplyChain = useMemo(() => {
    const activeSuppliers = suppliers.length > 0 ? suppliers : DEFAULT_SUPPLIERS;
    const activeWarehouses = warehouses.length > 0 ? warehouses : DEFAULT_WAREHOUSES;

    return activeSuppliers.map(supplier => {
      const recentOrders = orders.filter(o => o.supplierId === supplier.id).slice(-20);
      const onTimeDeliveries = recentOrders.filter(o => o.status === 'Delivered' && o.actualDeliveryTime && o.expectedDeliveryTime && new Date(o.actualDeliveryTime) <= new Date(o.expectedDeliveryTime)).length;
      const actualReliability = recentOrders.length > 0 ? onTimeDeliveries / recentOrders.length : supplier.reliability;
      
      const daysSinceLastDelivery = Math.floor((Date.now() - new Date(supplier.lastDelivery).getTime()) / (1000 * 60 * 60 * 24));
      const contractDaysLeft = Math.floor((new Date(supplier.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      
      const riskFactors = [];
      if (actualReliability < 0.85) riskFactors.push('Low reliability');
      if (daysSinceLastDelivery > 7) riskFactors.push('No recent delivery');
      if (contractDaysLeft < 60) riskFactors.push('Contract expiring soon');
      if (supplier.qualityScore < 85) riskFactors.push('Quality concerns');
      if (supplier.costPerGallon > 0.20) riskFactors.push('High cost');

      let status = 'healthy';
      if (riskFactors.length >= 3) status = 'critical';
      else if (riskFactors.length >= 1) status = 'warning';

      const totalCost = orders.filter(o => o.supplierId === supplier.id).reduce((sum, o) => sum + (o.volume || 0) * supplier.costPerGallon * 100, 0);
      const avgDeliveryTime = recentOrders.length > 0 ? Math.round(recentOrders.reduce((sum, o) => sum + (o.deliveryTime || 0), 0) / recentOrders.length) : 0;

      return {
        ...supplier,
        actualReliability: Math.round(actualReliability * 100) / 100,
        daysSinceLastDelivery,
        contractDaysLeft,
        riskFactors,
        status,
        totalCost,
        avgDeliveryTime,
        riskScore: Math.min(100, riskFactors.length * 20 + (1 - actualReliability) * 50),
      };
    });
  }, [suppliers, warehouses, orders]);

  const warehouseStatus = useMemo(() => {
    const activeWarehouses = warehouses.length > 0 ? warehouses : DEFAULT_WAREHOUSES;
    return activeWarehouses.map(wh => {
      const utilization = wh.capacity > 0 ? (wh.currentStock / wh.capacity) * 100 : 0;
      const daysOfSupply = wh.currentStock > 0 ? Math.floor(wh.currentStock / Math.max(1, orders.filter(o => o.warehouseId === wh.id).reduce((sum, o) => sum + (o.volume || 0), 0) / 30)) : 0;
      
      let status = 'normal';
      if (utilization > 90) status = 'critical';
      else if (utilization > 75) status = 'warning';
      else if (utilization < 20) status = 'low';

      return {
        ...wh,
        utilization: Math.round(utilization),
        daysOfSupply,
        status,
        reorderRecommended: utilization < 30,
      };
    });
  }, [warehouses, orders]);

  const optimizations = useMemo(() => {
    const opts = [];
    
    supplyChain.forEach(supplier => {
      if (supplier.status === 'critical' || supplier.status === 'warning') {
        opts.push({
          id: `opt_${supplier.id}`,
          type: 'supplier',
          priority: supplier.status === 'critical' ? 'high' : 'medium',
          title: `Review ${supplier.name} contract`,
          description: supplier.riskFactors.join(', '),
          potentialSavings: supplier.totalCost * 0.1,
          action: 'Renegotiate or find alternative',
        });
      }
    });

    warehouseStatus.forEach(wh => {
      if (wh.status === 'critical') {
        opts.push({
          id: `opt_${wh.id}`,
          type: 'warehouse',
          priority: 'high',
          title: `${wh.name} at ${wh.utilization}% capacity`,
          description: 'Risk of overflow or stockout',
          potentialSavings: 0,
          action: 'Redistribute or expand capacity',
        });
      } else if (wh.status === 'low') {
        opts.push({
          id: `opt_${wh.id}`,
          type: 'warehouse',
          priority: 'medium',
          title: `${wh.name} underutilized at ${wh.utilization}%`,
          description: 'Excess storage capacity',
          potentialSavings: wh.capacity * 0.05,
          action: 'Consolidate or lease space',
        });
      }
    });

    return opts.sort((a, b) => (b.priority === 'high' ? 3 : b.priority === 'medium' ? 2 : 1) - (a.priority === 'high' ? 3 : a.priority === 'medium' ? 2 : 1));
  }, [supplyChain, warehouseStatus]);

  const summary = useMemo(() => {
    const totalSuppliers = supplyChain.length;
    const healthySuppliers = supplyChain.filter(s => s.status === 'healthy').length;
    const totalWarehouses = warehouseStatus.length;
    const optimalWarehouses = warehouseStatus.filter(w => w.status === 'normal').length;
    const totalCost = supplyChain.reduce((sum, s) => sum + s.totalCost, 0);
    const avgReliability = supplyChain.length > 0 ? Math.round(supplyChain.reduce((sum, s) => sum + s.actualReliability, 0) / supplyChain.length * 100) : 0;
    const criticalOptimizations = optimizations.filter(o => o.priority === 'high').length;

    return { totalSuppliers, healthySuppliers, totalWarehouses, optimalWarehouses, totalCost, avgReliability, criticalOptimizations };
  }, [supplyChain, warehouseStatus, optimizations]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      onNotice?.('Supply chain data refreshed');
    }, 500);
  }, [onNotice]);

  const formatCedi = useCallback((amount) => {
    return `GH₵${(amount / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, []);

  return {
    supplyChain,
    warehouseStatus,
    optimizations,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  };
}

export default useSupplyChainOptimization;