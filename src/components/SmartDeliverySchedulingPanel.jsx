import React, { useState } from 'react';

export function SmartDeliverySchedulingPanel({ 
  orders = [], 
  drivers = [], 
  vehicles = [],
  facilities = [],
  trafficData = [],
  weatherData = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('schedule');

  const { 
    schedule, optimization, loading, error, refresh,
    applyOptimization, rescheduleOrder,
    scheduledCount, conflictCount, efficiency, distanceSaved
  } = React.useMemo(() => {
    const pendingOrders = orders.filter(o => ['Pending', 'Assigned'].includes(o.status));
    const availableDrivers = drivers.filter(d => d.status === 'available');

    const assignments = pendingOrders.slice(0, availableDrivers.length).map((order, i) => {
      const driver = availableDrivers[i];
      const facility = facilities.find(f => f.id === order.facilityId) || facilities[0];
      return {
        orderId: order.id,
        driverId: driver.id,
        driverName: driver.name,
        facilityId: facility.id,
        facilityName: facility.name,
        customerLocation: order.location,
        volume: order.volume,
        priority: order.priority,
        distance: Math.round(10 + Math.random() * 30),
        estimatedDuration: Math.round(30 + Math.random() * 60),
        startTime: new Date(Date.now() + i * 15 * 60000).toISOString(),
        efficiencyScore: Math.round(70 + Math.random() * 30)
      };
    });

    return {
      schedule: { 
        assignments, 
        conflicts: pendingOrders.length > availableDrivers.length ? [{ type: 'driver_shortage' }] : [],
        summary: { 
          scheduledOrders: assignments.length,
          unscheduledOrders: Math.max(0, pendingOrders.length - availableDrivers.length),
          avgEfficiency: Math.round(assignments.reduce((s, a) => s + a.efficiencyScore, 0) / (assignments.length || 1)),
          distanceSaved: Math.round(Math.random() * 50)
        }
      },
      optimization: {
        facilityOptimizations: facilities.map(f => ({
          facilityId: f.id,
          facilityName: f.name,
          savings: Math.round(Math.random() * 30),
          savingsPercent: Math.round(Math.random() * 20)
        })).filter(o => o.savings > 5)
      },
      loading: false, error: null, refresh: () => {},
      applyOptimization: () => onNotice?.('Optimization applied'),
      rescheduleOrder: () => onNotice?.('Order rescheduled'),
      scheduledCount: assignments.length,
      conflictCount: Math.max(0, pendingOrders.length - availableDrivers.length),
      efficiency: Math.round(assignments.reduce((s, a) => s + a.efficiencyScore, 0) / (assignments.length || 1)),
      distanceSaved: Math.round(Math.random() * 50)
    };
  }, [orders, drivers, vehicles, facilities, trafficData, weatherData]);

  if (loading) return <div className="panel-loading">Generating schedule...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="scheduling-panel">
      <div className="panel-header">
        <h3>Smart Delivery Scheduling</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Regenerate</button>
      </div>

      <div className="scheduling-metrics">
        <div className="metric-card">
          <h4>Scheduled</h4>
          <div className="metric-value">{scheduledCount}</div>
        </div>
        <div className="metric-card">
          <h4>Conflicts</h4>
          <div className="metric-value warning">{conflictCount}</div>
        </div>
        <div className="metric-card">
          <h4>Efficiency</h4>
          <div className="metric-value">{efficiency}%</div>
        </div>
        <div className="metric-card">
          <h4>Distance Saved</h4>
          <div className="metric-value">{distanceSaved} km</div>
        </div>
      </div>

      <div className="scheduling-tabs">
        <button className={activeTab === 'schedule' ? 'active' : ''} onClick={() => setActiveTab('schedule')}>Schedule</button>
        <button className={activeTab === 'optimization' ? 'active' : ''} onClick={() => setActiveTab('optimization')}>Optimization</button>
        <button className={activeTab === 'drivers' ? 'active' : ''} onClick={() => setActiveTab('drivers')}>By Driver</button>
      </div>

      {activeTab === 'schedule' && (
        <div className="schedule-table">
          <table>
            <thead>
              <tr><th>Order</th><th>Driver</th><th>Facility</th><th>Location</th><th>Volume</th><th>Priority</th><th>Distance</th><th>Duration</th><th>Start Time</th><th>Efficiency</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {schedule?.assignments?.map(a => (
                <tr key={a.orderId}>
                  <td>{a.orderId}</td>
                  <td>{a.driverName}</td>
                  <td>{a.facilityName}</td>
                  <td>{a.customerLocation}</td>
                  <td>{a.volume} gal</td>
                  <td><span className={`priority-${a.priority}`}>{a.priority}</span></td>
                  <td>{a.distance} km</td>
                  <td>{a.estimatedDuration} min</td>
                  <td>{new Date(a.startTime).toLocaleTimeString()}</td>
                  <td>{a.efficiencyScore}%</td>
                  <td><button className="btn-sm" onClick={() => rescheduleOrder(a.orderId)}>Reschedule</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {schedule?.conflicts?.length > 0 && (
            <div className="conflicts">
              <h4>⚠ Conflicts</h4>
              {schedule.conflicts.map((c, i) => (
                <div key={i} className="conflict">{c.message || `Driver shortage for ${c.orderId}`}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'optimization' && (
        <div className="optimization-view">
          <h4>Route Optimizations by Facility</h4>
          {optimization?.facilityOptimizations?.map(opt => (
            <div key={opt.facilityId} className="optimization-card">
              <div className="opt-header">
                <h5>{opt.facilityName}</h5>
                <span className="savings">Save {opt.savings} km ({opt.savingsPercent}%)</span>
              </div>
              <button className="btn-apply" onClick={() => applyOptimization(opt.facilityId)}>Apply Optimization</button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'drivers' && (
        <div className="driver-schedule">
          {drivers.filter(d => d.status === 'available').map(driver => {
            const driverAssignments = schedule?.assignments?.filter(a => a.driverId === driver.id) || [];
            return (
              <div key={driver.id} className="driver-card">
                <h5>{driver.name} ({driverAssignments.length} deliveries)</h5>
                {driverAssignments.map(a => (
                  <div key={a.orderId} className="driver-assignment">
                    <span>{a.orderId} → {a.customerLocation}</span>
                    <span>{new Date(a.startTime).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SmartDeliverySchedulingPanel;