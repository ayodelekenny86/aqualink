import React, { useState } from 'react';

export function CustomerSentimentAnalysisPanel({ 
  customers = [], 
  feedback = [],
  interactions = [],
  orders = [],
  supportTickets = [],
  surveys = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [filterRisk, setFilterRisk] = useState('all');

  const { 
    analysis, loading, error, refresh,
    getCustomerSentiment, getCustomersByRisk, getTopDetractors, getImprovementPriorities,
    overallSentiment, avgNPS, highChurnCount, advocateCount
  } = React.useMemo(() => {
    const mockCustomers = customers.slice(0, 15).map((c, i) => ({
      customerId: c.id || `cust-${i}`,
      customerName: c.name || `Customer ${i + 1}`,
      type: c.type || 'residential',
      sentimentScore: Math.floor(40 + Math.random() * 60),
      npsScore: Math.floor(-50 + Math.random() * 100),
      avgRating: Math.round((2.5 + Math.random() * 2.5) * 10) / 10,
      totalFeedback: Math.floor(Math.random() * 10),
      churnRisk: Math.random() > 0.8 ? 'high' : Math.random() > 0.5 ? 'medium' : 'low',
      loyaltyTier: ['advocate', 'loyal', 'neutral', 'detractor'][Math.floor(Math.random() * 4)],
      keyDrivers: ['pricing', 'delivery_speed'].slice(0, Math.floor(Math.random() * 2)),
      strengths: ['water_quality', 'reliability'].slice(0, Math.floor(Math.random() * 2)),
      trend: Math.random() > 0.6 ? 'improving' : Math.random() > 0.3 ? 'stable' : 'declining'
    }));

    return {
      analysis: { customers: mockCustomers, summary: { overallSentiment: Math.round(mockCustomers.reduce((s, c) => s + c.sentimentScore, 0) / mockCustomers.length), avgNPS: Math.round(mockCustomers.reduce((s, c) => s + c.npsScore, 0) / mockCustomers.length), churnRiskCounts: { high: mockCustomers.filter(c => c.churnRisk === 'high').length, medium: mockCustomers.filter(c => c.churnRisk === 'medium').length, low: mockCustomers.filter(c => c.churnRisk === 'low').length }, loyaltyDistribution: { advocates: mockCustomers.filter(c => c.loyaltyTier === 'advocate').length, loyal: mockCustomers.filter(c => c.loyaltyTier === 'loyal').length, neutral: mockCustomers.filter(c => c.loyaltyTier === 'neutral').length, detractors: mockCustomers.filter(c => c.loyaltyTier === 'detractor').length }, topIssues: [{ topic: 'pricing', avgScore: 65 }, { topic: 'delivery_speed', avgScore: 68 }], topStrengths: [{ topic: 'water_quality', avgScore: 88 }, { topic: 'reliability', avgScore: 85 }] } },
      loading: false, error: null, refresh: () => {},
      getCustomerSentiment: (id) => mockCustomers.find(c => c.customerId === id),
      getCustomersByRisk: (r) => mockCustomers.filter(c => c.churnRisk === r),
      getTopDetractors: () => mockCustomers.filter(c => c.loyaltyTier === 'detractor'),
      getImprovementPriorities: () => [{ topic: 'pricing', avgScore: 65 }, { topic: 'delivery_speed', avgScore: 68 }],
      overallSentiment: Math.round(mockCustomers.reduce((s, c) => s + c.sentimentScore, 0) / mockCustomers.length),
      avgNPS: Math.round(mockCustomers.reduce((s, c) => s + c.npsScore, 0) / mockCustomers.length),
      highChurnCount: mockCustomers.filter(c => c.churnRisk === 'high').length,
      advocateCount: mockCustomers.filter(c => c.loyaltyTier === 'advocate').length
    };
  }, [customers, feedback, interactions, orders, supportTickets, surveys]);

  if (loading) return <div className="panel-loading">Analyzing sentiment...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const filteredCustomers = analysis?.customers?.filter(c => 
    filterRisk === 'all' || c.churnRisk === filterRisk
  ) || [];

  return (
    <div className="sentiment-panel">
      <div className="panel-header">
        <h3>Customer Sentiment Analysis</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="sentiment-metrics">
        <div className="metric-card"><h4>Overall Sentiment</h4><div className="metric-value">{overallSentiment}/100</div></div>
        <div className="metric-card"><h4>Avg NPS</h4><div className="metric-value">{avgNPS}</div></div>
        <div className="metric-card"><h4>High Churn Risk</h4><div className="metric-value critical">{highChurnCount}</div></div>
        <div className="metric-card"><h4>Advocates</h4><div className="metric-value success">{advocateCount}</div></div>
      </div>

      <div className="sentiment-tabs">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={activeTab === 'customers' ? 'active' : ''} onClick={() => setActiveTab('customers')}>All Customers</button>
        <button className={activeTab === 'detractors' ? 'active' : ''} onClick={() => setActiveTab('detractors')}>Detractors</button>
        <button className={activeTab === 'priorities' ? 'active' : ''} onClick={() => setActiveTab('priorities')}>Priorities</button>
      </div>

      {activeTab === 'overview' && (
        <div className="sentiment-overview">
          <div className="nps-breakdown">
            <h4>NPS Distribution</h4>
            <div className="nps-bars">
              <div className="nps-bar promoters">
                <span>Promoters</span>
                <div className="bar"><div className="fill" style={{ width: `${(analysis.summary.loyaltyDistribution.advocates / analysis.summary.totalCustomers) * 100}%` }} /></div>
                <span>{analysis.summary.loyaltyDistribution.advocates}</span>
              </div>
              <div className="nps-bar passives">
                <span>Passives</span>
                <div className="bar"><div className="fill" style={{ width: `${(analysis.summary.loyaltyDistribution.neutral / analysis.summary.totalCustomers) * 100}%` }} /></div>
                <span>{analysis.summary.loyaltyDistribution.neutral}</span>
              </div>
              <div className="nps-bar detractors">
                <span>Detractors</span>
                <div className="bar"><div className="fill" style={{ width: `${(analysis.summary.loyaltyDistribution.detractors / analysis.summary.totalCustomers) * 100}%` }} /></div>
                <span>{analysis.summary.loyaltyDistribution.detractors}</span>
              </div>
            </div>
          </div>
          <div className="topic-analysis">
            <h4>Topic Sentiment</h4>
            {analysis.summary.topIssues.map((t, i) => (
              <div key={i} className="topic-item issue">
                <span>{t.topic}</span>
                <div className="score-bar"><div className="fill issue" style={{ width: `${t.avgScore}%` }} /></div>
                <span>{t.avgScore}/100</span>
              </div>
            ))}
            {analysis.summary.topStrengths.map((t, i) => (
              <div key={i} className="topic-item strength">
                <span>{t.topic}</span>
                <div className="score-bar"><div className="fill strength" style={{ width: `${t.avgScore}%` }} /></div>
                <span>{t.avgScore}/100</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="sentiment-filters">
          <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}>
            <option value="all">All Risk Levels</option>
            <option value="high">High Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="low">Low Risk</option>
          </select>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="customers-table">
          <table>
            <thead><tr><th>Customer</th><th>Type</th><th>Sentiment</th><th>NPS</th><th>Rating</th><th>Churn Risk</th><th>Loyalty</th><th>Trend</th></tr></thead>
            <tbody>
              {filteredCustomers.map(c => (
                <tr key={c.customerId}>
                  <td>{c.customerName}</td>
                  <td>{c.type}</td>
                  <td>{c.sentimentScore}/100</td>
                  <td>{c.npsScore > 0 ? '+' : ''}{c.npsScore}</td>
                  <td>{c.avgRating}/5</td>
                  <td><span className={`risk-badge ${c.churnRisk}`}>{c.churnRisk.toUpperCase()}</span></td>
                  <td><span className={`loyalty-${c.loyaltyTier}`}>{c.loyaltyTier.toUpperCase()}</span></td>
                  <td><span className={`trend-${c.trend}`}>{c.trend}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'detractors' && (
        <div className="detractors-list">
          {getTopDetractors().map(c => (
            <div key={c.customerId} className="detractor-card">
              <h4>{c.customerName}</h4>
              <p>Sentiment: {c.sentimentScore}/100 | NPS: {c.npsScore} | Rating: {c.avgRating}/5</p>
              <div className="key-drivers">
                {c.keyDrivers.map((d, i) => <span key={i} className="driver-tag issue">{d}</span>)}
              </div>
              <button className="btn-action" onClick={() => onNotice?.(`Action plan for ${c.customerName}`)}>Create Action Plan</button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'priorities' && (
        <div className="improvement-priorities">
          <h4>Top Improvement Priorities</h4>
          {getImprovementPriorities().map((p, i) => (
            <div key={i} className="priority-card">
              <h5>{p.topic.replace('_', ' ').toUpperCase()}</h5>
              <div className="priority-score">
                <div className="score-circle issue" style={{ '--score': p.avgScore }}>{p.avgScore}</div>
                <p>Below threshold - immediate attention needed</p>
              </div>
              <button className="btn-investigate" onClick={() => onNotice?.(`Investigating ${p.topic}`)}>Investigate</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerSentimentAnalysisPanel;