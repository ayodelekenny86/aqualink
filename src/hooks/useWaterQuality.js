import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update, findBy } from '../lib/collections';
import { formatCedi } from '../lib/money';

/**
 * Water Quality Trend Analysis & Compliance Alerts
 * 
 * Features:
 * - Real-time water quality parameter tracking (pH, turbidity, chlorine, coliform, E. coli)
 * - WHO/Ghana Standards compliance monitoring
 * - Trend analysis with statistical process control
 * - Predictive quality forecasting
 * - Source water risk assessment
 * - Treatment effectiveness monitoring
 * - Automated compliance reporting
 * - Alert escalation for critical parameters
 * - Historical comparison and benchmarking
 * - Certificate generation for institutional clients
 */

const WHO_STANDARDS = {
  ph: { min: 6.5, max: 8.5, unit: 'pH', critical: { min: 6.0, max: 9.0 } },
  turbidity: { max: 5, unit: 'NTU', critical: { max: 10 } },
  chlorine: { min: 0.2, max: 0.5, unit: 'mg/L', critical: { min: 0.1, max: 1.0 } },
  coliform: { max: 0, unit: 'CFU/100ml', critical: { max: 10 } },
  ecoli: { max: 0, unit: 'CFU/100ml', critical: { max: 1 } },
  tds: { max: 600, unit: 'mg/L', critical: { max: 1000 } },
  hardness: { max: 300, unit: 'mg/L CaCO3', critical: { max: 500 } },
  nitrate: { max: 50, unit: 'mg/L', critical: { max: 100 } },
  fluoride: { max: 1.5, unit: 'mg/L', critical: { max: 3.0 } },
  iron: { max: 0.3, unit: 'mg/L', critical: { max: 1.0 } },
  manganese: { max: 0.1, unit: 'mg/L', critical: { max: 0.5 } },
};

const PARAMETER_WEIGHTS = {
  ph: 0.15,
  turbidity: 0.15,
  chlorine: 0.15,
  coliform: 0.20,
  ecoli: 0.20,
  tds: 0.05,
  hardness: 0.05,
  nitrate: 0.03,
  fluoride: 0.02,
};

function checkCompliance(parameters) {
  const results = {};
  let overallPass = true;
  let criticalFailures = 0;
  let warnings = 0;
  
  Object.entries(parameters).forEach(([param, value]) => {
    const standard = WHO_STANDARDS[param];
    if (!standard) {
      results[param] = { value, status: 'unknown', message: 'No standard defined' };
      return;
    }
    
    const numValue = Number(value);
    if (isNaN(numValue)) {
      results[param] = { value, status: 'unknown', message: 'Invalid value' };
      return;
    }
    
    let status = 'pass';
    let message = 'Within limits';
    
    if (standard.min !== undefined && numValue < standard.critical.min) {
      status = 'critical';
      message = `Critically low (${numValue} ${standard.unit} < ${standard.critical.min} ${standard.unit})`;
      criticalFailures++;
    } else if (standard.max !== undefined && numValue > standard.critical.max) {
      status = 'critical';
      message = `Critically high (${numValue} ${standard.unit} > ${standard.critical.max} ${standard.unit})`;
      criticalFailures++;
    } else if (standard.min !== undefined && numValue < standard.min) {
      status = 'warning';
      message = `Below recommended (${numValue} ${standard.unit} < ${standard.min} ${standard.unit})`;
      warnings++;
    } else if (standard.max !== undefined && numValue > standard.max) {
      status = 'warning';
      message = `Above recommended (${numValue} ${standard.unit} > ${standard.max} ${standard.unit})`;
      warnings++;
    }
    
    if (status !== 'pass') overallPass = false;
    results[param] = { value: numValue, status, message, standard };
  });
  
  const score = calculateQualityScore(parameters);
  
  return {
    overallPass,
    score,
    criticalFailures,
    warnings,
    parameters: results,
    classification: score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'fair' : 'poor',
  };
}

function calculateQualityScore(parameters) {
  let totalWeight = 0;
  let weightedScore = 0;
  
  Object.entries(parameters).forEach(([param, value]) => {
    const standard = WHO_STANDARDS[param];
    const weight = PARAMETER_WEIGHTS[param] || 0;
    if (!standard || weight === 0) return;
    
    const numValue = Number(value);
    if (isNaN(numValue)) return;
    
    let paramScore = 100;
    
    if (standard.min !== undefined && standard.max !== undefined) {
      const range = standard.max - standard.min;
      const optimal = (standard.min + standard.max) / 2;
      const deviation = Math.abs(numValue - optimal) / (range / 2);
      paramScore = Math.max(0, 100 - deviation * 100);
    } else if (standard.max !== undefined) {
      if (numValue <= standard.max) {
        paramScore = 100;
      } else {
        const excess = (numValue - standard.max) / standard.max;
        paramScore = Math.max(0, 100 - excess * 200);
      }
    } else if (standard.min !== undefined) {
      if (numValue >= standard.min) {
        paramScore = 100;
      } else {
        const deficit = (standard.min - numValue) / standard.min;
        paramScore = Math.max(0, 100 - deficit * 200);
      }
    }
    
    weightedScore += paramScore * weight;
    totalWeight += weight;
  });
  
  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
}

function detectTrends(records, parameter, daysBack = 90) {
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const paramRecords = records
    .filter(r => r.parameters?.[parameter] !== undefined && new Date(r.date).getTime() >= cutoff)
    .map(r => ({ date: r.date, value: Number(r.parameters[parameter]) }))
    .filter(r => !isNaN(r.value))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (paramRecords.length < 5) return { trend: 'insufficient_data', slope: 0, r2: 0 };
  
  const n = paramRecords.length;
  const x = paramRecords.map((_, i) => i);
  const y = paramRecords.map(r => r.value);
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0, denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - xMean) * (y[i] - yMean);
    denominator += (x[i] - xMean) ** 2;
  }
  
  const slope = denominator !== 0 ? numerator / denominator : 0;
  
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = yMean + slope * (x[i] - xMean);
    ssRes += (y[i] - predicted) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  
  const r2 = ssTot !== 0 ? 1 - ssRes / ssTot : 0;
  
  let trend = 'stable';
  if (r2 > 0.3) {
    if (slope > 0.01) trend = 'increasing';
    else if (slope < -0.01) trend = 'decreasing';
  }
  
  return { trend, slope: Math.round(slope * 1000) / 1000, r2: Math.round(r2 * 100) / 100, dataPoints: n };
}

function forecastQuality(records, parameter, daysAhead = 30) {
  const trend = detectTrends(records, parameter);
  if (trend.trend === 'insufficient_data') return null;
  
  const latest = records
    .filter(r => r.parameters?.[parameter] !== undefined)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  
  if (!latest) return null;
  
  const lastValue = Number(latest.parameters[parameter]);
  const forecast = [];
  const standard = WHO_STANDARDS[parameter];
  
  for (let i = 1; i <= daysAhead; i++) {
    const predicted = lastValue + trend.slope * i;
    const date = new Date();
    date.setDate(date.getDate() + i);
    
    let status = 'pass';
    if (standard) {
      if (standard.max !== undefined && predicted > standard.critical.max) status = 'critical';
      else if (standard.min !== undefined && predicted < standard.critical.min) status = 'critical';
      else if (standard.max !== undefined && predicted > standard.max) status = 'warning';
      else if (standard.min !== undefined && predicted < standard.min) status = 'warning';
    }
    
    forecast.push({
      date: date.toISOString().split('T')[0],
      predicted: Math.round(predicted * 100) / 100,
      status,
    });
  }
  
  return forecast;
}

function generateComplianceCertificate(records, source, periodDays = 30) {
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const periodRecords = records
    .filter(r => r.source === source && new Date(r.date).getTime() >= cutoff && r.pass)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (periodRecords.length === 0) return null;
  
  const parameters = {};
  Object.keys(WHO_STANDARDS).forEach(param => {
    const values = periodRecords.map(r => r.parameters?.[param]).filter(v => v !== undefined).map(Number).filter(v => !isNaN(v));
    if (values.length > 0) {
      parameters[param] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100,
        tests: values.length,
      };
    }
  });
  
  const allPass = periodRecords.every(r => r.pass);
  const score = Math.round(periodRecords.reduce((s, r) => s + (r.score || 100), 0) / periodRecords.length);
  
  return {
    source,
    period: { start: periodRecords[0].date, end: periodRecords[periodRecords.length - 1].date, days: periodDays },
    testsPerformed: periodRecords.length,
    allTestsPassed: allPass,
    averageScore: score,
    parameters,
    classification: score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'fair' : 'poor',
    issuedAt: new Date().toISOString(),
    certificateId: `CERT-${source.replace(/[^a-z]/gi, '').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
  };
}

function assessSourceRisk(records, source) {
  const sourceRecords = records.filter(r => r.source === source).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (sourceRecords.length === 0) return { risk: 'unknown', score: 0, factors: ['No test data'] };
  
  const recent = sourceRecords.slice(0, 10);
  const failures = recent.filter(r => !r.pass).length;
  const failureRate = failures / recent.length;
  
  const paramFailures = {};
  Object.keys(WHO_STANDARDS).forEach(param => {
    const fails = recent.filter(r => r.parameters?.[param] !== undefined && {
      value: Number(r.parameters[param]),
      standard: WHO_STANDARDS[param],
    }).filter(r => {
      const standard = WHO_STANDARDS[param];
      const val = r.value;
      return (standard.max !== undefined && val > standard.max) || (standard.min !== undefined && val < standard.min);
    }).length;
    if (fails > 0) paramFailures[param] = fails;
  });
  
  let risk = 'low';
  if (failureRate > 0.3) risk = 'critical';
  else if (failureRate > 0.15) risk = 'high';
  else if (failureRate > 0.05) risk = 'medium';
  
  const factors = [];
  if (failureRate > 0) factors.push(`${Math.round(failureRate * 100)}% test failure rate`);
  Object.entries(paramFailures).forEach(([param, count]) => {
    factors.push(`${param}: ${count}/${recent.length} failures`);
  });
  if (recent.length < 5) factors.push('Insufficient test frequency');
  
  return { risk, score: Math.round((1 - failureRate) * 100), factors, testCount: recent.length };
}

export function useWaterQuality({ qualityRecords, sources, onNotice }) {
  const [records, setRecords] = useState(qualityRecords || []);
  const [compliance, setCompliance] = useState({});
  const [trends, setTrends] = useState({});
  const [forecasts, setForecasts] = useState({});
  const [certificates, setCertificates] = useState([]);
  const [sourceRisks, setSourceRisks] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const analyzeQuality = useCallback(() => {
    if (!records.length) {
      setLoading(false);
      return;
    }
    
    const latestBySource = {};
    records.forEach(r => {
      if (!latestBySource[r.source] || new Date(r.date) > new Date(latestBySource[r.source].date)) {
        latestBySource[r.source] = r;
      }
    });
    
    const newCompliance = {};
    const newTrends = {};
    const newForecasts = {};
    const newSourceRisks = {};
    const newAlerts = [];
    
    Object.entries(latestBySource).forEach(([source, record]) => {
      newCompliance[source] = checkCompliance(record.parameters || {});
      newSourceRisks[source] = assessSourceRisk(records, source);
      
      Object.keys(WHO_STANDARDS).forEach(param => {
        if (record.parameters?.[param] !== undefined) {
          newTrends[`${source}_${param}`] = detectTrends(records.filter(r => r.source === source), param);
          newForecasts[`${source}_${param}`] = forecastQuality(records.filter(r => r.source === source), param, 30);
        }
      });
      
      const comp = newCompliance[source];
      if (!comp.overallPass) {
        comp.criticalFailures > 0 && newAlerts.push({
          type: 'critical_quality_failure',
          source,
          parameters: Object.entries(comp.parameters).filter(([, v]) => v.status === 'critical').map(([k, v]) => ({ parameter: k, ...v })),
          timestamp: record.date,
          severity: 'critical',
        });
        comp.warnings > 0 && newAlerts.push({
          type: 'quality_warning',
          source,
          parameters: Object.entries(comp.parameters).filter(([, v]) => v.status === 'warning').map(([k, v]) => ({ parameter: k, ...v })),
          timestamp: record.date,
          severity: 'warning',
        });
      }
      
      const risk = newSourceRisks[source];
      if (risk.risk === 'critical' || risk.risk === 'high') {
        newAlerts.push({
          type: 'source_risk',
          source,
          risk: risk.risk,
          factors: risk.factors,
          timestamp: new Date().toISOString(),
          severity: risk.risk === 'critical' ? 'critical' : 'warning',
        });
      }
    });
    
    const newCertificates = (sources || Object.keys(latestBySource)).map(source => 
      generateComplianceCertificate(records, source, 30)
    ).filter(Boolean);
    
    setCompliance(newCompliance);
    setTrends(newTrends);
    setForecasts(newForecasts);
    setSourceRisks(newSourceRisks);
    setAlerts(newAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    setCertificates(newCertificates);
    setLoading(false);
  }, [records, sources]);

  useEffect(() => {
    setRecords(qualityRecords || []);
    setLoading(true);
    const timer = setTimeout(analyzeQuality, 200);
    return () => clearTimeout(timer);
  }, [qualityRecords, analyzeQuality]);

  const addQualityRecord = useCallback((record) => {
    const compliance = checkCompliance(record.parameters || {});
    const newRecord = {
      ...record,
      id: `qr_${Date.now()}`,
      date: record.date || new Date().toISOString().split('T')[0],
      pass: compliance.overallPass,
      score: compliance.score,
      createdAt: new Date().toISOString(),
    };
    
    setRecords(prev => [newRecord, ...prev]);
    insert('quality_records', newRecord);
    
    if (!compliance.overallPass) {
      onNotice(`Quality test for ${record.source}: ${compliance.classification} (Score: ${compliance.score}/100)`);
    }
    
    return newRecord;
  }, [onNotice]);

  const getSourceSummary = useCallback((source) => {
    const sourceRecords = records.filter(r => r.source === source);
    const latest = sourceRecords[0];
    return {
      source,
      latestTest: latest?.date,
      latestScore: latest?.score,
      latestPass: latest?.pass,
      compliance: compliance[source],
      trends: Object.keys(WHO_STANDARDS).reduce((acc, param) => {
        acc[param] = trends[`${source}_${param}`];
        return acc;
      }, {}),
      forecasts: Object.keys(WHO_STANDARDS).reduce((acc, param) => {
        acc[param] = forecasts[`${source}_${param}`];
        return acc;
      }, {}),
      risk: sourceRisks[source],
      certificate: certificates.find(c => c.source === source),
      testCount: sourceRecords.length,
    };
  }, [records, compliance, trends, forecasts, sourceRisks, certificates]);

  const summary = useMemo(() => {
    const sourcesWithData = Object.keys(compliance);
    const totalTests = records.length;
    const passingTests = records.filter(r => r.pass).length;
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const warningAlerts = alerts.filter(a => a.severity === 'warning').length;
    const highRiskSources = Object.values(sourceRisks).filter(r => r.risk === 'critical' || r.risk === 'high').length;
    
    return {
      totalTests,
      passingRate: totalTests > 0 ? Math.round((passingTests / totalTests) * 100) : 0,
      sourcesMonitored: sourcesWithData.length,
      criticalAlerts,
      warningAlerts,
      highRiskSources,
      avgScore: sourcesWithData.length > 0 
        ? Math.round(sourcesWithData.reduce((s, src) => s + (compliance[src]?.score || 0), 0) / sourcesWithData.length)
        : 0,
    };
  }, [compliance, records, alerts, sourceRisks]);

  return {
    records,
    compliance,
    trends,
    forecasts,
    certificates,
    sourceRisks,
    alerts,
    summary,
    loading,
    addQualityRecord,
    getSourceSummary,
    refresh: analyzeQuality,
    WHO_STANDARDS,
    generateComplianceCertificate: (source, days) => generateComplianceCertificate(records, source, days),
  };
}

export default useWaterQuality;