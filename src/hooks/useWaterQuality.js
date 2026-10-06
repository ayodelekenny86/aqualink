import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update } from '../lib/collections';

/**
 * Water quality monitoring hook: tracks water quality parameters, compliance,
 * and alerts for institutional customers.
 * 
 * Monitors:
 * - pH levels (6.5-8.5 WHO standard)
 * - Turbidity (<5 NTU)
 * - Chlorine residual (0.2-0.5 mg/L free chlorine)
 * - Total dissolved solids (TDS)
 * - Microbiological indicators (E. coli, total coliforms)
 * - Chemical contaminants (lead, arsenic, fluoride)
 */
const WHO_STANDARDS = {
  ph: { min: 6.5, max: 8.5, unit: 'pH', critical: { min: 6.0, max: 9.0 } },
  turbidity: { min: 0, max: 5, unit: 'NTU', critical: { max: 10 } },
  chlorineResidual: { min: 0.2, max: 0.5, unit: 'mg/L', critical: { min: 0.1, max: 1.0 } },
  tds: { min: 0, max: 600, unit: 'mg/L', critical: { max: 1000 } },
  ecoli: { min: 0, max: 0, unit: 'CFU/100mL', critical: { max: 1 } },
  totalColiforms: { min: 0, max: 0, unit: 'CFU/100mL', critical: { max: 10 } },
  lead: { min: 0, max: 0.01, unit: 'mg/L', critical: { max: 0.015 } },
  arsenic: { min: 0, max: 0.01, unit: 'mg/L', critical: { max: 0.015 } },
  fluoride: { min: 0, max: 1.5, unit: 'mg/L', critical: { max: 2.0 } },
};

const INITIAL_READINGS = [
  { id: 'wq-1', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), location: 'Treatment Plant Output', ph: 7.2, turbidity: 1.2, chlorineResidual: 0.35, tds: 180, ecoli: 0, totalColiforms: 0, lead: 0.001, arsenic: 0.002, fluoride: 0.4, status: 'compliant' },
  { id: 'wq-2', timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), location: 'Storage Tank A', ph: 7.0, turbidity: 0.8, chlorineResidual: 0.28, tds: 195, ecoli: 0, totalColiforms: 0, lead: 0.001, arsenic: 0.002, fluoride: 0.4, status: 'compliant' },
  { id: 'wq-3', timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), location: 'Distribution Point - East Legon', ph: 6.8, turbidity: 2.1, chlorineResidual: 0.22, tds: 210, ecoli: 0, totalColiforms: 0, lead: 0.001, arsenic: 0.002, fluoride: 0.4, status: 'compliant' },
  { id: 'wq-4', timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), location: 'Distribution Point - Spintex', ph: 7.4, turbidity: 1.5, chlorineResidual: 0.31, tds: 205, ecoli: 0, totalColiforms: 0, lead: 0.001, arsenic: 0.002, fluoride: 0.4, status: 'compliant' },
  { id: 'wq-5', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), location: 'Treatment Plant Output', ph: 7.1, turbidity: 1.0, chlorineResidual: 0.33, tds: 175, ecoli: 0, totalColiforms: 0, lead: 0.001, arsenic: 0.002, fluoride: 0.4, status: 'compliant' },
];

export function useWaterQuality({ institutionId }) {
  const [readings, setReadings] = useState(() => {
    const stored = localStorage.getItem('aq_water_quality_readings');
    return stored ? JSON.parse(stored) : INITIAL_READINGS;
  });
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastTested, setLastTested] = useState(null);

  // Persist readings
  useEffect(() => {
    localStorage.setItem('aq_water_quality_readings', JSON.stringify(readings));
  }, [readings]);

  // Evaluate reading against WHO standards
  const evaluateReading = useCallback((reading) => {
    const violations = [];
    const warnings = [];
    
    Object.entries(WHO_STANDARDS).forEach(([param, standard]) => {
      const value = reading[param];
      if (value === undefined || value === null) return;
      
      if (standard.critical) {
        if (standard.critical.min !== undefined && value < standard.critical.min) {
          violations.push({ parameter: param, value, limit: standard.critical.min, type: 'below_critical', severity: 'critical' });
        }
        if (standard.critical.max !== undefined && value > standard.critical.max) {
          violations.push({ parameter: param, value, limit: standard.critical.max, type: 'above_critical', severity: 'critical' });
        }
      }
      
      if (standard.min !== undefined && value < standard.min) {
        warnings.push({ parameter: param, value, limit: standard.min, type: 'below_standard', severity: 'warning' });
      }
      if (standard.max !== undefined && value > standard.max) {
        warnings.push({ parameter: param, value, limit: standard.max, type: 'above_standard', severity: 'warning' });
      }
    });
    
    return { violations, warnings, isCompliant: violations.length === 0 && warnings.length === 0 };
  }, []);

  // Add a new water quality reading
  const addReading = useCallback((reading) => {
    const evaluation = evaluateReading(reading);
    const status = evaluation.violations.length > 0 ? 'critical' : evaluation.warnings.length > 0 ? 'warning' : 'compliant';
    
    const newReading = {
      id: `wq-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...reading,
      status,
      violations: evaluation.violations,
      warnings: evaluation.warnings,
    };
    
    setReadings(prev => [newReading, ...prev.slice(0, 99)]); // Keep last 100
    setLastTested(newReading.timestamp);
    
    // Generate alerts for violations
    if (evaluation.violations.length > 0) {
      const newAlerts = evaluation.violations.map(v => ({
        id: `alert-${Date.now()}-${v.parameter}`,
        timestamp: new Date().toISOString(),
        location: reading.location,
        parameter: v.parameter,
        value: v.value,
        limit: v.limit,
        severity: 'critical',
        message: `${v.parameter} at ${v.value} ${WHO_STANDARDS[v.parameter]?.unit} exceeds critical limit of ${v.limit}`,
        acknowledged: false,
      }));
      setAlerts(prev => [...newAlerts, ...prev]);
    }
    
    if (evaluation.warnings.length > 0) {
      const newWarnings = evaluation.warnings.map(w => ({
        id: `alert-${Date.now()}-${w.parameter}`,
        timestamp: new Date().toISOString(),
        location: reading.location,
        parameter: w.parameter,
        value: w.value,
        limit: w.limit,
        severity: 'warning',
        message: `${w.parameter} at ${w.value} ${WHO_STANDARDS[w.parameter]?.unit} outside optimal range`,
        acknowledged: false,
      }));
      setAlerts(prev => [...newWarnings, ...prev]);
    }
    
    return newReading;
  }, [evaluateReading]);

  // Acknowledge alert
  const acknowledgeAlert = useCallback((alertId) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
  }, []);

  // Get compliance summary
  const complianceSummary = useMemo(() => {
    const recentReadings = readings.slice(0, 20);
    const total = recentReadings.length;
    const compliant = recentReadings.filter(r => r.status === 'compliant').length;
    const warning = recentReadings.filter(r => r.status === 'warning').length;
    const critical = recentReadings.filter(r => r.status === 'critical').length;
    
    return {
      totalTests: total,
      compliant,
      warning,
      critical,
      complianceRate: total > 0 ? Math.round((compliant / total) * 100) : 100,
      unacknowledgedAlerts: alerts.filter(a => !a.acknowledged).length,
      criticalAlerts: alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length,
    };
  }, [readings, alerts]);

  // Get parameter trends
  const parameterTrends = useMemo(() => {
    const params = Object.keys(WHO_STANDARDS);
    const trends = {};
    
    params.forEach(param => {
      const values = readings
        .slice(0, 20)
        .map(r => ({ timestamp: r.timestamp, value: r[param] }))
        .filter(v => v.value !== undefined && v.value !== null)
        .reverse(); // chronological
      
      if (values.length >= 2) {
        const first = values[0].value;
        const last = values[values.length - 1].value;
        const change = ((last - first) / first) * 100;
        
        trends[param] = {
          current: last,
          change: Number(change.toFixed(1)),
          trend: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
          values: values.slice(-10).map(v => v.value),
          standard: WHO_STANDARDS[param],
        };
      }
    });
    
    return trends;
  }, [readings]);

  // Get location-based summary
  const locationSummary = useMemo(() => {
    const locations = [...new Set(readings.map(r => r.location))];
    return locations.map(loc => {
      const locReadings = readings.filter(r => r.location === loc).slice(0, 10);
      const latest = locReadings[0];
      return {
        location: loc,
        lastTested: latest?.timestamp,
        status: latest?.status || 'unknown',
        parameters: latest ? {
          ph: latest.ph,
          turbidity: latest.turbidity,
          chlorineResidual: latest.chlorineResidual,
        } : {},
      };
    });
  }, [readings]);

  // Simulate automated testing (for demo)
  const simulateTest = useCallback((location = 'Treatment Plant Output') => {
    const baseReading = readings.find(r => r.location === location) || readings[0];
    if (!baseReading) return;
    
    // Add small random variations
    const variation = (val, range) => val + (Math.random() - 0.5) * range;
    
    const simulated = {
      location,
      ph: Math.max(6.0, Math.min(9.0, variation(baseReading.ph, 0.3))),
      turbidity: Math.max(0, variation(baseReading.turbidity, 0.5)),
      chlorineResidual: Math.max(0.1, Math.min(1.0, variation(baseReading.chlorineResidual, 0.1))),
      tds: Math.max(100, variation(baseReading.tds, 20)),
      ecoli: 0,
      totalColiforms: 0,
      lead: baseReading.lead,
      arsenic: baseReading.arsenic,
      fluoride: baseReading.fluoride,
    };
    
    return addReading(simulated);
  }, [readings, addReading]);

  return {
    readings,
    alerts,
    complianceSummary,
    parameterTrends,
    locationSummary,
    loading,
    lastTested,
    addReading,
    acknowledgeAlert,
    simulateTest,
    WHO_STANDARDS,
    refresh: () => setLoading(false),
  };
}

export default useWaterQuality;