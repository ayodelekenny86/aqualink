import { useState } from 'react';
import { formatCedi } from '../lib/money';
import useCustomerIntelligence from '../hooks/useCustomerIntelligence';

function SegmentBadge({ segment, count }) {
  const colors = {
    champion: 'highlight',
    loyal: 'good',
    potential_loyalist: 'info',
    recent_customer: 'good',
    new_customer: 'info',
    at_risk: 'warning',
    cannot_lose: 'critical',
    hibernating: 'muted',
    promising: 'info',
  };
  
  const labels = {
    champion: '🏆 Champions',
    loyal: '⭐ Loyal',
    potential_loyalist: '📈 Potential Loyalists',
    recent_customer: '🆕 Recent',
    new_customer: '🌱 New',
    at_risk: '⚠ At Risk',
    cannot_lose: '💎 Cannot Lose',
    hibernating: '💤 Hibernating',
    promising: '✨ Promising',
  };

  return (
    <article className={`segment-badge ${colors[segment] || ''}`}>
      <span className="segment-label">{labels[segment] || segment}</span>
      <span className="segment-count">{count}</span>
    </article>
  );
}

function ChurnRiskCard({ customer, onNotice }) {
  const riskColors = { high: 'critical', medium: 'warning', low: 'info', minimal: 'good' };
  const riskIcons = { high: '🚨', medium: '⚠', low: '👁', minimal: '✓' };

  return (
    <article className={`churn-card panel ${customer.riskLevel}`}>
      <div className="churn-header">
        <div>
          <strong>{customer.customerName}</strong>
          <span className={`risk-badge ${riskColors[customer.riskLevel]}`}>
            {riskIcons[customer.riskLevel]} {customer.riskLevel.toUpperCase()} RISK ({customer.riskScore}%)
          </span>
        </div>
        <small>Segment: {customer.segment}</small>
      </div>
      
      <div className="churn-metrics">
        <div className="churn-stat">
          <span>Days Inactive</span>
          <strong className={customer.daysOverdue > 0 ? 'critical' : customer.daysSinceLastOrder > 30 ? 'warning' : ''}>
            {customer.daysSinceLastOrder}d {customer.daysOverdue > 0 ? `({customer.daysOverdue}d overdue)` : ''}
          </strong>
        </div>
        <div className="churn-stat">
          <span>Total Value</span>
          <strong>{customer.totalSpent}</strong>
        </div>
        <div className="churn-stat">
          <span>Predicted LTV</span>
          <strong>{customer.ltv}</strong>
        </div>
        <div className="churn-stat">
          <span>Avg Interval</span>
          <strong>{customer.avgOrderInterval || '—'}d</strong>
        </div>
        <div className="churn-stat">
          <span>Next Expected</span>
          <strong>{customer.predictedNextOrder || 'Unknown'}</strong>
        </div>
      </div>

      <div className="churn-action">
        <span className="action-label">Recommended:</span>
        <span className="action-text">{customer.recommendedAction}</span>
      </div>

      <div className="churn-actions">
        <button className="primary-button" onClick={() => onNotice?.(`Initiating retention campaign for ${customer.customerName}`)}>
          Retain
        </button>
        <button className="outline-button" onClick={() => onNotice?.(`Viewing full history for ${customer.customerName}`)}>
          History
        </button>
        <button className="text-button" onClick={() => onNotice?.(`Sending message to ${customer.customerName}`)}>
          Message
        </button>
      </div>
    </article>
  );
}

function LTVCard({ customer, onNotice }) {
  return (
    <article className="ltv-card panel">
      <div className="ltv-header">
        <strong>{customer.customerName}</strong>
        <span className={`segment-tag ${customer.segment}`}>{customer.segment}</span>
      </div>
      <div className="ltv-main">
        <span className="ltv-value">{customer.ltv}</span>
        <span className="ltv-label">Predicted LTV</span>
      </div>
      <div className="ltv-metrics">
        <div><span>Health Score</span> <strong className={customer.healthScore >= 80 ? 'good' : customer.healthScore >= 50 ? 'warning' : 'critical'}>{customer.healthScore}/100</strong></div>
        <div><span>Total Spent</span> <strong>{customer.totalSpent}</strong></div>
        <div><span>Orders</span> <strong>{customer.frequency}</strong></div>
        <div><span>Avg Order</span> <strong>{customer.avgOrderValue}</strong></div>
      </div>
      <button className="text-button" onClick={() => onNotice?.(`Viewing LTV details for ${customer.customerName}`)}>
        View Details
      </button>
    </article>
  );
}

function CustomerDetailCard({ customer, onNotice }) {
  const healthColor = customer.healthScore >= 80 ? 'good' : customer.healthScore >= 50 ? 'warning' : 'critical';
  
  return (
    <article className="customer-detail-card panel">
      <div className="customer-header">
        <div>
          <strong>{customer.name}</strong>
          <small>ID: {customer.id.slice(-8)}</small>
        </div>
        <div className="customer-badges">
          <span className={`segment-badge ${customer.segment}`}>{customer.segment}</span>
          <span className={`health-score ${healthColor}`}>{customer.healthScore}/100</span>
        </div>
      </div>
      
      <div className="customer-grid">
        <div className="cust-stat">
          <span>Total Spent</span>
          <strong>{formatCedi(customer.totalSpent)}</strong>
        </div>
        <div className="cust-stat">
          <span>LTV</span>
          <strong>{formatCedi(customer.ltv)}</strong>
        </div>
        <div className="cust-stat">
          <span>Orders</span>
          <strong>{customer.frequency}</strong>
        </div>
        <div className="cust-stat">
          <span>Avg Order</span>
          <strong>{formatCedi(customer.avgOrderValue)}</strong>
        </div>
        <div className="cust-stat">
          <span>Last Order</span>
          <strong>{customer.recency}d ago</strong>
        </div>
        <div className="cust-stat">
          <span>Churn Risk</span>
          <strong className={customer.churn.riskLevel === 'high' ? 'critical' : customer.churn.riskLevel === 'medium' ? 'warning' : 'good'}>
            {customer.churn.riskLevel}
          </strong>
        </div>
      </div>

      <div className="rfm-breakdown">
        <span>RFM: </span>
        <span className="rfm-score">R:{customer.rfm.rScore} F:{customer.rfm.fScore} M:{customer.rfm.mScore} (Total: {customer.rfm.total}/15)</span>
      </div>

      <div className="customer-actions">
        <button className="primary-button" onClick={() => onNotice?.(`Starting retention for ${customer.name}`)}>
          Retention Action
        </button>
        <button className="outline-button" onClick={() => onNotice?.(`Viewing orders for ${customer.name}`)}>
          Order History
        </button>
        <button className="text-button" onClick={() => onNotice?.(`Messaging ${customer.name}`)}>
          Contact
        </button>
      </div>
    </article>
  );
}

function AnomalyCard({ anomaly, onNotice }) {
  const severityColors = { critical: 'critical', warning: 'warning', info: 'info' };
  const severityIcons = { critical: '🚨', warning: '⚠', info: 'ℹ' };

  return (
    <article className={`anomaly-card ${anomaly.severity}`}>
      <div className="anomaly-header">
        <span className={`severity-badge ${severityColors[anomaly.severity]}`}>
          {severityIcons[anomaly.severity]} {anomaly.severity.toUpperCase()}
        </span>
        <span className="anomaly-type">{anomaly.type.replace('_', ' ').toUpperCase()}</span>
      </div>
      <p className="anomaly-description">{anomaly.description}</p>
      <div className="anomaly-meta">
        <small>Customer: {anomaly.customerName}</small>
        <small>Detected: {new Date(anomaly.detectedAt).toLocaleDateString()}</small>
      </div>
      <button className="text-button" onClick={() => onNotice?.(`Investigating: ${anomaly.description}`)}>
        Investigate
      </button>
    </article>
  );
}

export default function CustomerIntelligencePanel({ 
  orders = [], 
  onNotice, 
  customers = [],
  driverPositions = {}
}) {
  const {
    customers: enrichedCustomers,
    churnAnalysis,
    ltvPredictions,
    segments,
    anomalies,
    revenueForecast,
    summary,
    loading,
    refresh,
  } = useCustomerIntelligence({ orders, customers, driverPositions, onNotice });

  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = enrichedCustomers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section className="panel customer-intelligence-panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">CUSTOMER INTELLIGENCE</span>
          <h2>AI-Powered Customer Analytics</h2>
        </div>
        <div className="toolbar-actions">
          <input 
            type="text" 
            placeholder="Search customers..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <select value={activeTab} onChange={(e) => setActiveTab(e.target.value)} className="tab-select">
            <option value="overview">Overview</option>
            <option value="churn">Churn Risk</option>
            <option value="ltv">LTV Rankings</option>
            <option value="segments">Segments</option>
            <option value="anomalies">Anomalies</option>
            <option value="all">All Customers</option>
          </select>
          <button className="outline-button" onClick={refresh} disabled={loading}>
            {loading ? '⟳' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div className="summary-stats">
        <article className="stat-card">
          <span>Total Customers</span>
          <strong>{summary.totalCustomers}</strong>
        </article>
        <article className={summary.atRiskCustomers > 0 ? 'stat-card warning' : 'stat-card good'}>
          <span>At Risk</span>
          <strong>{summary.atRiskCustomers}</strong>
        </article>
        <article className="stat-card highlight">
          <span>VIP Customers</span>
          <strong>{summary.vipCustomers}</strong>
        </article>
        <article className="stat-card info">
          <span>New This Period</span>
          <strong>{summary.newCustomers}</strong>
        </article>
        <article className="stat-card">
          <span>Total Predicted LTV</span>
          <strong>{formatCedi(Math.round(summary.totalPredictedLTV * 100))}</strong>
        </article>
        <article className="stat-card">
          <span>30-Day Revenue</span>
          <strong>{formatCedi(Math.round(summary.revenueForecast30d * 100))}</strong>
        </article>
        <article className={summary.criticalAnomalies > 0 ? 'stat-card critical' : 'stat-card good'}>
          <span>Critical Anomalies</span>
          <strong>{summary.criticalAnomalies}</strong>
        </article>
        <article className="stat-card">
          <span>Avg Health</span>
          <strong>{summary.avgHealthScore}/100</strong>
        </article>
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="segment-overview">
            <h4>Customer Segments</h4>
            <div className="segment-grid">
              {Object.entries(summary.segmentDistribution).map(([segment, count]) => (
                <SegmentBadge key={segment} segment={segment} count={count} />
              ))}
            </div>
          </div>

          <div className="panel-divider" />

          <div className="overview-highlights">
            <article className="highlight-card panel">
              <h4>🚨 Top Churn Risks</h4>
              {churnAnalysis.slice(0, 3).map((c, i) => (
                <div key={c.customerId} className="highlight-item">
                  <span className="rank">#{i + 1}</span>
                  <strong>{c.customerName}</strong>
                  <span className={`risk ${c.riskLevel}`}>{c.riskScore}% risk</span>
                  <button className="text-button small" onClick={() => onNotice?.(`Retaining ${c.customerName}`)}>Action</button>
                </div>
              ))}
              {churnAnalysis.length === 0 && <p className="empty-feed">No customers at risk</p>}
            </article>

            <article className="highlight-card panel">
              <h4>💎 Top LTV Customers</h4>
              {ltvPredictions.slice(0, 3).map((c, i) => (
                <div key={c.customerId} className="highlight-item">
                  <span className="rank">#{i + 1}</span>
                  <strong>{c.customerName}</strong>
                  <span className="ltv-value">{c.ltv}</span>
                  <span className="segment-tag">{c.segment}</span>
                </div>
              ))}
              {ltvPredictions.length === 0 && <p className="empty-feed">No LTV data yet</p>}
            </article>

            <article className="highlight-card panel">
              <h4>📊 Revenue Forecast</h4>
              <div className="forecast-display">
                <span className="forecast-amount">{formatCedi(Math.round(summary.revenueForecast30d * 100))}</span>
                <span className="forecast-period">Next 30 Days</span>
                <small>Based on {summary.totalCustomers} customers</small>
              </div>
            </article>
          </div>
        </>
      )}

      {activeTab === 'churn' && (
        <div className="churn-list">
          {churnAnalysis.length === 0 ? (
            <div className="empty-state good">
              <span className="empty-icon">✓</span>
              <p>No customers at risk. All customers are engaged.</p>
            </div>
          ) : (
            churnAnalysis.map(customer => (
              <ChurnRiskCard key={customer.customerId} customer={customer} onNotice={onNotice} />
            ))
          )}
        </div>
      )}

      {activeTab === 'ltv' && (
        <div className="ltv-grid">
          {ltvPredictions.length === 0 ? (
            <p className="empty-feed">No LTV predictions yet. Need more order history.</p>
          ) : (
            ltvPredictions.map(customer => (
              <LTVCard key={customer.customerId} customer={customer} onNotice={onNotice} />
            ))
          )}
        </div>
      )}

      {activeTab === 'segments' && (
        <div className="segments-detail">
          {Object.entries(segments).map(([segment, count]) => {
            const segmentCustomers = enrichedCustomers.filter(c => c.segment === segment);
            return (
              <article key={segment} className="segment-detail panel">
                <div className="segment-header">
                  <h4>
                    <SegmentBadge segment={segment} count={count} />
                  </h4>
                  <p className="segment-description">
                    {segment === 'champion' && 'High value, high frequency, recent buyers - your best customers'}
                    {segment === 'loyal' && 'Regular buyers with good frequency and recency'}
                    {segment === 'potential_loyalist' && 'Recent buyers with potential to become loyal'}
                    {segment === 'recent_customer' && 'Recent purchasers, need nurturing to increase frequency'}
                    {segment === 'new_customer' && 'First-time buyers, critical onboarding window'}
                    {segment === 'at_risk' && 'Previously active but now inactive - urgent retention needed'}
                    {segment === 'cannot_lose' && 'High value but inactive - immediate intervention required'}
                    {segment === 'hibernating' && 'Long inactive, low value - low priority for reactivation'}
                    {segment === 'promising' && 'New customers showing early positive signals'}
                  </p>
                </div>
                <div className="segment-customers">
                  {segmentCustomers.slice(0, 5).map(c => (
                    <div key={c.id} className="segment-customer-item">
                      <span>{c.name}</span>
                      <span>{formatCedi(c.totalSpent)}</span>
                      <span>{c.frequency} orders</span>
                      <span className={c.healthScore >= 80 ? 'good' : c.healthScore >= 50 ? 'warning' : 'critical'}>
                        {c.healthScore}/100
                      </span>
                    </div>
                  ))}
                  {segmentCustomers.length > 5 && (
                    <span className="segment-more">+{segmentCustomers.length - 5} more...</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {activeTab === 'anomalies' && (
        <div className="anomalies-list">
          {anomalies.length === 0 ? (
            <div className="empty-state good">
              <span className="empty-icon">✓</span>
              <p>No anomalies detected. Customer behavior is within normal patterns.</p>
            </div>
          ) : (
            anomalies.map(anomaly => (
              <AnomalyCard key={anomaly.customerId + anomaly.type} anomaly={anomaly} onNotice={onNotice} />
            ))
          )}
        </div>
      )}

      {activeTab === 'all' && (
        <div className="all-customers">
          {filteredCustomers.length === 0 ? (
            <p className="empty-feed">No customers match your search.</p>
          ) : (
            filteredCustomers.map(customer => (
              <CustomerDetailCard key={customer.id} customer={customer} onNotice={onNotice} />
            ))
          )}
        </div>
      )}
    </section>
  );
}