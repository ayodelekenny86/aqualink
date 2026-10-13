import { useState, useEffect, useCallback, useMemo } from 'react';

export function useWaterQualityPrediction({ 
  qualityRecords = [], 
  sources = [],
  weatherData = [],
  treatmentRecords = [],
  onNotice 
}) {
  const [predictions, setPredictions] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const predictQuality = useCallback(async () => {
    if (!qualityRecords.length) {
      setPredictions({ sources: [], trends: [], alerts: [] });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 350));

      const sourcePredictions = sources.map(source => {
        const sourceRecords = qualityRecords.filter(r => r.sourceId === source.id);
        if (sourceRecords.length < 3) {
          return {
            sourceId: source.id,
            sourceName: source.name,
            currentScore: source.currentQuality || 85,
            predictedScore: source.currentQuality || 85,
            trend: 'stable',
            confidence: 50,
            parameters: {},
            riskLevel: 'low',
            recommendedActions: ['Increase monitoring frequency']
          };
        }

        const recent = sourceRecords.slice(-10);
        const scores = recent.map(r => r.score || r.overallScore || 80);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const trend = calculateTrend(scores);
        
        const params = ['ph', 'turbidity', 'tds', 'chlorine', 'bacteria', 'hardness', 'alkalinity'];
        const parameterPredictions = {};
        
        params.forEach(param => {
          const values = recent.map(r => r[param]).filter(v => v != null);
          if (values.length >= 3) {
            const paramTrend = calculateTrend(values);
            const lastValue = values[values.length - 1];
            const predicted = lastValue + (paramTrend * 2);
            parameterPredictions[param] = {
              current: lastValue,
              predicted: Math.round(predicted * 100) / 100,
              trend: paramTrend > 0.1 ? 'increasing' : paramTrend < -0.1 ? 'decreasing' : 'stable',
              withinLimits: checkLimits(param, predicted)
            };
          }
        });

        const weatherImpact = calculateWeatherImpact(weatherData, source.location);
        const treatmentImpact = calculateTreatmentImpact(treatmentRecords, source.id);

        const predictedScore = Math.max(0, Math.min(100, 
          avgScore + (trend * 5) + weatherImpact + treatmentImpact
        ));

        const riskLevel = predictedScore >= 80 ? 'low' : predictedScore >= 60 ? 'medium' : predictedScore >= 40 ? 'high' : 'critical';

        const recommendedActions = [];
        if (predictedScore < 70) recommendedActions.push('Increase treatment dosage');
        if (predictedScore < 60) recommendedActions.push('Activate backup source');
        if (trend < -0.1) recommendedActions.push('Investigate quality decline');
        if (weatherImpact < -5) recommendedActions.push('Pre-treat for weather impact');
        if (Object.values(parameterPredictions).some(p => !p.withinLimits)) {
          recommendedActions.push('Adjust specific parameter treatments');
        }

        return {
          sourceId: source.id,
          sourceName: source.name,
          currentScore: Math.round(avgScore),
          predictedScore: Math.round(predictedScore),
          trend: trend > 0.1 ? 'improving' : trend < -0.1 ? 'declining' : 'stable',
          confidence: Math.min(95, 60 + sourceRecords.length * 2),
          parameters: parameterPredictions,
          riskLevel,
          recommendedActions: recommendedActions.length ? recommendedActions : ['Continue routine monitoring'],
          weatherImpact: Math.round(weatherImpact),
          treatmentImpact: Math.round(treatmentImpact),
          nextTestRecommended: getNextTestDate(sourceRecords)
        };
      });

      const overallTrend = calculateOverallTrend(sourcePredictions);
      const criticalSources = sourcePredictions.filter(s => s.riskLevel === 'critical').length;
      const highRiskSources = sourcePredictions.filter(s => s.riskLevel === 'high').length;

      const alerts = [];
      sourcePredictions.forEach(s => {
        if (s.riskLevel === 'critical') {
          alerts.push({
            severity: 'critical',
            sourceId: s.sourceId,
            sourceName: s.sourceName,
            message: `${s.sourceName} predicted to reach critical quality (${s.predictedScore}/100)`,
            predictedScore: s.predictedScore,
            timeframe: '24-48 hours',
            actions: s.recommendedActions
          });
        } else if (s.riskLevel === 'high') {
          alerts.push({
            severity: 'high',
            sourceId: s.sourceId,
            sourceName: s.sourceName,
            message: `${s.sourceName} quality declining toward high risk (${s.predictedScore}/100)`,
            predictedScore: s.predictedScore,
            timeframe: '3-5 days',
            actions: s.recommendedActions
          });
        }
      });

      const detectedAnomalies = detectAnomalies(qualityRecords);
      setAnomalies(detectedAnomalies);

      const newPredictions = {
        sources: sourcePredictions,
        overallTrend,
        summary: {
          totalSources: sources.length,
          criticalSources,
          highRiskSources,
          mediumRiskSources: sourcePredictions.filter(s => s.riskLevel === 'medium').length,
          lowRiskSources: sourcePredictions.filter(s => s.riskLevel === 'low').length,
          avgPredictedScore: sourcePredictions.length 
            ? Math.round(sourcePredictions.reduce((sum, s) => sum + s.predictedScore, 0) / sourcePredictions.length)
            : 0
        },
        alerts: alerts.sort((a, b) => 
          (b.severity === 'critical' ? 3 : b.severity === 'high' ? 2 : 1) - 
          (a.severity === 'critical' ? 3 : a.severity === 'high' ? 2 : 1)
        ),
        generatedAt: new Date().toISOString()
      };

      setPredictions(newPredictions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [qualityRecords, sources, weatherData, treatmentRecords]);

  const detectAnomalies = useCallback((records) => {
    const anomalies = [];
    const bySource = {};
    records.forEach(r => {
      if (!bySource[r.sourceId]) bySource[r.sourceId] = [];
      bySource[r.sourceId].push(r);
    });

    Object.entries(bySource).forEach(([sourceId, sourceRecords]) => {
      const recent = sourceRecords.slice(-20);
      const scores = recent.map(r => r.score || r.overallScore).filter(v => v != null);
      if (scores.length < 5) return;

      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const stdDev = Math.sqrt(scores.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / scores.length);
      const lastScore = scores[scores.length - 1];
      const zScore = stdDev > 0 ? Math.abs(lastScore - mean) / stdDev : 0;

      if (zScore > 2.5) {
        anomalies.push({
          sourceId,
          sourceName: sources.find(s => s.id === sourceId)?.name || sourceId,
          type: lastScore < mean ? 'sudden_drop' : 'sudden_spike',
          severity: zScore > 3.5 ? 'critical' : 'high',
          currentValue: lastScore,
          expectedRange: [Math.round(mean - 2 * stdDev), Math.round(mean + 2 * stdDev)],
          zScore: Math.round(zScore * 10) / 10,
          detectedAt: new Date().toISOString(),
          description: `Quality ${lastScore < mean ? 'drop' : 'spike'} detected: ${lastScore} (expected ${Math.round(mean)}±${Math.round(stdDev)})`
        });
      }

      const params = ['ph', 'turbidity', 'tds', 'chlorine', 'bacteria'];
      params.forEach(param => {
        const values = recent.map(r => r[param]).filter(v => v != null);
        if (values.length < 5) return;
        const paramMean = values.reduce((a, b) => a + b, 0) / values.length;
        const paramStdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - paramMean, 2), 0) / values.length);
        const lastValue = values[values.length - 1];
        const paramZScore = paramStdDev > 0 ? Math.abs(lastValue - paramMean) / paramStdDev : 0;

        if (paramZScore > 3) {
          anomalies.push({
            sourceId,
            sourceName: sources.find(s => s.id === sourceId)?.name || sourceId,
            type: `parameter_${param}_anomaly`,
            parameter: param,
            severity: paramZScore > 4 ? 'critical' : 'high',
            currentValue: lastValue,
            expectedRange: [Math.round((paramMean - 2 * paramStdDev) * 100) / 100, Math.round((paramMean + 2 * paramStdDev) * 100) / 100],
            zScore: Math.round(paramZScore * 10) / 10,
            detectedAt: new Date().toISOString(),
            description: `${param.toUpperCase()} anomaly: ${lastValue} (expected ${paramMean.toFixed(2)}±${paramStdDev.toFixed(2)})`
          });
        }
      });
    });

    return anomalies.sort((a, b) => 
      (b.severity === 'critical' ? 2 : 1) - (a.severity === 'critical' ? 2 : 1)
    );
  }, [sources]);

  const getSourcePrediction = useCallback((sourceId) => {
    return predictions?.sources?.find(s => s.sourceId === sourceId) || null;
  }, [predictions]);

  const getCriticalAlerts = useCallback(() => {
    return predictions?.alerts?.filter(a => a.severity === 'critical') || [];
  }, [predictions]);

  const acknowledgeAnomaly = useCallback((anomalyIndex) => {
    setAnomalies(prev => prev.filter((_, i) => i !== anomalyIndex));
    onNotice?.('Anomaly acknowledged');
  }, [onNotice]);

  useEffect(() => { predictQuality(); }, [predictQuality]);

  return {
    predictions,
    anomalies,
    loading,
    error,
    refresh: predictQuality,
    getSourcePrediction,
    getCriticalAlerts,
    acknowledgeAnomaly,
    criticalCount: predictions?.summary?.criticalSources || 0,
    highRiskCount: predictions?.summary?.highRiskSources || 0,
    avgPredictedScore: predictions?.summary?.avgPredictedScore || 0,
    overallTrend: predictions?.overallTrend || 'stable',
    alerts: predictions?.alerts || []
  };
}

function calculateTrend(values) {
  if (values.length < 2) return 0;
  const n = values.length;
  const xSum = (n - 1) * n / 2;
  const ySum = values.reduce((a, b) => a + b, 0);
  const xySum = values.reduce((sum, y, i) => sum + i * y, 0);
  const x2Sum = values.reduce((sum, _, i) => sum + i * i, 0);
  return (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
}

function calculateOverallTrend(sourcePredictions) {
  const improving = sourcePredictions.filter(s => s.trend === 'improving').length;
  const declining = sourcePredictions.filter(s => s.trend === 'declining').length;
  if (improving > declining * 1.5) return 'improving';
  if (declining > improving * 1.5) return 'declining';
  return 'stable';
}

function calculateWeatherImpact(weatherData, location) {
  const weather = weatherData.find(w => w.area === location);
  if (!weather) return 0;
  if (weather.condition === 'heavy_rain') return -8;
  if (weather.condition === 'rain') return -4;
  if (weather.condition === 'flood') return -15;
  if (weather.condition === 'drought') return -3;
  if (weather.condition === 'extreme_heat') return -2;
  return 0;
}

function calculateTreatmentImpact(treatmentRecords, sourceId) {
  const recent = treatmentRecords
    .filter(t => t.sourceId === sourceId)
    .slice(-5);
  if (!recent.length) return 0;
  const avgEffectiveness = recent.reduce((sum, t) => sum + (t.effectiveness || 0), 0) / recent.length;
  return (avgEffectiveness - 50) / 10;
}

function checkLimits(param, value) {
  const limits = {
    ph: { min: 6.5, max: 8.5 },
    turbidity: { min: 0, max: 5 },
    tds: { min: 0, max: 500 },
    chlorine: { min: 0.2, max: 4 },
    bacteria: { min: 0, max: 0 },
    hardness: { min: 0, max: 300 },
    alkalinity: { min: 20, max: 200 }
  };
  const limit = limits[param];
  if (!limit) return true;
  return value >= limit.min && value <= limit.max;
}

function getNextTestDate(records) {
  const lastRecord = records[records.length - 1];
  if (!lastRecord?.date) return null;
  const lastDate = new Date(lastRecord.date);
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + 7);
  return nextDate.toISOString();
}

export default useWaterQualityPrediction;