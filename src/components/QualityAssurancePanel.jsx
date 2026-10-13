import React, { useState, useMemo } from 'react';
import { useQualityAssurance } from '../hooks/useQualityAssurance';

export default function QualityAssurancePanel({ 
  qualityRecords = [], 
  sources = [], 
  orders = [], 
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedSource, setSelectedSource] = useState(null);
  const [showAddRecord, setShowAddRecord] = useState(false);

  const {
    sourceAnalysis,
    compliance,
    alerts,
    certificates,
    summary,
    loading,
    lastUpdated,
    refresh,
    addQualityRecord,
    formatCedi,
  } = useQualityAssurance({ qualityRecords, sources, orders, onNotice });

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">QUALITY ASSURANCE</span>
            <h2>AI-Powered Water Quality Compliance</h2>
          </div>
        </div>
        <div className="loading">Analyzing water quality data...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">QUALITY ASSURANCE</span>
          <h2>AI-Powered Water Quality Compliance</h2>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setShowAddRecord(true)}>
            <i data-lucide="plus" /> Add Test Record
          </button>
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="quality-summary">
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="droplets" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.sourcesMonitored}</p>
            <p className="summary-label">Sources Monitored</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="check-circle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.totalTests}</p>
            <p className="summary-label">Total Tests</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="award" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.complianceRate}%</p>
            <p className="summary-label">Compliance Rate</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="star" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.avgScore}/100</p>
            <p className="summary-label">Avg Quality Score</p>
          </div>
        </article>
        <article className="summary-card critical">
          <div className="summary-icon"><i data-lucide="alert-triangle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.criticalAlerts}</p>
            <p className="summary-label">Critical Alerts</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="alert-circle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.highRiskSources}</p>
            <p className="summary-label">High Risk Sources</p>
          </div>
        </article>
      </div>

      <div className="quality-tabs">
        <div className="tab-nav">
          {['overview', 'sources', 'compliance', 'certificates', 'alerts'].map(tab => (
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
            <div className="overview-grid">
              <div className="overview-section">
                <h4>Source Classifications</h4>
                <div className="classification-chart">
                  <div className="classification-item excellent">
                    <span className="class-label">Excellent</span>
                    <span className="class-value">{summary.excellent}</span>
                  </div>
                  <div className="classification-item good">
                    <span className="class-label">Good</span>
                    <span className="class-value">{summary.good}</span>
                  </div>
                  <div className="classification-item fair">
                    <span className="class-label">Fair</span>
                    <span className="class-value">{summary.fair}</span>
                  </div>
                  <div className="classification-item poor">
                    <span className="class-label">Poor</span>
                    <span className="class-value">{summary.poor}</span>
                  </div>
                  <div className="classification-item critical">
                    <span className="class-label">Critical</span>
                    <span className="class-value">{summary.critical}</span>
                  </div>
                </div>
              </div>
              
              <div className="overview-section">
                <h4>Top Risk Sources</h4>
                {sourceAnalysis.filter(s => s.needsAttention).slice(0, 5).map(source => (
                  <div key={source.source} className="risk-source-item">
                    <div>
                      <strong>{source.source}</strong>
                      <span className={`classification ${source.classification}`}>{source.classification.toUpperCase()}</span>
                    </div>
                    <div>
                      <span>{source.overallPassRate}% pass</span>
                      <button className="btn btn-sm btn-secondary" onClick={() => setSelectedSource(source.source)}>Details</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sources' && (
          <div className="tab-content">
            <div className="source-grid">
              {sourceAnalysis.map(source => (
                <article key={source.source} className={`source-card panel ${source.classification}`} onClick={() => setSelectedSource(source.source)}>
                  <div className="source-header">
                    <div>
                      <strong>{source.source}</strong>
                      <small>{source.totalTests} tests · Last: {source.lastTest ? new Date(source.lastTest).toLocaleDateString() : 'Never'}</small>
                    </div>
                    <span className={`classification-badge ${source.classification}`}>
                      {source.classification.toUpperCase()} ({source.overallPassRate}%)
                    </span>
                  </div>
                  <div className="source-stats">
                    <div className="stat-row">
                      <span className="stat-label">Score</span>
                      <div className="score-bar">
                        <div className="score-fill" style={{ width: `${source.score}%` }} />
                        <span>{source.score}/100</span>
                      </div>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Tests (30d)</span>
                      <span className="stat-value">{source.recentTests}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Critical Failures</span>
                      <span className="stat-value">{source.criticalFailures}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Days Since Test</span>
                      <span className="stat-value">{source.daysSinceLastTest}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Testing Freq.</span>
                      <span className="stat-value">{source.testingFrequency} days</span>
                    </div>
                    {source.needsAttention && (
                      <div className="attention-banner">
                        <i data-lucide="alert-triangle" /> Requires attention
                      </div>
                    )}
                  </div>
                  <div className="source-params">
                    {Object.entries(source.paramStats).slice(0, 4).map(([param, stats]) => (
                      <div key={param} className={`param-item ${stats.status}`}>
                        <span>{param.toUpperCase()}</span>
                        <strong>{stats.avg} {stats.count > 0 ? WHO_STANDARDS[param]?.unit || '' : ''}</strong>
                        <span className={`param-status ${stats.status}`}>{stats.passRate}%</span>
                      </div>
                    ))}
                    {Object.keys(source.paramStats).length > 4 && (
                      <span className="more-params">+{Object.keys(source.paramStats).length - 4} more parameters</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="tab-content">
            <h4>Parameter Compliance (WHO Standards)</h4>
            <div className="compliance-table">
              <table>
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Standard Range</th>
                    <th>Tests</th>
                    <th>Pass Rate</th>
                    <th>Avg Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(compliance).map(([param, data]) => (
                    <tr key={param}>
                      <td>{param.toUpperCase()}</td>
                      <td>{data.standard.min} - {data.standard.max} {data.standard.unit}</td>
                      <td>{data.totalTests}</td>
                      <td><div className="progress-bar"><div className="progress-fill" style={{ width: `${data.passRate}%` }} /><span>{data.passRate}%</span></div></td>
                      <td>{data.avgValue} {data.standard.unit}</td>
                      <td><span className={`status ${data.passRate >= 95 ? 'status-delivered' : data.passRate >= 80 ? 'status-online' : data.passRate >= 60 ? 'status-awaiting' : 'status-cancelled'}`}>{data.passRate >= 95 ? 'Excellent' : data.passRate >= 80 ? 'Good' : data.passRate >= 60 ? 'Fair' : 'Poor'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'certificates' && (
          <div className="tab-content">
            {certificates.length === 0 ? (
              <div className="empty-state">
                <i data-lucide="award" />
                <h3>No compliance certificates</h3>
                <p>Sources with Excellent/Good ratings qualify for certificates</p>
              </div>
            ) : (
              <div className="certificate-grid">
                {certificates.map(cert => (
                  <article key={cert.certificateId} className="certificate-card panel">
                    <div className="cert-header">
                      <div className="cert-badge">{cert.classification.toUpperCase()}</div>
                      <div>
                        <h4>{cert.source}</h4>
                        <span>Score: {cert.averageScore}% · Tests: {cert.testsPerformed}</span>
                      </div>
                    </div>
                    <div className="cert-details">
                      <div><span>Period:</span> {cert.period.start} to {cert.period.end}</div>
                      <div><span>Valid Until:</span> {cert.validUntil}</div>
                      <div><span>Issued By:</span> {cert.issuedBy}</div>
                    </div>
                    <div className="cert-actions">
                      <button className="btn btn-primary" onClick={() => onNotice?.(`Certificate ${cert.certificateId} downloaded`)}>
                        <i data-lucide="download" /> Download
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="tab-content">
            {alerts.length === 0 ? (
              <div className="empty-state success">
                <i data-lucide="check-circle" />
                <h3>No active alerts</h3>
                <p>All water sources are within compliance standards</p>
              </div>
            ) : (
              <div className="alerts-list">
                {alerts.slice(0, 20).map(alert => (
                  <article key={alert.id} className={`alert-card ${alert.severity}`}>
                    <div className="alert-header">
                      <div>
                        <h4>{alert.source}</h4>
                        <span className="alert-type">{alert.message}</span>
                      </div>
                      <span className={`severity-badge ${alert.severity}`}>{alert.severity.toUpperCase()}</span>
                    </div>
                    <div className="alert-meta">
                      <small>Type: {alert.type.replace('_', ' ')} · {new Date(alert.date).toLocaleString()}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedSource && (
          <div className="tab-content source-detail">
            <button className="close-detail" onClick={() => setSelectedSource(null)}>← Back</button>
            {(() => {
              const source = sourceAnalysis.find(s => s.source === selectedSource);
              if (!source) return <div>Source not found</div>;
              return (
                <div className="source-detail-view">
                  <div className="source-profile">
                    <div className="profile-header">
                      <div className="avatar">{source.source.charAt(0)}</div>
                      <div>
                        <h3>{source.source}</h3>
                        <span className={`classification-badge ${source.classification}`}>{source.classification.toUpperCase()}</span>
                      </div>
                      <div className="profile-score">
                        <div className="score-circle" style={{ background: `conic-gradient(${source.classification === 'excellent' ? '#10b981' : source.classification === 'good' ? '#3b82f6' : source.classification === 'fair' ? '#f59e0b' : '#ef4444'} ${source.score * 3.6}deg, #e5e7eb 0deg)` }}>
                          <span>{source.score}</span>
                        </div>
                        <p>Quality Score</p>
                      </div>
                    </div>
                    
                    <div className="metric-grid">
                      <div className="metric-card">
                        <span className="metric-value">{source.overallPassRate}%</span>
                        <span className="metric-label">Pass Rate</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{source.totalTests}</span>
                        <span className="metric-label">Total Tests</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{source.criticalFailures}</span>
                        <span className="metric-label">Critical Failures</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{source.daysSinceLastTest} days</span>
                        <span className="metric-label">Since Last Test</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{source.testingFrequency} days</span>
                        <span className="metric-label">Test Frequency</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{source.recentTests}</span>
                        <span className="metric-label">Tests (30d)</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="params-section">
                    <h4>Parameter Details</h4>
                    <div className="params-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Parameter</th>
                            <th>Avg</th>
                            <th>Min</th>
                            <th>Max</th>
                            <th>Pass Rate</th>
                            <th>Trend</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(source.paramStats).map(([param, stats]) => (
                            <tr key={param}>
                              <td>{param.toUpperCase()}</td>
                              <td>{stats.avg} {WHO_STANDARDS[param]?.unit || ''}</td>
                              <td>{stats.min} {WHO_STANDARDS[param]?.unit || ''}</td>
                              <td>{stats.max} {WHO_STANDARDS[param]?.unit || ''}</td>
                              <td><div className="progress-bar"><div className="progress-fill" style={{ width: `${stats.passRate}%` }} /><span>{stats.passRate}%</span></div></td>
                              <td><span className={`trend ${stats.trend}`}>{stats.trend}</span></td>
                              <td><span className={`status ${stats.status === 'excellent' ? 'status-delivered' : stats.status === 'good' ? 'status-online' : stats.status === 'fair' ? 'status-awaiting' : 'status-cancelled'}`}>{stats.status.toUpperCase()}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {showAddRecord && (
          <div className="tab-content add-record-form">
            <button className="close-detail" onClick={() => setShowAddRecord(false)}>← Cancel</button>
            <h4>Add Water Quality Test Record</h4>
            <form className="quality-form panel" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const parameters = {};
              Object.keys(WHO_STANDARDS).forEach(key => {
                if (formData.get(key)) parameters[key] = formData.get(key);
              });
              addQualityRecord({
                source: formData.get('source'),
                parameters,
              });
              setShowAddRecord(false);
              e.target.reset();
            }}>
              <div className="form-row">
                <label>Source<select name="source" required>
                  {sources.length > 0 ? sources.map(s => <option key={s} value={s}>{s}</option>) : 
                   [...new Set(qualityRecords.map(r => r.source))].map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="new">New Source...</option>
                </select></label>
              </div>
              <div className="form-row">
                {Object.entries(WHO_STANDARDS).map(([param, std]) => (
                  <label key={param}>{param.toUpperCase()} ({std.unit})<input name={param} type="number" step="0.1" placeholder={`${std.min}-${std.max}`} /></label>
                ))}
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">Add Record</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddRecord(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{qualityRecords.length} quality records</span>
      </div>
    </section>
  );
}

const WHO_STANDARDS = {
  ph: { min: 6.5, max: 8.5, unit: 'pH' },
  turbidity: { min: 0, max: 5, unit: 'NTU' },
  chlorine: { min: 0.2, max: 0.5, unit: 'mg/L' },
  coliform: { min: 0, max: 0, unit: 'CFU/100ml' },
  ecoli: { min: 0, max: 0, unit: 'CFU/100ml' },
  tds: { min: 0, max: 600, unit: 'mg/L' },
  hardness: { min: 0, max: 200, unit: 'mg/L CaCO3' },
};