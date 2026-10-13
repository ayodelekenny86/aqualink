import React, { useState, useMemo } from 'react';
import { useCustomerChurnPrediction } from '../hooks/useCustomerChurnPrediction';

export default function CustomerChurnPredictionPanel({ 
  customers = [], 
  orders = [], 
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [filterRisk, setFilterRisk] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const {
    churnPredictions,
    atRiskCustomers,
    summary,
    loading,
    lastUpdated,
    refresh,
    recordRetentionAction,
    formatCedi,
  } = useCustomerChurnPrediction({ customers, orders, onNotice });

  const filteredPredictions = useMemo(() => {
    if (filterRisk === 'all') return churnPredictions;
    return churnPredictions.filter(c => c.riskLevel === filterRisk);
  }, [churnPredictions, filterRisk]);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">CUSTOMER CHURN PREDICTION</span>
            <h2>AI-Powered Retention Intelligence</h2>
          </div>
        </div>
        <div className="loading">Analyzing customer behavior...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">CUSTOMER CHURN PREDICTION</span>
          <h2>AI-Powered Retention Intelligence</h2>
        </div>
        <div className="toolbar-actions">
          <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} className="filter-select">
            <option value="all">All Customers</option>
            <option value="critical">Critical Risk</option>
            <option value="high">High Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="low">Low Risk</option>
          </select>
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="churn-summary">
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="users" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.total}</p>
            <p className="summary-label">Total Customers</p>
          </div>
        </article>
        <article className="summary-card critical">
          <div className="summary-icon"><i data-lucide="alert-triangle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.critical}</p>
            <p className="summary-label">Critical Risk</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="alert-circle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.high}</p>
            <p className="summary-label">High Risk</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="clock" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.medium}</p>
            <p className="summary-label">Medium Risk</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="heart" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.low}</p>
            <p className="summary-label">Low Risk</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="dollar-sign" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.atRiskRevenue)}</p>
            <p className="summary-label">At-Risk Revenue</p>
          </div>
        </article>
      </div>

      <div className="churn-tabs">
        <div className="tab-nav">
          {['overview', 'at-risk', 'actions', 'segments'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'at-risk' ? 'At Risk' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'at-risk' && atRiskCustomers.length > 0 && <span className="badge">{atRiskCustomers.length}</span>}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="customer-grid">
              {filteredPredictions.map(customer => (
                <article key={customer.customerId} className={`customer-card panel ${customer.riskLevel}`} onClick={() => setSelectedCustomer(customer.customerId)}>
                  <div className="customer-header">
                    <div>
                      <strong>{customer.customerName}</strong>
                      <small>{customer.segment}</small>
                    </div>
                    <span className={`risk-badge ${customer.riskLevel}`}>
                      {customer.riskLevel.toUpperCase()} ({customer.churnRisk}%)
                    </span>
                  </div>
                  <div className="customer-stats">
                    <div className="stat-row">
                      <span className="stat-label">Orders</span>
                      <span className="stat-value">{customer.totalOrders}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Total Spent</span>
                      <span className="stat-value">{formatCedi(customer.totalSpent)}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Avg Order</span>
                      <span className="stat-value">{formatCedi(customer.avgOrderValue)}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Frequency</span>
                      <span className="stat-value">{customer.orderFrequency}/mo</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Satisfaction</span>
                      <span className="stat-value">{customer.satisfactionScore}/5.0</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Days Inactive</span>
                      <span className="stat-value">{customer.daysSinceLastOrder}{customer.isOverdue ? ` (${customer.daysOverdue} overdue)` : ''}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Predicted LTV</span>
                      <span className="stat-value">{formatCedi(customer.ltv)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {filteredPredictions.length === 0 && (
              <div className="empty-state">
                <i data-lucide="filter" />
                <h3>No customers match the current filter</h3>
              </div>
            )}
          </div>
        )}

        {activeTab === 'at-risk' && (
          <div className="tab-content">
            {atRiskCustomers.length === 0 ? (
              <div className="empty-state success">
                <i data-lucide="check-circle" />
                <h3>No customers at risk</h3>
                <p>All customers are engaged and healthy</p>
              </div>
            ) : (
              <div className="at-risk-list">
                {atRiskCustomers.map(customer => (
                  <article key={customer.customerId} className={`at-risk-card ${customer.riskLevel}`}>
                    <div className="at-risk-header">
                      <div>
                        <h4>{customer.customerName}</h4>
                        <span className="customer-segment">{customer.segment}</span>
                      </div>
                      <div className="risk-indicators">
                        <span className={`risk-badge ${customer.riskLevel}`}>{customer.churnRisk}% risk</span>
                        <span className="ltv-badge">LTV: {formatCedi(customer.ltv)}</span>
                      </div>
                    </div>
                    <div className="at-risk-metrics">
                      <div className="metric"><span>Inactive:</span> <strong>{customer.daysSinceLastOrder} days</strong></div>
                      <div className="metric"><span>Orders:</span> <strong>{customer.totalOrders}</strong></div>
                      <div className="metric"><span>Satisfaction:</span> <strong>{customer.satisfactionScore}/5</strong></div>
                      <div className="metric"><span>Revenue at Risk:</span> <strong>{formatCedi(customer.ltv)}</strong></div>
                    </div>
                    <div className="at-risk-actions">
                      {customer.retentionActions.map((action, i) => (
                        <button key={i} className="btn btn-sm btn-secondary" onClick={() => recordRetentionAction(customer.customerId, action, 'Auto-suggested')}>
                          {action}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="tab-content">
            <h4>Retention Action Log</h4>
            <p className="panel-copy">Track retention interventions and their outcomes</p>
            <div className="action-form panel">
              <h5>Record New Retention Action</h5>
              <div className="form-row">
                <select id="actionCustomer" className="form-select">
                  <option value="">Select Customer</option>
                  {atRiskCustomers.map(c => <option key={c.customerId} value={c.customerId}>{c.customerName} ({c.riskLevel})</option>)}
                </select>
                <select id="actionType" className="form-select">
                  <option value="discount">Offer Discount</option>
                  <option value="outreach">Personal Outreach</option>
                  <option value="subscription">Promote Subscription</option>
                  <option value="feedback">Request Feedback</option>
                  <option value="manager">Assign Account Manager</option>
                </select>
              </div>
              <textarea id="actionNotes" placeholder="Notes..." rows="2" />
              <button className="btn btn-primary" onClick={() => {
                const customerId = document.getElementById('actionCustomer').value;
                const action = document.getElementById('actionType').value;
                const notes = document.getElementById('actionNotes').value;
                if (customerId) {
                  recordRetentionAction(customerId, action, notes);
                  document.getElementById('actionNotes').value = '';
                }
              }}>
                Record Action
              </button>
            </div>
          </div>
        )}

        {activeTab === 'segments' && (
          <div className="tab-content">
            <h4>Customer Segments</h4>
            <div className="segment-grid">
              {['VIP', 'High Value', 'Regular', 'At Risk', 'New/Low Activity'].map(segment => {
                const count = churnPredictions.filter(c => c.segment === segment).length;
                const avgLTV = churnPredictions.filter(c => c.segment === segment).reduce((sum, c) => sum + c.ltv, 0) / Math.max(1, count);
                return (
                  <article key={segment} className="segment-card panel">
                    <div className="segment-header">
                      <h4>{segment}</h4>
                      <span className="segment-count">{count} customers</span>
                    </div>
                    <div className="segment-stats">
                      <div><span>Avg LTV:</span> <strong>{formatCedi(Math.round(avgLTV))}</strong></div>
                      <div><span>Percentage:</span> <strong>{summary.total > 0 ? Math.round(count / summary.total * 100) : 0}%</strong></div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {selectedCustomer && (
          <div className="tab-content customer-detail">
            <button className="close-detail" onClick={() => setSelectedCustomer(null)}>← Back</button>
            {(() => {
              const customer = churnPredictions.find(c => c.customerId === selectedCustomer);
              if (!customer) return <div>Customer not found</div>;
              return (
                <div className="customer-detail-view">
                  <div className="customer-profile">
                    <div className="profile-header">
                      <div className="avatar">{customer.customerName.charAt(0)}</div>
                      <div>
                        <h3>{customer.customerName}</h3>
                        <span className={`risk-badge ${customer.riskLevel}`}>{customer.riskLevel.toUpperCase()} RISK ({customer.churnRisk}%)</span>
                      </div>
                      <div className="profile-segment">
                        <span className="segment-badge">{customer.segment}</span>
                      </div>
                    </div>
                    
                    <div className="metric-grid">
                      <div className="metric-card">
                        <span className="metric-value">{customer.totalOrders}</span>
                        <span className="metric-label">Total Orders</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{formatCedi(customer.totalSpent)}</span>
                        <span className="metric-label">Total Spent</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{formatCedi(customer.avgOrderValue)}</span>
                        <span className="metric-label">Avg Order Value</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{customer.orderFrequency}/mo</span>
                        <span className="metric-label">Order Frequency</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{customer.satisfactionScore}/5.0</span>
                        <span className="metric-label">Satisfaction</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{customer.daysSinceLastOrder} days</span>
                        <span className="metric-label">Days Since Order</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{formatCedi(customer.ltv)}</span>
                        <span className="metric-label">Predicted LTV</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{customer.isOverdue ? 'YES' : 'NO'}</span>
                        <span className="metric-label">Overdue</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="retention-actions-section">
                    <h4>Recommended Retention Actions</h4>
                    <ul>
                      {customer.retentionActions.map((action, i) => (
                        <li key={i}>
                          <button className="btn btn-sm btn-secondary" onClick={() => recordRetentionAction(customer.customerId, action, 'From detail view')}>
                            <i data-lucide="check" /> {action}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{customers.length} customers analyzed</span>
      </div>
    </section>
  );
}