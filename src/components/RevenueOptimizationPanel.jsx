import React, { useState, useMemo } from 'react';
import { useRevenueOptimization } from '../hooks/useRevenueOptimization';

export default function RevenueOptimizationPanel({ 
  orders = [], 
  pricing = {}, 
  customers = [], 
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');

  const {
    revenueAnalysis,
    recommendations,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  } = useRevenueOptimization({ orders, pricing, customers, onNotice });

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">REVENUE OPTIMIZATION</span>
            <h2>AI-Powered Revenue Intelligence</h2>
          </div>
        </div>
        <div className="loading">Analyzing revenue patterns...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">REVENUE OPTIMIZATION</span>
          <h2>AI-Powered Revenue Intelligence</h2>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="revenue-summary">
        <article className="summary-card highlight">
          <div className="summary-icon"><i data-lucide="trending-up" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.totalRevenue)}</p>
            <p className="summary-label">Total Revenue</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="clock" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.pendingRevenue)}</p>
            <p className="summary-label">Pending Revenue</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="package" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.avgOrderValue)}</p>
            <p className="summary-label">Avg Order Value</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="shopping-cart" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.totalOrders}</p>
            <p className="summary-label">Completed Orders</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="alert-triangle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.highPriorityRecommendations}</p>
            <p className="summary-label">High Priority Actions</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="dollar-sign" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.totalOptimizationImpact)}</p>
            <p className="summary-label">Optimization Potential</p>
          </div>
        </article>
      </div>

      <div className="revenue-tabs">
        <div className="tab-nav">
          {['overview', 'pricing', 'trends', 'recommendations'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'recommendations' && recommendations.length > 0 && <span className="badge">{recommendations.length}</span>}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="overview-grid">
              <div className="overview-section">
                <h4>Monthly Revenue Trend</h4>
                {summary.monthlyTrend.length > 0 ? (
                  <div className="trend-chart">
                    {summary.monthlyTrend.slice(-12).map((month, i) => (
                      <div key={month.month} className="trend-bar" style={{ height: `${Math.max(10, (month.revenue / Math.max(...summary.monthlyTrend.map(m => m.revenue))) * 100)}%` }} title={`${month.month}: ${formatCedi(month.revenue)}`}>
                        <span className="trend-label">{month.month.slice(5)}</span>
                        <span className="trend-value">{formatCedi(month.revenue)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-feed">No revenue data available</p>
                )}
              </div>
              
              <div className="overview-section">
                <h4>Volume Tier Distribution</h4>
                <div className="tier-chart">
                  {Object.entries(summary.volumeTiers).map(([tier, count]) => (
                    <div key={tier} className="tier-bar">
                      <span className="tier-label">{tier}</span>
                      <div className="bar-container">
                        <div className="bar-fill" style={{ width: `${Math.max(5, (count / Math.max(...Object.values(summary.volumeTiers))) * 100)}%` }} />
                      </div>
                      <span className="tier-value">{count} orders</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="overview-section full-width">
              <h4>Customer Segments</h4>
              <div className="segment-chart">
                {Object.entries(summary.customerSegments).map(([segment, count]) => (
                  <div key={segment} className="segment-bar">
                    <span className="segment-label">{segment}</span>
                    <div className="bar-container">
                      <div className="bar-fill" style={{ width: `${Math.max(5, (count / Math.max(...Object.values(summary.customerSegments))) * 100)}%` }} />
                    </div>
                    <span className="segment-value">{count} customers</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          <div className="tab-content">
            <h4>Price Optimization by Volume Tier</h4>
            <div className="pricing-table">
              <table>
                <thead>
                  <tr>
                    <th>Volume Tier</th>
                    <th>Orders</th>
                    <th>Avg Price</th>
                    <th>Current Multiplier</th>
                    <th>Optimal Multiplier</th>
                    <th>Elasticity</th>
                    <th>Revenue Impact</th>
                    <th>Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.priceOptimization).map(([tier, data]) => (
                    <tr key={tier} className={data.recommendation !== 'maintain' ? 'highlight' : ''}>
                      <td><strong>{tier}</strong></td>
                      <td>{data.count}</td>
                      <td>{formatCedi(data.avgPrice)}</td>
                      <td>{data.currentMultiplier}x</td>
                      <td><strong>{data.optimalMultiplier}x</strong></td>
                      <td>{data.elasticity}</td>
                      <td className={data.revenueImpact > 0 ? 'positive' : data.revenueImpact < 0 ? 'negative' : ''}>
                        {data.revenueImpact > 0 ? '+' : ''}{formatCedi(data.revenueImpact)}
                      </td>
                      <td>
                        <span className={`recommendation-badge ${data.recommendation}`}>
                          {data.recommendation.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="tab-content">
            <h4>Revenue Trends Analysis</h4>
            <div className="trends-grid">
              {summary.monthlyTrend.slice(-6).map((month, i) => {
                const prevMonth = summary.monthlyTrend[summary.monthlyTrend.length - 6 + i - 1];
                const growth = prevMonth ? ((month.revenue - prevMonth.revenue) / prevMonth.revenue * 100).toFixed(1) : 0;
                return (
                  <article key={month.month} className="trend-card panel">
                    <div className="trend-header">
                      <h5>{month.month}</h5>
                      <span className={`growth ${growth > 0 ? 'positive' : growth < 0 ? 'negative' : 'neutral'}`}>
                        {growth > 0 ? '+' : ''}{growth}%
                      </span>
                    </div>
                    <div className="trend-value">{formatCedi(month.revenue)}</div>
                    <div className="trend-details">
                      {prevMonth && (
                        <>
                          <span>Previous: {formatCedi(prevMonth.revenue)}</span>
                          <span>Change: {formatCedi(month.revenue - prevMonth.revenue)}</span>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            
            <div className="panel-divider" />
            <h4>Key Metrics</h4>
            <div className="metrics-grid">
              <div className="metric-card">
                <span className="metric-label">Avg Monthly Revenue</span>
                <span className="metric-value">{formatCedi(summary.monthlyTrend.length > 0 ? Math.round(summary.monthlyTrend.reduce((s, m) => s + m.revenue, 0) / summary.monthlyTrend.length) : 0)}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Revenue per Order</span>
                <span className="metric-value">{formatCedi(summary.avgOrderValue)}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Orders per Month</span>
                <span className="metric-value">{summary.monthlyTrend.length > 0 ? Math.round(summary.totalOrders / summary.monthlyTrend.length) : 0}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Pending Conversion</span>
                <span className="metric-value">{summary.totalOrders > 0 ? Math.round(summary.pendingOrders / summary.totalOrders * 100) : 0}%</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div className="tab-content">
            {recommendations.length === 0 ? (
              <div className="empty-state success">
                <i data-lucide="check-circle" />
                <h3>Revenue optimized</h3>
                <p>No pricing adjustments recommended at this time</p>
              </div>
            ) : (
              <div className="recommendations-list">
                {recommendations.map(rec => (
                  <article key={rec.id} className={`recommendation-card ${rec.priority}`}>
                    <div className="recommendation-header">
                      <div>
                        <h4>{rec.title}</h4>
                        <p>{rec.description}</p>
                      </div>
                      <span className={`priority-badge ${rec.priority}`}>{rec.priority.toUpperCase()}</span>
                    </div>
                    <div className="recommendation-details">
                      <div className="impact {rec.impact > 0 ? 'positive' : 'negative'}">
                        <span>Estimated Impact:</span>
                        <strong>{rec.impact > 0 ? '+' : ''}{formatCedi(rec.impact)}/month</strong>
                      </div>
                      <div className="action">
                        <span>Action:</span>
                        <strong>{rec.action}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{orders.length} orders analyzed</span>
      </div>
    </section>
  );
}