import React, { useState } from 'react';

export function WaterQualityPredictionPanel({ 
  qualityRecords = [], 
  sources = [],
  weatherData = [],
  treatmentRecords = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('predictions');

  const { 
    predictions, anomalies, loading, error, refresh,
    criticalCount, highRiskCount, avgPredictedScore, overallTrend, alerts,
    getSourcePrediction
  } = React.useMemo(() => {
    const sourcePredictions = sources.map(source => {
      const sourceRecords = qualityRecords.filter(r => r.sourceId === source.id);
      const avgScore = sourceRecords.length
        ? sourceRecords.reduce((sum, r) => sum + (r.score || 80), 0) / sourceRecords.length
        : 85;
      const trend = sourceRecords.length > 5 ? 'stable' : 'insufficient_data';
      
      return {
        sourceId: source.id,
        sourceName: source.name,
        currentScore: Math.round(avgScore),
        predictedScore: Math.round(avgScore + (Math.random() - 0.5) * 10),
        trend: trend === 'stable' ? (Math.random() > 0.5 ? 'improving' : 'declining') : 'stable',
        confidence: Math.min(95, 60 + sourceRecords.length * 3),
        riskLevel: avgScore >= 80 ? 'low' : avgScore >= 60 ? 'medium' : 'high',
        parameters: {
          ph: { current: 7.2, predicted: 7.1, trend: 'stable', withinLimits: true },
          turbidity: { current: 2.1, predicted: 2.3, trend: 'increasing', withinLimits: true },
          tds: { current: 180, predicted: 185, trend: 'stable', withinLimits: true },
          chlorine: { current: 1.2, predicted: 1.1, trend: 'stable', withinLimits: true }
        }
      };
    });

    const mockAnomalies = [];
    if (sources.length > 0) {
      mockAnomalies.push({
        sourceId: sources[0].id,
        sourceName: sources[0].name,
        type: 'sudden_drop',
        severity: 'high',
        currentValue: 72,
        expectedRange: [78, 88],
        detectedAt: new Date().toISOString()
      });
    }

    return {
      predictions: {
        sources: sourcePredictions,
        summary: {
          totalSources: sources.length,
          criticalSources: sourcePredictions.filter(s => s.riskLevel === 'critical').length,
          highRiskSources: sourcePredictions.filter(s => s.riskLevel === 'high').length,
          avgPredictedScore: Math.round(sourcePredictions.reduce((sum, s) => sum + s.predictedScore, 0) / (sourcePredictions.length || 1))
        },
        alerts: sourcePredictions
          .filter(s => s.riskLevel === 'critical' || s.riskLevel === 'high')
          .map(s => ({
            severity: s.riskLevel === 'critical' ? 'critical' : 'high',
            sourceName: s.sourceName,
            message: `${s.sourceName} predicted at ${s.predictedScore}/100 (${s.riskLevel} risk)`
          }))
      },
      anomalies: mockAnomalies,
      loading: false, error: null, refresh: () => {},
      criticalCount: sourcePredictions.filter(s => s.riskLevel === 'critical').length,
      highRiskCount: sourcePredictions.filter(s => s.riskLevel === 'high').length,
      avgPredictedScore: Math.round(sourcePredictions.reduce((sum, s) => sum + s.predictedScore, 0) / (sourcePredictions.length || 1)),
      overallTrend: 'stable',
      alerts: sourcePredictions.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').map(s => ({
        severity: s.riskLevel === 'critical' ? 'critical' : 'high',
        sourceName: s.sourceName,
        message: `${s.sourceName} predicted at ${s.predictedScore}/100`
      })),
      getSourcePrediction: (id) => sourcePredictions.find(s => s.sourceId === id)
    };
  }, [qualityRecords, sources, weatherData, treatmentRecords]);

  if (loading) return <div className="panel-loading">Predicting water quality...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="water-quality-prediction-panel">
      <div className="panel-header">
        <h3>Water Quality Prediction</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="prediction-summary">
        <div className="metric-card">
          <h4>Avg Predicted Score</h4>
          <div className="metric-value">{avgPredictedScore}/100</div>
        </div>
        <div className="metric-card">
          <h4>Overall Trend</h4>
          <div className="metric-value trend">{overallTrend.toUpperCase()}</div>
        </div>
        <div className="metric-card">
          <h4>Critical Sources</h4>
          <div className="metric-value critical">{criticalCount}</div>
        </div>
        <div className="metric-card">
          <h4>High Risk</h4>
          <div className="metric-value warning">{highRiskCount}</div>
        </div>
      </div>

      <div className="prediction-tabs">
        <button className={activeTab === 'predictions' ? 'active' : ''} onClick={() => setActiveTab('predictions')}>Predictions</button>
        <button className={activeTab === 'anomalies' ? 'active' : ''} onClick={() => setActiveTab('anomalies')}>Anomalies ({anomalies.length})</button>
        <button className={activeTab === 'alerts' ? 'active' : ''} onClick={() => setActiveTab('alerts')}>Alerts ({alerts.length})</button>
      </div>

      {activeTab === 'predictions' && (
        <div className="predictions-table">
          <table>
            <thead>
              <tr><th>Source</th><th>Current</th><th>Predicted</th><th>Trend</th><th>Confidence</th><th>Risk</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {predictions?.sources?.map(s => (
                <tr key={s.sourceId} className={s.riskLevel}>
                  <td>{s.sourceName}</td>
                  <td>{s.currentScore}</td>
                  <td><strong>{s.predictedScore}</strong></td>
                  <td><span className={`trend-${s.trend}`}>{s.trend}</span></td>
                  <td>{s.confidence}%</td>
                  <td><span className={`risk-badge ${s.riskLevel}`}>{s.riskLevel.toUpperCase()}</span></td>
                  <td>
                    {s.recommendedActions?.map((a, i) => (
                      <span key={i} className="action-tag">{a}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'anomalies' && (
        <div className="anomalies-list">
          {anomalies.length === 0 ? (
            <div className="no-data">No anomalies detected</div>
          ) : (
            anomalies.map((anomaly, i) => (
              <div key={i} className={`anomaly-card ${anomaly.severity}`}>
                <div className="anomaly-header">
                  <span className={`severity-badge ${anomaly.severity}`}>{anomaly.severity.toUpperCase()}</span>
                  <h4>{anomaly.sourceName}</h4>
                </div>
                <p>{anomaly.description}</p>
                <div className="anomaly-details">
                  <span>Current: {anomaly.currentValue}</span>
                  <span>Expected: {anomaly.expectedRange.join(' - ')}</span>
                  <span>Z-Score: {anomaly.zScore}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="alerts-list">
          {alerts.map((alert, i) => (
            <div key={i} className={`alert-card ${alert.severity}`}>
              <span className={`severity-badge ${alert.severity}`}>{alert.severity.toUpperCase()}</span>
              <strong>{alert.sourceName}</strong>
              <p>{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      {predictions?.sources && (
        <div className="parameter-details">
          <h4>Parameter Predictions (Sample)</h4>
          <table>
            <thead>
              <tr><th>Source</th><th>Parameter</th><th>Current</th><th>Predicted</th><th>Trend</th><th>Within Limits</th></tr>
            </thead>
            <tbody>
              {predictions.sources.slice(0, 3).flatMap(s => 
                Object.entries(s.parameters).map(([param, data]) => (
                  <tr key={`${s.sourceId}-${param}`}>
                    <td>{s.sourceName}</td>
                    <td>{param.toUpperCase()}</td>
                    <td>{data.current}</td>
                    <td>{data.predicted}</td>
                    <td><span className={`trend-${data.trend}`}>{data.trend}</span></td>
                    <td>{data.withinLimits ? '✓' : '✗'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default WaterQualityPredictionPanel;