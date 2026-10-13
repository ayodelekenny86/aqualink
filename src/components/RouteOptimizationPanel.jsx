import { useState } from 'react';
import { formatCedi } from '../lib/money';
import useRouteOptimization from '../hooks/useRouteOptimization';

function ZoneCard({ zone, onNotice }) {
  const pressureColors = {
    critical: 'status-cancelled',
    high: 'status-enroute',
    normal: 'status-awaiting',
    low: 'status-delivered',
  };

  return (
    <article className="zone-card panel">
      <div className="zone-header">
        <strong>{zone.zoneName}</strong>
        <span className={`status ${pressureColors[zone.pressure]}`}>
          {zone.pressure.toUpperCase()}
        </span>
      </div>
      <div className="zone-stats">
        <div><span>Pending:</span> <strong>{zone.pendingOrders}</strong></div>
        <div><span>Active:</span> <strong>{zone.activeOrders}</strong></div>
        <div><span>Drivers:</span> <strong>{zone.availableDrivers} avail / {zone.busyDrivers} busy</strong></div>
        <div><span>Utilization:</span> <strong className={zone.utilization > 150 ? 'critical' : zone.utilization > 100 ? 'warning' : ''}>{zone.utilization}%</strong></div>
      </div>
      <div className="zone-actions">
        <button className="text-button" onClick={() => onNotice?.(`Viewing details for ${zone.zoneName}`)}>
          Details
        </button>
        {zone.pressure === 'critical' && (
          <button className="primary-button small" onClick={() => onNotice?.(`Activating surge for ${zone.zoneName}`)}>
            Surge
          </button>
        )}
      </div>
    </article>
  );
}

function OptimizationCard({ optimization, onApply, onNotice }) {
  return (
    <article className="optimization-card panel">
      <div className="optimization-header">
        <div>
          <strong>{optimization.zoneName}</strong>
          <small>Driver: {optimization.driverName}</small>
        </div>
        <span className={`status ${optimization.status === 'applied' ? 'status-delivered' : 'status-awaiting'}`}>
          {optimization.status.toUpperCase()}
        </span>
      </div>
      <div className="optimization-summary">
        <div className="opt-stat">
          <span>Stops</span>
          <strong>{optimization.optimizedOrders.length}</strong>
        </div>
        <div className="opt-stat">
          <span>Distance</span>
          <strong>{optimization.totalDistance} km</strong>
        </div>
        <div className="opt-stat highlight">
          <span>Saved</span>
          <strong>{optimization.distanceSaved} km</strong>
        </div>
        <div className="opt-stat">
          <span>Time</span>
          <strong>{optimization.totalTime} min</strong>
        </div>
        <div className="opt-stat highlight">
          <span>Time Saved</span>
          <strong>{optimization.timeSaved} min</strong>
        </div>
      </div>
      <div className="optimization-route">
        {optimization.optimizedOrders.map((stop, idx) => (
          <div key={stop.orderId} className="route-stop">
            <span className="stop-sequence">{idx + 1}</span>
            <span className="stop-info">
              <strong>{stop.orderId}</strong>
              <small>{stop.location} · {stop.volume} · {formatCedi(stop.value)}</small>
            </span>
            <span className="stop-distance">{stop.distanceFromPrevious?.toFixed(1)} km</span>
            <span className="stop-time">{stop.travelTime} min</span>
          </div>
        ))}
      </div>
      {optimization.status === 'pending' && (
        <div className="optimization-actions">
          <button className="primary-button" onClick={() => onApply(optimization.id)}>
            Apply Optimization
          </button>
          <button className="text-button" onClick={() => onNotice?.(`Viewing map for optimization ${optimization.id}`)}>
            View Map
          </button>
        </div>
      )}
    </article>
  );
}

function SuggestionCard({ suggestion, onApply, onNotice }) {
  const priorityColors = { critical: 'critical', high: 'warning', medium: 'info', low: 'good' };
  
  return (
    <article className={`suggestion-card ${suggestion.priority}`}>
      <div className="suggestion-header">
        <span className={`priority-badge ${priorityColors[suggestion.priority]}`}>
          {suggestion.priority.toUpperCase()}
        </span>
        <span className="suggestion-type">{suggestion.type.replace('_', ' ').toUpperCase()}</span>
      </div>
      <p className="suggestion-reason">{suggestion.reason}</p>
      <div className="suggestion-actions">
        <button className="primary-button" onClick={() => onApply(suggestion)}>
          {suggestion.type === 'redistribute_drivers' ? 'Redistribute' : 
           suggestion.type === 'no_drivers' ? 'Activate Surge' : 'Redeploy'}
        </button>
        <button className="text-button" onClick={() => onNotice?.(`Viewing zone ${suggestion.zoneName || suggestion.fromZoneName}`)}>
          View Zone
        </button>
      </div>
    </article>
  );
}

function DriverWorkloadCard({ driver, onNotice }) {
  return (
    <article className="driver-workload-card panel">
      <div className="driver-wl-header">
        <div>
          <strong>{driver.name}</strong>
          <small>{driver.vehicle} · {driver.base}</small>
        </div>
        <span className={`status ${driver.status === 'online' ? 'status-online' : driver.status === 'on_job' ? 'status-enroute' : 'status-offline'}`}>
          {driver.status.toUpperCase()}
        </span>
      </div>
      <div className="driver-wl-stats">
        <div><span>Active Orders:</span> <strong>{driver.currentOrders}</strong></div>
        <div><span>Location:</span> <strong>{driver.location}</strong></div>
      </div>
      <button className="text-button" onClick={() => onNotice?.(`Viewing route for ${driver.name}`)}>
        View Route
      </button>
    </article>
  );
}

export default function RouteOptimizationPanel({ 
  orders = [], 
  onNotice, 
  driverPositions = {}
}) {
  const {
    zoneLoads,
    driverWorkloads,
    optimizationQueue,
    rebalancingSuggestions,
    autoAssignEnabled,
    setAutoAssignEnabled,
    autoRebalanceEnabled,
    setAutoRebalanceEnabled,
    surgeMode,
    activateSurge,
    fleetSummary,
    assignOrder,
    autoAssignAll,
    optimizeRoutes,
    applyOptimization,
    applyRebalancing,
    refreshLoads,
    lastOptimization,
    loading,
  } = useRouteOptimization({ orders, driverPositions, onNotice });

  const [activeTab, setActiveTab] = useState('zones');

  return (
    <section className="panel route-optimization-panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">ROUTE OPTIMIZATION</span>
          <h2>AI-Powered Fleet Dispatch</h2>
        </div>
        <div className="toolbar-actions">
          <select value={activeTab} onChange={(e) => setActiveTab(e.target.value)} className="tab-select">
            <option value="zones">Zone Overview</option>
            <option value="optimizations">Optimizations</option>
            <option value="rebalancing">Rebalancing</option>
            <option value="drivers">Driver Workloads</option>
          </select>
          <button className="outline-button" onClick={refreshLoads} disabled={loading}>
            {loading ? '⟳' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div className="fleet-summary">
        <article className="summary-card">
          <span>Online Drivers</span>
          <strong>{fleetSummary.onlineDrivers}</strong>
        </article>
        <article className="summary-card">
          <span>On Job</span>
          <strong>{fleetSummary.onJobDrivers}</strong>
        </article>
        <article className="summary-card">
          <span>Pending Orders</span>
          <strong>{fleetSummary.totalPendingOrders}</strong>
        </article>
        <article className="summary-card">
          <span>Avg Utilization</span>
          <strong>{fleetSummary.avgZoneUtilization}%</strong>
        </article>
        <article className={fleetSummary.surgeActive ? 'summary-card warning' : 'summary-card'}>
          <span>Surge Mode</span>
          <strong>{fleetSummary.surgeActive ? 'ACTIVE' : 'OFF'}</strong>
        </article>
      </div>

      <div className="optimization-controls">
        <label className="toggle-label">
          <input type="checkbox" checked={autoAssignEnabled} onChange={(e) => setAutoAssignEnabled(e.target.checked)} />
          <span>Auto-Assign Orders</span>
        </label>
        <label className="toggle-label">
          <input type="checkbox" checked={autoRebalanceEnabled} onChange={(e) => setAutoRebalanceEnabled(e.target.checked)} />
          <span>Auto-Rebalance Zones</span>
        </label>
        <label className="toggle-label">
          <input type="checkbox" checked={surgeMode} onChange={(e) => activateSurge(e.target.checked)} />
          <span>Surge Pricing</span>
        </label>
        <button className="primary-button" onClick={autoAssignAll} disabled={fleetSummary.totalPendingOrders === 0 || fleetSummary.onlineDrivers === 0}>
          Assign All Now ({fleetSummary.totalPendingOrders})
        </button>
        <button className="outline-button" onClick={optimizeRoutes} disabled={loading}>
          {loading ? 'Optimizing…' : 'Optimize Routes'}
        </button>
      </div>

      {lastOptimization && (
        <div className="last-optimization">
          <small>Last optimization: {new Date(lastOptimization).toLocaleString()}</small>
        </div>
      )}

      {activeTab === 'zones' && (
        <div className="zone-grid">
          {zoneLoads.map(zone => (
            <ZoneCard key={zone.zoneId} zone={zone} onNotice={onNotice} />
          ))}
        </div>
      )}

      {activeTab === 'optimizations' && (
        <div className="optimizations-list">
          {optimizationQueue.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🗺️</span>
              <p>No optimizations generated yet. Click "Optimize Routes" to create AI-powered route plans.</p>
            </div>
          ) : (
            optimizationQueue
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
              .map(opt => (
                <OptimizationCard 
                  key={opt.id} 
                  optimization={opt} 
                  onApply={applyOptimization}
                  onNotice={onNotice}
                />
              ))
          )}
        </div>
      )}

      {activeTab === 'rebalancing' && (
        <div className="rebalancing-suggestions">
          {rebalancingSuggestions.length === 0 ? (
            <div className="empty-state good">
              <span className="empty-icon">✓</span>
              <p>All zones are well balanced. No rebalancing needed.</p>
            </div>
          ) : (
            rebalancingSuggestions.map(suggestion => (
              <SuggestionCard 
                key={suggestion.id} 
                suggestion={suggestion} 
                onApply={applyRebalancing}
                onNotice={onNotice}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'drivers' && (
        <div className="driver-workloads">
          {driverWorkloads.length === 0 ? (
            <p className="empty-feed">No drivers in the system.</p>
          ) : (
            driverWorkloads.map(driver => (
              <DriverWorkloadCard key={driver.driverId} driver={driver} onNotice={onNotice} />
            ))
          )}
        </div>
      )}
    </section>
  );
}