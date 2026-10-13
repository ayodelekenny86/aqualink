import React, { useState, useMemo } from 'react';
import { useSustainabilityTracking } from '../hooks/useSustainabilityTracking';

export default function SustainabilityTrackingPanel({ 
  orders = [], 
  qualityRecords = [], 
  sources = [], 
  fleetDrivers = [], 
  vehicles = [], 
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');

  const {
    sustainabilityData,
    waterFootprint,
    circularEconomy,
    sdgAlignment,
    certifications,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  } = useSustainabilityTracking({ orders, qualityRecords, sources, fleetDrivers, vehicles, onNotice });

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">SUSTAINABILITY TRACKING</span>
            <h2>AI-Powered Environmental & Social Impact</h2>
          </div>
        </div>
        <div className="loading">Calculating sustainability metrics...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">SUSTAINABILITY TRACKING</span>
          <h2>AI-Powered Environmental & Social Impact</h2>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="sustainability-summary">
        <article className="summary-card highlight">
          <div className="summary-icon"><i data-lucide="droplets" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.waterSaved?.toLocaleString() || 0} gal</p>
            <p className="summary-label">Water Saved vs Traditional</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="recycle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.plasticAvoided?.toLocaleString() || 0}</p>
            <p className="summary-label">Plastic Bottles Avoided</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="leaf" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.co2Reduced?.toLocaleString() || 0} kg</p>
            <p className="summary-label">CO₂ Reduced</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="check-circle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.qualityCompliance}%</p>
            <p className="summary-label">Quality Compliance</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="recycle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.containerReuseRate}%</p>
            <p className="summary-label">Container Reuse Rate</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="target" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.sdgProgress}%</p>
            <p className="summary-label">Avg SDG Progress</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="award" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.certifiedStandards}/{summary.totalSDGs}</p>
            <p className="summary-label">Certified Standards</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="flag" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.onTrackGoals}/{summary.totalSDGs}</p>
            <p className="summary-label">SDGs On Track</p>
          </div>
        </article>
      </div>

      <div className="sustainability-tabs">
        <div className="tab-nav">
          {['overview', 'water-footprint', 'circular-economy', 'sdg-alignment', 'certifications'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'water-footprint' ? 'Water Footprint' : tab === 'circular-economy' ? 'Circular Economy' : tab === 'sdg-alignment' ? 'SDG Alignment' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="overview-grid">
              <div className="overview-section">
                <h4>Environmental Impact Trend</h4>
                {waterFootprint?.monthlyTrend?.length > 0 ? (
                  <div className="trend-chart">
                    {waterFootprint.monthlyTrend.map(month => (
                      <div key={month.month} className="trend-bar" 
                        style={{ height: `${Math.max(10, (month.delivered / Math.max(...waterFootprint.monthlyTrend.map(m => m.delivered))) * 100)}%` }}
                        title={`${month.month}: ${month.delivered.toLocaleString()} gal delivered`}
                      >
                        <span className="trend-label">{month.month.slice(5)}</span>
                        <span className="trend-value">{month.lossRate.toFixed(1)}% loss</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-feed">No trend data available</p>
                )}
              </div>

              <div className="overview-section">
                <h4>Conservation Initiatives</h4>
                <div className="initiatives-list">
                  {waterFootprint?.conservationInitiatives?.map((init, i) => (
                    <article key={i} className="initiative-card panel">
                      <div className="initiative-header">
                        <h5>{init.name}</h5>
                        <span className={`status-badge ${init.status}`}>{init.status.toUpperCase()}</span>
                      </div>
                      <div className="initiative-stats">
                        <div><span>Projected Savings:</span> <strong>{init.savings?.toLocaleString() || 0} gal/mo</strong></div>
                        <div><span>Investment:</span> <strong>{formatCedi(init.investment)}</strong></div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="overview-section full-width">
                <h4>Key Sustainability Metrics</h4>
                <div className="metrics-grid">
                  <div className="metric-card highlight">
                    <span className="metric-label">Operational Efficiency</span>
                    <span className="metric-value">{sustainabilityData?.operationalEfficiency?.toFixed(1) || 0}%</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Communities Served</span>
                    <span className="metric-value">{sustainabilityData?.communitiesServed || 0}</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Waste per Delivery</span>
                    <span className="metric-value">{circularEconomy?.wasteManagement?.wastePerDelivery || 0} kg</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Recycling Rate</span>
                    <span className="metric-value">{circularEconomy?.wasteManagement?.recyclingRate || 0}%</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Landfill Diversion</span>
                    <span className="metric-value">{circularEconomy?.wasteManagement?.landfillDiversion || 0}%</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Container Loss Rate</span>
                    <span className="metric-value">{circularEconomy?.containerReuse?.containersLost / circularEconomy?.containerReuse?.totalContainers * 100 || 0}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'water-footprint' && (
          <div className="tab-content">
            <div className="water-footprint-grid">
              <div className="water-balance">
                <h4>Water Balance</h4>
                <div className="balance-cards">
                  <article className="balance-card withdrawn">
                    <span className="balance-label">Total Withdrawn</span>
                    <span className="balance-value">{waterFootprint?.totalWithdrawn?.toLocaleString() || 0} gal</span>
                  </article>
                  <article className="balance-card delivered">
                    <span className="balance-label">Total Delivered</span>
                    <span className="balance-value">{waterFootprint?.totalDelivered?.toLocaleString() || 0} gal</span>
                  </article>
                  <article className="balance-card loss">
                    <span className="balance-label">Loss Rate</span>
                    <span className="balance-value">{waterFootprint?.lossRate || 0}%</span>
                  </article>
                  <article className="balance-card saved">
                    <span className="balance-label">vs Traditional</span>
                    <span className="balance-value">{sustainabilityData?.waterSaved?.toLocaleString() || 0} gal saved</span>
                  </article>
                </div>
              </div>

              <h4>Source Breakdown</h4>
              <div className="source-footprint-table">
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Withdrawn</th>
                      <th>Delivered</th>
                      <th>Loss %</th>
                      <th>Quality Score</th>
                      <th>Sustainability Index</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waterFootprint?.sourceBreakdown?.map((src, i) => (
                      <tr key={i}>
                        <td>{src.source}</td>
                        <td>{src.withdrawn?.toLocaleString() || 0} gal</td>
                        <td>{src.delivered?.toLocaleString() || 0} gal</td>
                        <td>{src.lossRate || 0}%</td>
                        <td>{src.qualityScore?.toFixed(1) || 0}/100</td>
                        <td>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${src.sustainabilityIndex || 0}%`, background: src.sustainabilityIndex > 80 ? '#10b981' : src.sustainabilityIndex > 60 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <span>{src.sustainabilityIndex?.toFixed(0) || 0}/100</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'circular-economy' && (
          <div className="tab-content">
            <div className="circular-grid">
              <div className="circular-section">
                <h4>Container Lifecycle</h4>
                <div className="lifecycle-flow">
                  <div className="flow-step in-circulation">
                    <span className="flow-value">{circularEconomy?.containerReuse?.containersInCirculation?.toLocaleString() || 0}</span>
                    <span className="flow-label">In Circulation</span>
                  </div>
                  <div className="flow-arrow">→</div>
                  <div className="flow-step reused">
                    <span className="flow-value">{circularEconomy?.containerReuse?.reuseRate || 0}%</span>
                    <span className="flow-label">Reuse Rate</span>
                  </div>
                  <div className="flow-arrow">→</div>
                  <div className="flow-step recycled">
                    <span className="flow-value">{circularEconomy?.containerReuse?.containersRecycled?.toLocaleString() || 0}</span>
                    <span className="flow-label">Recycled</span>
                  </div>
                  <div className="flow-arrow">→</div>
                  <div className="flow-step lost">
                    <span className="flow-value">{circularEconomy?.containerReuse?.containersLost?.toLocaleString() || 0}</span>
                    <span className="flow-label">Lost</span>
                  </div>
                </div>

                <div className="progress-bar-large">
                  <div className="progress-fill-large" style={{ width: `${circularEconomy?.containerReuse?.reuseRate || 0}%` }} />
                </div>
                <div className="progress-labels">
                  <span>Current: {circularEconomy?.containerReuse?.reuseRate || 0}%</span>
                  <span>Target: {circularEconomy?.containerReuse?.targetReuseRate || 90}%</span>
                </div>
              </div>

              <div className="circular-section">
                <h4>Material Composition</h4>
                <div className="material-breakdown">
                  {Object.entries(circularEconomy?.materialFlow || {}).map(([material, percent]) => (
                    <div key={material} className="material-item">
                      <div className="material-bar">
                        <div className="material-fill" style={{ width: `${percent}%`, background: material === 'reused' ? '#10b981' : material === 'recycled' ? '#3b82f6' : material === 'bioBased' ? '#8b5cf6' : '#ef4444' }} />
                      </div>
                      <div className="material-label">
                        <span>{material.charAt(0).toUpperCase() + material.slice(1).replace('Content', ' Content')}</span>
                        <span>{percent}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel-divider" />
            <h4>Circular Initiatives</h4>
            <div className="circular-initiatives">
              {circularEconomy?.initiatives?.map((init, i) => (
                <article key={i} className={`initiative-card panel ${init.status}`}>
                  <div className="initiative-header">
                    <h5>{init.name}</h5>
                    <span className={`status-badge ${init.status}`}>{init.status.toUpperCase()}</span>
                  </div>
                  <div className="initiative-meta">
                    <span className={`impact-badge ${init.impact}`}>{init.impact.toUpperCase()} IMPACT</span>
                    <span className="participation">Participation: {init.participation}%</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'sdg-alignment' && (
          <div className="tab-content">
            <h4>UN Sustainable Development Goals Alignment</h4>
            <div className="sdg-grid">
              {sdgAlignment?.map(sdg => (
                <article key={sdg.goal} className={`sdg-card panel ${sdg.status}`}>
                  <div className="sdg-header">
                    <div className="sdg-icon">
                      <span className="sdg-number">{sdg.goal}</span>
                    </div>
                    <div>
                      <h5>SDG {sdg.goal}: {sdg.name}</h5>
                      <span className={`sdg-status ${sdg.status}`}>{sdg.status.replace('-', ' ').toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="sdg-progress">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${sdg.progress}%`, background: sdg.status === 'on-track' ? '#10b981' : sdg.status === 'accelerating' ? '#3b82f6' : '#f59e0b' }} />
                    </div>
                    <span>{sdg.progress}%</span>
                  </div>
                  <p className="sdg-target">{sdg.target}</p>
                  <div className="sdg-metrics">
                    {sdg.keyMetrics?.map((metric, i) => (
                      <span key={i} className="metric-tag">{metric}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="panel-divider" />
            <div className="sdg-summary">
              <h4>Overall SDG Performance</h4>
              <div className="sdg-summary-stats">
                <div className="summary-stat">
                  <span className="stat-value">{summary.sdgProgress}%</span>
                  <span className="stat-label">Average Progress</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-value">{summary.onTrackGoals}/{summary.totalSDGs}</span>
                  <span className="stat-label">Goals On Track</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-value">{sdgAlignment?.filter(s => s.status === 'accelerating').length || 0}</span>
                  <span className="stat-label">Accelerating</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-value">{sdgAlignment?.filter(s => s.status === 'needs-attention').length || 0}</span>
                  <span className="stat-label">Need Attention</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'certifications' && (
          <div className="tab-content">
            <h4>Sustainability Certifications & Standards</h4>
            <div className="certifications-grid">
              {certifications?.map((cert, i) => (
                <article key={i} className={`certification-card panel ${cert.status}`}>
                  <div className="cert-header">
                    <div className="cert-icon">
                      <i data-lucide={cert.status === 'certified' ? 'award' : cert.status === 'in-progress' ? 'clock' : cert.status === 'assessment' ? 'clipboard-check' : 'calendar'} />
                    </div>
                    <div>
                      <h5>{cert.name}</h5>
                      <span className="cert-category">{cert.category}</span>
                    </div>
                    <span className={`cert-status ${cert.status}`}>{cert.status.replace('-', ' ').toUpperCase()}</span>
                  </div>
                  <div className="cert-details">
                    <div><span>Auditor:</span> <strong>{cert.auditor}</strong></div>
                    <div><span>Scope:</span> <strong>{cert.scope}</strong></div>
                    <div><span>Expiry:</span> <strong>{cert.expiry}</strong></div>
                  </div>
                  <div className="cert-actions">
                    {cert.status === 'certified' && (
                      <button className="btn btn-secondary" onClick={() => onNotice?.(`Downloading ${cert.name} certificate`)}>
                        <i data-lucide="download" /> View Certificate
                      </button>
                    )}
                    {cert.status === 'in-progress' && (
                      <button className="btn btn-primary" onClick={() => onNotice?.(`Checking progress for ${cert.name}`)}>
                        <i data-lucide="refresh-cw" /> Check Progress
                      </button>
                    )}
                    {cert.status === 'assessment' && (
                      <button className="btn btn-primary" onClick={() => onNotice?.(`Starting assessment for ${cert.name}`)}>
                        <i data-lucide="play" /> Begin Assessment
                      </button>
                    )}
                    {cert.status === 'planned' && (
                      <button className="btn btn-secondary" onClick={() => onNotice?.(`Planning ${cert.name} certification`)}>
                        <i data-lucide="calendar" /> Schedule
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{orders.length} orders · {qualityRecords.length} quality records · {sources.length} sources · {fleetDrivers.length} drivers</span>
      </div>
    </section>
  );
}