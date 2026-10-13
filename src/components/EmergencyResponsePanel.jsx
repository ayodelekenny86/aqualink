import React, { useState } from 'react';

export function EmergencyResponsePanel({ 
  orders = [], 
  drivers = [],
  vehicles = [],
  facilities = [],
  incidents = [],
  weatherAlerts = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('active');
  const [selectedIncident, setSelectedIncident] = useState(null);

  const { 
    activeIncidents, responsePlans, loading, error, refresh,
    assignResponder, updateIncidentStatus, completeIncident, escalateIncident,
    getResponsePlan, getActiveIncidents, getIncidentsBySeverity,
    criticalCount, highCount, totalActive
  } = React.useMemo(() => {
    const mockIncidents = [
      { id: 'incident-ord-1', type: 'emergency_delivery', severity: 'critical', title: 'Emergency Delivery: Korle Bu Hospital', description: '5000 gal needed urgently for hospital', location: 'Korle Bu, Accra', status: 'active', assignedDriver: null, requiredVolume: 5000, deadline: new Date(Date.now() + 2 * 3600000).toISOString(), escalationLevel: 1 },
      { id: 'incident-ord-2', type: 'emergency_delivery', severity: 'critical', title: 'Emergency Delivery: 37 Military Hospital', description: '3000 gal needed for emergency ward', location: '37 Military Hospital, Accra', status: 'responding', assignedDriver: 'driver-1', requiredVolume: 3000, deadline: new Date(Date.now() + 1.5 * 3600000).toISOString(), escalationLevel: 1 },
      { id: 'incident-weather-1', type: 'weather_emergency', severity: 'high', title: 'Heavy Rain Alert: Greater Accra', description: 'Flash flood warning affecting water sources', location: 'Greater Accra Region', status: 'monitoring', affectedSources: ['Weija Dam', 'Kpong'], estimatedImpact: 'Turbidity spike expected', escalationLevel: 1 }
    ];

    const mockPlans = mockIncidents.map(inc => ({
      incidentId: inc.id,
      type: inc.type,
      steps: inc.type === 'emergency_delivery' ? [
        { step: 1, action: 'Identify nearest available driver', status: inc.assignedDriver ? 'completed' : 'pending', assignedTo: inc.assignedDriver },
        { step: 2, action: 'Dispatch driver to facility', status: inc.assignedDriver ? 'in_progress' : 'pending' },
        { step: 3, action: 'Load emergency water supply', status: 'pending' },
        { step: 4, action: 'Deliver to customer location', status: 'pending' },
        { step: 5, action: 'Confirm delivery and document', status: 'pending' }
      ] : [
        { step: 1, action: 'Assess source water quality impact', status: 'in_progress' },
        { step: 2, action: 'Activate backup water sources', status: 'pending' },
        { step: 3, action: 'Notify affected customers', status: 'pending' },
        { step: 4, action: 'Deploy emergency treatment if needed', status: 'pending' },
        { step: 5, action: 'Monitor and report status', status: 'pending' }
      ],
      estimatedTime: inc.type === 'emergency_delivery' ? 90 : 120,
      resources: inc.type === 'emergency_delivery' ? { drivers: drivers.filter(d => d.status === 'available').slice(0, 3).map(d => ({ id: d.id, name: d.name, distance: Math.round(5 + Math.random() * 20) })) } : {}
    }));

    return {
      activeIncidents: mockIncidents,
      responsePlans: mockPlans,
      loading: false, error: null, refresh: () => {},
      assignResponder: (iid, did, vid) => onNotice?.(`Assigned ${did} to ${iid}`),
      updateIncidentStatus: (iid, s) => onNotice?.(`${iid} -> ${s}`),
      completeIncident: (iid) => onNotice?.(`Completed ${iid}`),
      escalateIncident: (iid) => onNotice?.(`Escalated ${iid}`),
      getResponsePlan: (iid) => mockPlans.find(p => p.incidentId === iid),
      getActiveIncidents: () => mockIncidents,
      getIncidentsBySeverity: (s) => mockIncidents.filter(i => i.severity === s),
      criticalCount: mockIncidents.filter(i => i.severity === 'critical').length,
      highCount: mockIncidents.filter(i => i.severity === 'high').length,
      totalActive: mockIncidents.length
    };
  }, [orders, drivers, vehicles, facilities, incidents, weatherAlerts]);

  if (loading) return <div className="panel-loading">Loading emergency system...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="emergency-response-panel">
      <div className="panel-header">
        <h3>Emergency Response</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="emergency-metrics">
        <div className="metric-card"><h4>Active Incidents</h4><div className="metric-value">{totalActive}</div></div>
        <div className="metric-card"><h4>Critical</h4><div className="metric-value critical">{criticalCount}</div></div>
        <div className="metric-card"><h4>High</h4><div className="metric-value warning">{highCount}</div></div>
        <div className="metric-card"><h4>Responding</h4><div className="metric-value">{activeIncidents.filter(i => i.status === 'responding').length}</div></div>
      </div>

      <div className="emergency-tabs">
        <button className={activeTab === 'active' ? 'active' : ''} onClick={() => setActiveTab('active')}>Active Incidents</button>
        <button className={activeTab === 'response' ? 'active' : ''} onClick={() => setActiveTab('response')}>Response Plans</button>
        <button className={activeTab === 'resources' ? 'active' : ''} onClick={() => setActiveTab('resources')}>Resources</button>
      </div>

      {activeTab === 'active' && (
        <div className="incidents-list">
          {activeIncidents.map(incident => (
            <div key={incident.id} className={`incident-card ${incident.severity} ${incident.status}`} onClick={() => setSelectedIncident(incident.id)}>
              <div className="incident-header">
                <div>
                  <h4>{incident.title}</h4>
                  <p>{incident.description}</p>
                </div>
                <div className="incident-badges">
                  <span className={`severity-badge ${incident.severity}`}>{incident.severity.toUpperCase()}</span>
                  <span className={`status-badge ${incident.status}`}>{incident.status.toUpperCase()}</span>
                  {incident.escalationLevel > 1 && <span className="escalation-badge">ESCALATED L{incident.escalationLevel}</span>}
                </div>
              </div>
              <div className="incident-details">
                <span>📍 {incident.location}</span>
                <span>⏰ Deadline: {new Date(incident.deadline).toLocaleTimeString()}</span>
                <span>📦 {incident.requiredVolume?.toLocaleString()} gal</span>
                {incident.assignedDriver && <span>🚚 Driver: {incident.assignedDriver}</span>}
              </div>
              <div className="incident-actions">
                {!incident.assignedDriver && drivers.filter(d => d.status === 'available').map(d => (
                  <button key={d.id} className="btn-assign" onClick={e => { e.stopPropagation(); assignResponder(incident.id, d.id, d.vehicleId); }}>Assign {d.name}</button>
                ))}
                <button className="btn-view" onClick={e => { e.stopPropagation(); setSelectedIncident(incident.id); }}>View Plan</button>
                <button className="btn-complete" onClick={e => { e.stopPropagation(); completeIncident(incident.id); }}>Complete</button>
                <button className="btn-escalate" onClick={e => { e.stopPropagation(); escalateIncident(incident.id); }}>Escalate</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'response' && (
        <div className="response-plans">
          {activeIncidents.map(incident => {
            const plan = getResponsePlan(incident.id);
            if (!plan) return null;
            return (
              <div key={incident.id} className="response-plan-card">
                <h4>{incident.title}</h4>
                <div className="plan-meta">Estimated: {plan.estimatedTime} min | Type: {plan.type}</div>
                <div className="plan-steps">
                  {plan.steps.map(step => (
                    <div key={step.step} className={`plan-step ${step.status}`}>
                      <span className="step-number">{step.step}</span>
                      <span className="step-action">{step.action}</span>
                      <span className={`step-status ${step.status}`}>{step.status.toUpperCase()}</span>
                      {step.assignedTo && <span className="step-assignee">{step.assignedTo}</span>}
                    </div>
                  ))}
                </div>
                {plan.resources?.drivers && (
                  <div className="plan-resources">
                    <h5>Available Drivers</h5>
                    {plan.resources.drivers.map(d => (
                      <button key={d.id} className="btn-driver" onClick={() => assignResponder(incident.id, d.id, d.vehicleId)}>{d.name} ({d.distance} km away)</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'resources' && (
        <div className="emergency-resources">
          <div className="resource-section">
            <h4>Available Drivers</h4>
            <div className="resource-grid">
              {drivers.filter(d => d.status === 'available').map(d => (
                <div key={d.id} className="resource-card">
                  <strong>{d.name}</strong>
                  <p>Vehicle: {d.vehicleId}</p>
                  <p>Rating: {d.rating}/5</p>
                  <p>Experience: {d.experience} yrs</p>
                </div>
              ))}
            </div>
          </div>
          <div className="resource-section">
            <h4>Available Vehicles</h4>
            <div className="resource-grid">
              {vehicles.filter(v => v.status === 'available').map(v => (
                <div key={v.id} className="resource-card">
                  <strong>{v.plate}</strong>
                  <p>Type: {v.type}</p>
                  <p>Capacity: {v.capacity} gal</p>
                  <p>Fuel: {v.fuelType}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="resource-section">
            <h4>Backup Facilities</h4>
            <div className="resource-grid">
              {facilities.filter(f => f.isBackup || f.status === 'active').map(f => (
                <div key={f.id} className="resource-card">
                  <strong>{f.name}</strong>
                  <p>Available: {f.availableVolume?.toLocaleString()} gal</p>
                  <p>Type: {f.type}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedIncident && (
        <div className="incident-modal-overlay" onClick={() => setSelectedIncident(null)}>
          <div className="incident-modal" onClick={e => e.stopPropagation()}>
            <h3>Incident Details: {activeIncidents.find(i => i.id === selectedIncident)?.title}</h3>
            <button className="btn-close" onClick={() => setSelectedIncident(null)}>✕</button>
            <p>Full incident details and response plan would be shown here</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmergencyResponsePanel;