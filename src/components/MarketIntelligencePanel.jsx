import React, { useState, useMemo } from 'react';
import { useMarketIntelligence } from '../hooks/useMarketIntelligence';

export default function MarketIntelligencePanel({ 
  orders = [], 
  customers = [], 
  competitors = [], 
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');

  const {
    marketData,
    competitorAnalysis,
    pricingIntelligence,
    trendForecasts,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  } = useMarketIntelligence({ orders, customers, competitors, onNotice });

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">MARKET INTELLIGENCE</span>
            <h2>AI-Powered Competitive & Market Analysis</h2>
          </div>
        </div>
        <div className="loading">Analyzing market dynamics...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">MARKET INTELLIGENCE</span>
          <h2>AI-Powered Competitive & Market Analysis</h2>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="market-summary">
        <article className="summary-card highlight">
          <div className="summary-icon"><i data-lucide="trending-up" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.marketShare}%</p>
            <p className="summary-label">Market Share</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="bar-chart-2" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.growthRate}%</p>
            <p className="summary-label">Growth Rate (MoM)</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="dollar-sign" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.totalRevenue)}</p>
            <p className="summary-label">Total Revenue</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="target" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.competitivePosition || '—'}</p>
            <p className="summary-label">Price Position</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="alert-triangle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.highThreatCompetitors}</p>
            <p className="summary-label">High Threat Rivals</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="lightbulb" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.activeTrends}</p>
            <p className="summary-label">Active Trends</p>
          </div>
        </article>
      </div>

      <div className="market-tabs">
        <div className="tab-nav">
          {['overview', 'competitors', 'pricing', 'trends'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'competitors' && competitorAnalysis.filter(c => c.threatLevel === 'high').length > 0 && (
                <span className="badge">{competitorAnalysis.filter(c => c.threatLevel === 'high').length}</span>
              )}
              {tab === 'trends' && trendForecasts.filter(t => t.impact === 'high').length > 0 && (
                <span className="badge">{trendForecasts.filter(t => t.impact === 'high').length}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="overview-grid">
              <div className="overview-section">
                <h4>Revenue Trend (6 Months)</h4>
                {marketData?.monthlyTrend?.length > 0 ? (
                  <div className="trend-chart">
                    {marketData.monthlyTrend.map((month, i) => (
                      <div key={month.month} className="trend-bar" 
                        style={{ height: `${Math.max(10, (month.revenue / Math.max(...marketData.monthlyTrend.map(m => m.revenue))) * 100)}%` }}
                        title={`${month.month}: ${formatCedi(month.revenue)}`}
                      >
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
                <h4>Customer Segments</h4>
                <div className="segment-chart">
                  {Object.entries(marketData?.customerSegments || {}).map(([segment, count]) => (
                    <div key={segment} className="segment-bar">
                      <span className="segment-label">{segment}</span>
                      <div className="bar-container">
                        <div className="bar-fill" style={{ width: `${Math.max(5, (count / Math.max(...Object.values(marketData?.customerSegments || {1:1}))) * 100)}%` }} />
                      </div>
                      <span className="segment-value">{count} customers</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overview-section full-width">
                <h4>Top Performing Zones</h4>
                <div className="zone-highlights">
                  {marketData?.topZones?.map((zone, i) => (
                    <div key={zone} className="zone-highlight">
                      <span className="zone-rank">#{i + 1}</span>
                      <span className="zone-name">{zone}</span>
                      <span className="zone-metric">High demand</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'competitors' && (
          <div className="tab-content">
            <div className="competitors-grid">
              {competitorAnalysis.map(comp => (
                <article key={comp.id} className={`competitor-card panel ${comp.threatLevel}`}>
                  <div className="competitor-header">
                    <div>
                      <strong>{comp.name}</strong>
                      <small>{comp.type} Competitor · {comp.marketShare}% share</small>
                    </div>
                    <span className={`threat-badge ${comp.threatLevel}`}>{comp.threatLevel.toUpperCase()}</span>
                  </div>
                  <div className="competitor-stats">
                    <div className="stat-row">
                      <span className="stat-label">Avg Price/Gal</span>
                      <span className="stat-value">GH₵${comp.avgPricePerGallon.toFixed(2)}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Service Radius</span>
                      <span className="stat-value">{comp.serviceRadius.toFixed(0)} km</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Delivery Speed</span>
                      <span className="stat-value">{comp.deliverySpeed}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Last Price Change</span>
                      <span className="stat-value">{comp.lastPriceChange}</span>
                    </div>
                  </div>
                  <div className="competitor-analysis">
                    <div className="analysis-col">
                      <h5>Strengths</h5>
                      <ul>
                        {comp.strengths.map((s, i) => <li key={i}><i data-lucide="check" className="success" /> {s}</li>)}
                      </ul>
                    </div>
                    <div className="analysis-col">
                      <h5>Weaknesses</h5>
                      <ul>
                        {comp.weaknesses.map((w, i) => <li key={i}><i data-lucide="x" className="danger" /> {w}</li>)}
                      </ul>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          <div className="tab-content">
            <div className="pricing-grid">
              <div className="pricing-section">
                <h4>Price Positioning</h4>
                <div className="position-indicator">
                  <div className="position-bar">
                    <div className="position-marker budget" style={{ left: '10%' }} />
                    <div className="position-marker competitive" style={{ left: '45%' }} />
                    <div className="position-marker premium" style={{ left: '85%' }} />
                    <div className="our-position" style={{ left: `${pricingIntelligence?.pricePosition === 'budget' ? 15 : pricingIntelligence?.pricePosition === 'premium' ? 80 : 50}%` }} />
                  </div>
                  <div className="position-labels">
                    <span>Budget</span>
                    <span>Competitive</span>
                    <span>Premium</span>
                  </div>
                </div>
                <div className="price-metrics">
                  <div className="metric"><span>Our Avg:</span> <strong>GH₵${pricingIntelligence?.ourAvgPrice?.toFixed(2) || '—'}</strong></div>
                  <div className="metric"><span>Market Avg:</span> <strong>GH₵${pricingIntelligence?.marketAvgPrice?.toFixed(2) || '—'}</strong></div>
                  <div className="metric"><span>Elasticity:</span> <strong>{pricingIntelligence?.priceElasticity || '—'}</strong></div>
                </div>
              </div>

              <div className="pricing-section">
                <h4>Competitor Pricing</h4>
                <div className="competitor-pricing-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Competitor</th>
                        <th>Price/Gal</th>
                        <th>Volume Tier</th>
                        <th>vs Market</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingIntelligence?.competitorPrices?.map((cp, i) => (
                        <tr key={i}>
                          <td>{cp.competitor}</td>
                          <td>GH₵${cp.price.toFixed(2)}</td>
                          <td><span className={`volume-badge ${cp.volume}`}>{cp.volume}</span></td>
                          <td className={cp.price > pricingIntelligence?.marketAvgPrice ? 'higher' : 'lower'}>
                            {cp.price > (pricingIntelligence?.marketAvgPrice || 0) ? '+' : ''}{((cp.price - (pricingIntelligence?.marketAvgPrice || 0)) / (pricingIntelligence?.marketAvgPrice || 1) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pricing-section full-width">
                <h4>Recommended Actions</h4>
                <div className="recommendations-list">
                  {pricingIntelligence?.recommendedActions?.map((rec, i) => (
                    <article key={i} className="recommendation-card">
                      <div className="rec-header">
                        <h5>{rec.action}</h5>
                        <span className="confidence-badge">{rec.confidence}% confidence</span>
                      </div>
                      <p>{rec.reason}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="pricing-section full-width">
                <h4>Volume Discount Tiers</h4>
                <div className="tier-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Volume Tier</th>
                        <th>Multiplier</th>
                        <th>Effective Price/Gal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingIntelligence?.volumeDiscountTiers?.map((tier, i) => (
                        <tr key={i}>
                          <td>{tier.tier}</td>
                          <td>{tier.multiplier}x</td>
                          <td>GH₵${(pricingIntelligence.ourAvgPrice * tier.multiplier).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="tab-content">
            <h4>Market Trend Forecasts</h4>
            <div className="trends-list">
              {trendForecasts.map((trend, i) => (
                <article key={i} className={`trend-card panel ${trend.impact}`}>
                  <div className="trend-header">
                    <div>
                      <h5>{trend.trend}</h5>
                      <p>{trend.description}</p>
                    </div>
                    <div className="trend-badges">
                      <span className={`direction-badge ${trend.direction}`}>
                        <i data-lucide={trend.direction === 'up' ? 'trending-up' : 'trending-down'} /> {trend.direction.toUpperCase()}
                      </span>
                      <span className={`impact-badge ${trend.impact}`}>{trend.impact.toUpperCase()} IMPACT</span>
                      <span className="confidence-badge">{trend.confidence}% confidence</span>
                    </div>
                  </div>
                  <div className="trend-meta">
                    <span><i data-lucide="calendar" /> {trend.timeframe}</span>
                    <span className={`direction ${trend.direction}`}>{trend.direction === 'up' ? 'Growing opportunity' : 'Declining risk'}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{orders.length} orders · {customers.length} customers · {competitors.length || 'Default'} competitors</span>
      </div>
    </section>
  );
}