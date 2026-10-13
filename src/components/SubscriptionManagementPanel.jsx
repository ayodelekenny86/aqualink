import React, { useState, useMemo } from 'react';
import { useSubscriptionManagement } from '../hooks/useSubscriptionManagement';

export default function SubscriptionManagementPanel({ 
  customers = [], 
  orders = [], 
  subscriptions = [], 
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [filterRisk, setFilterRisk] = useState('all');
  const [filterUpsell, setFilterUpsell] = useState('all');

  const {
    subscriptionData,
    churnRisk,
    upsellOpportunities,
    revenueForecast,
    lifecycleMetrics,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  } = useSubscriptionManagement({ customers, orders, subscriptions, onNotice });

  const filteredChurnRisk = useMemo(() => {
    if (filterRisk === 'all') return churnRisk;
    return churnRisk.filter(c => c.riskLevel === filterRisk);
  }, [churnRisk, filterRisk]);

  const filteredUpsell = useMemo(() => {
    if (filterUpsell === 'all') return upsellOpportunities;
    return upsellOpportunities.filter(o => o.priority === filterUpsell);
  }, [upsellOpportunities, filterUpsell]);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">SUBSCRIPTION MANAGEMENT</span>
            <h2>AI-Powered Recurring Revenue Intelligence</h2>
          </div>
        </div>
        <div className="loading">Analyzing subscription metrics...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">SUBSCRIPTION MANAGEMENT</span>
          <h2>AI-Powered Recurring Revenue Intelligence</h2>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="subscription-summary">
        <article className="summary-card highlight">
          <div className="summary-icon"><i data-lucide="repeat" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.activeSubscriptions}</p>
            <p className="summary-label">Active Subscriptions</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="dollar-sign" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.totalMRR)}</p>
            <p className="summary-label">Monthly Recurring Revenue</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="alert-triangle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.churnRate}%</p>
            <p className="summary-label">Churn Rate</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="trending-up" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.netGrowth > 0 ? '+' : ''}{summary.netGrowth}</p>
            <p className="summary-label">Net Growth (MoM)</p>
          </div>
        </article>
        <article className="summary-card critical">
          <div className="summary-icon"><i data-lucide="users" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.criticalChurnRisk}</p>
            <p className="summary-label">Critical Churn Risk</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="arrow-up-right" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.highUpsellOpportunities}</p>
            <p className="summary-label">High Upsell Ops</p>
          </div>
        </article>
      </div>

      <div className="subscription-tabs">
        <div className="tab-nav">
          {['overview', 'churn-risk', 'upsell', 'forecast', 'lifecycle', 'plans'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'churn-risk' ? 'Churn Risk' : tab === 'upsell' ? 'Upsell Ops' : tab === 'forecast' ? 'Revenue Forecast' : tab === 'lifecycle' ? 'Lifecycle' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'churn-risk' && churnRisk.filter(c => c.riskLevel === 'critical').length > 0 && (
                <span className="badge">{churnRisk.filter(c => c.riskLevel === 'critical').length}</span>
              )}
              {tab === 'upsell' && upsellOpportunities.filter(o => o.priority === 'high').length > 0 && (
                <span className="badge">{upsellOpportunities.filter(o => o.priority === 'high').length}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="overview-grid">
              <div className="overview-section">
                <h4>MRR Trend (12 Months)</h4>
                {subscriptionData?.monthlyTrend?.length > 0 ? (
                  <div className="trend-chart">
                    {subscriptionData.monthlyTrend.map(month => (
                      <div key={month.month} className="trend-bar" 
                        style={{ height: `${Math.max(10, (month.mrr / Math.max(...subscriptionData.monthlyTrend.map(m => m.mrr))) * 100)}%` }}
                        title={`${month.month}: ${formatCedi(month.mrr * 100)}`}
                      >
                        <span className="trend-label">{month.month.slice(5)}</span>
                        <span className="trend-value">{formatCedi(month.mrr * 100)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-feed">No MRR data available</p>
                )}
              </div>

              <div className="overview-section">
                <h4>Subscription Status</h4>
                <div className="status-breakdown">
                  <div className="status-item active">
                    <span className="status-label">Active</span>
                    <span className="status-value">{subscriptionData?.activeSubscriptions || 0}</span>
                  </div>
                  <div className="status-item paused">
                    <span className="status-label">Paused</span>
                    <span className="status-value">{subscriptionData?.pausedSubscriptions || 0}</span>
                  </div>
                  <div className="status-item cancelled">
                    <span className="status-label">Cancelled</span>
                    <span className="status-value">{subscriptionData?.cancelledSubscriptions || 0}</span>
                  </div>
                </div>
              </div>

              <div className="overview-section full-width">
                <h4>Plan Distribution</h4>
                <div className="plan-distribution">
                  {subscriptionData?.plans?.map(plan => (
                    <article key={plan.id} className="plan-card panel">
                      <div className="plan-header">
                        <strong>{plan.name}</strong>
                        <span className="plan-price">{formatCedi(plan.price)}/mo</span>
                      </div>
                      <div className="plan-stats">
                        <div className="stat"><span>Subscribers:</span> <strong>{plan.subscribers}</strong></div>
                        <div className="stat"><span>Frequency:</span> <strong>{plan.frequency}</strong></div>
                        <div className="stat"><span>Volume:</span> <strong>{plan.volume.toLocaleString()} gal</strong></div>
                        <div className="stat"><span>Monthly Revenue:</span> <strong>{formatCedi(plan.subscribers * plan.price)}</strong></div>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${subscriptionData.activeSubscriptions > 0 ? plan.subscribers / subscriptionData.activeSubscriptions * 100 : 0}%` }} />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'churn-risk' && (
          <div className="tab-content">
            <div className="filter-bar">
              <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} className="filter-select">
                <option value="all">All Risk Levels</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="churn-risk-list">
              {filteredChurnRisk.map(customer => (
                <article key={customer.customerId} className={`churn-risk-card ${customer.riskLevel}`}>
                  <div className="churn-header">
                    <div>
                      <h4>{customer.customerName}</h4>
                      <span className="customer-segment">{customer.segment} · {customer.currentPlan}</span>
                    </div>
                    <div className="risk-indicators">
                      <span className={`risk-badge ${customer.riskLevel}`}>{customer.riskScore}% Risk</span>
                      <span className="ltv-badge">{formatCedi(customer.monthlyValue)}/mo</span>
                    </div>
                  </div>
                  <div className="churn-metrics">
                    <div className="metric"><span>Days Since Order:</span> <strong>{customer.daysSinceOrder}</strong></div>
                    <div className="metric"><span>Order Freq:</span> <strong>{customer.orderFrequency}/mo</strong></div>
                    <div className="metric"><span>Satisfaction:</span> <strong>{customer.satisfactionScore}/5.0</strong></div>
                    <div className="metric"><span>Payment Issues:</span> <strong>{customer.paymentIssues}</strong></div>
                  </div>
                  <div className="churn-actions">
                    {customer.recommendedActions.map((action, i) => (
                      <button key={i} className="btn btn-sm btn-secondary" onClick={() => onNotice?.(`${action} for ${customer.customerName}`)}>
                        {action}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            {filteredChurnRisk.length === 0 && (
              <div className="empty-state success">
                <i data-lucide="check-circle" />
                <h3>No customers match the current filter</h3>
              </div>
            )}
          </div>
        )}

        {activeTab === 'upsell' && (
          <div className="tab-content">
            <div className="filter-bar">
              <select value={filterUpsell} onChange={e => setFilterUpsell(e.target.value)} className="filter-select">
                <option value="all">All Priorities</option>
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </div>
            <div className="upsell-list">
              {filteredUpsell.map(opp => (
                <article key={opp.customerId} className={`upsell-card ${opp.priority}`}>
                  <div className="upsell-header">
                    <div>
                      <h4>{opp.customerName}</h4>
                      <span className="current-plan">{opp.currentPlan} → {opp.recommendedPlan}</span>
                    </div>
                    <div className="upsell-value">
                      <span className={`priority-badge ${opp.priority}`}>{opp.priority.toUpperCase()}</span>
                      <span className="uplift-badge">+{opp.upliftPercent}%</span>
                    </div>
                  </div>
                  <div className="upsell-details">
                    <div className="metric"><span>Current:</span> <strong>{formatCedi(opp.currentValue)}/mo</strong></div>
                    <div className="metric"><span>Recommended:</span> <strong>{formatCedi(opp.recommendedValue)}/mo</strong></div>
                    <div className="metric"><span>Annual Uplift:</span> <strong>{formatCedi(opp.upliftValue * 12)}</strong></div>
                    <div className="metric"><span>Tenure:</span> <strong>{opp.tenureMonths} months</strong></div>
                  </div>
                  <div className="upsell-reasons">
                    {opp.reasons.map((reason, i) => (
                      <span key={i} className="reason-tag">{reason}</span>
                    ))}
                  </div>
                  <div className="upsell-actions">
                    <button className="btn btn-primary" onClick={() => onNotice?.(`Creating upgrade proposal for ${opp.customerName}`)}>
                      <i data-lucide="send" /> Send Proposal
                    </button>
                    <button className="btn btn-secondary" onClick={() => onNotice?.(`Scheduling call with ${opp.customerName}`)}>
                      <i data-lucide="phone" /> Schedule Call
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {filteredUpsell.length === 0 && (
              <div className="empty-state">
                <i data-lucide="filter" />
                <h3>No upsell opportunities match the current filter</h3>
              </div>
            )}
          </div>
        )}

        {activeTab === 'forecast' && (
          <div className="tab-content">
            <div className="forecast-scenarios">
              {Object.entries(revenueForecast?.scenarios || {}).map(([scenario, data]) => (
                <article key={scenario} className={`forecast-scenario ${scenario}`}>
                  <h5>{scenario.charAt(0).toUpperCase() + scenario.slice(1)} Scenario</h5>
                  <div className="scenario-metrics">
                    <div className="metric"><span>Month 6 MRR:</span> <strong>{formatCedi(data[5]?.projectedMRR * 100 || 0)}</strong></div>
                    <div className="metric"><span>Month 12 MRR:</span> <strong>{formatCedi(data[11]?.projectedMRR * 100 || 0)}</strong></div>
                    <div className="metric"><span>Year 1 ARR:</span> <strong>{formatCedi(data[11]?.projectedARR * 100 || 0)}</strong></div>
                  </div>
                  <div className="scenario-chart">
                    {data.slice(0, 12).map((month, i) => (
                      <div key={i} className="forecast-point" style={{ height: `${Math.max(5, (month.projectedMRR / Math.max(...data.map(d => d.projectedMRR))) * 100)}%` }} title={`Month ${month.month}: ${formatCedi(month.projectedMRR * 100)}`} />
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="panel-divider" />
            <h4>Growth Assumptions</h4>
            <div className="assumptions-grid">
              <div className="assumption-card panel">
                <span className="assumption-label">Monthly Net New</span>
                <strong className="assumption-value">{revenueForecast?.growthAssumptions?.monthlyNetNew?.toFixed(1) || 0}/mo</strong>
              </div>
              <div className="assumption-card panel">
                <span className="assumption-label">Annual Price Increase</span>
                <strong className="assumption-value">{(revenueForecast?.growthAssumptions?.annualPriceIncrease * 100).toFixed(0) || 0}%</strong>
              </div>
              <div className="assumption-card panel">
                <span className="assumption-label">Churn Rate</span>
                <strong className="assumption-value">{revenueForecast?.growthAssumptions?.churnRate?.toFixed(1) || 0}%</strong>
              </div>
              <div className="assumption-card panel">
                <span className="assumption-label">Expansion Rate</span>
                <strong className="assumption-value">{(revenueForecast?.growthAssumptions?.expansionRate * 100).toFixed(0) || 0}%</strong>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'lifecycle' && (
          <div className="tab-content">
            <div className="lifecycle-grid">
              {Object.entries(lifecycleMetrics || {}).map(([stage, metrics]) => (
                <article key={stage} className="lifecycle-stage panel">
                  <div className="stage-header">
                    <h4>{stage.charAt(0).toUpperCase() + stage.slice(1)}</h4>
                    <span className="stage-nps">{stage === 'advocacy' ? `NPS: ${metrics.nps}` : ''}</span>
                  </div>
                  <div className="stage-metrics">
                    {Object.entries(metrics).map(([key, value]) => (
                      <div key={key} className="stage-metric">
                        <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</span>
                        <strong>{typeof value === 'number' ? value.toFixed(value < 10 ? 1 : 0) : value}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'plans' && (
          <div className="tab-content">
            <h4>Subscription Plan Performance</h4>
            <div className="plans-table">
              <table>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Price/Mo</th>
                    <th>Subscribers</th>
                    <th>Frequency</th>
                    <th>Volume</th>
                    <th>Monthly Revenue</th>
                    <th>Share</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptionData?.plans?.map(plan => (
                    <tr key={plan.id}>
                      <td><strong>{plan.name}</strong></td>
                      <td>{formatCedi(plan.price)}</td>
                      <td>{plan.subscribers}</td>
                      <td>{plan.frequency}</td>
                      <td>{plan.volume.toLocaleString()} gal</td>
                      <td>{formatCedi(plan.subscribers * plan.price)}</td>
                      <td>{subscriptionData.activeSubscriptions > 0 ? Math.round(plan.subscribers / subscriptionData.activeSubscriptions * 100) : 0}%</td>
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={() => onNotice?.(`Optimizing ${plan.name} plan`)}>
                          Optimize
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{customers.length} customers · {subscriptions.length} subscriptions · {orders.length} orders</span>
      </div>
    </section>
  );
}