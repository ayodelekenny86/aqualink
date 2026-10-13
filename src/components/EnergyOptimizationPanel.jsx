import React, { useState, useMemo } from 'react';
import { useEnergyOptimization } from '../hooks/useEnergyOptimization';

export default function EnergyOptimizationPanel({ 
  fleetDrivers = [], 
  orders = [], 
  driverLocations = {}, 
  vehicles = [], 
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [filterPriority, setFilterPriority] = useState('all');

  const {
    energyData,
    efficiencyRecommendations,
    evTransitionPlan,
    carbonFootprint,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  } = useEnergyOptimization({ fleetDrivers, orders, driverLocations, vehicles, onNotice });

  const filteredRecommendations = useMemo(() => {
    if (filterPriority === 'all') return efficiencyRecommendations;
    return efficiencyRecommendations.filter(r => r.priority === filterPriority);
  }, [efficiencyRecommendations, filterPriority]);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">ENERGY OPTIMIZATION</span>
            <h2>AI-Powered Fleet Energy & Emissions Management</h2>
          </div>
        </div>
        <div className="loading">Analyzing fleet energy consumption...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">ENERGY OPTIMIZATION</span>
          <h2>AI-Powered Fleet Energy & Emissions Management</h2>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="energy-summary">
        <article className="summary-card highlight">
          <div className="summary-icon"><i data-lucide="gauge" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.avgEfficiency} km/L</p>
            <p className="summary-label">Avg Fuel Efficiency</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="dollar-sign" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.totalFuelCost)}</p>
            <p className="summary-label">Monthly Fuel Cost</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="trending-down" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.potentialSavings)}</p>
            <p className="summary-label">Potential Monthly Savings</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="leaf" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.potentialCO2Reduction.toLocaleString()} kg</p>
            <p className="summary-label">Potential CO₂ Reduction</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="zap" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.evProgress}</p>
            <p className="summary-label">EV Adoption</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="alert-triangle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.highPriorityActions}</p>
            <p className="summary-label">High Priority Actions</p>
          </div>
        </article>
      </div>

      <div className="energy-tabs">
        <div className="tab-nav">
          {['overview', 'recommendations', 'ev-transition', 'carbon-footprint', 'vehicles'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'ev-transition' ? 'EV Transition' : tab === 'carbon-footprint' ? 'Carbon Footprint' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'recommendations' && efficiencyRecommendations.filter(r => r.priority === 'high').length > 0 && (
                <span className="badge">{efficiencyRecommendations.filter(r => r.priority === 'high').length}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="overview-grid">
              <div className="overview-section">
                <h4>Monthly Fuel Cost Trend</h4>
                {energyData?.monthlyTrend?.length > 0 ? (
                  <div className="trend-chart">
                    {energyData.monthlyTrend.map(month => (
                      <div key={month.month} className="trend-bar" 
                        style={{ height: `${Math.max(10, (month.fuelCost / Math.max(...energyData.monthlyTrend.map(m => m.fuelCost))) * 100)}%` }}
                        title={`${month.month}: ${formatCedi(month.fuelCost * 100)}`}
                      >
                        <span className="trend-label">{month.month.slice(5)}</span>
                        <span className="trend-value">{formatCedi(month.fuelCost * 100)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-feed">No trend data available</p>
                )}
              </div>

              <div className="overview-section">
                <h4>Efficiency Trend</h4>
                {energyData?.monthlyTrend?.length > 0 ? (
                  <div className="efficiency-chart">
                    {energyData.monthlyTrend.map(month => (
                      <div key={month.month} className="efficiency-point" 
                        style={{ bottom: `${(month.efficiency / Math.max(...energyData.monthlyTrend.map(m => m.efficiency))) * 100}%` }}
                        title={`${month.month}: ${month.efficiency.toFixed(1)} km/L`}
                      >
                        <span>{month.efficiency.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-feed">No efficiency data available</p>
                )}
              </div>

              <div className="overview-section full-width">
                <h4>Vehicle Fleet Breakdown</h4>
                <div className="vehicle-breakdown-grid">
                  {energyData?.vehicleBreakdown?.map(v => (
                    <article key={v.id} className="vehicle-breakdown-card panel">
                      <div className="vehicle-header">
                        <strong>{v.type.toUpperCase()}</strong>
                        <span className={`fuel-badge ${v.fuelType}`}>{v.fuelType.toUpperCase()}</span>
                      </div>
                      <div className="vehicle-metrics">
                        <div className="metric"><span>Count:</span> <strong>{v.count}</strong></div>
                        <div className="metric"><span>Avg Efficiency:</span> <strong>{v.avgEfficiency} km/L</strong></div>
                        <div className="metric"><span>Monthly Fuel Cost:</span> <strong>{formatCedi(v.totalFuelCost)}</strong></div>
                        <div className="metric"><span>CO₂ Emissions:</span> <strong>{v.co2Emissions?.toLocaleString() || 0} kg</strong></div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div className="tab-content">
            <div className="filter-bar">
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="filter-select">
                <option value="all">All Priorities</option>
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </div>
            <div className="recommendations-list">
              {filteredRecommendations.map(rec => (
                <article key={rec.id} className={`recommendation-card ${rec.priority} ${rec.category}`}>
                  <div className="recommendation-header">
                    <div>
                      <h4>{rec.title}</h4>
                      <p>{rec.description}</p>
                      <div className="rec-meta">
                        <span className="category-badge">{rec.category}</span>
                        <span className="effort-badge">{rec.effort} effort</span>
                        <span className="timeline-badge">{rec.implementation}</span>
                      </div>
                    </div>
                    <span className={`priority-badge ${rec.priority}`}>{rec.priority.toUpperCase()}</span>
                  </div>
                  <div className="recommendation-impact">
                    <div className="impact-item savings">
                      <span className="impact-label">Monthly Savings</span>
                      <strong className="impact-value">{formatCedi(rec.estimatedSavings)}</strong>
                    </div>
                    <div className="impact-item co2">
                      <span className="impact-label">CO₂ Reduction</span>
                      <strong className="impact-value">{Math.round(rec.co2Reduction).toLocaleString()} kg</strong>
                    </div>
                    <div className="impact-item roi">
                      <span className="impact-label">Payback</span>
                      <strong className="impact-value">{rec.estimatedSavings > 0 ? (rec.estimatedSavings * 12 / rec.estimatedSavings).toFixed(1) : '—'} months</strong>
                    </div>
                  </div>
                  <div className="recommendation-actions">
                    <button className="btn btn-primary" onClick={() => onNotice?.(`Initiating: ${rec.title}`)}>
                      <i data-lucide="play" /> Implement
                    </button>
                    <button className="btn btn-secondary" onClick={() => onNotice?.(`Viewing details: ${rec.title}`)}>
                      <i data-lucide="eye" /> Details
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {filteredRecommendations.length === 0 && (
              <div className="empty-state success">
                <i data-lucide="check-circle" />
                <h3>No recommendations match the current filter</h3>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ev-transition' && (
          <div className="tab-content">
            <div className="ev-transition-overview">
              <div className="ev-progress">
                <h4>Electrification Progress</h4>
                <div className="progress-bar-large">
                  <div className="progress-fill-large" style={{ width: `${(energyData?.evCount || 0) / (energyData?.fleetSize || 1) * 100}%` }} />
                </div>
                <div className="progress-labels">
                  <span>Current: {energyData?.evCount || 0} EV</span>
                  <span>Target: {summary.evTarget}</span>
                </div>
              </div>

              <div className="ev-metrics">
                <article className="metric-card highlight">
                  <span className="metric-label">Total Investment</span>
                  <span className="metric-value">{formatCedi(evTransitionPlan?.totalInvestment || 0)}</span>
                </article>
                <article className="metric-card success">
                  <span className="metric-label">Annual Savings</span>
                  <span className="metric-value">{formatCedi(evTransitionPlan?.annualSavings || 0)}</span>
                </article>
                <article className="metric-card">
                  <span className="metric-label">Payback Period</span>
                  <span className="metric-value">{evTransitionPlan?.paybackPeriod || 0} years</span>
                </article>
                <article className="metric-card">
                  <span className="metric-label">Annual CO₂ Reduction</span>
                  <span className="metric-value">{evTransitionPlan?.co2ReductionAnnual?.toLocaleString() || 0} kg</span>
                </article>
              </div>
            </div>

            <h4>Transition Phases</h4>
            <div className="phases-list">
              {evTransitionPlan?.phases?.map((phase, i) => (
                <article key={i} className="phase-card panel">
                  <div className="phase-header">
                    <div>
                      <h5>Phase {phase.phase}: {phase.action}</h5>
                      <span className="phase-timeline">{phase.timeline}</span>
                    </div>
                    <div className="phase-investment">
                      <span>Investment: {formatCedi(phase.investment)}</span>
                      <span>Savings: {formatCedi(phase.savings)}/yr</span>
                    </div>
                  </div>
                  <div className="phase-progress">
                    <div className="progress-bar-small">
                      <div className="progress-fill-small" style={{ width: `${((i + 1) / (evTransitionPlan?.phases?.length || 1)) * 100}%` }} />
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="charging-infrastructure">
              <h4>Charging Infrastructure</h4>
              <div className="infra-grid">
                <article className="infra-card panel">
                  <h5>Charging Stations</h5>
                  <div className="infra-stat">
                    <span className="infra-value">{evTransitionPlan?.chargingInfrastructure?.needed || 0}</span>
                    <span className="infra-label">Needed</span>
                  </div>
                  <div className="infra-stat">
                    <span className="infra-value">{evTransitionPlan?.chargingInfrastructure?.existing || 0}</span>
                    <span className="infra-label">Existing</span>
                  </div>
                  <div className="infra-stat">
                    <span className="infra-value">{formatCedi(evTransitionPlan?.chargingInfrastructure?.cost || 0)}</span>
                    <span className="infra-label">Setup Cost</span>
                  </div>
                </article>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'carbon-footprint' && (
          <div className="tab-content">
            <div className="carbon-overview">
              <article className="carbon-card panel highlight">
                <div className="carbon-main">
                  <span className="carbon-value">{carbonFootprint?.totalCO2?.toLocaleString() || 0}</span>
                  <span className="carbon-unit">kg CO₂/month</span>
                </div>
                <div className="carbon-sub">
                  <span>{carbonFootprint?.co2PerKm || 0} kg/km</span>
                  <span>{carbonFootprint?.co2PerDelivery || 0} kg/delivery</span>
                </div>
              </article>

              <div className="carbon-targets">
                <h4>Net Zero Roadmap</h4>
                <div className="target-timeline">
                  <div className="target-item current">
                    <span className="target-year">2024</span>
                    <span className="target-progress">{carbonFootprint?.currentProgress || 0}%</span>
                    <span className="target-label">Current Progress</span>
                  </div>
                  <div className="target-item milestone">
                    <span className="target-year">2027</span>
                    <span className="target-progress">40%</span>
                    <span className="target-label">Fleet 40% Electric</span>
                  </div>
                  <div className="target-item milestone">
                    <span className="target-year">2030</span>
                    <span className="target-progress">70%</span>
                    <span className="target-label">Majority Electric</span>
                  </div>
                  <div className="target-item goal">
                    <span className="target-year">{carbonFootprint?.netZeroTarget || 2035}</span>
                    <span className="target-progress">100%</span>
                    <span className="target-label">Net Zero</span>
                  </div>
                </div>
              </div>
            </div>

            <h4>Emissions by Vehicle Type</h4>
            <div className="emissions-breakdown">
              {carbonFootprint?.breakdown?.map((item, i) => (
                <article key={i} className="emission-card panel">
                  <div className="emission-header">
                    <strong>{item.type.toUpperCase()}</strong>
                    <span className={`fuel-badge ${item.fuelType}`}>{item.fuelType.toUpperCase()}</span>
                  </div>
                  <div className="emission-stats">
                    <div className="stat"><span>CO₂:</span> <strong>{item.co2?.toLocaleString() || 0} kg</strong></div>
                    <div className="stat"><span>Share:</span> <strong>{item.percentage}%</strong></div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${item.percentage}%`, background: item.fuelType === 'electric' ? '#10b981' : item.fuelType === 'petrol' ? '#f59e0b' : '#ef4444' }} />
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <h4>Carbon Offset Projects</h4>
            <div className="offsets-grid">
              {carbonFootprint?.offsets?.map((offset, i) => (
                <article key={i} className={`offset-card panel ${offset.verified ? 'verified' : 'pending'}`}>
                  <div className="offset-header">
                    <h5>{offset.project}</h5>
                    <span className={`verified-badge ${offset.verified ? 'verified' : 'pending'}`}>
                      {offset.verified ? 'Verified' : 'Pending Verification'}
                    </span>
                  </div>
                  <div className="offset-stats">
                    <div><span>Offset:</span> <strong>{offset.tons} tons CO₂</strong></div>
                    <div><span>Cost:</span> <strong>{formatCedi(offset.cost)}</strong></div>
                    <div><span>Price/Ton:</span> <strong>{formatCedi(offset.cost / offset.tons)}</strong></div>
                  </div>
                  <button className="btn btn-primary" onClick={() => onNotice?.(`Purchasing offset: ${offset.project}`)}>
                    Purchase Offset
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'vehicles' && (
          <div className="tab-content">
            <h4>Vehicle Efficiency Details</h4>
            <div className="vehicle-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Type</th>
                    <th>Fuel</th>
                    <th>Distance (km)</th>
                    <th>Efficiency (km/L)</th>
                    <th>Fuel Cost</th>
                    <th>CO₂ (kg)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {energyData?.vehicleBreakdown?.map(v => (
                    <tr key={v.id}>
                      <td><strong>{v.type} x{v.count}</strong></td>
                      <td>{v.type}</td>
                      <td><span className={`fuel-badge ${v.fuelType}`}>{v.fuelType}</span></td>
                      <td>{v.totalDistance?.toLocaleString() || 0}</td>
                      <td>{v.avgEfficiency} km/L</td>
                      <td>{formatCedi(v.totalFuelCost)}</td>
                      <td>{v.co2Emissions?.toLocaleString() || 0}</td>
                      <td>
                        <span className={`status ${v.fuelType === 'electric' ? 'status-delivered' : v.avgEfficiency > 13 ? 'status-online' : v.avgEfficiency > 10 ? 'status-awaiting' : 'status-cancelled'}`}>
                          {v.fuelType === 'electric' ? 'OPTIMAL' : v.avgEfficiency > 13 ? 'GOOD' : v.avgEfficiency > 10 ? 'FAIR' : 'POOR'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{fleetDrivers.length} drivers · {vehicles.length || 'Default'} vehicles · {orders.length} orders</span>
      </div>
    </section>
  );
}