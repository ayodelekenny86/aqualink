import React from 'react';

export function CarbonFootprintPanel({ 
  orders = [], 
  drivers = [], 
  vehicles = [],
  routes = [],
  facilities = [],
  onNotice 
}) {
  const { 
    footprint, targets, loading, error, refresh,
    totalEmissions, emissionsPerGallon, progressToTarget,
    reductionOpportunities, monthlyTrend, getTopEmitters
  } = React.useMemo(() => {
    const totalDistance = routes.reduce((sum, r) => sum + (r.distance || 0), 0);
    const avgEmission = vehicles.length 
      ? vehicles.reduce((sum, v) => sum + (v.emissionsPerKm || 0.25), 0) / vehicles.length 
      : 0.25;
    const fuelEmissions = totalDistance * avgEmission;
    const facilityEmissions = facilities.reduce((sum, f) => sum + (f.monthlyEmissions || 500), 0);
    const totalEmissionsCalc = fuelEmissions + facilityEmissions;
    const totalVolume = orders.reduce((sum, o) => sum + (o.volume || 0), 0);

    const trend = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(2026, i).toLocaleString('default', { month: 'short' }),
      emissions: Math.round((fuelEmissions + facilityEmissions) * (0.8 + Math.random() * 0.4))
    }));

    const opportunities = [
      { id: 'route_optimization', title: 'Route Optimization', potentialReduction: Math.round(totalEmissionsCalc * 0.18), effort: 'medium', status: 'identified' },
      { id: 'ev_transition', title: 'EV Fleet Transition', potentialReduction: Math.round(fuelEmissions * 0.6), effort: 'high', status: 'planning' },
      { id: 'solar_facilities', title: 'Solar-Powered Facilities', potentialReduction: Math.round(facilityEmissions * 0.4), effort: 'medium', status: 'feasibility' },
      { id: 'load_consolidation', title: 'Load Consolidation', potentialReduction: Math.round(fuelEmissions * 0.12), effort: 'low', status: 'pilot' },
      { id: 'driver_training', title: 'Eco-Driving Training', potentialReduction: Math.round(fuelEmissions * 0.08), effort: 'low', status: 'identified' }
    ];

    return {
      footprint: { summary: { totalEmissions: totalEmissionsCalc }, monthlyTrend: trend, reductionOpportunities: opportunities },
      targets: { annualReduction: 25 },
      loading: false, error: null, refresh: () => {},
      totalEmissions: Math.round(totalEmissionsCalc),
      emissionsPerGallon: totalVolume > 0 ? Math.round((totalEmissionsCalc / totalVolume) * 1000) / 1000 : 0,
      progressToTarget: 35,
      reductionOpportunities: opportunities,
      monthlyTrend: trend,
      getTopEmitters: () => ({ vehicles: [], facilities: [], drivers: [] })
    };
  }, [orders, drivers, vehicles, routes, facilities]);

  if (loading) return <div className="panel-loading">Calculating carbon footprint...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const topEmitters = getTopEmitters(5);

  return (
    <div className="carbon-panel">
      <div className="panel-header">
        <h3>Carbon Footprint Tracking</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="carbon-summary">
        <div className="metric-card">
          <h4>Total Monthly Emissions</h4>
          <div className="metric-value">{totalEmissions.toLocaleString()} kg CO₂</div>
        </div>
        <div className="metric-card">
          <h4>Emissions per Gallon</h4>
          <div className="metric-value">{emissionsPerGallon} g CO₂/gal</div>
        </div>
        <div className="metric-card">
          <h4>Reduction Progress</h4>
          <div className="metric-value">{progressToTarget}% to target</div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressToTarget}%` }} /></div>
        </div>
      </div>

      <div className="monthly-trend">
        <h4>Monthly Emissions Trend</h4>
        <div className="trend-chart">
          {monthlyTrend.map((m, i) => (
            <div key={i} className="trend-bar" style={{ height: `${(m.emissions / Math.max(...monthlyTrend.map(t => t.emissions))) * 100}%` }} title={`${m.label}: ${m.emissions} kg CO₂`}>
              <span className="bar-label">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="reduction-opportunities">
        <h4>Reduction Opportunities</h4>
        {reductionOpportunities.map(opp => (
          <div key={opp.id} className={`opportunity-card ${opp.status}`}>
            <div className="opp-header">
              <h5>{opp.title}</h5>
              <span className={`status-badge ${opp.status}`}>{opp.status.toUpperCase()}</span>
            </div>
            <p>Potential reduction: {opp.potentialReduction.toLocaleString()} kg CO₂/year</p>
            <div className="opp-meta">
              <span>Effort: {opp.effort}</span>
              <span>Timeline: {opp.timeline || 'TBD'}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="top-emitters">
        <h4>Top Emission Sources</h4>
        <div className="emitter-tabs">
          <button>Vehicles</button>
          <button>Facilities</button>
          <button>Drivers</button>
        </div>
        <div className="emitter-list">
          {topEmitters.vehicles.slice(0, 5).map((v, i) => (
            <div key={i} className="emitter-item">
              <span>{v.name || v.vehicleId}</span>
              <span>{v.emissions.toLocaleString()} kg CO₂</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CarbonFootprintPanel;