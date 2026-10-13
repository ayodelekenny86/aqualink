import { useState } from 'react';
import { formatCedi } from '../lib/money';
import usePredictiveInventory from '../hooks/usePredictiveInventory';

function InventoryItemCard({ item, onRestock, onNotice }) {
  const healthColors = {
    healthy: 'status-delivered',
    low: 'status-awaiting',
    warning: 'status-enroute',
    critical: 'status-cancelled',
  };

  const healthLabels = {
    healthy: 'HEALTHY',
    low: 'LOW STOCK',
    warning: 'REORDER SOON',
    critical: 'CRITICAL',
  };

  return (
    <article className="inventory-card panel">
      <div className="inventory-header">
        <div>
          <strong>{item.name}</strong>
          <small>{item.type.replace('_', ' ').toUpperCase()}</small>
        </div>
        <span className={`status ${healthColors[item.health]}`}>
          {healthLabels[item.health]}
        </span>
      </div>

      <div className="inventory-stats">
        <div><span>Current Stock:</span> <strong>{item.current.toLocaleString()} {item.unit}</strong></div>
        <div><span>Daily Usage:</span> <strong>{item.dailyUsage?.toFixed(1) || 0} {item.unit}/day</strong></div>
        <div><span>Days Remaining:</span> <strong className={item.daysRemaining <= item.leadTime ? 'critical' : item.daysRemaining <= 7 ? 'warning' : ''}>{item.daysRemaining}</strong></div>
        <div><span>Reorder Point:</span> <strong>{item.reorderPoint} {item.unit}</strong></div>
        <div><span>Lead Time:</span> <strong>{item.leadTime} days</strong></div>
        <div><span>Unit Cost:</span> <strong>{formatCedi(item.costPerUnit * 100)}</strong></div>
        <div><span>Stock Value:</span> <strong>{formatCedi(item.current * item.costPerUnit * 100)}</strong></div>
      </div>

      {item.needsReorder && (
        <div className="reorder-banner warning">
          <span>⚠ REORDER NEEDED</span>
          <button className="primary-button" onClick={() => onRestock(item.id, item.reorderQty, item.reorderCost)}>
            Order {item.reorderQty} {item.unit} (~{formatCedi(item.reorderCost * 100)})
          </button>
        </div>
      )}

      <div className="inventory-actions">
        <button className="outline-button" onClick={() => onNotice?.(`Viewing history for ${item.name}`)}>
          History
        </button>
        <button className="text-button" onClick={() => onNotice?.(`Adjusting levels for ${item.name}`)}>
          Adjust
        </button>
      </div>
    </article>
  );
}

function PredictionCard({ prediction, onNotice }) {
  const riskColors = { high: 'critical', medium: 'warning', low: 'good' };
  
  return (
    <article className="prediction-card panel">
      <div className="prediction-header">
        <strong>{prediction.itemName}</strong>
        <span className={`risk-badge ${riskColors[prediction.stockoutRisk]}`}>
          {prediction.stockoutRisk.toUpperCase()} RISK
        </span>
      </div>
      
      <div className="prediction-grid">
        <div className="pred-stat">
          <span>Current Stock</span>
          <strong>{prediction.currentStock}</strong>
        </div>
        <div className="pred-stat">
          <span>Daily Usage</span>
          <strong>{prediction.avgDailyUsage}/day</strong>
        </div>
        <div className="pred-stat">
          <span>Days of Stock</span>
          <strong>{prediction.daysOfStock}d</strong>
        </div>
        <div className="pred-stat">
          <span>30-Day Forecast</span>
          <strong>{prediction.forecast30d}</strong>
        </div>
        <div className="pred-stat">
          <span>Reorder Point</span>
          <strong>{prediction.reorderPoint}</strong>
        </div>
        <div className="pred-stat">
          <span>EOQ</span>
          <strong>{prediction.eoq}</strong>
        </div>
      </div>

      <div className="forecast-mini-chart">
        {prediction.forecastData.slice(0, 14).map((day, i) => (
          <div key={i} className="forecast-bar-wrapper" title={`${day.date}: ${day.predictedUsage}`}>
            <div className="forecast-bar" style={{ 
              height: `${Math.max(5, (day.predictedUsage / Math.max(1, prediction.avgDailyUsage * 2)) * 100)}%` 
            }} />
            <span className="forecast-day">{day.date.slice(5)}</span>
          </div>
        ))}
      </div>

      <div className="prediction-actions">
        <button className="primary-button" onClick={() => onNotice?.(`Creating PO for ${prediction.itemName}: ${prediction.recommendedOrderQty} units`)}>
          Order {prediction.recommendedOrderQty} units
        </button>
        <button className="text-button" onClick={() => onNotice?.(`Viewing detailed forecast for ${prediction.itemName}`)}>
          Details
        </button>
      </div>
    </article>
  );
}

function AlertBanner({ alerts, onNotice }) {
  if (alerts.length === 0) return null;
  
  const critical = alerts.filter(a => a.severity === 'critical');
  const warning = alerts.filter(a => a.severity === 'warning');
  
  return (
    <div className="alert-banners">
      {critical.length > 0 && (
        <div className="alert-banner critical">
          <span className="alert-icon">🚨</span>
          <div>
            <strong>{critical.length} Critical Alert{critical.length !== 1 ? 's' : ''}</strong>
            <span>{critical.map(a => a.message).join('; ')}</span>
          </div>
        </div>
      )}
      {warning.length > 0 && (
        <div className="alert-banner warning">
          <span className="alert-icon">⚠</span>
          <div>
            <strong>{warning.length} Warning{warning.length !== 1 ? 's' : ''}</strong>
            <span>{warning.map(a => a.message).join('; ')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PredictiveInventoryPanel({ 
  orders = [], 
  onNotice, 
  sellerProfile,
  driverPositions = {},
  forecast = []
}) {
  const {
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
  } = usePredictiveInventory({ sellerProfile, orders, driverPositions, forecast, onNotice });

  const [activeTab, setActiveTab] = useState('overview');
  const [showRestockModal, setShowRestockModal] = useState(null);

  return (
    <section className="panel predictive-inventory-panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">PREDICTIVE INVENTORY</span>
          <h2>AI-Driven Stock Management</h2>
        </div>
        <div className="toolbar-actions">
          <select value={activeTab} onChange={(e) => setActiveTab(e.target.value)} className="tab-select">
            <option value="overview">Overview</option>
            <option value="predictions">AI Predictions</option>
            <option value="reorders">Reorder Queue</option>
            <option value="equipment">Equipment</option>
            <option value="alerts">Alerts</option>
          </select>
          {loading && <span className="loading-indicator">⟳</span>}
        </div>
      </div>

      <AlertBanner alerts={alerts} onNotice={onNotice} />

      <div className="summary-stats">
        <article className="stat-card">
          <span>Items Tracked</span>
          <strong>{summary.itemsTracked}</strong>
        </article>
        <article className="stat-card">
          <span>Total Value</span>
          <strong>{formatCedi(summary.totalValue * 100)}</strong>
        </article>
        <article className={summary.criticalCount > 0 ? 'stat-card critical' : 'stat-card good'}>
          <span>Critical Items</span>
          <strong>{summary.criticalCount}</strong>
        </article>
        <article className={summary.lowStockCount > 0 ? 'stat-card warning' : 'stat-card'}>
          <span>Low Stock</span>
          <strong>{summary.lowStockCount}</strong>
        </article>
        <article className="stat-card good">
          <span>Healthy</span>
          <strong>{summary.healthyCount}</strong>
        </article>
        <article className={summary.reorderRecommendations > 0 ? 'stat-card warning' : 'stat-card'}>
          <span>Reorder Queue</span>
          <strong>{summary.reorderRecommendations}</strong>
        </article>
      </div>

      {activeTab === 'overview' && (
        <div className="inventory-grid">
          {inventory.map(item => (
            <InventoryItemCard 
              key={item.id} 
              item={item} 
              onRestock={(id, qty, cost) => {
                recordRestock(id, qty, cost);
                onNotice?.(`Restocked ${qty} units`);
              }}
              onNotice={onNotice}
            />
          ))}
          {inventory.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">📦</span>
              <p>No inventory items configured.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'predictions' && (
        <div className="predictions-grid">
          {predictions.map(pred => (
            <PredictionCard key={pred.itemId} prediction={pred} onNotice={onNotice} />
          ))}
          {predictions.length === 0 && (
            <div className="empty-state">
              <p>No predictions available. Complete more deliveries to build usage history.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reorders' && (
        <div className="reorder-queue">
          <h4>Reorder Recommendations</h4>
          {reorderRecommendations.length === 0 ? (
            <p className="empty-feed">No reorders needed. All items are well stocked.</p>
          ) : (
            <div className="reorder-table">
              <div className="reorder-header">
                <span>Item</span>
                <span>Current</span>
                <span>Reorder Pt</span>
                <span>Rec. Qty</span>
                <span>Est. Cost</span>
                <span>Urgency</span>
                <span>Action</span>
              </div>
              {reorderRecommendations.map(rec => (
                <div key={rec.itemId} className={`reorder-row ${rec.urgency}`}>
                  <span><strong>{rec.itemName}</strong><br/><small>{rec.reason}</small></span>
                  <span>{rec.currentStock}</span>
                  <span>{rec.reorderPoint || '—'}</span>
                  <span>{rec.recommendedQty}</span>
                  <span>{formatCedi(rec.estimatedCost * 100)}</span>
                  <span className={`urgency-badge ${rec.urgency}`}>{rec.urgency.toUpperCase()}</span>
                  <button className="primary-button small" onClick={() => {
                    const item = inventory.find(i => i.id === rec.itemId);
                    if (item) recordRestock(item.id, rec.recommendedQty, rec.estimatedCost);
                  }}>
                    Order
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'equipment' && (
        <div className="equipment-section">
          <div className="panel-title">
            <span className="section-kicker">EQUIPMENT HEALTH</span>
            <h3>{equipment.length} assets · {pendingMaintenance.filter(e => e.maintenance?.urgency === 'overdue').length} overdue</h3>
          </div>
          {equipment.length === 0 ? (
            <p className="empty-feed">No equipment registered. Add assets to track maintenance.</p>
          ) : (
            <div className="equipment-grid">
              {equipment.map(eq => (
                <article key={eq.id} className="equipment-card panel">
                  <div className="equipment-header">
                    <div>
                      <strong>{eq.name}</strong>
                      <small>{eq.assetTag} · {eq.type.toUpperCase()}</small>
                    </div>
                    <span className={`status ${eq.maintenance?.urgency === 'overdue' ? 'status-cancelled' : eq.maintenance?.urgency === 'due_soon' ? 'status-enroute' : 'status-delivered'}`}>
                      {eq.maintenance?.urgency?.toUpperCase() || 'OK'}
                    </span>
                  </div>
                  <div className="equipment-stats">
                    {eq.type === 'vehicle' && (
                      <>
                        <div><span>KM:</span> <strong>{eq.usage?.km?.toLocaleString() || 0}</strong></div>
                        <div><span>Hours:</span> <strong>{eq.usage?.hours?.toLocaleString() || 0}</strong></div>
                        <div><span>KM to Service:</span> <strong>{eq.maintenance?.kmRemaining?.toLocaleString() || '—'}</strong></div>
                      </>
                    )}
                    {eq.type === 'pump' && (
                      <>
                        <div><span>Hours:</span> <strong>{eq.usage?.hours?.toLocaleString() || 0}</strong></div>
                        <div><span>Hours to Service:</span> <strong>{eq.maintenance?.hoursRemaining?.toLocaleString() || '—'}</strong></div>
                      </>
                    )}
                    {eq.type === 'filter' && (
                      <>
                        <div><span>Volume Processed:</span> <strong>{eq.usage?.volume?.toLocaleString() || 0} gal</strong></div>
                        <div><span>Days to Replace:</span> <strong>{eq.maintenance?.daysRemaining || '—'}</strong></div>
                      </>
                    )}
                    <div><span>Total Maint. Cost:</span> <strong>{formatCedi((eq.totalMaintenanceCost || 0) * 100)}</strong></div>
                  </div>
                  {eq.maintenance?.urgency !== 'ok' && (
                    <button className="primary-button" onClick={() => recordMaintenance(eq.id, 'scheduled', 'Routine service', 0, 'internal')}>
                      Schedule Maintenance
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="alerts-list">
          {alerts.length === 0 ? (
            <p className="empty-feed">No active alerts. All systems nominal.</p>
          ) : (
            alerts.map(alert => (
              <article key={alert.id} className={`alert-item panel ${alert.severity}`}>
                <div className="alert-content">
                  <div className="alert-header">
                    <span className={`severity ${alert.severity}`}>{alert.severity.toUpperCase()}</span>
                    <strong>{alert.itemName}</strong>
                    <small>{new Date(alert.createdAt).toLocaleString()}</small>
                  </div>
                  <p>{alert.message}</p>
                </div>
                <div className="alert-actions">
                  <button className="text-button" onClick={() => onNotice?.(`Acknowledged: ${alert.message}`)}>
                    Acknowledge
                  </button>
                  <button className="primary-button" onClick={() => {
                    const item = inventory.find(i => i.id === alert.itemId);
                    if (item && item.needsReorder) recordRestock(item.id, item.reorderQty, item.reorderCost);
                  }}>
                    Resolve
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}