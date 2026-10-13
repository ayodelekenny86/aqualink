import React, { useState } from 'react';

export function InventoryForecastingPanel({ 
  products = [], 
  orders = [], 
  suppliers = [],
  warehouses = [],
  usageHistory = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('forecasts');
  const [filterRisk, setFilterRisk] = useState('all');

  const { 
    forecasts, alerts, loading, error, refresh,
    placeOrder, updateReorderPoint,
    getProductForecast,
    getCriticalAlerts,
    getTotalInventoryValue,
    criticalCount, highCount, atRiskProducts
  } = React.useMemo(() => {
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

    const mockAlerts = mockForecasts.filter(f => f.stockoutRisk === 'high' || f.orderUrgency === 'immediate').map(f => ({
      severity: f.orderUrgency === 'immediate' ? 'critical' : 'high',
      productId: f.productId,
      productName: f.productName,
      type: f.willStockout ? 'stockout_imminent' : 'reorder_overdue',
      message: f.willStockout ? `${f.productName} will stock out by ${f.stockoutDate}` : `${f.productName} reorder overdue`,
      recommendedAction: `Order ${f.recommendedOrderQty} units`,
      estimatedCost: f.estimatedOrderValue
    }));

    return {
      forecasts: mockForecasts,
      alerts: mockAlerts,
      loading: false, error: null, refresh: () => {},
      placeOrder: (id, qty) => onNotice?.(`Ordered ${qty} units`),
      updateReorderPoint: () => onNotice?.('Reorder point updated'),
      getProductForecast: (id) => mockForecasts.find(f => f.productId === id),
      getCriticalAlerts: () => mockAlerts.filter(a => a.severity === 'critical'),
      getTotalInventoryValue: () => mockForecasts.reduce((s, f) => s + f.currentStock * f.costPerUnit, 0),
      criticalCount: mockAlerts.filter(a => a.severity === 'critical').length,
      highCount: mockAlerts.filter(a => a.severity === 'high').length,
      atRiskProducts: mockForecasts.filter(f => f.stockoutRisk === 'high' || f.stockoutRisk === 'medium').length
    };
  }, [products, orders, suppliers, warehouses, usageHistory]);

  if (loading) return <div className="panel-loading">Forecasting inventory...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const filteredForecasts = forecasts.filter(f => 
    filterRisk === 'all' || f.stockoutRisk === filterRisk
  );

  return (
    <div className="inventory-panel">
      <div className="panel-header">
        <h3>Inventory Forecasting</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="inventory-metrics">
        <div className="metric-card">
          <h4>Total Products</h4>
          <div className="metric-value">{forecasts.length}</div>
        </div>
        <div className="metric-card">
          <h4>At Risk</h4>
          <div className="metric-value warning">{atRiskProducts}</div>
        </div>
        <div className="metric-card">
          <h4>Critical Alerts</h4>
          <div className="metric-value critical">{criticalCount}</div>
        </div>
        <div className="metric-card">
          <h4>Inventory Value</h4>
          <div className="metric-value">GH₵{getTotalInventoryValue().toLocaleString()}</div>
        </div>
      </div>

      <div className="inventory-tabs">
        <button className={activeTab === 'forecasts' ? 'active' : ''} onClick={() => setActiveTab('forecasts')}>Forecasts</button>
        <button className={activeTab === 'alerts' ? 'active' : ''} onClick={() => setActiveTab('alerts')}>Alerts ({alerts.length})</button>
      </div>

      <div className="forecast-filters">
        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}>
          <option value="all">All Risk Levels</option>
          <option value="high">High Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="low">Low Risk</option>
        </select>
      </div>

      {activeTab === 'forecasts' && (
        <div className="forecasts-table">
          <table>
            <thead>
              <tr><th>Product</th><th>Stock</th><th>Daily Usage</th><th>Days Left</th><th>Risk</th><th>Urgency</th><th>Action</th></tr>
            </thead>
            <tbody>
              {filteredForecasts.map(f => (
                <tr key={f.productId} className={f.stockoutRisk}>
                  <td>
                    <strong>{f.productName}</strong>
                    <br/><small>{f.sku} · {f.category}</small>
                  </td>
                  <td>{f.currentStock.toLocaleString()}</td>
                  <td>{f.avgDailyUsage}/day</td>
                  <td>{f.daysUntilStockout} days</td>
                  <td><span className={`risk-badge ${f.stockoutRisk}`}>{f.stockoutRisk.toUpperCase()}</span></td>
                  <td><span className={`urgency-badge ${f.orderUrgency}`}>{f.orderUrgency.toUpperCase()}</span></td>
                  <td>
                    {f.orderUrgency !== 'normal' && (
                      <button className="btn-order" onClick={() => placeOrder(f.productId, f.recommendedOrderQty)}>
                        Order {f.recommendedOrderQty}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="alerts-list">
          {alerts.map((alert, i) => (
            <div key={i} className={`alert-card ${alert.severity}`}>
              <span className={`severity-badge ${alert.severity}`}>{alert.severity.toUpperCase()}</span>
              <strong>{alert.productName}</strong>
              <p>{alert.message}</p>
              <div className="alert-actions">
                <span>Action: {alert.recommendedAction}</span>
                <span>Cost: GH₵{alert.estimatedCost.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {forecasts.length > 0 && (
        <div className="stock-projection">
          <h4>Stock Projection (Sample Product)</h4>
          <div className="projection-chart">
            {forecasts[0]?.projectedUsage?.slice(0, 14).map((p, i) => (
              <div key={i} className="proj-bar" style={{ height: `${Math.max(10, (p.projectedStock / (forecasts[0].currentStock || 1)) * 100)}%` }} title={p.date}>
                <span className="bar-date">{p.date.split('-').slice(1).join('-')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default InventoryForecastingPanel;