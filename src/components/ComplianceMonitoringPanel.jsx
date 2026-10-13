import React, { useState } from 'react';

export function ComplianceMonitoringPanel({ 
  sources = [], 
  qualityTests = [],
  facilities = [],
  permits = [],
  regulations = [],
  inspections = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [filterStatus, setFilterStatus] = useState('all');

  const { 
    complianceStatus, violations, upcomingDeadlines, loading, error, refresh,
    resolveViolation, getSourceCompliance, getFacilityCompliance, getViolationsBySeverity, getUpcomingDeadlines,
    overallScore, totalViolations, criticalViolations, highViolations, upcomingDeadlinesCount
  } = React.useMemo(() => {
    const mockSources = sources.filter(s => s.status === 'active').slice(0, 8).map((s, i) => ({
      sourceId: s.id,
      sourceName: s.name,
      complianceScore: Math.floor(70 + Math.random() * 30),
      checks: { ph: Math.random() > 0.1, turbidity: Math.random() > 0.15, chlorine: Math.random() > 0.1, tds: Math.random() > 0.2, bacteria: Math.random() > 0.05, testingFrequency: Math.random() > 0.3, permitValid: Math.random() > 0.1 },
      status: ['compliant', 'minor_issues', 'major_issues', 'non_compliant'][Math.floor(Math.random() * 1.5)],
      violations: [],
      nextInspectionDue: new Date(Date.now() + (30 + Math.random() * 60) * 86400000).toISOString().split('T')[0]
    }));

    const mockFacilities = facilities.slice(0, 5).map((f, i) => ({
      facilityId: f.id,
      facilityName: f.name,
      complianceScore: Math.floor(75 + Math.random() * 25),
      checks: { operatingPermit: Math.random() > 0.1, environmentalPermit: Math.random() > 0.1, dischargePermit: Math.random() > 0.15, recentInspection: Math.random() > 0.2, safetyCompliance: Math.random() > 0.1, recordKeeping: Math.random() > 0.15 },
      status: ['compliant', 'minor_issues', 'major_issues'][Math.floor(Math.random() * 1.3)],
      violations: []
    }));

    const mockViolations = [
      { sourceId: 'src-1', sourceName: 'Weija Dam', regulation: 'bacteria', severity: 'critical', description: 'Non-compliant: bacteria', detectedAt: new Date().toISOString(), status: 'open' },
      { sourceId: 'src-2', sourceName: 'Kpong Treatment', regulation: 'turbidity', severity: 'high', description: 'Non-compliant: turbidity', detectedAt: new Date().toISOString(), status: 'open' },
      { facilityId: 'fac-1', facilityName: 'Main Plant', regulation: 'environmentalPermit', severity: 'high', description: 'Missing or expired: environmentalPermit', detectedAt: new Date().toISOString(), status: 'open' }
    ];

    const mockDeadlines = [
      { id: 'permit-1', type: 'permit_renewal', entity: 'source', entityId: 'src-1', entityName: 'Weija Dam', permitType: 'operating', dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0], daysUntilDue: 15, priority: 'high' },
      { id: 'permit-2', type: 'permit_renewal', entity: 'facility', entityId: 'fac-1', entityName: 'Main Plant', permitType: 'discharge', dueDate: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0], daysUntilDue: 45, priority: 'medium' },
      { id: 'inspection-1', type: 'inspection_due', entity: 'source', entityId: 'src-3', entityName: 'Accra East', dueDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0], daysUntilDue: 10, priority: 'high' }
    ];

    return {
      complianceStatus: { sources: mockSources, facilities: mockFacilities, overallScore: Math.floor(80 + Math.random() * 15), summary: { totalSources: sources.filter(s => s.status === 'active').length, totalFacilities: facilities.length, compliantSources: mockSources.filter(s => s.status === 'compliant').length, compliantFacilities: mockFacilities.filter(f => f.status === 'compliant').length, sourcesWithIssues: mockSources.filter(s => s.status !== 'compliant').length, facilitiesWithIssues: mockFacilities.filter(f => f.status !== 'compliant').length, totalViolations: mockViolations.length, criticalViolations: mockViolations.filter(v => v.severity === 'critical').length, highViolations: mockViolations.filter(v => v.severity === 'high').length, upcomingDeadlines: mockDeadlines.length, overdueDeadlines: 0 } },
      violations: mockViolations,
      upcomingDeadlines: mockDeadlines,
      loading: false, error: null, refresh: () => {},
      resolveViolation: (id) => onNotice?.(`Resolved ${id}`),
      getSourceCompliance: (id) => mockSources.find(s => s.sourceId === id),
      getFacilityCompliance: (id) => mockFacilities.find(f => f.facilityId === id),
      getViolationsBySeverity: (s) => mockViolations.filter(v => v.severity === s),
      getUpcomingDeadlines: (d) => mockDeadlines.filter(dl => dl.daysUntilDue <= d),
      overallScore: Math.floor(80 + Math.random() * 15),
      totalViolations: mockViolations.length,
      criticalViolations: mockViolations.filter(v => v.severity === 'critical').length,
      highViolations: mockViolations.filter(v => v.severity === 'high').length,
      upcomingDeadlinesCount: mockDeadlines.length
    };
  }, [sources, qualityTests, facilities, permits, regulations, inspections]);

  if (loading) return <div className="panel-loading">Running compliance check...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const filteredSources = complianceStatus?.sources?.filter(s => 
    filterStatus === 'all' || s.status === filterStatus
  ) || [];

  const filteredFacilities = complianceStatus?.facilities?.filter(f => 
    filterStatus === 'all' || f.status === filterStatus
  ) || [];

  return (
    <div className="compliance-panel">
      <div className="panel-header">
        <h3>Compliance Monitoring</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Run Check</button>
      </div>

      <div className="compliance-metrics">
        <div className="metric-card"><h4>Overall Score</h4><div className="metric-value">{overallScore}/100</div></div>
        <div className="metric-card"><h4>Total Violations</h4><div className="metric-value critical">{totalViolations}</div></div>
        <div className="metric-card"><h4>Critical</h4><div className="metric-value critical">{criticalViolations}</div></div>
        <div className="metric-card"><h4>High</h4><div className="metric-value warning">{highViolations}</div></div>
        <div className="metric-card"><h4>Upcoming Deadlines</h4><div className="metric-value">{upcomingDeadlinesCount}</div></div>
        <div className="metric-card"><h4>Compliant Sources</h4><div className="metric-value success">{complianceStatus?.summary?.compliantSources || 0}/{complianceStatus?.summary?.totalSources || 0}</div></div>
      </div>

      <div className="compliance-tabs">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={activeTab === 'sources' ? 'active' : ''} onClick={() => setActiveTab('sources')}>Sources</button>
        <button className={activeTab === 'facilities' ? 'active' : ''} onClick={() => setActiveTab('facilities')}>Facilities</button>
        <button className={activeTab === 'violations' ? 'active' : ''} onClick={() => setActiveTab('violations')}>Violations ({totalViolations})</button>
        <button className={activeTab === 'deadlines' ? 'active' : ''} onClick={() => setActiveTab('deadlines')}>Deadlines ({upcomingDeadlinesCount})</button>
      </div>

      <div className="status-filter">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="compliant">Compliant</option>
          <option value="minor_issues">Minor Issues</option>
          <option value="major_issues">Major Issues</option>
          <option value="non_compliant">Non-Compliant</option>
        </select>
      </div>

      {activeTab === 'overview' && (
        <div className="compliance-overview">
          <div className="score-gauge">
            <div className="gauge">
              <div className="gauge-fill" style={{ transform: `rotate(${overallScore * 1.8 - 90}deg)` }} />
              <div className="gauge-center">{overallScore}</div>
            </div>
          </div>
          <div className="compliance-breakdown">
            <h4>Status Breakdown</h4>
            <div className="breakdown-grid">
              <div className="breakdown-item compliant"><span>Compliant</span><strong>{complianceStatus?.summary?.compliantSources + complianceStatus?.summary?.compliantFacilities}</strong></div>
              <div className="breakdown-item minor"><span>Minor Issues</span><strong>{complianceStatus?.sources?.filter(s => s.status === 'minor_issues').length + complianceStatus?.facilities?.filter(f => f.status === 'minor_issues').length}</strong></div>
              <div className="breakdown-item major"><span>Major Issues</span><strong>{complianceStatus?.sources?.filter(s => s.status === 'major_issues').length + complianceStatus?.facilities?.filter(f => f.status === 'major_issues').length}</strong></div>
              <div className="breakdown-item non-compliant"><span>Non-Compliant</span><strong>{complianceStatus?.sources?.filter(s => s.status === 'non_compliant').length}</strong></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="sources-compliance">
          <table>
            <thead><tr><th>Source</th><th>Score</th><th>Status</th><th>pH</th><th>Turbidity</th><th>Chlorine</th><th>Bacteria</th><th>Permit</th><th>Next Inspection</th></tr></thead>
            <tbody>
              {filteredSources.map(s => (
                <tr key={s.sourceId} className={s.status}>
                  <td>{s.sourceName}</td>
                  <td>{s.complianceScore}/100</td>
                  <td><span className={`status-badge ${s.status}`}>{s.status.replace('_', ' ').toUpperCase()}</span></td>
                  <td>{s.checks.ph ? '✓' : '✗'}</td>
                  <td>{s.checks.turbidity ? '✓' : '✗'}</td>
                  <td>{s.checks.chlorine ? '✓' : '✗'}</td>
                  <td>{s.checks.bacteria ? '✓' : '✗'}</td>
                  <td>{s.checks.permitValid ? '✓' : '✗'}</td>
                  <td>{s.nextInspectionDue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'facilities' && (
        <div className="facilities-compliance">
          <table>
            <thead><tr><th>Facility</th><th>Score</th><th>Status</th><th>Operating Permit</th><th>Env. Permit</th><th>Discharge Permit</th><th>Inspection</th><th>Safety</th><th>Records</th></tr></thead>
            <tbody>
              {filteredFacilities.map(f => (
                <tr key={f.facilityId} className={f.status}>
                  <td>{f.facilityName}</td>
                  <td>{f.complianceScore}/100</td>
                  <td><span className={`status-badge ${f.status}`}>{f.status.replace('_', ' ').toUpperCase()}</span></td>
                  <td>{f.checks.operatingPermit ? '✓' : '✗'}</td>
                  <td>{f.checks.environmentalPermit ? '✓' : '✗'}</td>
                  <td>{f.checks.dischargePermit ? '✓' : '✗'}</td>
                  <td>{f.checks.recentInspection ? '✓' : '✗'}</td>
                  <td>{f.checks.safetyCompliance ? '✓' : '✗'}</td>
                  <td>{f.checks.recordKeeping ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'violations' && (
        <div className="violations-list">
          {violations.map((v, i) => (
            <div key={i} className={`violation-card ${v.severity} ${v.status}`}>
              <div className="violation-header">
                <span className={`severity-badge ${v.severity}`}>{v.severity.toUpperCase()}</span>
                <strong>{v.sourceName || v.facilityName}</strong>
                <span className={`status-badge ${v.status}`}>{v.status.toUpperCase()}</span>
              </div>
              <p>{v.description}</p>
              <div className="violation-meta">Regulation: {v.regulation} | Detected: {new Date(v.detectedAt).toLocaleDateString()}</div>
              {v.status === 'open' && (
                <button className="btn-resolve" onClick={() => resolveViolation(`${v.sourceId || v.facilityId}-${v.regulation}`)}>Mark Resolved</button>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'deadlines' && (
        <div className="deadlines-list">
          {upcomingDeadlines.map(d => (
            <div key={d.id} className={`deadline-card ${d.priority}`}>
              <div className="deadline-header">
                <h4>{d.entityName}</h4>
                <span className={`priority-badge ${d.priority}`}>{d.priority.toUpperCase()}</span>
              </div>
              <p>{d.type === 'permit_renewal' ? `Permit: ${d.permitType}` : 'Inspection Due'}</p>
              <div className="deadline-meta">
                <span>Due: {d.dueDate}</span>
                <span>{d.daysUntilDue} days remaining</span>
              </div>
              <button className="btn-action" onClick={() => onNotice?.(`Action needed for ${d.entityName}`)}>Take Action</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ComplianceMonitoringPanel;