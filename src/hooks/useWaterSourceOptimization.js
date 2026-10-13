import { useState, useEffect, useCallback, useMemo } from 'react';

export function useWaterSourceOptimization({ sources = [], orders = [], qualityRecords = [] }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyzeSources = useCallback(async () => {
    if (!sources.length) {
      setAnalysis({
        recommendations: [],
        sourceScores: [],
        alerts: [],
        optimalMix: {}
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 300));

      const sourceScores = sources.map(source => {
        const sourceOrders = orders.filter(o => o.sourceId === source.id);
        const sourceQuality = qualityRecords.filter(q => q.sourceId === source.id);
        
        const avgQuality = sourceQuality.length
          ? sourceQuality.reduce((sum, q) => sum + (q.score || 0), 0) / sourceQuality.length
          : 0.85;
        
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
          metrics: {
            avgQuality,
            avgDistance,
            costPerUnit,
            reliability,
            utilization: Math.round(utilization * 100),
            currentLoad,
            capacity
          },
          tier: totalScore >= 0.8 ? 'premium' : totalScore >= 0.6 ? 'standard' : 'backup'
        };
      });

      const sortedSources = [...sourceScores].sort((a, b) => b.score - a.score);
      const primary = sortedSources[0];
      const secondary = sortedSources[1];
      const backup = sortedSources.slice(2);

      const recommendations = [];
      if (primary) {
        recommendations.push({
          type: 'primary',
          sourceId: primary.sourceId,
          sourceName: primary.name,
          reason: `Highest composite score (${primary.score}/100) — best quality/cost/distance balance`,
          confidence: primary.score
        });
      }
      if (secondary) {
        recommendations.push({
          type: 'secondary',
          sourceId: secondary.sourceId,
          sourceName: secondary.name,
          reason: `Backup source with ${secondary.score}/100 score — activates at >80% primary utilization`,
          confidence: secondary.score
        });
      }
      backup.forEach(b => {
        if (b.score >= 50) {
          recommendations.push({
            type: 'backup',
            sourceId: b.sourceId,
            sourceName: b.name,
            reason: `Emergency backup (${b.score}/100) — use only during shortages`,
            confidence: b.score
          });
        }
      });

      const alerts = [];
      sourceScores.forEach(s => {
        if (s.metrics.utilization > 90) {
          alerts.push({
            severity: 'critical',
            sourceId: s.sourceId,
            sourceName: s.name,
            message: `${s.name} at ${s.metrics.utilization}% capacity — risk of shortage`
          });
        } else if (s.metrics.utilization > 75) {
          alerts.push({
            severity: 'warning',
            sourceId: s.sourceId,
            sourceName: s.name,
            message: `${s.name} at ${s.metrics.utilization}% capacity — monitor closely`
          });
        }
        if (s.metrics.avgQuality < 70) {
          alerts.push({
            severity: 'critical',
            sourceId: s.sourceId,
            sourceName: s.name,
            message: `${s.name} quality dropped to ${s.metrics.avgQuality.toFixed(1)} — investigate immediately`
          });
        }
      });

      const optimalMix = {
        primary: primary?.sourceId || null,
        secondary: secondary?.sourceId || null,
        backup: backup.filter(b => b.score >= 50).map(b => b.sourceId),
        ratios: primary && secondary ? {
          primary: 0.7,
          secondary: 0.25,
          backup: 0.05
        } : { primary: 1 }
      };

      setAnalysis({
        recommendations,
        sourceScores: sortedSources,
        alerts,
        optimalMix,
        lastAnalyzed: new Date().toISOString()
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sources, orders, qualityRecords]);

  useEffect(() => { analyzeSources(); }, [analyzeSources]);

  const getSourceRecommendation = useCallback((sourceId) => {
    return analysis?.recommendations?.find(r => r.sourceId === sourceId) || null;
  }, [analysis]);

  const getSourceScore = useCallback((sourceId) => {
    return analysis?.sourceScores?.find(s => s.sourceId === sourceId) || null;
  }, [analysis]);

  return {
    analysis,
    loading,
    error,
    refresh: analyzeSources,
    getSourceRecommendation,
    getSourceScore,
    primarySource: analysis?.recommendations?.find(r => r.type === 'primary') || null,
    secondarySource: analysis?.recommendations?.find(r => r.type === 'secondary') || null,
    backupSources: analysis?.recommendations?.filter(r => r.type === 'backup') || [],
    alerts: analysis?.alerts || [],
    optimalMix: analysis?.optimalMix || {}
  };
}

export default useWaterSourceOptimization;