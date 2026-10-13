import React from 'react';

export function PredictivePricingPanel({ 
  orders = [], 
  pricing = {},
  competitors = [],
  weatherData = [],
  events = [],
  historicalPricing = [],
  onNotice 
}) {
  const { 
    analysis, recommendations, loading, error, refresh,
    applyRecommendation,
    currentPrice, optimalPrice, elasticity
  } = React.useMemo(() => {
    const basePrice = pricing.perGallon || 0.02;
    const current = pricing.currentPrice || basePrice;
    const competitorPrices = competitors.map(c => c.pricePerGallon).filter(p => p > 0);
    const avgCompetitor = competitorPrices.length ? competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length : basePrice * 1.1;
    
    return {
      analysis: {
        currentPrice: current,
        basePrice,
        avgCompetitorPrice: avgCompetitor,
        priceElasticity: -1.5,
        demandForecast: { baseVolume: 5000, forecastVolume: 6000, multiplier: 1.2 },
        optimalPrice: current * 1.05,
        priceScenarios: [
          { label: 'Conservative (-5%)', price: current * 1.05 * 0.95, volume: 6200, revenue: current * 1.05 * 0.95 * 6200 },
          { label: 'Optimal', price: current * 1.05, volume: 5800, revenue: current * 1.05 * 5800 },
          { label: 'Aggressive (+5%)', price: current * 1.05 * 1.05, volume: 5400, revenue: current * 1.05 * 1.05 * 5400 }
        ]
      },
      recommendations: [
        { id: 'optimal', type: 'optimal_price', title: 'Optimal Price Point', recommendedPrice: current * 1.05, expectedRevenue: current * 1.05 * 5800, confidence: 85, reasoning: 'Based on elasticity of -1.5', riskLevel: 'medium' },
        { id: 'competitive', type: 'competitive_match', title: 'Competitive Match', recommendedPrice: avgCompetitor * 0.98, expectedRevenue: avgCompetitor * 0.98 * 6300, confidence: 75, reasoning: 'Match competitors at 2% discount', riskLevel: 'low' }
      ],
      loading: false, error: null, refresh: () => {},
      applyRecommendation: (id) => onNotice?.(`Applied: ${id}`),
      currentPrice: current,
      optimalPrice: current * 1.05,
      elasticity: -1.5
    };
  }, [orders, pricing, competitors, weatherData, events, historicalPricing]);

  if (loading) return <div className="panel-loading">Analyzing pricing...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="pricing-panel">
      <div className="panel-header">
        <h3>Predictive Pricing</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="pricing-summary">
        <div className="metric-card">
          <h4>Current Price</h4>
          <div className="metric-value">GH₵{currentPrice.toFixed(4)}/gal</div>
        </div>
        <div className="metric-card">
          <h4>Optimal Price</h4>
          <div className="metric-value">GH₵{optimalPrice.toFixed(4)}/gal</div>
        </div>
        <div className="metric-card">
          <h4>Price Elasticity</h4>
          <div className="metric-value">{elasticity}</div>
        </div>
        <div className="metric-card">
          <h4>Competitor Avg</h4>
          <div className="metric-value">GH₵{analysis?.avgCompetitorPrice?.toFixed(4) || 'N/A'}/gal</div>
        </div>
      </div>

      <div className="recommendations">
        <h4>Price Recommendations</h4>
        {recommendations.map(rec => (
          <div key={rec.id} className={`recommendation-card ${rec.riskLevel}`}>
            <div className="rec-header">
              <h5>{rec.title}</h5>
              <span className={`risk-badge ${rec.riskLevel}`}>{rec.riskLevel.toUpperCase()}</span>
            </div>
            <p>{rec.reasoning}</p>
            <div className="rec-metrics">
              <span>Price: GH₵{rec.recommendedPrice?.toFixed(4) || 'N/A'}/gal</span>
              <span>Revenue: GH₵{rec.expectedRevenue?.toLocaleString() || 'N/A'}</span>
              <span>Confidence: {rec.confidence}%</span>
            </div>
            <button className="btn-apply" onClick={() => applyRecommendation(rec.id)}>Apply</button>
          </div>
        ))}
      </div>

      <div className="price-scenarios">
        <h4>Price Scenarios</h4>
        <table>
          <thead><tr><th>Scenario</th><th>Price/Gal</th><th>Volume</th><th>Revenue</th></tr></thead>
          <tbody>
            {analysis?.priceScenarios?.map((s, i) => (
              <tr key={i}>
                <td>{s.label}</td>
                <td>GH₵{s.price.toFixed(4)}</td>
                <td>{s.volume.toLocaleString()} gal</td>
                <td>GH₵{s.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="surge-rules">
        <h4>Dynamic Surge Rules</h4>
        {recommendations.find(r => r.type === 'dynamic_surge')?.rules?.map((rule, i) => (
          <div key={i} className="surge-rule">
            <span>{rule.trigger}</span>
            <span>{(rule.multiplier * 100).toFixed(0)}%</span>
            <span>{rule.maxDuration}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PredictivePricingPanel;