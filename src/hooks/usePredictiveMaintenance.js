import { useState, useEffect, useMemo, useCallback } from 'react';

const USE_MOCK = typeof window !== 'undefined' && (!window.__SUPABASE_URL__ || !window.__SUPABASE_ANON_KEY__);

const DEFAULT_VEHICLES = [
  { id: 'v1', name: 'Tanker #1', type: 'tanker', capacity: 5000, assetTag: 'TNK-001', lastService: '2026-08-15', mileage: 45000, hoursUsed: 1200 },
  { id: 'v2', name: 'Tanker #2', type: 'tanker', capacity: 3000, assetTag: 'TNK-002', lastService: '2026-07-20', mileage: 62000, hoursUsed: 1800 },
  { id: 'v3', name: 'Pump #1', type: 'pump', capacity: 0, assetTag: 'PMP-001', lastService: '2026-09-01', mileage: 0, hoursUsed: 2400 },
  { id: 'v4', name: 'Filter System #1', type: 'filter', capacity: 0, assetTag: 'FLT-001', lastService: '2026-08-10', mileage: 0, hoursUsed: 1500 },
];

const SERVICE_INTERVALS = {
  tanker: { mileage: 10000, hours: 500, days: 90 },
  pump: { mileage: 0, hours: 1000, days: 180 },
  filter: { mileage: 0, hours: 2000, days: 365 },
};

export function usePredictiveMaintenance({ vehicles = [], orders = [], onNotice }) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState([]);

  const fleet = useMemo(() => {
    if (vehicles.length > 0) return vehicles;
    return DEFAULT_VEHICLES;
  }, [vehicles]);

  const predictions = useMemo(() => {
    return fleet.map(asset => {
      const interval = SERVICE_INTERVALS[asset.type] || SERVICE_INTERVALS.tanker;
      const lastServiceDate = new Date(asset.lastService);
      const daysSinceService = Math.floor((Date.now() - lastServiceDate.getTime()) / (1000 * 60 * 60 * 24));
      
      let mileagePercent = 0;
      let hoursPercent = 0;
      let daysPercent = 0;
      
      if (asset.type === 'tanker') {
        mileagePercent = Math.min(100, (asset.mileage % interval.mileage) / interval.mileage * 100);
        hoursPercent = Math.min(100, (asset.hoursUsed % interval.hours) / interval.hours * 100);
      } else if (asset.type === 'pump') {
        hoursPercent = Math.min(100, (asset.hoursUsed % interval.hours) / interval.hours * 100);
      } else if (asset.type === 'filter') {
        hoursPercent = Math.min(100, (asset.hoursUsed % interval.hours) / interval.hours * 100);
      }
      daysPercent = Math.min(100, daysSinceService / interval.days * 100);

      const overallScore = asset.type === 'tanker' 
        ? Math.max(mileagePercent, hoursPercent, daysPercent)
        : Math.max(hoursPercent, daysPercent);

      let urgency = 'ok';
      let daysUntilDue = interval.days - daysSinceService;
      
      if (overallScore >= 90) {
        urgency = 'overdue';
        daysUntilDue = 0;
      } else if (overallScore >= 75) {
        urgency = 'due_soon';
      } else if (overallScore >= 50) {
        urgency = 'upcoming';
      }

      const nextServiceDate = new Date(lastServiceDate);
      nextServiceDate.setDate(nextServiceDate.getDate() + interval.days);
      
      const predictedFailureRisk = Math.min(95, overallScore + Math.random() * 10);
      const estimatedCost = estimateMaintenanceCost(asset, urgency);

      return {
        assetId: asset.id,
        assetName: asset.name,
        assetTag: asset.assetTag,
        type: asset.type,
        lastService: asset.lastService,
        nextServiceDue: nextServiceDate.toISOString().split('T')[0],
        daysSinceService,
        daysUntilDue,
        mileage: asset.mileage,
        hoursUsed: asset.hoursUsed,
        mileagePercent: Math.round(mileagePercent),
        hoursPercent: Math.round(hoursPercent),
        daysPercent: Math.round(daysPercent),
        overallScore: Math.round(overallScore),
        urgency,
        predictedFailureRisk: Math.round(predictedFailureRisk),
        estimatedCost,
        recommendedActions: getRecommendedActions(asset, urgency),
      };
    });
  }, [fleet]);

  const alerts = useMemo(() => {
    return predictions
      .filter(p => p.urgency !== 'ok')
      .sort((a, b) => b.overallScore - a.overallScore)
      .map(p => ({
        assetId: p.assetId,
        assetName: p.assetName,
        type: p.urgency === 'overdue' ? 'critical' : p.urgency === 'due_soon' ? 'warning' : 'info',
        message: `${p.assetName} (${p.assetTag}) - ${p.urgency === 'overdue' ? 'OVERDUE' : p.urgency === 'due_soon' ? 'Due Soon' : 'Upcoming'} maintenance`,
        daysUntilDue: p.daysUntilDue,
        predictedFailureRisk: p.predictedFailureRisk,
        estimatedCost: p.estimatedCost,
      }));
  }, [predictions]);

  const summary = useMemo(() => {
    const total = predictions.length;
    const overdue = predictions.filter(p => p.urgency === 'overdue').length;
    const dueSoon = predictions.filter(p => p.urgency === 'due_soon').length;
    const upcoming = predictions.filter(p => p.urgency === 'upcoming').length;
    const ok = predictions.filter(p => p.urgency === 'ok').length;
    const totalEstimatedCost = predictions.reduce((sum, p) => sum + p.estimatedCost, 0);
    const avgFailureRisk = total > 0 ? Math.round(predictions.reduce((sum, p) => sum + p.predictedFailureRisk, 0) / total) : 0;

    return { total, overdue, dueSoon, upcoming, ok, totalEstimatedCost, avgFailureRisk };
  }, [predictions]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      onNotice?.('Maintenance predictions refreshed');
    }, 500);
  }, [onNotice]);

  const recordMaintenance = useCallback((assetId, type, description, cost, performedBy) => {
    const record = {
      id: `maint_${Date.now()}`,
      assetId,
      type,
      description,
      cost,
      performedBy,
      date: new Date().toISOString(),
    };
    setMaintenanceHistory(prev => [record, ...prev]);
    
    const asset = fleet.find(a => a.id === assetId);
    if (asset) {
      // Update asset's last service date in local storage simulation
      const updatedAssets = fleet.map(a => a.id === assetId ? { ...a, lastService: new Date().toISOString().split('T')[0] } : a);
      localStorage.setItem('predictive_maintenance_vehicles', JSON.stringify(updatedAssets));
    }
    
    onNotice?.(`Maintenance recorded for ${asset?.name || assetId}`);
    return { ok: true, record };
  }, [fleet, onNotice]);

  const getAssetDetail = useCallback((assetId) => {
    return predictions.find(p => p.assetId === assetId) || null;
  }, [predictions]);

  useEffect(() => {
    setLoading(false);
    setLastUpdated(new Date().toISOString());
  }, []);

  function estimateMaintenanceCost(asset, urgency) {
    const baseCosts = {
      tanker: { routine: 800, minor: 2500, major: 8000 },
      pump: { routine: 400, minor: 1500, major: 5000 },
      filter: { routine: 200, minor: 800, major: 3000 },
    };
    const costs = baseCosts[asset.type] || baseCosts.tanker;
    if (urgency === 'overdue') return costs.major + Math.floor(Math.random() * 2000);
    if (urgency === 'due_soon') return costs.minor + Math.floor(Math.random() * 1000);
    return costs.routine + Math.floor(Math.random() * 500);
  }

  function getRecommendedActions(asset, urgency) {
    const actions = [];
    if (urgency === 'overdue') {
      actions.push('Schedule immediate service');
      actions.push('Do not deploy until serviced');
      actions.push('Check for related issues');
    } else if (urgency === 'due_soon') {
      actions.push('Schedule service within 7 days');
      actions.push('Monitor performance closely');
    } else if (urgency === 'upcoming') {
      actions.push('Plan service within 30 days');
    } else {
      actions.push('Continue normal operations');
    }
    return actions;
  }

  const formatCedi = useCallback((amount) => {
    return `GH₵${(amount / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, []);

  return {
    predictions,
    alerts,
    summary,
    maintenanceHistory,
    loading,
    lastUpdated,
    refresh,
    recordMaintenance,
    getAssetDetail,
    formatCedi,
  };
}

export default usePredictiveMaintenance;