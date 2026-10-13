import React, { useState } from 'react';

export function CustomerLifetimeValuePanel({ 
  customers = [], 
  orders = [], 
  payments = [],
  subscriptions = [],
  interactions = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('segments');
  const [filterSegment, setFilterSegment] = useState('all');

  const { 
    segments, clvAnalysis, loading, error, refresh,
    getCustomerCLV,
    getHighValueCustomers,
    getChurnRiskCustomers,
    getRetentionRecommendations,
    summary,
    topCustomers,
    churnRiskCount
  } = React.useMemo(() => {
    const mockCustomers = customers.slice(0, 15).map((c, i) => {
      const totalOrders = Math.floor(5 + Math.random() * 50);
      const avgOrderValue = Math.round((50 + Math.random() * 300) * 100) / 100;
      const frequency = Math.round((0.5 + Math.random() * 3) * 10) / 10;
      const tenureMonths = Math.floor(1 + Math.random() * 36);
      const clv = avgOrderValue * frequency * 12 * (1 + tenureMonths / 12);
      const churnProbability = Math.random() * 0.4;
      
      return {
        customerId: c.id || `cust-${i}`,
        customerName: c.name || `Customer ${i + 1}`,
        type: c.type || ['residential', 'commercial', 'industrial'][Math.floor(Math.random() * 3)],
        segment: clv > 50000 ? 'champion' : clv > 20000 ? 'loyal' : clv > 5000 ? 'potential' : 'at_risk',
        totalOrders,
        totalSpent: Math.round(totalOrders * avgOrderValue * 100) / 100,
        avgOrderValue,
        frequency,
        tenureMonths,
        clv: Math.round(clv * 100) / 100,
        predictedCLV: Math.round(clv * (1.1 + Math.random() * 0.3) * 100) / 100,
        churnProbability: Math.round(churnProbability * 100) / 100,
        churnRisk: churnProbability > 0.3 ? 'high' : churnProbability > 0.15 ? 'medium' : 'low',
        lastOrderDate: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString().split('T')[0],
        preferredProducts: ['Bulk Water', 'Express Delivery'].slice(0, Math.floor(1 + Math.random() * 2)),
        paymentReliability: Math.round((0.7 + Math.random() * 0.3) * 100),
        engagementScore: Math.floor(30 + Math.random() * 70),
        revenueContribution: 0,
        retentionActions: []
      };
    });

    const totalRevenue = mockCustomers.reduce((s, c) => s + c.totalSpent, 0);
    mockCustomers.forEach(c => { c.revenueContribution = Math.round((c.totalSpent / totalRevenue) * 10000) / 100; });

    const segmentCounts = {};
    mockCustomers.forEach(c => { segmentCounts[c.segment] = (segmentCounts[c.segment] || 0) + 1; });

    const mockRetentionRecommendations = mockCustomers
      .filter(c => c.churnRisk === 'high' || c.segment === 'at_risk')
      .slice(0, 5)
      .map(c => ({
        customerId: c.customerId,
        customerName: c.customerName,
        priority: c.churnRisk === 'high' ? 'immediate' : 'soon',
        actions: ['Personal outreach', 'Loyalty discount', 'Service review', 'Contract renewal'].slice(0, 3),
        expectedRetentionGain: Math.round((c.clv * 0.3) * 100) / 100,
        cost: Math.round((c.clv * 0.05) * 100) / 100
      }));

    return {
      segments: Object.entries(segmentCounts).map(([segment, count]) => ({
        segment,
        count,
        avgCLV: Math.round(mockCustomers.filter(c => c.segment === segment).reduce((s, c) => s + c.clv, 0) / count),
        totalRevenue: Math.round(mockCustomers.filter(c => c.segment === segment).reduce((s, c) => s + c.totalSpent, 0))
      })),
      clvAnalysis: mockCustomers,
      loading: false, error: null, refresh: () => {},
      getCustomerCLV: (id) => mockCustomers.find(c => c.customerId === id),
      getHighValueCustomers: () => mockCustomers.filter(c => c.segment === 'champion' || c.segment === 'loyal'),
      getChurnRiskCustomers: () => mockCustomers.filter(c => c.churnRisk === 'high' || c.churnRisk === 'medium'),
      getRetentionRecommendations: () => mockRetentionRecommendations,
      summary: {
        totalCustomers: mockCustomers.length,
        avgCLV: Math.round(mockCustomers.reduce((s, c) => s + c.clv, 0) / mockCustomers.length),
        totalCLV: Math.round(mockCustomers.reduce((s, c) => s + c.clv, 0)),
        totalRevenue,
        champions: segmentCounts.champion || 0,
        loyal: segmentCounts.loyal || 0,
        potential: segmentCounts.potential || 0,
        atRisk: segmentCounts.at_risk || 0
      },
      topCustomers: mockCustomers.sort((a, b) => b.clv - a.clv).slice(0, 10),
      churnRiskCount: mockCustomers.filter(c => c.churnRisk === 'high').length
    };
  }, [customers, orders, payments, subscriptions, interactions]);

  if (loading) return <div className="panel-loading">Calculating CLV...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const filteredAnalysis = clvAnalysis.filter(c => 
    filterSegment === 'all' || c.segment === filterSegment
  );

  return (
    <div className="clv-panel">
      <div className="panel-header">
        <h3>Customer Lifetime Value</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="clv-metrics">
        <div className="metric-card">
          <h4>Total Customers</h4>
          <div className="metric-value">{summary.totalCustomers}</div>
        </div>
        <div className="metric-card">
          <h4>Avg CLV</h4>
          <div className="metric-value">GH₵{summary.avgCLV.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <h4>Total CLV</h4>
          <div className="metric-value">GH₵{summary.totalCLV.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <h4>Total Revenue</h4>
          <div className="metric-value">GH₵{summary.totalRevenue.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <h4>Churn Risk</h4>
          <div className="metric-value critical">{churnRiskCount}</div>
        </div>
        <div className="metric-card">
          <h4>Champions</h4>
          <div className="metric-value success">{summary.champions}</div>
        </div>
      </div>

      <div className="clv-tabs">
        <button className={activeTab === 'segments' ? 'active' : ''} onClick={() => setActiveTab('segments')}>Segments</button>
        <button className={activeTab === 'customers' ? 'active' : ''} onClick={() => setActiveTab('customers')}>All Customers</button>
        <button className={activeTab === 'retention' ? 'active' : ''} onClick={() => setActiveTab('retention')}>Retention ({getRetentionRecommendations().length})</button>
      </div>

      <div className="segment-filters">
        <select value={filterSegment} onChange={e => setFilterSegment(e.target.value)}>
          <option value="all">All Segments</option>
          <option value="champion">Champions</option>
          <option value="loyal">Loyal</option>
          <option value="potential">Potential</option>
          <option value="at_risk">At Risk</option>
        </select>
      </div>

      {activeTab === 'segments' && (
        <div className="segments-grid">
          {segments.map(s => (
            <div key={s.segment} className={`segment-card ${s.segment}`}>
              <h4>{s.segment.toUpperCase()}</h4>
              <div className="segment-count">{s.count} customers</div>
              <div className="segment-clv">Avg CLV: GH₵{s.avgCLV.toLocaleString()}</div>
              <div className="segment-revenue">Revenue: GH₵{s.totalRevenue.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="clv-table">
          <table>
            <thead>
              <tr><th>Customer</th><th>Type</th><th>Segment</th><th>Orders</th><th>Revenue</th><th>CLV</th><th>Predicted</th><th>Churn Risk</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredAnalysis.map(c => (
                <tr key={c.customerId} className={c.segment}>
                  <td><strong>{c.customerName}</strong></td>
                  <td>{c.type}</td>
                  <td><span className={`segment-badge ${c.segment}`}>{c.segment.toUpperCase()}</span></td>
                  <td>{c.totalOrders}</td>
                  <td>GH₵{c.totalSpent.toLocaleString()}</td>
                  <td>GH₵{c.clv.toLocaleString()}</td>
                  <td>GH₵{c.predictedCLV.toLocaleString()}</td>
                  <td><span className={`risk-badge ${c.churnRisk}`}>{c.churnRisk.toUpperCase()}</span></td>
                  <td>
                    {c.churnRisk === 'high' && (
                      <button className="btn-retain" onClick={() => onNotice?.(`Retention campaign for ${c.customerName}`)}>Retain</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'retention' && (
        <div className="retention-recommendations">
          <h4>Retention Recommendations</h4>
          {getRetentionRecommendations().map((rec, i) => (
            <div key={i} className={`retention-card ${rec.priority}`}>
              <div className="rec-header">
                <strong>{rec.customerName}</strong>
                <span className={`priority-badge ${rec.priority}`}>{rec.priority.toUpperCase()}</span>
              </div>
              <div className="rec-actions">
                {rec.actions.map((a, j) => <span key={j} className="action-tag">{a}</span>)}
              </div>
              <div className="rec-metrics">
                <span>Expected Gain: GH₵{rec.expectedRetentionGain.toLocaleString()}</span>
                <span>Cost: GH₵{rec.cost.toLocaleString()}</span>
                <span>ROI: {Math.round(rec.expectedRetentionGain / rec.cost * 100)}%</span>
              </div>
              <button className="btn-execute" onClick={() => onNotice?.(`Executing retention for ${rec.customerName}`)}>Execute</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerLifetimeValuePanel;