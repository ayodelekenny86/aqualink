import React, { useState } from 'react';

export function EmergencyResponsePanel({ 
  orders = [], 
  drivers = [], 
  facilities = [],
  customers = [],
  weatherAlerts = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('detected');
  const [selectedEmergency, setSelectedEmergency] = useState(null);

  const { 
    emergencies, activeEmergency, responsePlans, loading, error, refresh,
    generateResponsePlan, executeResponsePlan, resolveEmergency,
    activeCount, criticalCount
  } = React.useMemo(() => {
    const detected = [];
    
    const criticalOrders = orders.filter(o => 
      o.priority === 'emergency' || o.status === 'Emergency' || (o.delayMinutes && o.delayMinutes > 120)
    );
    
    criticalOrders.forEach(order => {
      const customer = customers.find(c => c.id === order.customerId);
      detected.push({
        id: `emergency-${order.id}`,
        type: 'delivery_critical',
        severity: 'critical',
        title: `Critical Delivery: ${order.id}`,
        description: `Emergency water delivery to ${customer?.name || 'customer'} at ${order.location}`,
        orderId: order.id,
        status: 'detected'
      });
    });

    const severeWeather = weatherAlerts.filter(w => w.severity === 'severe' || w.severity === 'extreme');
    severeWeather.forEach(alert => {
      detected.push({
        id: `emergency-weather-${alert.id}`,
        type: 'weather_disruption',
        severity: alert.severity === 'extreme' ? 'critical' : 'high',
        title: `Weather Emergency: ${alert.type}`,
        description: alert.description,
        status: 'detected'
      });
    });

    return {
      emergencies: detected,
      activeEmergency: detected[0] || null,
      responsePlans: [],
      loading: false, error: null, refresh: () => {},
      generateResponsePlan: async (id) => { 
        setSelectedEmergency(detected.find(e => e.id === id));
        onNotice?.(`Generating response plan...`);
      },
      executeResponsePlan: async (id) => { onNotice?.(`Executing plan...`); },
      resolveEmergency: async (id) => { onNotice?.(`Emergency resolved`); },
      activeCount: detected.length,
      criticalCount: detected.filter(e => e.severity === 'critical').length
    };
  }, [orders, drivers, facilities, customers, weatherAlerts, onNotice]);

  if (loading) return <div className="panel-loading">Detecting emergencies...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const activeEmergencies = emergencies.filter(e => e.status !== 'resolved');

  return (
    <div className="emergency-panel">
      <div className="panel-header">
        <h3>Emergency Response</h3>
        <div className="emergency-badges">
          <span className="badge critical">{criticalCount} Critical</span>
          <span className="badge warning">{activeCount} Active</span>
        </div>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Scan</button>
      </div>

      <div className="emergency-tabs">
        <button className={activeTab === 'detected' ? 'active' : ''} onClick={() => setActiveTab('detected')}>Detected ({activeEmergencies.length})</button>
        <button className={activeTab === 'responding' ? 'active' : ''} onClick={() => setActiveTab('responding')}>Responding</button>
        <button className={activeTab === 'plans' ? 'active' : ''} onClick={() => setActiveTab('plans')}>Response Plans</button>
      </div>

      {activeTab === 'detected' && (
        <div className="emergency-list">
          {activeEmergencies.length === 0 ? (
            <div className="no-emergencies">✅ No active emergencies detected</div>
          ) : (
            activeEmergencies.map(emergency => (
              <div key={emergency.id} className={`emergency-card ${emergency.severity}`} onClick={() => setSelectedEmergency(emergency)}>
                <div className="emergency-header">
                  <span className={`severity-badge ${emergency.severity}`}>{emergency.severity.toUpperCase()}</span>
                  <h4>{emergency.title}</h4>
                  <span className="type-badge">{emergency.type.replace('_', ' ')}</span>
                </div>
                <p>{emergency.description}</p>
                <div className="emergency-meta">
                  <span>Detected: {new Date(emergency.detectedAt).toLocaleTimeString()}</span>
                  <button className="btn-plan" onClick={(e) => { e.stopPropagation(); generateResponsePlan(emergency.id); }}>
                    Create Plan
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'responding' && (
        <div className="responding-list">
          {emergencies.filter(e => e.status === 'responding').length === 0 ? (
            <div className="no-emergencies">No emergencies currently being responded to</div>
          ) : (
            emergencies.filter(e => e.status === 'responding').map(emergency => (
              <div key={emergency.id} className="emergency-card responding">
                <h4>{emergency.title}</h4>
                <p>Status: RESPONDING</p>
                <button className="btn-resolve" onClick={() => resolveEmergency(emergency.id)}>Mark Resolved</button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'plans' && (
        <div className="plans-list">
          {responsePlans.length === 0 ? (
            <div className="no-emergencies">No response plans generated yet</div>
          ) : (
            responsePlans.map(plan => (
              <div key={plan.id} className="plan-card">
                <h4>Plan for {plan.emergencyType.replace('_', ' ')}</h4>
                <p>Created: {new Date(plan.createdAt).toLocaleString()}</p>
                <p>Est. Resolution: {plan.estimatedResolution} min</p>
                <button className="btn-execute" onClick={() => executeResponsePlan(plan.id)}>Execute</button>
              </div>
            ))
          )}
        </div>
      )}

      {selectedEmergency && (
        <div className="emergency-detail-modal" onClick={() => setSelectedEmergency(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{selectedEmergency.title}</h3>
            <p>{selectedEmergency.description}</p>
            <p>Severity: <strong>{selectedEmergency.severity.toUpperCase()}</strong></p>
            <p>Type: {selectedEmergency.type.replace('_', ' ')}</p>
            <button className="btn-close" onClick={() => setSelectedEmergency(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmergencyResponsePanel;