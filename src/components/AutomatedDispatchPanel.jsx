import React, { useState, useMemo } from 'react';
import { useAutomatedDispatch } from '../hooks/useAutomatedDispatch';

export default function AutomatedDispatchPanel({ 
  orders = [], 
  drivers = [], 
  driverLocations = {},
  zoneLoads = {},
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('plan');
  const [config, setConfig] = useState({
    maxDistance: 25,
    minScore: 50,
    batchSize: 10,
  });
  const [selectedOrder, setSelectedOrder] = useState(null);

  const {
    dispatchPlan,
    dispatchHistory,
    loading,
    lastUpdated,
    autoMode,
    setAutoMode,
    refresh,
    executeDispatch,
    optimizeDriverRoute,
    getOrderRecommendations,
    formatCedi,
  } = useAutomatedDispatch({ 
    orders, 
    drivers, 
    driverLocations, 
    zoneLoads, 
    config,
    onNotice 
  });

  const pendingOrders = useMemo(() => 
    orders.filter(o => ['Pending', 'Confirmed', 'Assigned'].includes(o.status) && !o.driverId),
  [orders]);

  const availableDrivers = useMemo(() =>
    drivers.filter(d => d.status === 'Online' && (d.currentOrders || 0) < (d.maxOrders || 5)),
  [drivers]);

  const stats = dispatchPlan?.stats || {
    totalPending: pendingOrders.length,
    assigned: 0,
    unassigned: pendingOrders.length,
    availableDrivers: availableDrivers.length,
    utilizationRate: 0,
  };

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">AUTOMATED DISPATCH</span>
            <h2>AI-Powered Order Assignment</h2>
          </div>
        </div>
        <div className="loading">Generating dispatch plan...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">AUTOMATED DISPATCH</span>
          <h2>AI-Powered Order Assignment</h2>
        </div>
        <div className="toolbar-actions">
          <label className="auto-toggle">
            <input 
              type="checkbox" 
              checked={autoMode} 
              onChange={e => setAutoMode(e.target.checked)} 
            />
            <span>Auto-dispatch every minute</span>
          </label>
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh Plan
          </button>
        </div>
      </div>

      <div className="dispatch-summary">
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="package" /></div>
          <div className="summary-content">
            <p className="summary-value">{stats.totalPending}</p>
            <p className="summary-label">Pending Orders</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="check-circle" /></div>
          <div className="summary-content">
            <p className="summary-value">{stats.assigned}</p>
            <p className="summary-label">Auto-Assigned</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="alert-circle" /></div>
          <div className="summary-content">
            <p className="summary-value">{stats.unassigned}</p>
            <p className="summary-label">Unassigned</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="users" /></div>
          <div className="summary-content">
            <p className="summary-value">{stats.availableDrivers}</p>
            <p className="summary-label">Available Drivers</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="activity" /></div>
          <div className="summary-content">
            <p className="summary-value">{Math.round(stats.utilizationRate * 100)}%</p>
            <p className="summary-label">Utilization</p>
          </div>
        </article>
      </div>

      <div className="dispatch-tabs">
        <div className="tab-nav">
          {['plan', 'assignments', 'unassigned', 'history', 'settings'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'plan' && (
          <div className="tab-content">
            <div className="dispatch-overview">
              <div className="overview-section">
                <h4>Recommended Assignments</h4>
                {dispatchPlan?.assignments.length > 0 ? (
                  <div className="assignment-list">
                    {dispatchPlan.assignments.map((assignment, idx) => (
                      <article key={assignment.orderId} className="assignment-card">
                        <div className="assignment-header">
                          <span className="assignment-rank">#{idx + 1}</span>
                          <span className="assignment-order">Order {assignment.orderId.slice(-8)}</span>
                          <span className="assignment-score" style={{ color: assignment.score >= 80 ? '#10b981' : assignment.score >= 60 ? '#f59e0b' : '#ef4444' }}>
                            {assignment.score}%
                          </span>
                        </div>
                        <div className="assignment-details">
                          <div className="detail-row">
                            <span className="detail-label">Driver:</span>
                            <span className="detail-value">{assignment.driverName}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Distance:</span>
                            <span className="detail-value">{assignment.distance} km</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Factors:</span>
                            <div className="factor-tags">
                              {Object.entries(assignment.factors).map(([key, value]) => (
                                <span key={key} className="factor-tag">{key}: {value}%</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-plan">
                    <i data-lucide="package-x" />
                    <p>No assignments generated. Check driver availability or adjust settings.</p>
                  </div>
                )}
              </div>

              {dispatchPlan?.idleDrivers.length > 0 && (
                <div className="overview-section">
                  <h4>Idle Drivers</h4>
                  <div className="idle-drivers">
                    {dispatchPlan.idleDrivers.map(driver => (
                      <div key={driver.driverId} className="idle-driver">
                        <span>{driver.driverName}</span>
                        <span className="idle-orders">{driver.currentOrders} active orders</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="dispatch-actions">
              <button 
                className="btn btn-primary" 
                onClick={() => executeDispatch()}
                disabled={!dispatchPlan?.assignments.length}
              >
                <i data-lucide="send" /> Execute All Assignments
              </button>
              <button className="btn btn-secondary" onClick={refresh}>
                <i data-lucide="rotate-ccw" /> Regenerate Plan
              </button>
            </div>
          </div>
        )}

        {activeTab === 'assignments' && (
          <div className="tab-content">
            <h4>Current Assignments</h4>
            {dispatchPlan?.assignments.length > 0 ? (
              <div className="assignments-table">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Driver</th>
                      <th>Match Score</th>
                      <th>Distance</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatchPlan.assignments.map(assignment => {
                      const order = orders.find(o => o.id === assignment.orderId);
                      return (
                        <tr key={assignment.orderId}>
                          <td>{assignment.orderId.slice(-8)}</td>
                          <td>{order?.customer || 'Unknown'}</td>
                          <td>{assignment.driverName}</td>
                          <td>
                            <span className={`score-badge ${assignment.score >= 80 ? 'high' : assignment.score >= 60 ? 'medium' : 'low'}`}>
                              {assignment.score}%
                            </span>
                          </td>
                          <td>{assignment.distance} km</td>
                          <td><span className="status-badge assigned">Assigned</span></td>
                          <td>
                            <button className="btn-icon" onClick={() => setSelectedOrder(assignment.orderId)}>
                              <i data-lucide="eye" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <i data-lucide="package-x" />
                <p>No current assignments</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'unassigned' && (
          <div className="tab-content">
            <h4>Unassigned Orders</h4>
            {dispatchPlan?.unassigned.length > 0 ? (
              <div className="unassigned-table">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Zone</th>
                      <th>Priority</th>
                      <th>Reason</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatchPlan.unassigned.map(item => {
                      const order = orders.find(o => o.id === item.orderId);
                      return (
                        <tr key={item.orderId}>
                          <td>{item.orderId.slice(-8)}</td>
                          <td>{order?.customer || 'Unknown'}</td>
                          <td>{item.zone}</td>
                          <td><span className={`priority-badge ${(item.priority || 'normal').toLowerCase()}`}>{item.priority}</span></td>
                          <td>{item.reason}</td>
                          <td>
                            <button className="btn-icon" onClick={() => setSelectedOrder(item.orderId)}>
                              <i data-lucide="search" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state success">
                <i data-lucide="check-circle" />
                <p>All orders assigned!</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="tab-content">
            <h4>Dispatch History</h4>
            {dispatchHistory.length > 0 ? (
              <div className="history-table">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Order</th>
                      <th>Driver</th>
                      <th>Score</th>
                      <th>Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dispatchHistory].reverse().slice(0, 20).map((entry, idx) => (
                      <tr key={idx}>
                        <td>{entry.executedAt ? new Date(entry.executedAt).toLocaleTimeString() : entry.timestamp}</td>
                        <td>{entry.orderId?.slice(-8) || entry.order?.id?.slice(-8)}</td>
                        <td>{entry.driverName || entry.driver?.name}</td>
                        <td>{entry.score}%</td>
                        <td>{entry.distance} km</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <i data-lucide="history" />
                <p>No dispatch history yet</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="tab-content">
            <h4>Dispatch Configuration</h4>
            <div className="settings-form">
              <div className="setting-row">
                <label>
                  <span>Max Distance (km)</span>
                  <input 
                    type="range" 
                    min="5" 
                    max="50" 
                    value={config.maxDistance} 
                    onChange={e => setConfig({...config, maxDistance: parseInt(e.target.value)})}
                  />
                  <span className="range-value">{config.maxDistance} km</span>
                </label>
              </div>
              <div className="setting-row">
                <label>
                  <span>Minimum Match Score</span>
                  <input 
                    type="range" 
                    min="30" 
                    max="90" 
                    value={config.minScore} 
                    onChange={e => setConfig({...config, minScore: parseInt(e.target.value)})}
                  />
                  <span className="range-value">{config.minScore}%</span>
                </label>
              </div>
              <div className="setting-row">
                <label>
                  <span>Batch Size</span>
                  <input 
                    type="range" 
                    min="5" 
                    max="20" 
                    value={config.batchSize} 
                    onChange={e => setConfig({...config, batchSize: parseInt(e.target.value)})}
                  />
                  <span className="range-value">{config.batchSize} orders</span>
                </label>
              </div>
              <div className="setting-description">
                <h5>How Matching Works</h5>
                <ul>
                  <li><strong>Distance (30%):</strong> Closer drivers score higher</li>
                  <li><strong>Zone Capacity (15%):</strong> Less loaded zones preferred</li>
                  <li><strong>Performance (20%):</strong> Higher efficiency drivers prioritized</li>
                  <li><strong>Vehicle Match (15%):</strong> Correct vehicle type required</li>
                  <li><strong>Workload (10%):</strong> Drivers with fewer orders preferred</li>
                  <li><strong>Availability (10%):</strong> Recently active drivers prioritized</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {selectedOrder && (
          <div className="tab-content order-recommendations">
            <button className="close-detail" onClick={() => setSelectedOrder(null)}>← Back</button>
            <h3>Driver Recommendations for Order {selectedOrder.slice(-8)}</h3>
            {(() => {
              const recommendations = getOrderRecommendations(selectedOrder);
              if (recommendations.length === 0) {
                return <div className="empty-state"><p>No suitable drivers found</p></div>;
              }
              return (
                <div className="recommendations-list">
                  {recommendations.map((rec, idx) => (
                    <article key={rec.driver.id} className="recommendation-card">
                      <div className="rec-header">
                        <span className="rec-rank">#{idx + 1}</span>
                        <span className="rec-name">{rec.driver.name}</span>
                        <span className="rec-score" style={{ color: rec.score >= 80 ? '#10b981' : rec.score >= 60 ? '#f59e0b' : '#ef4444' }}>
                          {rec.score}%
                        </span>
                      </div>
                      <div className="rec-factors">
                        {Object.entries(rec.factors).map(([key, value]) => (
                          <div key={key} className="factor-bar">
                            <span>{key}</span>
                            <div className="bar"><div className="fill" style={{ width: `${value}%` }} /></div>
                            <span>{value}%</span>
                          </div>
                        ))}
                      </div>
                      <div className="rec-meta">
                        <span>Distance: {rec.distance} km</span>
                        <span>Current orders: {rec.driver.currentOrders || 0}</span>
                      </div>
                    </article>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{orders.length} orders · {drivers.length} drivers</span>
      </div>
    </section>
  );
}