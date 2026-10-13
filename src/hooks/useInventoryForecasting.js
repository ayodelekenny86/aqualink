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
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 350));

      const productForecasts = products.map(product => {
        const productOrders = orders.filter(o => o.productId === product.id);
        const productUsage = usageHistory.filter(u => u.productId === product.id);
        const supplier = suppliers.find(s => s.id === product.supplierId);
        const warehouse = warehouses.find(w => w.id === product.warehouseId);

        const recentUsage = productUsage.slice(-30);
        const avgDailyUsage = recentUsage.length 
          ? recentUsage.reduce((sum, u) => sum + (u.quantity || 0), 0) / recentUsage.length 
          : product.avgDailyUsage || 100;

        const usageTrend = calculateTrend(recentUsage.map(u => u.quantity || 0));
        const seasonality = calculateSeasonality(productUsage);

        const currentStock = product.currentStock || 0;
        const reorderPoint = product.reorderPoint || (avgDailyUsage * 7);
        const maxStock = product.maxStock || (avgDailyUsage * 30);
        const leadTime = supplier?.leadTimeDays || 7;

        const daysUntilStockout = avgDailyUsage > 0 ? currentStock / avgDailyUsage : Infinity;
        const daysUntilReorder = avgDailyUsage > 0 ? (currentStock - reorderPoint) / avgDailyUsage : Infinity;

        const forecastHorizon = 30;
        const projectedUsage = [];
        for (let i = 1; i <= forecastHorizon; i++) {
          const trendFactor = 1 + (usageTrend * i);
          const seasonalFactor = seasonality[(new Date(Date.now() + i * 86400000).getMonth())] || 1;
          const dailyUsage = avgDailyUsage * trendFactor * seasonalFactor;
          projectedUsage.push({
            day: i,
            date: new Date(Date.now() + i * 86400000).toISOString().split('T')[0],
            projectedUsage: Math.round(dailyUsage),
            cumulativeUsage: Math.round(projectedUsage.reduce((sum, p) => sum + p.projectedUsage, 0) + dailyUsage),
            projectedStock: Math.max(0, currentStock - Math.round(projectedUsage.reduce((sum, p) => sum + p.projectedUsage, 0) + dailyUsage))
          });
        }

        const stockoutDay = projectedUsage.find(p => p.projectedStock <= 0);
        const willStockout = !!stockoutDay;
        const stockoutRisk = willStockout ? 'high' : daysUntilStockout < 14 ? 'medium' : 'low';

        const recommendedOrderQty = Math.max(0, maxStock - currentStock + (avgDailyUsage * leadTime));
        const orderUrgency = daysUntilReorder <= 0 ? 'immediate' : daysUntilReorder <= 3 ? 'urgent' : daysUntilReorder <= 7 ? 'soon' : 'normal';

        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          category: product.category,
          currentStock,
          avgDailyUsage: Math.round(avgDailyUsage),
          usageTrend: usageTrend > 0 ? 'increasing' : usageTrend < 0 ? 'decreasing' : 'stable',
          seasonality,
          reorderPoint,
          maxStock,
          leadTime,
          daysUntilStockout: Math.round(daysUntilStockout),
          daysUntilReorder: Math.round(daysUntilReorder),
          stockoutRisk,
          willStockout,
          stockoutDate: stockoutDay?.date,
          recommendedOrderQty: Math.round(recommendedOrderQty),
          orderUrgency,
          supplier: supplier?.name,
          warehouse: warehouse?.name,
          projectedUsage: projectedUsage.slice(0, 14),
          costPerUnit: product.costPerUnit || 0,
          estimatedOrderValue: Math.round(recommendedOrderQty * (product.costPerUnit || 0)),
          lastUpdated: new Date().toISOString()
        };
      });

      const newAlerts = [];
      productForecasts.forEach(f => {
        if (f.stockoutRisk === 'high' || f.orderUrgency === 'immediate') {
          newAlerts.push({
            severity: f.orderUrgency === 'immediate' ? 'critical' : 'high',
            productId: f.productId,
            productName: f.productName,
            type: f.willStockout ? 'stockout_imminent' : 'reorder_overdue',
            message: f.willStockout 
              ? `${f.productName} will stock out by ${f.stockoutDate} (${f.daysUntilStockout} days)`
              : `${f.productName} reorder overdue by ${Math.abs(f.daysUntilReorder)} days`,
            recommendedAction: f.willStockout 
              ? `Place emergency order of ${f.recommendedOrderQty} units immediately`
              : `Place standard order of ${f.recommendedOrderQty} units`,
            estimatedCost: f.estimatedOrderValue
          });
        } else if (f.stockoutRisk === 'medium' || f.orderUrgency === 'urgent') {
          newAlerts.push({
            severity: 'medium',
            productId: f.productId,
            productName: f.productName,
            type: 'reorder_soon',
            message: `${f.productName} needs reorder in ${f.daysUntilReorder} days`,
            recommendedAction: `Prepare order of ${f.recommendedOrderQty} units`,
            estimatedCost: f.estimatedOrderValue
          });
        }
      });

      setForecasts(productForecasts);
      setAlerts(newAlerts.sort((a, b) => 
        (b.severity === 'critical' ? 3 : b.severity === 'high' ? 2 : 1) - 
        (a.severity === 'critical' ? 3 : a.severity === 'high' ? 2 : 1)
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [products, orders, suppliers, warehouses, usageHistory]);

  const placeOrder = useCallback((productId, quantity) => {
    const forecast = forecasts.find(f => f.productId === productId);
    if (!forecast) return false;
    
    onNotice?.(`Order placed: ${quantity} units of ${forecast.productName}`);
    setForecasts(prev => prev.map(f => 
      f.productId === productId 
        ? { ...f, currentStock: f.currentStock + quantity, orderUrgency: 'normal', daysUntilReorder: (f.currentStock + quantity - f.reorderPoint) / f.avgDailyUsage }
        : f
    ));
    return true;
  }, [forecasts, onNotice]);

  const updateReorderPoint = useCallback((productId, newReorderPoint) => {
    setForecasts(prev => prev.map(f => 
      f.productId === productId ? { ...f, reorderPoint: newReorderPoint } : f
    ));
    onNotice?.(`Reorder point updated for product`);
  }, [onNotice]);

  useEffect(() => { generateForecasts(); }, [generateForecasts]);

  const getProductForecast = useCallback((productId) => {
    return forecasts.find(f => f.productId === productId) || null;
  }, [forecasts]);

  const getCriticalAlerts = useCallback(() => {
    return alerts.filter(a => a.severity === 'critical');
  }, [alerts]);

  const getTotalInventoryValue = useCallback(() => {
    return forecasts.reduce((sum, f) => sum + (f.currentStock * f.costPerUnit), 0);
  }, [forecasts]);

  return {
    forecasts,
    alerts,
    loading,
    error,
    refresh: generateForecasts,
    placeOrder,
    updateReorderPoint,
    getProductForecast,
    getCriticalAlerts,
    getTotalInventoryValue,
    criticalCount: alerts.filter(a => a.severity === 'critical').length,
    highCount: alerts.filter(a => a.severity === 'high').length,
    totalProducts: products.length,
    atRiskProducts: forecasts.filter(f => f.stockoutRisk === 'high' || f.stockoutRisk === 'medium').length
  };
}

function calculateTrend(values) {
  if (values.length < 3) return 0;
  const n = values.length;
  const xSum = (n - 1) * n / 2;
  const ySum = values.reduce((a, b) => a + b, 0);
  const xySum = values.reduce((sum, y, i) => sum + i * y, 0);
  const x2Sum = values.reduce((sum, _, i) => sum + i * i, 0);
  return (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
}

function calculateSeasonality(usageHistory) {
  const monthlyUsage = {};
  usageHistory.forEach(u => {
    const month = new Date(u.date).getMonth();
    monthlyUsage[month] = (monthlyUsage[month] || 0) + (u.quantity || 0);
  });
  const avgMonthly = Object.values(monthlyUsage).reduce((a, b) => a + b, 0) / (Object.keys(monthlyUsage).length || 1);
  const seasonality = {};
  for (let m = 0; m < 12; m++) {
    seasonality[m] = monthlyUsage[m] ? monthlyUsage[m] / avgMonthly : 1;
  }
  return seasonality;
}

export default useInventoryForecasting;