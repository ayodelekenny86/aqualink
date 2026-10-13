import React, { useState, useMemo } from 'react';
import { useFleetUtilization } from '../hooks/useFleetUtilization';

export default function FleetUtilizationPanel({ 
  fleetDrivers = [], 
  orders = [], 
  driverLocations = {}, 
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [filterTier, setFilterTier] = useState('all');

  const {
    utilization,
    fleetSummary,
    zoneUtilization,
    recommendations,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  } = useFleetUtilization({ fleetDrivers, orders, driverLocations, onNotice });

  const tiers = ['Elite', 'Pro', 'Standard', 'Needs Improvement'];
  const filteredUtilization = useMemo(() => {
    if (filterTier === 'all') return utilization;
    return utilization.filter(d => d.tier === filterTier);
  }, [utilization, filterTier]);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">FLEET UTILIZATION</span>
            <h2>AI-Powered Fleet Performance Analytics</h2>
          </div>
        </div>
        <div className="loading">Analyzing fleet utilization...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">FLEET UTILIZATION</span>
          <h2>AI-Powered Fleet Performance Analytics</h2>
        </div>
        <div className="toolbar-actions">
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className="filter-select">
            <option value="all">All Tiers</option>
            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="fleet-summary">
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="users" /></div>
          <div className="summary-content">
            <p className="summary-value">{fleetSummary.total}</p>
            <p className="summary-label">Total Drivers</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="wifi" /></div>
          <div className="summary-content">
            <p className="summary-value">{fleetSummary.online}</p>
            <p className="summary-label">Online</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="truck" /></div>
          <div className="summary-content">
            <p className="summary-value">{fleetSummary.onJob}</p>
            <p className="summary-label">On Job</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="pause-circle" /></div>
          <div className="summary-content">
            <p className="summary-value">{fleetSummary.idle}</p>
            <p className="summary-label">Idle</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="clock" /></div>
          <div className="summary-content">
            <p className="summary-value">{fleetSummary.avgUtilization}%</p>
            <p className="summary-label">Avg Utilization</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="target" /></div>
          <div className="summary-content">
            <p className="summary-value">{fleetSummary.avgEfficiency}</p>
            <p className="summary-label">Avg Efficiency</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="dollar-sign" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(fleetSummary.totalRevenue)}</p>
            <p className="summary-label">Total Revenue</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="package" /></div>
          <div className="summary-content">
            <p className="summary-value">{fleetSummary.totalOrders}</p>
            <p className="summary-label">Completed Orders</p>
          </div>
        </article>
      </div>

      <div className="fleet-tabs">
        <div className="tab-nav">
          {['overview', 'drivers', 'zones', 'recommendations'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'recommendations' && recommendations.length > 0 && <span className="badge">{recommendations.length}</span>}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="overview-grid">
              <div className="overview-section">
                <h4>Tier Distribution</h4>
                <div className="tier-distribution">
                  {Object.entries(fleetSummary.tierDistribution).map(([tier, count]) => (
                    <div key={tier} className={`tier-item ${tier}`}>
                      <span className="tier-name">{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
                      <span className="tier-count">{count}</span>
                      <div className="tier-bar">
                        <div className="tier-fill" style={{ width: `${fleetSummary.total > 0 ? count / fleetSummary.total * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="overview-section">
                <h4>Zone Utilization</h4>
                <div className="zone-list">
                  {zoneUtilization.map(zone => (
                    <div key={zone.zoneId} className={`zone-item ${zone.pressure}`}>
                      <div>
                        <strong>{zone.zoneName}</strong>
                        <small>{zone.assignedDrivers} drivers · {zone.activeOrders} active</small>
                      </div>
                      <div>
                        <span className={`pressure-badge ${zone.pressure}`}>{zone.pressure.toUpperCase()}</span>
                        <span className="utilization">{zone.utilization}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="overview-section full-width">
              <h4>Fleet Performance Metrics</h4>
              <div className="metrics-grid">
                <div className="metric-card">
                  <span className="metric-label">Total Distance</span>
                  <span className="metric-value">{fleetSummary.totalDistance.toLocaleString()} km</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Total Volume</span>
                  <span className="metric-value">{fleetSummary.totalVolume.toLocaleString()} gal</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Avg On-Time Rate</span>
                  <span className="metric-value">{fleetSummary.avgOnTimeRate}%</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Avg Orders/Hour</span>
                  <span className="metric-value">{fleetSummary.avgOrdersPerHour}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'drivers' && (
          <div className="tab-content">
            <div className="driver-table">
              <table>
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Vehicle</th>
                    <th>Base</th>
                    <th>Status</th>
                    <th>Tier</th>
                    <th>Efficiency</th>
                    <th>Orders</th>
                    <th>On-Time</th>
                    <th>Utilization</th>
                    <th>Revenue</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUtilization.map(driver => (
                    <tr key={driver.driverId} onClick={() => setSelectedDriver(driver.driverId)} style={{ cursor: 'pointer' }}>
                      <td className="driver-name">{driver.driverName}</td>
                      <td>{driver.vehicle}</td>
                      <td>{driver.base}</td>
                      <td><span className={`status ${driver.status === 'online' ? 'status-online' : 'status-offline'}`}>{driver.status.toUpperCase()}</span></td>
                      <td><span className={`tier-badge ${driver.tier.toLowerCase().replace(' ', '-')}`}>{driver.tier}</span></td>
                      <td>
                        <div className="score-bar">
                          <div className="score-fill" style={{ width: `${driver.efficiencyScore}%` }} />
                        </div>
                        <span>{driver.efficiencyScore}</span>
                      </td>
                      <td>{driver.completedOrders}/{driver.totalOrders}</td>
                      <td>{driver.onTimeRate}%</td>
                      <td>{driver.utilizationRate}%</td>
                      <td>{formatCedi(driver.totalRevenue)}</td>
                      <td>
                        <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setSelectedDriver(driver.driverId); }}>
                          <i data-lucide="eye" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredUtilization.length === 0 && (
              <div className="empty-state">
                <i data-lucide="filter" />
                <h3>No drivers match the current filter</h3>
              </div>
            )}
          </div>
        )}

        {activeTab === 'zones' && (
          <div className="tab-content">
            <h4>Zone Utilization Details</h4>
            <div className="zone-detail-grid">
              {zoneUtilization.map(zone => (
                <article key={zone.zoneId} className={`zone-detail-card panel ${zone.pressure}`}>
                  <div className="zone-header">
                    <h4>{zone.zoneName}</h4>
                    <span className={`pressure-badge ${zone.pressure}`}>{zone.pressure.toUpperCase()}</span>
                  </div>
                  <div className="zone-metrics">
                    <div className="metric"><span>Utilization:</span> <strong>{zone.utilization}%</strong></div>
                    <div className="metric"><span>Active Orders:</span> <strong>{zone.activeOrders}</strong></div>
                    <div className="metric"><span>Pending Orders:</span> <strong>{zone.pendingOrders}</strong></div>
                    <div className="metric"><span>Assigned Drivers:</span> <strong>{zone.assignedDrivers}</strong></div>
                    <div className="metric"><span>Total Volume:</span> <strong>{zone.totalVolume.toLocaleString()} gal</strong></div>
                  </div>
                  {zone.pressure === 'high' && (
                    <div className="zone-warning">
                      <i data-lucide="alert-triangle" />
                      <span>High pressure - consider rebalancing</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div className="tab-content">
            {recommendations.length === 0 ? (
              <div className="empty-state success">
                <i data-lucide="check-circle" />
                <h3>Fleet operating optimally</h3>
                <p>No recommendations at this time</p>
              </div>
            ) : (
              <div className="recommendations-list">
                {recommendations.map(rec => (
                  <article key={rec.id} className={`recommendation-card ${rec.priority}`}>
                    <div className="recommendation-header">
                      <div>
                        <h4>{rec.title}</h4>
                        <p>{rec.description}</p>
                      </div>
                      <span className={`priority-badge ${rec.priority}`}>{rec.priority.toUpperCase()}</span>
                    </div>
                    <div className="recommendation-action">
                      <span className="action-label">Recommended:</span>
                      <strong>{rec.action}</strong>
                    </div>
                    {rec.driverName && (
                      <div className="recommendation-driver">
                        <i data-lucide="user" /> {rec.driverName}
                      </div>
                    )}
                    {rec.zoneName && (
                      <div className="recommendation-zone">
                        <i data-lucide="map-pin" /> {rec.zoneName}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedDriver && (
          <div className="tab-content driver-detail">
            <button className="close-detail" onClick={() => setSelectedDriver(null)}>← Back</button>
            {(() => {
              const driver = utilization.find(d => d.driverId === selectedDriver);
              if (!driver) return <div>Driver not found</div>;
              return (
                <div className="driver-detail-view">
                  <div className="driver-profile">
                    <div className="profile-header">
                      <div className="avatar">{driver.driverName.charAt(0)}</div>
                      <div>
                        <h3>{driver.driverName}</h3>
                        <span className={`tier-badge ${driver.tier.toLowerCase().replace(' ', '-')}`}>{driver.tier}</span>
                      </div>
                      <div className="profile-score">
                        <div className="score-circle" style={{ background: `conic-gradient(${driver.tier === 'Elite' ? '#f59e0b' : driver.tier === 'Pro' ? '#3b82f6' : driver.tier === 'Standard' ? '#10b981' : '#ef4444'} ${driver.efficiencyScore * 3.6}deg, #e5e7eb 0deg)` }}>
                          <span>{driver.efficiencyScore}</span>
                        </div>
                        <p>Efficiency Score</p>
                      </div>
                    </div>
                    
                    <div className="metric-grid">
                      <div className="metric-card">
                        <span className="metric-value">{driver.completedOrders}/{driver.totalOrders}</span>
                        <span className="metric-label">Completed</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.onTimeRate}%</span>
                        <span className="metric-label">On-Time Rate</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.utilizationRate}%</span>
                        <span className="metric-label">Utilization</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.avgDeliveryTime} min</span>
                        <span className="metric-label">Avg Delivery</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.ordersPerHour}/hr</span>
                        <span className="metric-label">Orders/Hour</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{formatCedi(driver.totalRevenue)}</span>
                        <span className="metric-label">Total Revenue</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.fuelEfficiency}</span>
                        <span className="metric-label">Fuel Eff. (gal/km)</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.revenuePerHour}/hr</span>
                        <span className="metric-label">Revenue/Hour</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.idleHours} hrs</span>
                        <span className="metric-label">Idle Time</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{fleetDrivers.length} drivers · {orders.length} orders</span>
      </div>
    </section>
  );
}