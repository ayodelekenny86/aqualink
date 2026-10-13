import React from 'react';

export function ComplianceMonitoringPanel({ 
  permits = [], 
  inspections = [], 
  regulations = [],
  facilities = [],
  onNotice 
}) {
  const { 
    status, loading, error, refresh,
    overallScore, criticalAlerts, highAlerts, summary 
  } = React.useMemo(() => {
    const now = new Date();
    
    const permitStatus = permits.map(permit => {
      const expiry = new Date(permit.expiryDate);
      const daysUntilExpiry = Math.ceil((expiry - now) / (24 * 60 * 60 * 1000));
      return {
        ...permit,
        daysUntilExpiry,
        status: daysUntilExpiry < 0 ? 'expired' : daysUntilExpiry <= 30 ? 'expiring' : 'valid'
      };
    });

    const inspectionStatus = inspections.map(inspection => {
      const dueDate = new Date(inspection.dueDate);
      const daysUntilDue = Math.ceil((dueDate - now) / (24 * 60 * 60 * 1000));
      return {
        ...inspection,
        daysUntilDue,
        status: daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 14 ? 'due_soon' : 'scheduled'
      };
    });

    const alerts = [
      ...permitStatus.filter(p => p.status === 'expired').map(p => ({
        severity: 'critical', title: `Permit Expired: ${p.name}`, message: `Expired ${Math.abs(p.daysUntilExpiry)} days ago`
      })),
      ...permitStatus.filter(p => p.status === 'expiring').map(p => ({
        severity: 'high', title: `Permit Expiring: ${p.name}`, message: `Expires in ${p.daysUntilExpiry} days`
      })),
      ...inspectionStatus.filter(i => i.status === 'overdue').map(i => ({
        severity: 'critical', title: `Inspection Overdue: ${i.type}`, message: `${i.type} at ${i.facilityName} overdue ${Math.abs(i.daysUntilDue)} days`
      })),
      ...inspectionStatus.filter(i => i.status === 'due_soon').map(i => ({
        severity: 'high', title: `Inspection Due: ${i.type}`, message: `Due in ${i.daysUntilDue} days at ${i.facilityName}`
      }))
    ];

    const score = Math.max(0, 100 - (
      permitStatus.filter(p => p.status === 'expired').length * 20 +
      permitStatus.filter(p => p.status === 'expiring').length * 5 +
      inspectionStatus.filter(i => i.status === 'overdue').length * 15 +
      inspectionStatus.filter(i => i.status === 'due_soon').length * 3
    ));

    return {
      status: { permits: permitStatus, inspections: inspectionStatus },
      loading: false, error: null, refresh: () => {},
      overallScore: score,
      criticalAlerts: alerts.filter(a => a.severity === 'critical'),
      highAlerts: alerts.filter(a => a.severity === 'high'),
      summary: {
        totalPermits: permits.length,
        validPermits: permitStatus.filter(p => p.status === 'valid').length,
        expiringPermits: permitStatus.filter(p => p.status === 'expiring').length,
        expiredPermits: permitStatus.filter(p => p.status === 'expired').length,
        totalInspections: inspections.length,
        overdueInspections: inspectionStatus.filter(i => i.status === 'overdue').length,
        dueSoonInspections: inspectionStatus.filter(i => i.status === 'due_soon').length
      }
    };
  }, [permits, inspections, regulations, facilities]);

  if (loading) return <div className="panel-loading">Checking compliance...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="compliance-panel">
      <div className="panel-header">
        <h3>Compliance Monitoring</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="compliance-score">
        <div className={`score-circle ${overallScore >= 80 ? 'good' : overallScore >= 60 ? 'warning' : 'critical'}`}>
          <span className="score-value">{overallScore}</span>
          <span className="score-label">/100</span>
        </div>
        <div className="score-details">
          <h4>Overall Compliance Score</h4>
          <p>{overallScore >= 80 ? 'Excellent' : overallScore >= 60 ? 'Needs Attention' : 'Critical'}</p>
        </div>
      </div>

      <div className="compliance-summary">
        <div className="summary-card permits">
          <h4>Permits</h4>
          <div className="summary-stats">
            <span className="valid">✓ {summary.validPermits} Valid</span>
            <span className="expiring">⏳ {summary.expiringPermits} Expiring</span>
            <span className="expired">✗ {summary.expiredPermits} Expired</span>
          </div>
        </div>
        <div className="summary-card inspections">
          <h4>Inspections</h4>
          <div className="summary-stats">
            <span className="scheduled">📅 {summary.totalInspections - summary.overdueInspections - summary.dueSoonInspections} Scheduled</span>
            <span className="due">⏰ {summary.dueSoonInspections} Due Soon</span>
            <span className="overdue">🔴 {summary.overdueInspections} Overdue</span>
          </div>
        </div>
      </div>

      {(criticalAlerts.length > 0 || highAlerts.length > 0) && (
        <div className="compliance-alerts">
          <h4>⚠ Compliance Alerts</h4>
          {criticalAlerts.map((alert, i) => (
            <div key={i} className="alert critical">
              <strong>{alert.title}</strong>: {alert.message}
            </div>
          ))}
          {highAlerts.map((alert, i) => (
            <div key={i} className="alert high">
              <strong>{alert.title}</strong>: {alert.message}
            </div>
          ))}
        </div>
      )}

      <div className="permits-table">
        <h4>Permit Status</h4>
        <table>
          <thead>
            <tr><th>Permit</th><th>Type</th><th>Expiry</th><th>Days Left</th><th>Status</th></tr>
          </thead>
          <tbody>
            {status?.permits?.map(p => (
              <tr key={p.id} className={p.status}>
                <td>{p.name}</td>
                <td>{p.type}</td>
                <td>{new Date(p.expiryDate).toLocaleDateString()}</td>
                <td>{p.daysUntilExpiry}</td>
                <td><span className={`status-badge ${p.status}`}>{p.status.toUpperCase()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="inspections-table">
        <h4>Inspection Schedule</h4>
        <table>
          <thead>
            <tr><th>Facility</th><th>Type</th><th>Due Date</th><th>Days Left</th><th>Status</th></tr>
          </thead>
          <tbody>
            {status?.inspections?.map(i => (
              <tr key={i.id} className={i.status}>
                <td>{i.facilityName}</td>
                <td>{i.type}</td>
                <td>{new Date(i.dueDate).toLocaleDateString()}</td>
                <td>{i.daysUntilDue}</td>
                <td><span className={`status-badge ${i.status}`}>{i.status.replace('_', ' ').toUpperCase()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ComplianceMonitoringPanel;