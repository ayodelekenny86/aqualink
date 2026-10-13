import React, { useState } from 'react';

export function WaterQualityPredictionPanel({ 
  sources = [], 
  qualityTests = [],
  weatherData = [],
  treatmentRecords = [],
  distributionData = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('sources');
  const [filterRisk, setFilterRisk] = useState('all');

  const { 
    predictions, alerts, loading, error, refresh,
    getSourcePrediction, getNodePrediction, getCriticalAlerts,
    compliantCount, highRiskCount, avgQualityScore, criticalAlertsCount
  } = React.useMemo(() => {
    const mockSources = sources.filter(s => s.status === 'active').slice(0, 8).map((s, i) => ({
      sourceId: s.id,
      sourceName: s.name,
      currentParams: { ph: 7.2, turbidity: 1.5, chlorine: 0.8, tds: 180, bacteria: 0, temperature: 25 },
      predictedParams: { 
        ph: Math.round((7.0 + Math.random() * 0.5) * 100) / 100,
        turbidity: Math.round((0.5 + Math.random() * 2) * 100) / 100,
        chlorine: Math.round((0.5 + Math.random() * 1) * 100) / 100,
        tds: Math.round(150 + Math.random() * 100),
        bacteria: Math.random() > 0.95 ? 1 : 0,
        temperature: Math.round(22 + Math.random() * 6)
      },
      qualityScore: Math.floor(70 + Math.random() * 30),
      compliance: { ph: true, turbidity: Math.random() > 0.1, chlorine: true, tds: true, bacteria: Math.random() > 0.05, overall: Math.random() > 0.1 },
      riskLevel: Math.random() > 0.8 ? 'high' : Math.random() > 0.5 ? 'medium' : 'low',
      trend: Math.random() > 0.7 ? 'improving' : Math.random() > 0.4 ? 'stable' : 'deteriorating',
      recommendations: ['Continue monitoring', 'Adjust chlorine dosing'],
      confidence: Math.round(80 + Math.random() * 15),
      lastTestDate: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString().split('T')[0]
    }));

    const mockAlerts = mockSources.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').map(s => ({
      severity: s.riskLevel,
      sourceId: s.sourceId,
      sourceName: s.sourceName,
      type: 'quality_risk',
      message: `${s.sourceName}: ${s.riskLevel.toUpperCase()} risk - ${s.recommendations[0]}`,
      params: s.predictedParams,
      compliance: s.compliance
    }));

    return {
      predictions: { sources: mockSources, distribution: [], summary: { totalSources: mockSources.length, compliantSources: mockSources.filter(p => p.compliance.overall).length, highRiskSources: mockSources.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length, avgQualityScore: Math.round(mockSources.reduce((s, p) => s + p.qualityScore, 0) / mockSources.length) } },
      alerts: mockAlerts,
      loading: false, error: null, refresh: () => {},
      getSourcePrediction: (id) => mockSources.find(p => p.sourceId === id),
      getNodePrediction: (id) => null,
      getCriticalAlerts: () => mockAlerts.filter(a => a.severity === 'critical'),
      compliantCount: mockSources.filter(p => p.compliance.overall).length,
      highRiskCount: mockSources.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length,
      avgQualityScore: Math.round(mockSources.reduce((s, p) => s + p.qualityScore, 0) / mockSources.length),
      criticalAlertsCount: mockAlerts.filter(a => a.severity === 'critical').length
    };
  }, [sources, qualityTests, weatherData, treatmentRecords, distributionData]);

  if (loading) return <div className="panel-loading">Predicting water quality...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const filteredSources = predictions?.sources?.filter(s => 
    filterRisk === 'all' || s.riskLevel === filterRisk
  ) || [];

  return (
    <div className="water-quality-panel">
      <div className="panel-header">
        <h3>Water Quality Prediction</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="quality-metrics">
        <div className="metric-card"><h4>Sources Monitored</h4><div className="metric-value">{predictions?.summary?.totalSources || 0}</div></div>
        <div className="metric-card"><h4>Compliant</h4><div className="metric-value success">{compliantCount}</div></div>
        <div className="metric-card"><h4>High Risk</h4><div className="metric-value warning">{highRiskCount}</div></div>
        <div className="metric-card"><h4>Avg Quality Score</h4><div className="metric-value">{avgQualityScore}/100</div></div>
        <div className="metric-card"><h4>Critical Alerts</h4><div className="metric-value critical">{criticalAlertsCount}</div></div>
      </div>

      <div className="quality-tabs">
        <button className={activeTab === 'sources' ? 'active' : ''} onClick={() => setActiveTab('sources')}>Sources</button>
        <button className={activeTab === 'distribution' ? 'active' : ''} onClick={() => setActiveTab('distribution')}>Distribution</button>
        <button className={activeTab === 'alerts' ? 'active' : ''} onClick={() => setActiveTab('alerts')}>Alerts ({alerts.length})</button>
      </div>

      <div className="risk-filter">
        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}>
          <option value="all">All Risk Levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {activeTab === 'sources' && (
        <div className="sources-grid">
          {filteredSources.map(source => (
            <div key={source.sourceId} className={`source-card ${source.riskLevel}`}>
              <div className="source-header">
                <h4>{source.sourceName}</h4>
                <span className={`risk-badge ${source.riskLevel}`}>{source.riskLevel.toUpperCase()}</span>
              </div>
              <div className="quality-score">Score: {source.qualityScore}/100</div>
              <div className="params-grid">
                <div className="param"><span>pH</span><strong>{source.predictedParams.ph}</strong> {source.compliance.ph ? '✓' : '✗'}</div>
                <div className="param"><span>Turbidity</span><strong>{source.predictedParams.turbidity} NTU</strong> {source.compliance.turbidity ? '✓' : '✗'}</div>
                <div className="param"><span>Chlorine</span><strong>{source.predictedParams.chlorine} mg/L</strong> {source.compliance.chlorine ? '✓' : '✗'}</div>
                <div className="param"><span>TDS</span><strong>{source.predictedParams.tds} ppm</strong> {source.compliance.tds ? '✓' : '✗'}</div>
                <div className="param"><span>Bacteria</span><strong>{source.predictedParams.bacteria} CFU</strong> {source.compliance.bacteria ? '✓' : '✗'}</div>
              </div>
              <div className="trend">Trend: {source.trend}</div>
              <div className="recommendations">
                {source.recommendations?.map((r, i) => <div key={i} className="rec-item">• {r}</div>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'distribution' && (
        <div className="distribution-nodes">
          <p>Distribution node predictions would appear here</p>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="quality-alerts">
          {alerts.map((alert, i) => (
            <div key={i} className={`alert-card ${alert.severity}`}>
              <div className="alert-header">
                <span className={`severity-badge ${alert.severity}`}>{alert.severity.toUpperCase()}</span>
                <strong>{alert.sourceName}</strong>
              </div>
              <p>{alert.message}</p>
              <div className="alert-params">
                pH: {alert.params.ph} | Turbidity: {alert.params.turbidity} | Chlorine: {alert.params.chlorine}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WaterQualityPredictionPanel;