import React, { useState } from 'react';

export function RevenueLeakDetectionPanel({ 
  orders = [], 
  payments = [],
  invoices = [],
  deliveries = [],
  customers = [],
  pricing = {},
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');

  const { 
    leaks, loading, error, refresh,
    getLeaksByType, getLeaksBySeverity, markLeakResolved, getTotalRecoverable,
    totalEstimatedLoss, criticalCount, highCount, totalLeaks
  } = React.useMemo(() => {
    const mockLeaks = [
      { id: 'leak-unpaid', type: 'unpaid_invoices', severity: 'critical', title: 'Unpaid/Overdue Invoices', description: '47 invoices totaling GH₵125,000 unpaid', estimatedLoss: 125000, count: 47, recommendations: ['Send payment reminders', 'Escalate to collections', 'Offer payment plans'], detectedAt: new Date().toISOString() },
      { id: 'leak-partial', type: 'partial_delivery', severity: 'high', title: 'Partial Deliveries Not Billed', description: '23 deliveries with 15,000 gal shortfall', estimatedLoss: 45000, count: 23, recommendations: ['Bill for actual volume', 'Investigate discrepancies', 'Update confirmation process'], detectedAt: new Date().toISOString() },
      { id: 'leak-pricing', type: 'pricing_errors', severity: 'high', title: 'Pricing Discrepancies', description: '12 orders with pricing deviations >10%', estimatedLoss: 18500, count: 12, recommendations: ['Audit pricing rules', 'Validate calculations', 'Implement auto-validation'], detectedAt: new Date().toISOString() },
      { id: 'leak-payments', type: 'failed_payments', severity: 'critical', title: 'Failed/Declined Payments', description: '18 failed payments totaling GH₵32,000', estimatedLoss: 32000, count: 18, recommendations: ['Retry payments', 'Contact customers', 'Update payment methods'], detectedAt: new Date().toISOString() },
      { id: 'leak-unbilled', type: 'unbilled_deliveries', severity: 'medium', title: 'Delivered but Unbilled Orders', description: '8 delivered orders without invoices', estimatedLoss: 12000, count: 8, recommendations: ['Auto-generate invoices', 'Reconcile deliveries', 'Set up billing alerts'], detectedAt: new Date().toISOString() },
      { id: 'leak-sub-1', type: 'subscription_underbilling', severity: 'medium', title: 'Subscription Underbilling: Kwame Ent.', description: 'Expected GH₵5,000/mo, billing GH₵3,800/mo', estimatedLoss: 14400, count: 1, recommendations: ['Review subscription terms', 'Update billing config', 'Contact customer'], detectedAt: new Date().toISOString() }
    ];

    return {
      leaks: { leaks: mockLeaks, summary: { totalLeaks: mockLeaks.length, totalEstimatedLoss: mockLeaks.reduce((s, l) => s + l.estimatedLoss, 0), criticalCount: mockLeaks.filter(l => l.severity === 'critical').length, highCount: mockLeaks.filter(l => l.severity === 'high').length, mediumCount: mockLeaks.filter(l => l.severity === 'medium').length, lowCount: mockLeaks.filter(l => l.severity === 'low').length, byType: mockLeaks.reduce((acc, l) => { acc[l.type] = (acc[l.type] || 0) + 1; return acc; }, {}), topLeaks: mockLeaks.sort((a, b) => b.estimatedLoss - a.estimatedLoss).slice(0, 5) } },
      loading: false, error: null, refresh: () => {},
      getLeaksByType: (t) => mockLeaks.filter(l => l.type === t),
      getLeaksBySeverity: (s) => mockLeaks.filter(l => l.severity === s),
      markLeakResolved: (id) => onNotice?.(`Resolved ${id}`),
      getTotalRecoverable: () => mockLeaks.filter(l => !l.resolved).reduce((s, l) => s + l.estimatedLoss, 0),
      totalEstimatedLoss: mockLeaks.reduce((s, l) => s + l.estimatedLoss, 0),
      criticalCount: mockLeaks.filter(l => l.severity === 'critical').length,
      highCount: mockLeaks.filter(l => l.severity === 'high').length,
      totalLeaks: mockLeaks.length
    };
  }, [orders, payments, invoices, deliveries, customers, pricing]);

  if (loading) return <div className="panel-loading">Detecting revenue leaks...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const filteredLeaks = leaks?.leaks?.filter(l => 
    (filterSeverity === 'all' || l.severity === filterSeverity) &&
    (activeTab === 'all' || l.type === activeTab)
  ) || [];

  const tabs = ['all', ...new Set(leaks?.leaks?.map(l => l.type))];

  return (
    <div className="revenue-leak-panel">
      <div className="panel-header">
        <h3>Revenue Leak Detection</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Scan Again</button>
      </div>

      <div className="leak-metrics">
        <div className="metric-card"><h4>Total Leaks</h4><div className="metric-value">{totalLeaks}</div></div>
        <div className="metric-card"><h4>Estimated Loss</h4><div className="metric-value critical">GH₵{totalEstimatedLoss.toLocaleString()}</div></div>
        <div className="metric-card"><h4>Critical</h4><div className="metric-value critical">{criticalCount}</div></div>
        <div className="metric-card"><h4>High</h4><div className="metric-value warning">{highCount}</div></div>
        <div className="metric-card"><h4>Recoverable</h4><div className="metric-value success">GH₵{getTotalRecoverable().toLocaleString()}</div></div>
      </div>

      <div className="leak-tabs">
        {tabs.map(tab => (
          <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {tab === 'all' ? 'All Leaks' : tab.replace('_', ' ').toUpperCase()}
          </button>
        ))}
      </div>

      <div className="severity-filter">
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div className="leaks-list">
        {filteredLeaks.map(leak => (
          <div key={leak.id} className={`leak-card ${leak.severity} ${leak.resolved ? 'resolved' : ''}`}>
            <div className="leak-header">
              <div>
                <h4>{leak.title}</h4>
                <p>{leak.description}</p>
              </div>
              <div className="leak-severity">
                <span className={`severity-badge ${leak.severity}`}>{leak.severity.toUpperCase()}</span>
                <div className="leak-loss">GH₵{leak.estimatedLoss.toLocaleString()}</div>
              </div>
            </div>
            <div className="leak-details">
              <span>Type: {leak.type.replace('_', ' ')}</span>
              <span>Count: {leak.count}</span>
              <span>Detected: {new Date(leak.detectedAt).toLocaleDateString()}</span>
            </div>
            <div className="leak-recommendations">
              {leak.recommendations?.map((r, i) => (
                <span key={i} className="rec-tag">{r}</span>
              ))}
            </div>
            <div className="leak-actions">
              {!leak.resolved && (
                <button className="btn-resolve" onClick={() => markLeakResolved(leak.id)}>Mark Resolved</button>
              )}
              {leak.resolved && <span className="resolved-badge">✓ Resolved</span>}
              <button className="btn-investigate" onClick={() => onNotice?.(`Investigating ${leak.title}`)}>Investigate</button>
            </div>
          </div>
        ))}
      </div>

      {filteredLeaks.length === 0 && (
        <div className="no-leaks">No leaks detected with current filters</div>
      )}

      <div className="leak-summary-by-type">
        <h4>Leaks by Type</h4>
        <div className="type-breakdown">
          {Object.entries(leaks?.summary?.byType || {}).map(([type, count]) => (
            <div key={type} className="type-item">
              <span>{type.replace('_', ' ')}</span>
              <span>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RevenueLeakDetectionPanel;