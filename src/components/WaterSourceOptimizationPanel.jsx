import React from 'react';

export function WaterSourceOptimizationPanel({ 
  sources = [], 
  orders = [], 
  qualityRecords = [],
  onNotice 
}) {
  const { 
    analysis, loading, error, refresh,
    primarySource, secondarySource, backupSources, alerts, optimalMix 
  } = React.useMemo(() => {
    const sourceScores = sources.map(source => {
      const sourceOrders = orders.filter(o => o.sourceId === source.id);
      const sourceQuality = qualityRecords.filter(q => q.sourceId === source.id);
      
      const avgQuality = sourceQuality.length
        ? sourceQuality.reduce((sum, q) => sum + (q.score || 0), 0) / sourceQuality.length
        : 85;
      
      const avgDistance = sourceOrders.length
        ? sourceOrders.reduce((sum, o) => sum + (o.distance || 0), 0) / sourceOrders.length
        : 10;
      
      const costPerUnit = source.costPerGallon || 0.02;
      const reliability = source.reliability || 0.9;
      const capacity = source.dailyCapacity || 50000;
      const currentLoad = sourceOrders.length * 1000;
      const utilization = currentLoad / capacity;

      const qualityScore = Math.min(1, avgQuality / 100) * 0.35;
      const costScore = Math.max(0, 1 - costPerUnit / 0.05) * 0.25;
      const distanceScore = Math.max(0, 1 - avgDistance / 50) * 0.2;
      const reliabilityScore = reliability * 0.15;
      const utilizationScore = utilization < 0.8 ? 1 : Math.max(0, 1 - (utilization - 0.8) / 0.3) * 0.05;

      const totalScore = qualityScore + costScore + distanceScore + reliabilityScore + utilizationScore;

      return {
        sourceId: source.id,
        name: source.name,
        score: Math.round(totalScore * 100),
        breakdown: {
          quality: Math.round(qualityScore * 100),
          cost: Math.round(costScore * 100),
          distance: Math.round(distanceScore * 100),
          reliability: Math.round(reliabilityScore * 100),
          utilization: Math.round(utilizationScore * 100)
        },
        metrics: { avgQuality, avgDistance, costPerUnit, reliability, utilization: Math.round(utilization * 100) },
        tier: totalScore >= 0.8 ? 'premium' : totalScore >= 0.6 ? 'standard' : 'backup'
      };
    }).sort((a, b) => b.score - a.score);

    const primary = sourceScores[0];
    const secondary = sourceScores[1];
    const backup = sourceScores.slice(2).filter(b => b.score >= 50);

    return {
      analysis: { sourceScores },
      loading: false,
      error: null,
      refresh: () => {},
      primarySource: primary ? { sourceId: primary.sourceId, sourceName: primary.name, reason: `Highest score (${primary.score}/100)`, confidence: primary.score } : null,
      secondarySource: secondary ? { sourceId: secondary.sourceId, sourceName: secondary.name, reason: `Backup at ${secondary.score}/100`, confidence: secondary.score } : null,
      backupSources: backup.map(b => ({ sourceId: b.sourceId, sourceName: b.name, reason: `Emergency (${b.score}/100)`, confidence: b.score })),
      alerts: [],
      optimalMix: { primary: primary?.sourceId, secondary: secondary?.sourceId, backup: backup.map(b => b.sourceId) }
    };
  }, [sources, orders, qualityRecords]);

  if (loading) return <div className="panel-loading">Analyzing water sources...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="water-source-panel">
      <div className="panel-header">
        <h3>Water Source Optimization</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="source-recommendations">
        <div className="recommendation-card primary">
          <span className="rec-badge">PRIMARY</span>
          {primarySource ? (
            <>
              <h4>{primarySource.sourceName}</h4>
              <p>{primarySource.reason}</p>
              <div className="confidence">Confidence: {primarySource.confidence}%</div>
            </>
          ) : (
            <p>No sources available</p>
          )}
        </div>

        <div className="recommendation-card secondary">
          <span className="rec-badge">SECONDARY</span>
          {secondarySource ? (
            <>
              <h4>{secondarySource.sourceName}</h4>
              <p>{secondarySource.reason}</p>
              <div className="confidence">Confidence: {secondarySource.confidence}%</div>
            </>
          ) : (
            <p>No secondary source configured</p>
          )}
        </div>

        {backupSources.length > 0 && (
          <div className="recommendation-card backup">
            <span className="rec-badge">BACKUP ({backupSources.length})</span>
            {backupSources.map(b => (
              <div key={b.sourceId} className="backup-item">
                <span>{b.sourceName}</span>
                <span className="confidence">{b.confidence}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="source-scores">
        <h4>Source Rankings</h4>
        <div className="scores-table">
          <div className="score-header">
            <span>Source</span>
            <span>Score</span>
            <span>Quality</span>
            <span>Cost</span>
            <span>Distance</span>
            <span>Reliability</span>
            <span>Utilization</span>
            <span>Tier</span>
          </div>
          {analysis?.sourceScores?.map(s => (
            <div key={s.sourceId} className={`score-row ${s.tier}`}>
              <span>{s.name}</span>
              <span className="score">{s.score}</span>
              <span>{s.breakdown.quality}</span>
              <span>{s.breakdown.cost}</span>
              <span>{s.breakdown.distance}</span>
              <span>{s.breakdown.reliability}</span>
              <span>{s.breakdown.utilization}</span>
              <span className={`tier-badge ${s.tier}`}>{s.tier.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="optimal-mix">
        <h4>Recommended Mix</h4>
        <div className="mix-bars">
          {optimalMix.primary && <div className="mix-bar primary" style={{ width: `${(optimalMix.ratios?.primary || 0.7) * 100}%` }}><span>Primary 70%</span></div>}
          {optimalMix.secondary && <div className="mix-bar secondary" style={{ width: `${(optimalMix.ratios?.secondary || 0.25) * 100}%` }}><span>Secondary 25%</span></div>}
          {optimalMix.backup && optimalMix.backup.length > 0 && <div className="mix-bar backup" style={{ width: `${(optimalMix.ratios?.backup || 0.05) * 100}%` }}><span>Backup 5%</span></div>}
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="source-alerts">
          <h4>⚠ Alerts</h4>
          {alerts.map((alert, i) => (
            <div key={i} className={`alert ${alert.severity}`}>
              <strong>{alert.sourceName}</strong>: {alert.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WaterSourceOptimizationPanel;