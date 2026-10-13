import React, { useState, useMemo } from 'react';
import { usePredictiveMaintenance } from '../hooks/usePredictiveMaintenance';

export default function PredictiveMaintenancePanel({ 
  vehicles = [], 
  orders = [], 
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [filterUrgency, setFilterUrgency] = useState('all');

  const {
    predictions,
    alerts,
    summary,
    maintenanceHistory,
    loading,
    lastUpdated,
    refresh,
    recordMaintenance,
    getAssetDetail,
    formatCedi,
  } = usePredictiveMaintenance({ vehicles, orders, onNotice });

  const filteredPredictions = useMemo(() => {
    if (filterUrgency === 'all') return predictions;
    return predictions.filter(p => p.urgency === filterUrgency);
  }, [predictions, filterUrgency]);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">PREDICTIVE MAINTENANCE</span>
            <h2>AI-Powered Asset Health Monitoring</h2>
          </div>
        </div>
        <div className="loading">Analyzing asset health...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">PREDICTIVE MAINTENANCE</span>
          <h2>AI-Powered Asset Health Monitoring</h2>
        </div>
        <div className="toolbar-actions">
          <select value={filterUrgency} onChange={e => setFilterUrgency(e.target.value)} className="filter-select">
            <option value="all">All Assets</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due Soon</option>
            <option value="upcoming">Upcoming</option>
            <option value="ok">Healthy</option>
          </select>
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="maintenance-summary">
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="truck" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.total}</p>
            <p className="summary-label">Total Assets</p>
          </div>
        </article>
        <article className="summary-card critical">
          <div className="summary-icon"><i data-lucide="alert-triangle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.overdue}</p>
            <p className="summary-label">Overdue</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="clock" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.dueSoon}</p>
            <p className="summary-label">Due Soon</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="calendar" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.upcoming}</p>
            <p className="summary-label">Upcoming</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="check-circle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.ok}</p>
            <p className="summary-label">Healthy</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="dollar-sign" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.totalEstimatedCost)}</p>
            <p className="summary-label">Est. Maintenance Cost</p>
          </div>
        </article>
      </div>

      <div className="maintenance-tabs">
        <div className="tab-nav">
          {['overview', 'alerts', 'schedule', 'history'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'alerts' && alerts.length > 0 && <span className="badge">{alerts.length}</span>}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="asset-grid">
              {filteredPredictions.map(asset => (
                <article key={asset.assetId} className={`asset-card panel ${asset.urgency}`} onClick={() => setSelectedAsset(asset.assetId)}>
                  <div className="asset-header">
                    <div>
                      <strong>{asset.assetName}</strong>
                      <small>{asset.assetTag} · {asset.type.toUpperCase()}</small>
                    </div>
                    <span className={`status ${asset.urgency === 'overdue' ? 'status-cancelled' : asset.urgency === 'due_soon' ? 'status-enroute' : asset.urgency === 'upcoming' ? 'status-awaiting' : 'status-delivered'}`}>
                      {asset.urgency.toUpperCase().replace('_', ' ')}
                    </span>
                  </div>
                  <div className="asset-stats">
                    <div className="stat-row">
                      <span className="stat-label">Overall Health</span>
                      <div className="health-bar">
                        <div className="health-fill" style={{ width: `${100 - asset.overallScore}%`, background: asset.urgency === 'overdue' ? '#ef4444' : asset.urgency === 'due_soon' ? '#f59e0b' : asset.urgency === 'upcoming' ? '#3b82f6' : '#10b981' }} />
                      </div>
                      <span className="stat-value">{100 - asset.overallScore}%</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Failure Risk</span>
                      <div className="risk-indicator">
                        <div className="risk-fill" style={{ width: `${asset.predictedFailureRisk}%` }} />
                        <span>{asset.predictedFailureRisk}%</span>
                      </div>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Days Until Due</span>
                      <span className="stat-value">{asset.daysUntilDue} days</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Est. Cost</span>
                      <span className="stat-value">{formatCedi(asset.estimatedCost)}</span>
                    </div>
                    <div className="stat-row detail-row">
                      {asset.type === 'tanker' && (
                        <>
                          <span className="stat-label">Mileage</span>
                          <span className="stat-value">{asset.mileage.toLocaleString()} km ({asset.mileagePercent}%)</span>
                        </>
                      )}
                      {asset.type !== 'tanker' && (
                        <>
                          <span className="stat-label">Hours Used</span>
                          <span className="stat-value">{asset.hoursUsed.toLocaleString()} hrs ({asset.hoursPercent}%)</span>
                        </>
                      )}
                    </div>
                    <div className="stat-row detail-row">
                      <span className="stat-label">Days Since Service</span>
                      <span className="stat-value">{asset.daysSinceService} days ({asset.daysPercent}%)</span>
                    </div>
                  </div>
                  <div className="asset-actions">
                    <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); recordMaintenance(asset.assetId, 'routine', 'Scheduled maintenance', asset.estimatedCost, 'internal'); }}>
                      Schedule Service
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {filteredPredictions.length === 0 && (
              <div className="empty-state">
                <i data-lucide="check-circle" className="success" />
                <h3>No assets match the current filter</h3>
              </div>
            )}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="tab-content">
            {alerts.length === 0 ? (
              <div className="empty-state success">
                <i data-lucide="check-circle" />
                <h3>No maintenance alerts</h3>
                <p>All assets are operating within normal parameters</p>
              </div>
            ) : (
              <div className="alerts-list">
                {alerts.map(alert => (
                  <article key={`${alert.assetId}_${alert.type}`} className={`alert-card ${alert.type}`}>
                    <div className="alert-header">
                      <div>
                        <h4>{alert.assetName}</h4>
                        <span className="alert-type">{alert.message}</span>
                      </div>
                      <span className={`severity-badge ${alert.type}`}>{alert.type.toUpperCase()}</span>
                    </div>
                    <div className="alert-details">
                      <div><span>Failure Risk:</span> <strong>{alert.predictedFailureRisk}%</strong></div>
                      <div><span>Days Until Due:</span> <strong>{alert.daysUntilDue}</strong></div>
                      <div><span>Est. Cost:</span> <strong>{formatCedi(alert.estimatedCost)}</strong></div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="tab-content">
            <h4>Upcoming Maintenance Schedule</h4>
            <div className="schedule-table">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Type</th>
                    <th>Last Service</th>
                    <th>Next Due</th>
                    <th>Days Left</th>
                    <th>Urgency</th>
                    <th>Est. Cost</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions
                    .filter(p => p.urgency !== 'ok')
                    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
                    .map(asset => (
                      <tr key={asset.assetId}>
                        <td>{asset.assetName}</td>
                        <td>{asset.assetTag}</td>
                        <td>{asset.lastService}</td>
                        <td>{asset.nextServiceDue}</td>
                        <td>{asset.daysUntilDue}</td>
                        <td><span className={`status ${asset.urgency === 'overdue' ? 'status-cancelled' : asset.urgency === 'due_soon' ? 'status-enroute' : 'status-awaiting'}`}>{asset.urgency.toUpperCase()}</span></td>
                        <td>{formatCedi(asset.estimatedCost)}</td>
                        <td>
                          <button className="btn btn-sm btn-primary" onClick={() => recordMaintenance(asset.assetId, 'routine', 'Scheduled maintenance', asset.estimatedCost, 'internal')}>
                            Schedule
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="tab-content">
            <h4>Maintenance History</h4>
            {maintenanceHistory.length === 0 ? (
              <div className="empty-state">
                <i data-lucide="history" />
                <h3>No maintenance records yet</h3>
                <p>Record maintenance activities to build history</p>
              </div>
            ) : (
              <div className="history-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Asset</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Cost</th>
                      <th>Performed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceHistory.slice(0, 50).map(record => (
                      <tr key={record.id}>
                        <td>{new Date(record.date).toLocaleDateString()}</td>
                        <td>{record.assetId}</td>
                        <td>{record.type}</td>
                        <td>{record.description}</td>
                        <td>{formatCedi(record.cost)}</td>
                        <td>{record.performedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {selectedAsset && (
          <div className="tab-content asset-detail">
            <button className="close-detail" onClick={() => setSelectedAsset(null)}>← Back</button>
            {(() => {
              const asset = getAssetDetail(selectedAsset);
              if (!asset) return <div>Asset not found</div>;
              return (
                <div className="asset-detail-view">
                  <div className="asset-profile">
                    <div className="profile-header">
                      <div className="avatar">{asset.assetName.charAt(0)}</div>
                      <div>
                        <h3>{asset.assetName}</h3>
                        <span className="tier-badge" style={{ background: asset.urgency === 'overdue' ? '#ef4444' : asset.urgency === 'due_soon' ? '#f59e0b' : asset.urgency === 'upcoming' ? '#3b82f6' : '#10b981', color: 'white' }}>
                          {asset.urgency.toUpperCase()}
                        </span>
                      </div>
                      <div className="profile-score">
                        <div className="score-circle" style={{ background: `conic-gradient(${asset.urgency === 'overdue' ? '#ef4444' : asset.urgency === 'due_soon' ? '#f59e0b' : asset.urgency === 'upcoming' ? '#3b82f6' : '#10b981'} ${asset.overallScore * 3.6}deg, #e5e7eb 0deg)` }}>
                          <span>{100 - asset.overallScore}</span>
                        </div>
                        <p>Health Score</p>
                      </div>
                    </div>
                    
                    <div className="metric-grid">
                      <div className="metric-card">
                        <span className="metric-value">{asset.predictedFailureRisk}%</span>
                        <span className="metric-label">Failure Risk</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{asset.daysUntilDue}</span>
                        <span className="metric-label">Days Until Due</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{formatCedi(asset.estimatedCost)}</span>
                        <span className="metric-label">Est. Cost</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{asset.type === 'tanker' ? asset.mileage.toLocaleString() + ' km' : asset.hoursUsed.toLocaleString() + ' hrs'}</span>
                        <span className="metric-label">Usage</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{asset.daysSinceService}</span>
                        <span className="metric-label">Days Since Service</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{asset.type}</span>
                        <span className="metric-label">Asset Type</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="recommended-actions">
                    <h4>Recommended Actions</h4>
                    <ul>
                      {asset.recommendedActions.map((action, i) => (
                        <li key={i}><i data-lucide="arrow-right" /> {action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{vehicles.length || 'Default'} assets monitored</span>
      </div>
    </section>
  );
}