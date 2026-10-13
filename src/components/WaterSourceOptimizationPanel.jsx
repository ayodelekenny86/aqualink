import React, { useState } from 'react';

export function WaterSourceOptimizationPanel({ 
  sources = [], 
  orders = [],
  facilities = [],
  weatherData = [],
  qualityTests = [],
  costData = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('sources');
  const [filterStatus, setFilterStatus] = useState('all');

  const { 
    optimization, scenarios, loading, error, refresh,
    runScenario, getSourceDetails, getAllocationForOrder,
    totalAvailableVolume, fulfillmentRate, avgOptimizationScore, estimatedCost, sourcesNeedingReview
  } = React.useMemo(() => {
    const mockSources = sources.filter(s => s.status === 'active').slice(0, 8).map((s, i) => ({
      sourceId: s.id,
      sourceName: s.name,
      type: s.type || 'surface',
      availableVolume: Math.floor(50000 + Math.random() * 200000),
      maxCapacity: Math.floor(100000 + Math.random() * 300000),
      qualityScore: Math.floor(75 + Math.random() * 25),
      weatherRisk: Math.round(Math.random() * 3 * 10) / 10,
      costPerGallon: Math.round((0.015 + Math.random() * 0.01) * 10000) / 10000,
      transportCostPerKm: Math.round((0.3 + Math.random() * 0.5) * 10) / 10,
      sustainabilityScore: Math.floor(60 + Math.random() * 40),
      reliabilityScore: Math.floor(70 + Math.random() * 30),
      optimizationScore: Math.round((70 + Math.random() * 30) * 10) / 10,
      utilizationRate: Math.floor(Math.random() * 80),
      recommendedAllocation: Math.floor(30000 + Math.random() * 150000),
      status: ['optimal', 'good', 'needs_review'][Math.floor(Math.random() * 1.5)],
      factors: { quality: 85, weather: 80, cost: 75, utilization: 60, sustainability: 70, reliability: 80 }
    }));

    const mockAllocation = mockSources.flatMap(src => 
      orders.filter(o => ['Pending', 'Assigned'].includes(o.status)).slice(0, 3).map((o, i) => ({
        sourceId: src.sourceId,
        sourceName: src.sourceName,
        orderId: o.id,
        allocatedVolume: Math.floor(Math.random() * 20000),
        distance: Math.floor(10 + Math.random() * 50),
        transportCost: Math.round((50 + Math.random() * 200) * 100) / 100,
        unitCost: src.costPerGallon,
        totalCost: Math.round((1000 + Math.random() * 5000) * 100) / 100
      }))
    );

    return {
      optimization: { sources: mockSources, allocationPlan: mockAllocation, summary: { totalSources: mockSources.length, optimalSources: mockSources.filter(s => s.status === 'optimal').length, totalAvailableVolume: mockSources.reduce((s, src) => s + src.availableVolume, 0), totalDemand: 500000, fulfillmentRate: 85, avgOptimizationScore: Math.round(mockSources.reduce((s, src) => s + src.optimizationScore, 0) / mockSources.length * 10) / 10, estimatedCost: mockAllocation.reduce((s, a) => s + a.totalCost, 0), avgCostPerGallon: 0.025, sourcesNeedingReview: mockSources.filter(s => s.status === 'needs_review').length } },
      scenarios: [
        { id: 'current', name: 'Current Optimization', supplyMultiplier: 1.0, demandMultiplier: 1.0, estimatedFulfillment: 85 },
        { id: 'drought', name: 'Drought Scenario (-30% supply)', supplyMultiplier: 0.7, demandMultiplier: 1.0, estimatedFulfillment: 60 },
        { id: 'surge', name: 'Demand Surge (+50%)', supplyMultiplier: 1.0, demandMultiplier: 1.5, estimatedFulfillment: 57 },
        { id: 'quality_crisis', name: 'Quality Crisis (top source offline)', supplyMultiplier: 0.5, demandMultiplier: 1.0, estimatedFulfillment: 43 },
        { id: 'cost_focus', name: 'Cost Minimization', supplyMultiplier: 1.0, demandMultiplier: 1.0, estimatedFulfillment: 85 }
      ],
      loading: false, error: null, refresh: () => {},
      runScenario: (id) => onNotice?.(`Running scenario: ${id}`),
      getSourceDetails: (id) => mockSources.find(s => s.sourceId === id),
      getAllocationForOrder: (id) => mockAllocation.filter(a => a.orderId === id),
      totalAvailableVolume: mockSources.reduce((s, src) => s + src.availableVolume, 0),
      fulfillmentRate: 85,
      avgOptimizationScore: Math.round(mockSources.reduce((s, src) => s + src.optimizationScore, 0) / mockSources.length * 10) / 10,
      estimatedCost: mockAllocation.reduce((s, a) => s + a.totalCost, 0),
      sourcesNeedingReview: mockSources.filter(s => s.status === 'needs_review').length
    };
  }, [sources, orders, facilities, weatherData, qualityTests, costData]);

  if (loading) return <div className="panel-loading">Optimizing water sources...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const filteredSources = optimization?.sources?.filter(s => 
    filterStatus === 'all' || s.status === filterStatus
  ) || [];

  return (
    <div className="water-source-panel">
      <div className="panel-header">
        <h3>Water Source Optimization</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Re-optimize</button>
      </div>

      <div className="source-metrics">
        <div className="metric-card"><h4>Total Sources</h4><div className="metric-value">{optimization?.summary?.totalSources || 0}</div></div>
        <div className="metric-card"><h4>Optimal</h4><div className="metric-value success">{optimization?.summary?.optimalSources || 0}</div></div>
        <div className="metric-card"><h4>Available Volume</h4><div className="metric-value">{totalAvailableVolume.toLocaleString()} gal</div></div>
        <div className="metric-card"><h4>Fulfillment Rate</h4><div className="metric-value">{fulfillmentRate}%</div></div>
        <div className="metric-card"><h4>Avg Score</h4><div className="metric-value">{avgOptimizationScore}/100</div></div>
        <div className="metric-card"><h4>Est. Cost</h4><div className="metric-value">GH₵{estimatedCost.toLocaleString()}</div></div>
        <div className="metric-card"><h4>Need Review</h4><div className="metric-value warning">{sourcesNeedingReview}</div></div>
      </div>

      <div className="source-tabs">
        <button className={activeTab === 'sources' ? 'active' : ''} onClick={() => setActiveTab('sources')}>Sources</button>
        <button className={activeTab === 'allocation' ? 'active' : ''} onClick={() => setActiveTab('allocation')}>Allocation Plan</button>
        <button className={activeTab === 'scenarios' ? 'active' : ''} onClick={() => setActiveTab('scenarios')}>Scenarios</button>
        <button className={activeTab === 'factors' ? 'active' : ''} onClick={() => setActiveTab('factors')}>Factor Analysis</button>
      </div>

      <div className="status-filter">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="optimal">Optimal</option>
          <option value="good">Good</option>
          <option value="needs_review">Needs Review</option>
        </select>
      </div>

      {activeTab === 'sources' && (
        <div className="sources-table">
          <table>
            <thead>
              <tr><th>Source</th><th>Type</th><th>Available</th><th>Quality</th><th>Weather Risk</th><th>Cost/Gal</th><th>Sustain.</th><th>Reliability</th><th>Score</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filteredSources.map(s => (
                <tr key={s.sourceId} className={s.status}>
                  <td><strong>{s.sourceName}</strong><br/><small>{s.type}</small></td>
                  <td>{s.availableVolume.toLocaleString()} gal</td>
                  <td>{s.qualityScore}/100</td>
                  <td>{s.weatherRisk}/5</td>
                  <td>GH₵{s.costPerGallon.toFixed(4)}</td>
                  <td>{s.sustainabilityScore}/100</td>
                  <td>{s.reliabilityScore}/100</td>
                  <td><strong>{s.optimizationScore}</strong></td>
                  <td><span className={`status-badge ${s.status}`}>{s.status.toUpperCase().replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'allocation' && (
        <div className="allocation-plan">
          <table>
            <thead><tr><th>Source</th><th>Order</th><th>Allocated</th><th>Distance</th><th>Transport Cost</th><th>Unit Cost</th><th>Total Cost</th></tr></thead>
            <tbody>
              {optimization?.allocationPlan?.map((a, i) => (
                <tr key={i}>
                  <td>{a.sourceName}</td>
                  <td>{a.orderId}</td>
                  <td>{a.allocatedVolume.toLocaleString()} gal</td>
                  <td>{a.distance} km</td>
                  <td>GH₵{a.transportCost.toFixed(2)}</td>
                  <td>GH₵{a.unitCost.toFixed(4)}</td>
                  <td>GH₵{a.totalCost.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'scenarios' && (
        <div className="scenarios-list">
          {scenarios.map(s => (
            <div key={s.id} className="scenario-card">
              <div className="scenario-header">
                <h4>{s.name}</h4>
                <span className="fulfillment">{s.estimatedFulfillment}% fulfillment</span>
              </div>
              <div className="scenario-params">
                <span>Supply: {(s.supplyMultiplier * 100).toFixed(0)}%</span>
                <span>Demand: {(s.demandMultiplier * 100).toFixed(0)}%</span>
              </div>
              <button className="btn-run" onClick={() => runScenario(s.id)}>Run Scenario</button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'factors' && (
        <div className="factor-analysis">
          {filteredSources.map(s => (
            <div key={s.sourceId} className="factor-card">
              <h4>{s.sourceName}</h4>
              <div className="factor-bars">
                {Object.entries(s.factors).map(([factor, value]) => (
                  <div key={factor} className="factor-bar">
                    <span>{factor}</span>
                    <div className="bar"><div className="fill" style={{ width: `${value}%` }} /></div>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WaterSourceOptimizationPanel;