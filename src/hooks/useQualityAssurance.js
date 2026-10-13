import { useState, useEffect, useMemo, useCallback } from 'react';

const USE_MOCK = typeof window !== 'undefined' && (!window.__SUPABASE_URL__ || !window.__SUPABASE_ANON_KEY__);

const WHO_STANDARDS = {
  ph: { min: 6.5, max: 8.5, unit: 'pH', critical: { min: 6.0, max: 9.0 } },
  turbidity: { min: 0, max: 5, unit: 'NTU', critical: { min: 0, max: 10 } },
  chlorine: { min: 0.2, max: 0.5, unit: 'mg/L', critical: { min: 0.1, max: 1.0 } },
  coliform: { min: 0, max: 0, unit: 'CFU/100ml', critical: { min: 0, max: 10 } },
  ecoli: { min: 0, max: 0, unit: 'CFU/100ml', critical: { min: 0, max: 1 } },
  tds: { min: 0, max: 600, unit: 'mg/L', critical: { min: 0, max: 1000 } },
  hardness: { min: 0, max: 200, unit: 'mg/L CaCO3', critical: { min: 0, max: 500 } },
};

const GHANA_STANDARDS = {
  ph: { min: 6.5, max: 8.5, unit: 'pH' },
  turbidity: { min: 0, max: 5, unit: 'NTU' },
  chlorine: { min: 0.2, max: 0.5, unit: 'mg/L' },
  coliform: { min: 0, max: 0, unit: 'CFU/100ml' },
  ecoli: { min: 0, max: 0, unit: 'CFU/100ml' },
};

export function useQualityAssurance({ qualityRecords = [], sources = [], orders = [], onNotice }) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const sourceAnalysis = useMemo(() => {
    const activeSources = sources.length > 0 ? sources : [...new Set(qualityRecords.map(r => r.source))];
    
    return activeSources.map(sourceName => {
      const records = qualityRecords.filter(r => r.source === sourceName).sort((a, b) => new Date(b.date) - new Date(a.date));
      const recentRecords = records.slice(0, 30);
      
      const paramStats = {};
      Object.keys(WHO_STANDARDS).forEach(param => {
        const values = recentRecords.map(r => r.parameters?.[param]).filter(v => v !== undefined && v !== null);
        if (values.length > 0) {
          const avg = values.reduce((sum, v) => sum + Number(v), 0) / values.length;
          const min = Math.min(...values);
          const max = Math.max(...values);
          const standard = WHO_STANDARDS[param];
          const passCount = values.filter(v => {
            const num = Number(v);
            return num >= standard.min && num <= standard.max;
          }).length;
          const passRate = (passCount / values.length) * 100;
          
          paramStats[param] = {
            avg: Math.round(avg * 100) / 100,
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            passRate: Math.round(passRate),
            count: values.length,
            trend: calculateTrend(values),
            status: passRate >= 95 ? 'excellent' : passRate >= 80 ? 'good' : passRate >= 60 ? 'fair' : 'poor',
          };
        }
      });

      const overallPassRate = Object.values(paramStats).length > 0 
        ? Math.round(Object.values(paramStats).reduce((sum, p) => sum + p.passRate, 0) / Object.values(paramStats).length)
        : 0;
      
      const criticalFailures = recentRecords.filter(r => {
        return Object.entries(r.parameters || {}).some(([param, value]) => {
          const standard = WHO_STANDARDS[param];
          if (!standard) return false;
          const num = Number(value);
          return num < standard.critical.min || num > standard.critical.max;
        });
      }).length;

      let classification = 'excellent';
      if (overallPassRate < 60) classification = 'critical';
      else if (overallPassRate < 80) classification = 'poor';
      else if (overallPassRate < 95) classification = 'good';

      const lastTest = records[0]?.date || null;
      const daysSinceLastTest = lastTest ? Math.floor((Date.now() - new Date(lastTest).getTime()) / (1000 * 60 * 60 * 24)) : 999;
      const testingFrequency = records.length >= 2 ? 
        Math.round((new Date(records[records.length - 1].date) - new Date(records[0].date)) / (1000 * 60 * 60 * 24 * (records.length - 1))) 
        : 0;

      return {
        source: sourceName,
        classification,
        overallPassRate,
        totalTests: records.length,
        recentTests: recentRecords.length,
        paramStats,
        criticalFailures,
        lastTest,
        daysSinceLastTest,
        testingFrequency,
        needsAttention: classification === 'critical' || classification === 'poor' || daysSinceLastTest > 30,
        score: calculateSourceScore(overallPassRate, criticalFailures, daysSinceLastTest),
      };
    });
  }, [qualityRecords, sources]);

  const compliance = useMemo(() => {
    const byParameter = {};
    Object.keys(WHO_STANDARDS).forEach(param => {
      const allValues = qualityRecords.flatMap(r => {
        const val = r.parameters?.[param];
        return val !== undefined && val !== null ? [{ source: r.source, value: Number(val), date: r.date }] : [];
      });
      
      if (allValues.length > 0) {
        const standard = WHO_STANDARDS[param];
        const passCount = allValues.filter(v => v.value >= standard.min && v.value <= standard.max).length;
        byParameter[param] = {
          totalTests: allValues.length,
          passCount,
          failCount: allValues.length - passCount,
          passRate: Math.round((passCount / allValues.length) * 100),
          avgValue: Math.round((allValues.reduce((sum, v) => sum + v.value, 0) / allValues.length) * 100) / 100,
          standard,
        };
      }
    });
    return byParameter;
  }, [qualityRecords]);

  const alerts = useMemo(() => {
    const alertList = [];
    
    sourceAnalysis.forEach(source => {
      if (source.classification === 'critical' || source.classification === 'poor') {
        alertList.push({
          id: `alert_${source.source}_classification`,
          source: source.source,
          type: 'classification',
          severity: source.classification === 'critical' ? 'critical' : 'high',
          message: `${source.source} classified as ${source.classification} (${source.overallPassRate}% pass rate)`,
          date: new Date().toISOString(),
        });
      }
      
      if (source.daysSinceLastTest > 30) {
        alertList.push({
          id: `alert_${source.source}_stale`,
          source: source.source,
          type: 'stale_data',
          severity: source.daysSinceLastTest > 60 ? 'critical' : 'medium',
          message: `${source.source} not tested for ${source.daysSinceLastTest} days`,
          date: new Date().toISOString(),
        });
      }
      
      if (source.criticalFailures > 0) {
        alertList.push({
          id: `alert_${source.source}_critical`,
          source: source.source,
          type: 'critical_failure',
          severity: 'critical',
          message: `${source.source} has ${source.criticalFailures} critical parameter failures`,
          date: new Date().toISOString(),
        });
      }
      
      Object.entries(source.paramStats).forEach(([param, stats]) => {
        if (stats.passRate < 80 && stats.count >= 3) {
          alertList.push({
            id: `alert_${source.source}_${param}`,
            source: source.source,
            type: 'parameter',
            severity: stats.passRate < 60 ? 'high' : 'medium',
            message: `${source.source} ${param} pass rate only ${stats.passRate}%`,
            date: new Date().toISOString(),
          });
        }
      });
    });

    return alertList.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });
  }, [sourceAnalysis]);

  const certificates = useMemo(() => {
    return sourceAnalysis
      .filter(s => s.classification === 'excellent' || s.classification === 'good')
      .map(source => ({
        certificateId: `CERT-${source.source.replace(/\s+/g, '-').toUpperCase()}-${new Date().getFullYear()}`,
        source: source.source,
        classification: source.classification,
        averageScore: source.overallPassRate,
        testsPerformed: source.totalTests,
        period: {
          start: source.lastTest ? new Date(source.lastTest).toISOString().split('T')[0] : 'N/A',
          end: new Date().toISOString().split('T')[0],
        },
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        issuedBy: 'AquaLink Quality Assurance',
      }));
  }, [sourceAnalysis]);

  const summary = useMemo(() => {
    const totalSources = sourceAnalysis.length;
    const excellent = sourceAnalysis.filter(s => s.classification === 'excellent').length;
    const good = sourceAnalysis.filter(s => s.classification === 'good').length;
    const fair = sourceAnalysis.filter(s => s.classification === 'fair').length;
    const poor = sourceAnalysis.filter(s => s.classification === 'poor').length;
    const critical = sourceAnalysis.filter(s => s.classification === 'critical').length;
    const totalTests = qualityRecords.length;
    const avgPassRate = totalSources > 0 ? Math.round(sourceAnalysis.reduce((sum, s) => sum + s.overallPassRate, 0) / totalSources) : 0;
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const highRiskSources = sourceAnalysis.filter(s => s.needsAttention).length;

    return {
      sourcesMonitored: totalSources,
      totalTests,
      excellent,
      good,
      fair,
      poor,
      critical,
      avgPassRate,
      criticalAlerts,
      highRiskSources,
      complianceRate: avgPassRate,
    };
  }, [sourceAnalysis, qualityRecords, alerts]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      onNotice?.('Quality assurance data refreshed');
    }, 500);
  }, [onNotice]);

  const addQualityRecord = useCallback((record) => {
    const newRecord = {
      id: `qr_${Date.now()}`,
      ...record,
      date: new Date().toISOString().split('T')[0],
      pass: checkCompliance(record.parameters),
    };
    onNotice?.(`Quality record added for ${record.source}`);
    return { ok: true, record: newRecord };
  }, [onNotice]);

  const formatCedi = useCallback((amount) => {
    return `GH₵${(amount / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, []);

  return {
    sourceAnalysis,
    compliance,
    alerts,
    certificates,
    summary,
    loading,
    lastUpdated,
    refresh,
    addQualityRecord,
    formatCedi,
  };
}

function checkCompliance(parameters) {
  if (!parameters) return false;
  return Object.entries(parameters).every(([param, value]) => {
    const standard = WHO_STANDARDS[param];
    if (!standard) return true;
    const num = Number(value);
    return num >= standard.min && num <= standard.max;
  });
}

function calculateTrend(values) {
  if (values.length < 3) return 'stable';
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const change = ((secondAvg - firstAvg) / firstAvg) * 100;
  if (change > 10) return 'increasing';
  if (change < -10) return 'decreasing';
  return 'stable';
}

function calculateSourceScore(passRate, criticalFailures, daysSinceTest) {
  let score = passRate;
  score -= criticalFailures * 15;
  score -= Math.min(20, daysSinceTest * 0.5);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export default useQualityAssurance;