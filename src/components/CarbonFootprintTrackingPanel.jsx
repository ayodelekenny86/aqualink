import React, { useState } from 'react';

export function CarbonFootprintTrackingPanel({ 
  fleet = [], 
  trips = [],
  fuelRecords = [],
  facilities = [],
  energyUsage = [],
  waterProduction = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [targetId, setTargetId] = useState(null);

  const { 
    footprint, targets, loading, error, refresh,
    updateTarget, addTarget, getProgressToTarget,
    totalCo2, co2PerGallon, reductionOpportunities, totalPotentialReduction
  } = React.useMemo(() => {
    const mockFleet = fleet.slice(0, 10).map((v, i) => ({
      vehicleId: v.id || `veh-${i}`,
      vehiclePlate: v.plate || `GT-${2000 + i}`,
      vehicleType: v.type || 'Truck',
      fuelType: v.fuelType || 'diesel',
      totalDistance: Math.floor(500 + Math.random() * 2000),
      totalFuel: Math.floor(100 + Math.random() * 500),
      avgEfficiency: Math.round((4 + Math.random() * 6) * 10) / 10,
      co2Emissions: Math.round((100 + Math.random() * 500) * 100) / 100,
      co2PerKm: Math.round((0.15 + Math.random() * 0.3) * 1000) / 1000,
      co2PerGallonDelivered: Math.round((0.02 + Math.random() * 0.05) * 10000) / 10000,
      tripsCount: Math.floor(10 + Math.random() * 50),
      efficiencyRating: ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)],
      trend: Math.random() > 0.5 ? 'improving' : 'stable'
    }));

    const mockFacilities = facilities.slice(0, 5).map((f, i) => ({
      facilityId: f.id || `fac-${i}`,
      facilityName: f.name || `Facility ${i + 1}`,
      totalKwh: Math.floor(10000 + Math.random() * 50000),
      totalWaterProduced: Math.floor(50000 + Math.random() * 200000),
      scope1Emissions: Math.round((50 + Math.random() * 200) * 100) / 100,
      scope2Emissions: Math.round((200 + Math.random() * 1000) * 100) / 100,
      totalEmissions: Math.round((250 + Math.random() * 1200) * 100) / 100,
      emissionsPerGallon: Math.round((0.001 + Math.random() * 0.005) * 100000) / 100000,
      renewablePercent: Math.floor(Math.random() * 40),
      efficiencyRating: ['A', 'B', 'C'][Math.floor(Math.random() * 3)]
    }));

    const mockTargets = [
      { id: 'target-1', name: '10% Reduction by 2026', targetReduction: 0.10, targetDate: '2026-12-31', scope: 'all', status: 'active' },
      { id: 'target-2', name: '25% Reduction by 2028', targetReduction: 0.25, targetDate: '2028-12-31', scope: 'all', status: 'planned' },
      { id: 'target-3', name: 'Net Zero Fleet by 2030', targetReduction: 1.0, targetDate: '2030-12-31', scope: 'fleet', status: 'planned' }
    ];

    const mockOpportunities = [
      { id: 'opp-1', type: 'vehicle_replacement', title: 'Replace 3 oldest diesel trucks with electric', potentialReduction: 450, investment: 'High', paybackPeriod: '4-5 years', priority: 'high' },
      { id: 'opp-2', type: 'solar_installation', title: 'Install 200kW solar at Main Treatment Plant', potentialReduction: 320, investment: 'Medium', paybackPeriod: '6 years', priority: 'medium' },
      { id: 'opp-3', type: 'idling_reduction', title: 'Driver training + auto-stop systems', potentialReduction: 85, investment: 'Low', paybackPeriod: '8 months', priority: 'medium' }
    ];

    return {
      footprint: { fleet: mockFleet, facilities: mockFacilities, monthlyTrends: [], reductionOpportunities: mockOpportunities, summary: { totalCo2: mockFleet.reduce((s, v) => s + v.co2Emissions, 0) + mockFacilities.reduce((s, f) => s + f.totalEmissions, 0), fleetCo2: mockFleet.reduce((s, v) => s + v.co2Emissions, 0), facilityCo2: mockFacilities.reduce((s, f) => s + f.totalEmissions, 0), totalWaterDelivered: 500000, co2PerGallon: 0.0045, fleetEfficiency: 5.8, renewablePercent: 15, vehiclesCount: fleet.length, facilitiesCount: facilities.length } },
      targets: mockTargets,
      loading: false, error: null, refresh: () => {},
      updateTarget: (id, upd) => onNotice?.(`Target ${id} updated`),
      addTarget: (t) => onNotice?.('Target added'),
      getProgressToTarget: (id) => Math.floor(Math.random() * 100),
      totalCo2: mockFleet.reduce((s, v) => s + v.co2Emissions, 0) + mockFacilities.reduce((s, f) => s + f.totalEmissions, 0),
      co2PerGallon: 0.0045,
      reductionOpportunities: mockOpportunities,
      totalPotentialReduction: mockOpportunities.reduce((s, o) => s + o.potentialReduction, 0)
    };
  }, [fleet, trips, fuelRecords, facilities, energyUsage, waterProduction]);

  if (loading) return <div className="panel-loading">Calculating carbon footprint...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="carbon-footprint-panel">
      <div className="panel-header">
        <h3>Carbon Footprint Tracking</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="carbon-metrics">
        <div className="metric-card"><h4>Total CO₂</h4><div className="metric-value">{totalCo2.toLocaleString()} kg</div></div>
        <div className="metric-card"><h4>Fleet CO₂</h4><div className="metric-value">{footprint.summary.fleetCo2.toLocaleString()} kg</div></div>
        <div className="metric-card"><h4>Facility CO₂</h4><div className="metric-value">{footprint.summary.facilityCo2.toLocaleString()} kg</div></div>
        <div className="metric-card"><h4>CO₂/Gallon</h4><div className="metric-value">{co2PerGallon.toFixed(4)} kg</div></div>
        <div className="metric-card"><h4>Fleet Efficiency</h4><div className="metric-value">{footprint.summary.fleetEfficiency} km/L</div></div>
        <div className="metric-card"><h4>Renewable %</h4><div className="metric-value">{footprint.summary.renewablePercent}%</div></div>
        <div className="metric-card"><h4>Potential Reduction</h4><div className="metric-value success">{totalPotentialReduction.toLocaleString()} kg</div></div>
      </div>

      <div className="carbon-tabs">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={activeTab === 'fleet' ? 'active' : ''} onClick={() => setActiveTab('fleet')}>Fleet</button>
        <button className={activeTab === 'facilities' ? 'active' : ''} onClick={() => setActiveTab('facilities')}>Facilities</button>
        <button className={activeTab === 'targets' ? 'active' : ''} onClick={() => setActiveTab('targets')}>Targets</button>
        <button className={activeTab === 'opportunities' ? 'active' : ''} onClick={() => setActiveTab('opportunities')}>Opportunities</button>
      </div>

      {activeTab === 'overview' && (
        <div className="overview-content">
          <div className="trend-chart">
            <h4>Monthly CO₂ Trend</h4>
            <div className="chart-placeholder">Chart: Monthly emissions trend over 6 months</div>
          </div>
          <div className="breakdown">
            <h4>Emissions Breakdown</h4>
            <div className="breakdown-bars">
              <div className="breakdown-bar">
                <span>Fleet</span>
                <div className="bar"><div className="fill" style={{ width: `${(footprint.summary.fleetCo2 / footprint.summary.totalCo2) * 100}%` }} /></div>
                <span>{footprint.summary.fleetCo2.toLocaleString()} kg ({(footprint.summary.fleetCo2 / footprint.summary.totalCo2 * 100).toFixed(1)}%)</span>
              </div>
              <div className="breakdown-bar">
                <span>Facilities (Scope 1)</span>
                <div className="bar"><div className="fill" style={{ width: `${(footprint.summary.facilityCo2 * 0.3 / footprint.summary.totalCo2) * 100}%` }} /></div>
                <span>{(footprint.summary.facilityCo2 * 0.3).toLocaleString()} kg</span>
              </div>
              <div className="breakdown-bar">
                <span>Facilities (Scope 2)</span>
                <div className="bar"><div className="fill" style={{ width: `${(footprint.summary.facilityCo2 * 0.7 / footprint.summary.totalCo2) * 100}%` }} /></div>
                <span>{(footprint.summary.facilityCo2 * 0.7).toLocaleString()} kg</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'fleet' && (
        <div className="fleet-table">
          <table>
            <thead><tr><th>Vehicle</th><th>Type</th><th>Fuel</th><th>Distance</th><th>Efficiency</th><th>CO₂</th><th>CO₂/km</th><th>Rating</th><th>Trend</th></tr></thead>
            <tbody>
              {footprint.fleet.map(v => (
                <tr key={v.vehicleId}>
                  <td>{v.vehiclePlate}</td>
                  <td>{v.vehicleType}</td>
                  <td>{v.fuelType}</td>
                  <td>{v.totalDistance.toLocaleString()} km</td>
                  <td>{v.avgEfficiency} km/L</td>
                  <td>{v.co2Emissions.toLocaleString()} kg</td>
                  <td>{v.co2PerKg} kg</td>
                  <td><span className={`rating-${v.efficiencyRating.toLowerCase()}`}>{v.efficiencyRating}</span></td>
                  <td><span className={`trend-${v.trend}`}>{v.trend}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'facilities' && (
        <div className="facilities-table">
          <table>
            <thead><tr><th>Facility</th><th>Water Produced</th><th>Scope 1</th><th>Scope 2</th><th>Total</th><th>CO₂/Gal</th><th>Renewable</th><th>Rating</th></tr></thead>
            <tbody>
              {footprint.facilities.map(f => (
                <tr key={f.facilityId}>
                  <td>{f.facilityName}</td>
                  <td>{f.totalWaterProduced.toLocaleString()} gal</td>
                  <td>{f.scope1Emissions.toLocaleString()} kg</td>
                  <td>{f.scope2Emissions.toLocaleString()} kg</td>
                  <td><strong>{f.totalEmissions.toLocaleString()} kg</strong></td>
                  <td>{f.emissionsPerGallon.toFixed(5)} kg</td>
                  <td>{f.renewablePercent}%</td>
                  <td><span className={`rating-${f.efficiencyRating.toLowerCase()}`}>{f.efficiencyRating}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'targets' && (
        <div className="targets-list">
          {targets.map(t => (
            <div key={t.id} className={`target-card ${t.status}`}>
              <div className="target-header">
                <h4>{t.name}</h4>
                <span className={`status-badge ${t.status}`}>{t.status.toUpperCase()}</span>
              </div>
              <div className="target-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${getProgressToTarget(t.id)}%` }} />
                </div>
                <span>{getProgressToTarget(t.id)}% to target</span>
              </div>
              <div className="target-details">
                <span>Target: {(t.targetReduction * 100).toFixed(0)}% reduction</span>
                <span>By: {t.targetDate}</span>
                <span>Scope: {t.scope}</span>
              </div>
            </div>
          ))}
          <button className="btn-add-target" onClick={() => setTargetId('new')}>+ Add Target</button>
        </div>
      )}

      {activeTab === 'opportunities' && (
        <div className="opportunities-list">
          {reductionOpportunities.map(opp => (
            <div key={opp.id} className={`opportunity-card ${opp.priority}`}>
              <div className="opp-header">
                <h4>{opp.title}</h4>
                <span className={`priority-badge ${opp.priority}`}>{opp.priority.toUpperCase()}</span>
              </div>
              <p>{opp.description}</p>
              <div className="opp-metrics">
                <span>Reduction: {opp.potentialReduction.toLocaleString()} kg CO₂/yr</span>
                <span>Investment: {opp.investment}</span>
                <span>Payback: {opp.paybackPeriod}</span>
              </div>
              <button className="btn-implement" onClick={() => onNotice?.(`Implementing: ${opp.title}`)}>Implement</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CarbonFootprintTrackingPanel;