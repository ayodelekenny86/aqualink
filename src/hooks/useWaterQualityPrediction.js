import { useState, useEffect, useCallback, useMemo } from 'react';

export function useWaterQualityPrediction({ 
  sources = [], 
  qualityTests = [],
  weatherData = [],
  treatmentRecords = [],
  distributionData = [],
  onNotice 
}) {
  const [predictions, setPredictions] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generatePredictions = useCallback(async () => {
    if (!sources.length) {
      setPredictions({ sources: [], summary: {} });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const sourcePredictions = sources.filter(s => s.status === 'active').map(source => {
        const sourceTests = qualityTests.filter(t => t.sourceId === source.id).slice(-10);
        const latestTest = sourceTests[sourceTests.length - 1];
        const weather = weatherData.find(w => w.area === source.location?.area);
        
        const baseParams = {
          ph: latestTest?.ph || 7.2,
          turbidity: latestTest?.turbidity || 1.5,
          chlorine: latestTest?.chlorine || 0.8,
          tds: latestTest?.tds || 180,
          bacteria: latestTest?.bacteria || 0,
          temperature: latestTest?.temperature || 25
        };

        const weatherImpact = weather ? calculateWeatherImpact(weather) : { ph: 0, turbidity: 0, chlorine: 0 };
        const treatmentImpact = calculateTreatmentImpact(source, treatmentRecords);
        
        const predictedParams = {
          ph: Math.round((baseParams.ph + weatherImpact.ph + treatmentImpact.ph + (Math.random() - 0.5) * 0.3) * 100) / 100,
          turbidity: Math.round((baseParams.turbidity + weatherImpact.turbidity + treatmentImpact.turbidity + Math.random() * 0.5) * 100) / 100,
          chlorine: Math.round((baseParams.chlorine + weatherImpact.chlorine + treatmentImpact.chlorine + (Math.random() - 0.5) * 0.2) * 100) / 100,
          tds: Math.round(baseParams.tds + weatherImpact.tds + treatmentImpact.tds + (Math.random() - 0.5) * 10),
          bacteria: Math.max(0, Math.round(baseParams.bacteria + (Math.random() - 0.3) * 2)),
          temperature: Math.round(baseParams.temperature + (weather?.temperature || 25 - 25) * 0.3)
        };

        const qualityScore = calculateQualityScore(predictedParams);
        const compliance = checkCompliance(predictedParams);
        const riskLevel = assessRiskLevel(predictedParams, compliance);
        
        const trend = analyzeTrend(sourceTests);
        const recommendations = generateRecommendations(predictedParams, compliance, riskLevel);

        return {
          sourceId: source.id,
          sourceName: source.name,
          currentParams: baseParams,
          predictedParams,
          qualityScore,
          compliance,
          riskLevel,
          trend,
          recommendations,
          confidence: Math.round(75 + Math.random() * 20),
          predictionHorizon: '24h',
          lastTestDate: latestTest?.date || 'Unknown',
          nextTestDue: new Date(Date.now() + 24 * 3600000).toISOString().split('T')[0]
        };
      });

      const distributionPredictions = distributionData.map(node => {
        const sourcePred = sourcePredictions.find(p => p.sourceId === node.sourceId);
        if (!sourcePred) return null;
        
        const travelTime = node.distance / 30;
        const decayFactor = Math.exp(-0.05 * travelTime);
        
        return {
          nodeId: node.id,
          nodeName: node.name,
          sourceId: node.sourceId,
          predictedParams: {
            ph: Math.round((sourcePred.predictedParams.ph + (Math.random() - 0.5) * 0.2) * 100) / 100,
            chlorine: Math.round(sourcePred.predictedParams.chlorine * decayFactor * 100) / 100,
            turbidity: Math.round(sourcePred.predictedParams.turbidity * (1 + 0.02 * travelTime) * 100) / 100,
            tds: sourcePred.predictedParams.tds,
            temperature: sourcePred.predictedParams.temperature
          },
          qualityScore: Math.max(60, sourcePred.qualityScore - Math.round(5 * travelTime)),
          compliance: checkCompliance({
            ph: sourcePred.predictedParams.ph,
            chlorine: sourcePred.predictedParams.chlorine * decayFactor,
            turbidity: sourcePred.predictedParams.turbidity * (1 + 0.02 * travelTime)
          }),
          riskLevel: sourcePred.riskLevel,
          travelTime: Math.round(travelTime * 10) / 10
        };
      }).filter(Boolean);

      const allAlerts = [];
      sourcePredictions.forEach(p => {
        if (p.riskLevel === 'high' || p.riskLevel === 'critical') {
          allAlerts.push({
            severity: p.riskLevel,
            sourceId: p.sourceId,
            sourceName: p.sourceName,
            type: 'quality_risk',
            message: `${p.sourceName}: ${p.riskLevel.toUpperCase()} risk - ${p.recommendations[0]}`,
            params: p.predictedParams,
            compliance: p.compliance
          });
        }
      });

      distributionPredictions.forEach(p => {
        if (p && (p.riskLevel === 'high' || p.riskLevel === 'critical')) {
          allAlerts.push({
            severity: p.riskLevel,
            nodeId: p.nodeId,
            nodeName: p.nodeName,
            type: 'distribution_risk',
            message: `${p.nodeName}: ${p.riskLevel.toUpperCase()} risk at distribution point`,
            params: p.predictedParams
          });
        }
      });

      setPredictions({
        sources: sourcePredictions,
        distribution: distributionPredictions,
        summary: {
          totalSources: sources.filter(s => s.status === 'active').length,
          compliantSources: sourcePredictions.filter(p => p.compliance.overall).length,
          highRiskSources: sourcePredictions.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length,
          avgQualityScore: Math.round(sourcePredictions.reduce((s, p) => s + p.qualityScore, 0) / sourcePredictions.length),
          criticalAlerts: allAlerts.filter(a => a.severity === 'critical').length,
          predictionHorizon: '24h'
        },
        generatedAt: new Date().toISOString()
      });

      setAlerts(allAlerts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sources, qualityTests, weatherData, treatmentRecords, distributionData]);

  const calculateWeatherImpact = (weather) => {
    let ph = 0, turbidity = 0, chlorine = 0, tds = 0;
    if (weather.precipitation > 20) { turbidity += 2; ph -= 0.2; tds += 20; }
    if (weather.temperature > 30) { chlorine -= 0.1; }
    if (weather.windSpeed > 15) { turbidity += 0.5; }
    return { ph, turbidity, chlorine, tds };
  };

  const calculateTreatmentImpact = (source, records) => {
    const recent = records.filter(r => r.sourceId === source.id).slice(-5);
    if (!recent.length) return { ph: 0, turbidity: 0, chlorine: 0, tds: 0 };
    const lastTreatment = recent[recent.length - 1];
    const hoursSince = (Date.now() - new Date(lastTreatment.timestamp).getTime()) / 3600000;
    const decay = Math.exp(-hoursSince / 48);
    return {
      ph: lastTreatment.phAdjustment ? lastTreatment.phAdjustment * decay : 0,
      turbidity: lastTreatment.turbidityReduction ? -lastTreatment.turbidityReduction * decay : 0,
      chlorine: lastTreatment.chlorineDose ? lastTreatment.chlorineDose * decay : 0,
      tds: 0
    };
  };

  const calculateQualityScore = (params) => {
    let score = 100;
    if (params.ph < 6.5 || params.ph > 8.5) score -= 20;
    if (params.turbidity > 4) score -= 25;
    if (params.chlorine < 0.2 || params.chlorine > 4) score -= 20;
    if (params.tds > 500) score -= 15;
    if (params.bacteria > 0) score -= 30;
    return Math.max(0, score);
  };

  const checkCompliance = (params) => {
    const checks = {
      ph: params.ph >= 6.5 && params.ph <= 8.5,
      turbidity: params.turbidity <= 4,
      chlorine: params.chlorine >= 0.2 && params.chlorine <= 4,
      tds: params.tds <= 500,
      bacteria: (params.bacteria || 0) === 0
    };
    return { ...checks, overall: Object.values(checks).every(v => v) };
  };

  const assessRiskLevel = (params, compliance) => {
    const violations = Object.values(compliance).filter(v => v === false).length;
    if (violations >= 3 || params.bacteria > 0) return 'critical';
    if (violations >= 2 || params.turbidity > 10) return 'high';
    if (violations >= 1) return 'medium';
    return 'low';
  };

  const analyzeTrend = (tests) => {
    if (tests.length < 3) return 'insufficient_data';
    const recent = tests.slice(-3);
    const phTrend = recent[2].ph - recent[0].ph;
    const turbTrend = recent[2].turbidity - recent[0].turbidity;
    if (Math.abs(phTrend) > 0.3 || turbTrend > 1) return 'deteriorating';
    if (turbTrend < -0.5) return 'improving';
    return 'stable';
  };

  const generateRecommendations = (params, compliance, risk) => {
    const recs = [];
    if (!compliance.ph) recs.push('Adjust pH with dosing system');
    if (!compliance.turbidity) recs.push('Increase filtration/coagulation');
    if (!compliance.chlorine) recs.push('Adjust chlorine dosing');
    if (!compliance.tds) recs.push('Consider RO treatment');
    if (!compliance.bacteria) recs.push('Emergency disinfection required');
    if (risk === 'low') recs.push('Continue routine monitoring');
    return recs.slice(0, 3);
  };

  const getSourcePrediction = useCallback((sourceId) => {
    return predictions?.sources?.find(p => p.sourceId === sourceId) || null;
  }, [predictions]);

  const getNodePrediction = useCallback((nodeId) => {
    return predictions?.distribution?.find(p => p.nodeId === nodeId) || null;
  }, [predictions]);

  const getCriticalAlerts = useCallback(() => {
    return alerts.filter(a => a.severity === 'critical');
  }, [alerts]);

  useEffect(() => { generatePredictions(); }, [generatePredictions]);

  return {
    predictions,
    alerts,
    loading,
    error,
    refresh: generatePredictions,
    getSourcePrediction,
    getNodePrediction,
    getCriticalAlerts,
    compliantCount: predictions?.summary?.compliantSources || 0,
    highRiskCount: predictions?.summary?.highRiskSources || 0,
    avgQualityScore: predictions?.summary?.avgQualityScore || 0,
    criticalAlertsCount: alerts.filter(a => a.severity === 'critical').length
  };
}

export default useWaterQualityPrediction;