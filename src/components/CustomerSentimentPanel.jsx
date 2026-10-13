import React, { useState } from 'react';

export function CustomerSentimentPanel({ 
  customers = [], 
  orders = [], 
  ratings = [],
  messages = [],
  supportTickets = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');

  const { 
    analysis, loading, error, refresh,
    overallSentiment, nps, churnRiskCount, criticalAlerts, insights, segments
  } = React.useMemo(() => {
    const customerSentiments = customers.map(customer => {
      const customerOrders = orders.filter(o => o.customerId === customer.id);
      const customerRatings = ratings.filter(r => r.customerId === customer.id);
      const avgRating = customerRatings.length
        ? customerRatings.reduce((sum, r) => sum + (r.rating || 0), 0) / customerRatings.length
        : 3.5;
      
      let score = 50 + (avgRating - 3) * 10 + Math.min(customerOrders.length * 2, 20);
      score = Math.max(0, Math.min(100, score));
      
      const label = score >= 80 ? 'promoter' : score >= 60 ? 'passive' : score >= 40 ? 'detractor' : 'churn_risk';
      
      return {
        customerId: customer.id,
        customerName: customer.name,
        sentimentScore: Math.round(score),
        sentimentLabel: label,
        avgRating: Math.round(avgRating * 10) / 10,
        orderCount: customerOrders.length,
        riskFactors: score < 40 ? [{ factor: 'Low sentiment', severity: 'critical' }] : [],
        recommendedActions: label === 'churn_risk' ? ['Immediate retention call', 'Offer discount'] : []
      };
    });

    const segs = [
      { name: 'Promoters', customers: customerSentiments.filter(c => c.sentimentLabel === 'promoter'), color: '#10b981' },
      { name: 'Passive', customers: customerSentiments.filter(c => c.sentimentLabel === 'passive'), color: '#f59e0b' },
      { name: 'Detractors', customers: customerSentiments.filter(c => c.sentimentLabel === 'detractor'), color: '#ef4444' },
      { name: 'Churn Risk', customers: customerSentiments.filter(c => c.sentimentLabel === 'churn_risk'), color: '#7c2d12' }
    ];

    const npsCalc = customerSentiments.length
      ? Math.round(((segs[0].customers.length - segs[2].customers.length - segs[3].customers.length) / customerSentiments.length) * 100)
      : 0;

    return {
      analysis: {
        overall: { sentimentScore: customerSentiments.length ? Math.round(customerSentiments.reduce((s, c) => s + c.sentimentScore, 0) / customerSentiments.length) : 75, nps: npsCalc },
        segments: segs.map(s => ({ name: s.name, count: s.customers.length, percentage: Math.round((s.customers.length / (customers.length || 1)) * 100), color: s.color })),
        customers: customerSentiments
      },
      loading: false, error: null, refresh: () => {},
      overallSentiment: customerSentiments.length ? Math.round(customerSentiments.reduce((s, c) => s + c.sentimentScore, 0) / customerSentiments.length) : 75,
      nps: npsCalc,
      churnRiskCount: segs[3].customers.length,
      criticalAlerts: customerSentiments.filter(c => c.sentimentLabel === 'churn_risk').map(c => ({ customerName: c.customerName, message: `${c.customerName} at churn risk` })),
      insights: [
        npsCalc > 50 ? { type: 'strength', title: 'Strong Loyalty', description: `NPS of ${npsCalc}` } : { type: 'concern', title: 'NPS Needs Work', description: `NPS of ${npsCalc}` }
      ],
      segments: segs.map(s => ({ name: s.name, count: s.customers.length, percentage: Math.round((s.customers.length / (customers.length || 1)) * 100), color: s.color }))
    };
  }, [customers, orders, ratings, messages, supportTickets]);

  if (loading) return <div className="panel-loading">Analyzing sentiment...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="sentiment-panel">
      <div className="panel-header">
        <h3>Customer Sentiment Analysis</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="sentiment-overview">
        <div className="metric-card">
          <h4>Overall Sentiment</h4>
          <div className="metric-value">{overallSentiment}/100</div>
        </div>
        <div className="metric-card">
          <h4>NPS</h4>
          <div className={`metric-value ${nps >= 0 ? 'positive' : 'negative'}`}>{nps >= 0 ? '+' : ''}{nps}</div>
        </div>
        <div className="metric-card">
          <h4>Churn Risk</h4>
          <div className="metric-value critical">{churnRiskCount}</div>
        </div>
        <div className="metric-card">
          <h4>Critical Alerts</h4>
          <div className="metric-value warning">{criticalAlerts.length}</div>
        </div>
      </div>

      <div className="sentiment-tabs">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Segments</button>
        <button className={activeTab === 'customers' ? 'active' : ''} onClick={() => setActiveTab('customers')}>All Customers</button>
        <button className={activeTab === 'insights' ? 'active' : ''} onClick={() => setActiveTab('insights')}>Insights</button>
        <button className={activeTab === 'alerts' ? 'active' : ''} onClick={() => setActiveTab('alerts')}>Alerts ({criticalAlerts.length})</button>
      </div>

      {activeTab === 'overview' && (
        <div className="segments-view">
          {segments.map(seg => (
            <div key={seg.name} className="segment-card" style={{ borderLeftColor: seg.color }}>
              <div className="seg-header">
                <h4>{seg.name}</h4>
                <span className="seg-count">{seg.count} ({seg.percentage}%)</span>
              </div>
              <div className="seg-bar">
                <div className="seg-fill" style={{ width: `${seg.percentage}%`, backgroundColor: seg.color }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="customers-table">
          <table>
            <thead>
              <tr><th>Customer</th><th>Sentiment</th><th>Score</th><th>Avg Rating</th><th>Orders</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {analysis?.customers?.sort((a, b) => a.sentimentScore - b.sentimentScore).map(c => (
                <tr key={c.customerId} className={c.sentimentLabel}>
                  <td>{c.customerName}</td>
                  <td><span className={`sentiment-badge ${c.sentimentLabel}`}>{c.sentimentLabel.toUpperCase()}</span></td>
                  <td>{c.sentimentScore}</td>
                  <td>{c.avgRating}</td>
                  <td>{c.orderCount}</td>
                  <td>{c.recommendedActions?.slice(0, 2).map((a, i) => <span key={i} className="action-tag">{a}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="insights-list">
          {insights.map((insight, i) => (
            <div key={i} className={`insight-card ${insight.type}`}>
              <h4>{insight.title}</h4>
              <p>{insight.description}</p>
              {insight.metric && <span className="metric">Metric: {insight.metric}</span>}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="alerts-list">
          {criticalAlerts.map((alert, i) => (
            <div key={i} className="alert-card critical">
              <span className="severity-badge critical">CRITICAL</span>
              <strong>{alert.customerName}</strong>
              <p>{alert.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerSentimentPanel;