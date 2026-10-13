import { useState, useEffect, useCallback, useMemo } from 'react';

export function useInventoryForecasting({ 
  products = [], 
  orders = [], 
  suppliers = [],
  warehouses = [],
  usageHistory = [],
  onNotice 
}) {
  const [forecasts, setForecasts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateForecasts = useCallback(async () => {
    if (!products.length) {
      setForecasts([]);
      setAlerts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const mockForecasts = products.slice(0, 10).map((p, i) => ({
        productId: p.id || `prod-${i}`,
        productName: p.name || `Product ${i + 1}`,
        sku: p.sku || `SKU-${i + 1}`,
        category: p.category || 'General',
        currentStock: Math.floor(Math.random() * 5000),
        avgDailyUsage: Math.floor(50 + Math.random() * 200),
        usageTrend: Math.random() > 0.5 ? 'increasing' : 'stable',
        reorderPoint: 500,
        maxStock: 10000,
        leadTime: 7,
        daysUntilStockout: Math.floor(5 + Math.random() * 30),
        daysUntilReorder: Math.floor(2 + Math.random() * 14),
        stockoutRisk: Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low',
        willStockout: Math.random() > 0.8,
        stockoutDate: new Date(Date.now() + (5 + Math.random() * 20) * 86400000).toISOString().split('T')[0],
        recommendedOrderQty: Math.floor(1000 + Math.random() * 5000),
        orderUrgency: Math.random() > 0.7 ? 'immediate' : Math.random() > 0.4 ? 'soon' : 'normal',
        supplier: suppliers[0]?.name || 'Default Supplier',
        warehouse: warehouses[0]?.name || 'Main Warehouse',
        costPerUnit: p.costPerUnit || 0.02,
        estimatedOrderValue: Math.floor(2000 + Math.random() * 10000)
      }));

      const mockAlerts = mockForecasts
        .filter(f => f.stockoutRisk === 'high' || f.orderUrgency === 'immediate')
        .map(f => ({
          severity: f.orderUrgency === 'immediate' ? 'critical' : 'high',
          productId: f.productId,
          productName: f.productName,
          type: f.willStockout ? 'stockout_imminent' : 'reorder_overdue',
          message: f.willStockout ? `${f.productName} will stock out by ${f.stockoutDate}` : `${f.productName} reorder overdue`,
          recommendedAction: `Order ${f.recommendedOrderQty} units`,
          estimatedCost: f.estimatedOrderValue
        }));

      setForecasts(mockForecasts);
      setAlerts(mockAlerts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [products, orders, suppliers, warehouses, usageHistory]);

  const placeOrder = useCallback((productId, qty) => {
    onNotice?.(`Placed order for ${qty} units of product ${productId}`);
  }, [onNotice]);

  const updateReorderPoint = useCallback((productId, newPoint) => {
    onNotice?.(`Updated reorder point for ${productId} to ${newPoint}`);
  }, [onNotice]);

  const getProductForecast = useCallback((productId) => {
    return forecasts.find(f => f.productId === productId) || null;
  }, [forecasts]);

  const getCriticalAlerts = useCallback(() => {
    return alerts.filter(a => a.severity === 'critical');
  }, [alerts]);

  const getTotalInventoryValue = useCallback(() => {
    return forecasts.reduce((s, f) => s + f.currentStock * f.costPerUnit, 0);
  }, [forecasts]);

  const refresh = useCallback(() => generateForecasts(), [generateForecasts]);

  useEffect(() => { generateForecasts(); }, [generateForecasts]);

  return {
    forecasts,
    alerts,
    loading,
    error,
    refresh,
    placeOrder,
    updateReorderPoint,
    getProductForecast,
    getCriticalAlerts,
    getTotalInventoryValue,
    criticalCount: alerts.filter(a => a.severity === 'critical').length,
    highCount: alerts.filter(a => a.severity === 'high').length,
    atRiskProducts: forecasts.filter(f => f.stockoutRisk === 'high' || f.stockoutRisk === 'medium').length
  };
}

export default useInventoryForecasting;