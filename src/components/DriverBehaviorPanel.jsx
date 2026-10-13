import React, { useState } from 'react';

export function DriverBehaviorPanel({ 
  drivers = [], 
  trips = [], 
  vehicles = [],
  fuelRecords = [],
  maintenanceRecords = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [filterTier, setFilterTier] = useState('all');

  const { 
    analysis, coachingAlerts, loading, error, refresh,
    getDriverAnalysis,
    getCoachingCandidates,
    acknowledgeAlert,
    summary,
    criticalAlerts,
    highAlerts
  } = React.useMemo(() => {
    const mockDrivers = drivers.slice(0, 10).map((d, i) => ({
      driverId: d.id || `driver-${i}`,
      driverName: d.name || `Driver ${i + 1}`,
      vehicleId: d.vehicleId,
      vehiclePlate: d.plate || `GT-${1000 + i}`,
      totalTrips: Math.floor(20 + Math.random() * 80),
      totalDistance: Math.floor(500 + Math.random() * 2000),
      totalDuration: Math.floor(1000 + Math.random() * 3000),
      metrics: {
        hardBrakingEvents: Math.floor(Math.random() * 15),
        hardAccelerationEvents: Math.floor(Math.random() * 10),
        speedingEvents: Math.floor(Math.random() * 8),
        idlingMinutes: Math.floor(Math.random() * 120),
        harshEventsPer100km: Math.round((Math.random() * 5) * 10) / 10,
        speedingRate: Math.round(Math.random() * 0.3 * 100) / 100,
        idlingPercent: Math.round(Math.random() * 20 * 10) / 10,
        fuelEfficiency: Math.round((8 + Math.random() * 6) * 10) / 10,
        targetEfficiency: 12
      },
      scores: {
        safety: Math.floor(50 + Math.random() * 50),
        eco: Math.floor(40 + Math.random() * 60),
        overall: Math.floor(45 + Math.random() * 55)
      },
      tier: Math.random() > 0.7 ? 'excellent' : Math.random() > 0.4 ? 'good' : Math.random() > 0.2 ? 'needs_improvement' : 'poor',
      riskFactors: [],
      coachingRecommendations: ['Eco-driving training', 'Speed management'],
      lastTripDate: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
      trend: Math.random() > 0.6 ? 'improving' : Math.random() > 0.3 ? 'stable' : 'declining'
    }));

    const mockCoachingAlerts = mockDrivers.filter(d => d.tier === 'poor' || d.scores.safety < 50).map(d => ({
      severity: d.tier === 'poor' ? 'critical' : 'high',
      driverId: d.driverId,
      driverName: d.driverName,
      type: 'safety_critical',
      message: `${d.driverName} has ${d.tier === 'poor' ? 'critical' : 'low'} safety score (${d.scores.safety}/100)`,
      recommendedActions: d.coachingRecommendations,
      metrics: { safetyScore: d.scores.safety, harshEvents: d.metrics.harshEventsPer100km }
    }));

    return {
      analysis: {
        drivers: mockDrivers,
        summary: {
          totalDrivers: drivers.length,
          excellent: mockDrivers.filter(d => d.tier === 'excellent').length,
          good: mockDrivers.filter(d => d.tier === 'good').length,
          needsImprovement: mockDrivers.filter(d => d.tier === 'needs_improvement').length,
          poor: mockDrivers.filter(d => d.tier === 'poor').length,
          avgSafetyScore: Math.round(mockDrivers.reduce((s, d) => s + d.scores.safety, 0) / mockDrivers.length),
          avgEcoScore: Math.round(mockDrivers.reduce((s, d) => s + d.scores.eco, 0) / mockDrivers.length),
          avgOverallScore: Math.round(mockDrivers.reduce((s, d) => s + d.scores.overall, 0) / mockDrivers.length),
          fleetFuelEfficiency: Math.round(mockDrivers.reduce((s, d) => s + d.metrics.fuelEfficiency, 0) / mockDrivers.length * 10) / 10
        }
      },
      coachingAlerts: mockCoachingAlerts,
      loading: false, error: null, refresh: () => {},
      getDriverAnalysis: (id) => mockDrivers.find(d => d.driverId === id),
      getCoachingCandidates: () => mockDrivers.filter(d => d.tier === 'needs_improvement' || d.tier === 'poor'),
      acknowledgeAlert: (i) => onNotice?.('Alert acknowledged'),
      summary: {
        totalDrivers: drivers.length,
        excellent: mockDrivers.filter(d => d.tier === 'excellent').length,
        good: mockDrivers.filter(d => d.tier === 'good').length,
        needsImprovement: mockDrivers.filter(d => d.tier === 'needs_improvement').length,
        poor: mockDrivers.filter(d => d.tier === 'poor').length,
        avgSafetyScore: Math.round(mockDrivers.reduce((s, d) => s + d.scores.safety, 0) / mockDrivers.length),
        avgEcoScore: Math.round(mockDrivers.reduce((s, d) => s + d.scores.eco, 0) / mockDrivers.length),
        fleetFuelEfficiency: Math.round(mockDrivers.reduce((s, d) => s + d.metrics.fuelEfficiency, 0) / mockDrivers.length * 10) / 10
      },
      criticalAlerts: mockCoachingAlerts.filter(a => a.severity === 'critical'),
      highAlerts: mockCoachingAlerts.filter(a => a.severity === 'high')
    };
  }, [drivers, trips, vehicles, fuelRecords, maintenanceRecords]);

  if (loading) return <div className="panel-loading">Analyzing driver behavior...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const filteredDrivers = analysis?.drivers?.filter(d => 
    filterTier === 'all' || d.tier === filterTier
  ) || [];

  return (
    <div className="driver-behavior-panel">
      <div className="panel-header">
        <h3>Driver Behavior Analysis</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="behavior-summary">
        <div className="metric-card">
          <h4>Total Drivers</h4>
          <div className="metric-value">{summary.totalDrivers}</div>
        </div>
        <div className="metric-card">
          <h4>Avg Safety</h4>
          <div className="metric-value">{summary.avgSafetyScore}/100</div>
        </div>
        <div className="metric-card">
          <h4>Avg Eco</h4>
          <div className="metric-value">{summary.avgEcoScore}/100</div>
        </div>
        <div className="metric-card">
          <h4>Fleet Efficiency</h4>
          <div className="metric-value">{summary.fleetFuelEfficiency} km/L</div>
        </div>
        <div className="metric-card">
          <h4>Critical Alerts</h4>
          <div className="metric-value critical">{criticalAlerts.length}</div>
        </div>
        <div className="metric-card">
          <h4>Needs Coaching</h4>
          <div className="metric-value warning">{summary.needsImprovement + summary.poor}</div>
        </div>
      </div>

      <div className="behavior-tabs">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={activeTab === 'drivers' ? 'active' : ''} onClick={() => setActiveTab('drivers')}>All Drivers</button>
        <button className={activeTab === 'coaching' ? 'active' : ''} onClick={() => setActiveTab('coaching')}>Coaching ({coachingAlerts.length})</button>
      </div>

      <div className="tier-filters">
        <select value={filterTier} onChange={e => setFilterTier(e.target.value)}>
          <option value="all">All Tiers</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="needs_improvement">Needs Improvement</option>
          <option value="poor">Poor</option>
        </select>
      </div>

      {activeTab === 'overview' && (
        <div className="tier-distribution">
          <h4>Driver Tier Distribution</h4>
          <div className="tier-bars">
            {[
              { tier: 'Excellent', count: summary.excellent, color: '#10b981' },
              { tier: 'Good', count: summary.good, color: '#3b82f6' },
              { tier: 'Needs Improvement', count: summary.needsImprovement, color: '#f59e0b' },
              { tier: 'Poor', count: summary.poor, color: '#ef4444' }
            ].map(t => (
              <div key={t.tier} className="tier-bar-item">
                <span>{t.tier}</span>
                <div className="tier-bar-visual">
                  <div className="tier-fill" style={{ width: `${summary.totalDrivers ? (t.count / summary.totalDrivers) * 100 : 0}%`, backgroundColor: t.color }} />
                </div>
                <span>{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'drivers' && (
        <div className="drivers-table">
          <table>
            <thead>
              <tr><th>Driver</th><th>Vehicle</th><th>Trips</th><th>Safety</th><th>Eco</th><th>Overall</th><th>Tier</th><th>Trend</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredDrivers.map(d => (
                <tr key={d.driverId} className={d.tier}>
                  <td>{d.driverName}</td>
                  <td>{d.vehiclePlate}</td>
                  <td>{d.totalTrips}</td>
                  <td>{d.scores.safety}/100</td>
                  <td>{d.scores.eco}/100</td>
                  <td><strong>{d.scores.overall}/100</strong></td>
                  <td><span className={`tier-badge ${d.tier}`}>{d.tier.toUpperCase().replace('_', ' ')}</span></td>
                  <td><span className={`trend-${d.trend}`}>{d.trend}</span></td>
                  <td>
                    {d.tier !== 'excellent' && (
                      <button className="btn-coach" onClick={() => onNotice?.(`Coaching scheduled for ${d.driverName}`)}>Coach</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'coaching' && (
        <div className="coaching-alerts">
          {coachingAlerts.map((alert, i) => (
            <div key={i} className={`coaching-alert ${alert.severity}`}>
              <div className="alert-header">
                <span className={`severity-badge ${alert.severity}`}>{alert.severity.toUpperCase()}</span>
                <strong>{alert.driverName}</strong>
              </div>
              <p>{alert.message}</p>
              <div className="alert-recommendations">
                {alert.recommendedActions?.map((a, j) => (
                  <span key={j} className="action-tag">{a}</span>
                ))}
              </div>
              <button className="btn-acknowledge" onClick={() => acknowledgeAlert(i)}>Acknowledge</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DriverBehaviorPanel;