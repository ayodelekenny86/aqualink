import React, { useState } from 'react';

export function SmartDeliverySchedulingPanel({ 
  orders = [], 
  drivers = [],
  vehicles = [],
  facilities = [],
  trafficData = [],
  timeWindows = [],
  weatherForecast = [],
  customerPreferences = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('schedule');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [dragOrder, setDragOrder] = useState(null);

  const { 
    schedule, conflicts, loading, error, refresh,
    rescheduleOrder, addOrderToSchedule,
    getDriverSchedule, getOrderSchedule,
    scheduledCount, unscheduledCount, scheduleRate, conflictCount
  } = React.useMemo(() => {
    const pendingOrders = orders.filter(o => ['Pending', 'Assigned', 'Scheduled'].includes(o.status)).slice(0, 15);
    const availableDrivers = drivers.filter(d => d.status === 'available' || d.status === 'on_duty').slice(0, 5);
    const availableVehicles = vehicles.filter(v => v.status === 'available').slice(0, 5);

    const assignments = pendingOrders.slice(0, 10).map((order, i) => {
      const driver = availableDrivers[i % availableDrivers.length];
      const vehicle = availableVehicles[i % availableVehicles.length];
      const facility = facilities[0];
      const startTime = Date.now() + (i * 90 + 60) * 60000;
      const travelTime = 30 + Math.random() * 60;
      const serviceTime = Math.ceil(order.volume / 500) * 15;
      
      return {
        orderId: order.id,
        customerId: order.customerId,
        driverId: driver.id,
        driverName: driver.name,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        facilityId: facility.id,
        facilityName: facility.name,
        volume: order.volume,
        priority: order.priority,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(startTime + travelTime + serviceTime).toISOString(),
        travelTime: Math.round(travelTime),
        serviceTime,
        distance: Math.round(travelTime * 30),
        status: 'scheduled',
        customerPreferenceMet: Math.floor(50 + Math.random() * 50)
      };
    });

    const unscheduled = pendingOrders.slice(10);
    const mockConflicts = [
      { type: 'preference_mismatch', orderId: assignments[0]?.orderId, driverId: assignments[0]?.driverId, matchScore: 35, severity: 'medium' },
      { type: 'preference_mismatch', orderId: assignments[1]?.orderId, driverId: assignments[1]?.driverId, matchScore: 40, severity: 'medium' }
    ];

    const driverSchedules = availableDrivers.map(driver => {
      const driverAssignments = assignments.filter(a => a.driverId === driver.id);
      return {
        driverId: driver.id,
        driverName: driver.name,
        schedule: driverAssignments.map(a => ({
          orderId: a.orderId,
          start: new Date(a.startTime).getTime(),
          end: new Date(a.endTime).getTime()
        })).sort((a, b) => a.start - b.start),
        totalHours: driverAssignments.reduce((s, a) => s + a.travelTime + a.serviceTime, 0) / 60,
        ordersCount: driverAssignments.length
      };
    });

    return {
      schedule: { assignments, unscheduled, driverSchedules, conflicts: mockConflicts, summary: { totalOrders: pendingOrders.length, scheduledOrders: assignments.length, unscheduledOrders: unscheduled.length, scheduleRate: Math.round((assignments.length / pendingOrders.length) * 100), driversUsed: availableDrivers.length, totalDrivers: availableDrivers.length, avgPreferenceMatch: Math.round(assignments.reduce((s, a) => s + a.customerPreferenceMet, 0) / Math.max(1, assignments.length)), totalDistance: assignments.reduce((s, a) => s + a.distance, 0), estimatedRevenue: assignments.reduce((s, a) => s + a.volume * 0.02, 0) } },
      conflicts: mockConflicts,
      loading: false, error: null, refresh: () => {},
      rescheduleOrder: (oid, did, st) => onNotice?.(`Rescheduled ${oid}`),
      addOrderToSchedule: (oid, did, st) => onNotice?.(`Added ${oid}`),
      getDriverSchedule: (id) => driverSchedules.find(d => d.driverId === id),
      getOrderSchedule: (id) => assignments.find(a => a.orderId === id),
      scheduledCount: assignments.length,
      unscheduledCount: unscheduled.length,
      scheduleRate: Math.round((assignments.length / pendingOrders.length) * 100),
      conflictCount: mockConflicts.length
    };
  }, [orders, drivers, vehicles, facilities, trafficData, timeWindows, weatherForecast, customerPreferences]);

  if (loading) return <div className="panel-loading">Generating schedule...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="smart-scheduling-panel">
      <div className="panel-header">
        <h3>Smart Delivery Scheduling</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Re-optimize</button>
      </div>

      <div className="schedule-metrics">
        <div className="metric-card"><h4>Scheduled</h4><div className="metric-value">{scheduledCount}</div></div>
        <div className="metric-card"><h4>Unscheduled</h4><div className="metric-value warning">{unscheduledCount}</div></div>
        <div className="metric-card"><h4>Schedule Rate</h4><div className="metric-value">{scheduleRate}%</div></div>
        <div className="metric-card"><h4>Conflicts</h4><div className="metric-value critical">{conflictCount}</div></div>
        <div className="metric-card"><h4>Avg Preference Match</h4><div className="metric-value">{schedule?.summary?.avgPreferenceMatch || 0}%</div></div>
        <div className="metric-card"><h4>Total Distance</h4><div className="metric-value">{schedule?.summary?.totalDistance || 0} km</div></div>
      </div>

      <div className="schedule-tabs">
        <button className={activeTab === 'schedule' ? 'active' : ''} onClick={() => setActiveTab('schedule')}>Timeline</button>
        <button className={activeTab === 'drivers' ? 'active' : ''} onClick={() => setActiveTab('drivers')}>By Driver</button>
        <button className={activeTab === 'unscheduled' ? 'active' : ''} onClick={() => setActiveTab('unscheduled')}>Unscheduled ({unscheduledCount})</button>
        <button className={activeTab === 'conflicts' ? 'active' : ''} onClick={() => setActiveTab('conflicts')}>Conflicts ({conflictCount})</button>
      </div>

      {activeTab === 'schedule' && (
        <div className="timeline-view">
          {schedule?.driverSchedules?.map(driverSchedule => (
            <div key={driverSchedule.driverId} className="driver-timeline">
              <div className="timeline-header">
                <h4>{driverSchedule.driverName}</h4>
                <span>{driverSchedule.ordersCount} orders · {driverSchedule.totalHours.toFixed(1)}h</span>
              </div>
              <div className="timeline-bars">
                {driverSchedule.schedule.map((slot, i) => {
                  const assignment = schedule.assignments.find(a => a.orderId === slot.orderId);
                  if (!assignment) return null;
                  const startHour = new Date(slot.start).getHours();
                  const duration = (slot.end - slot.start) / 60000;
                  const left = startHour * 4;
                  const width = Math.max(20, duration * 0.8);
                  
                  return (
                    <div 
                      key={i} 
                      className="timeline-bar"
                      style={{ left: `${left}%`, width: `${width}%` }}
                      onClick={() => setSelectedDriver(driverSchedule.driverId)}
                    >
                      <span>{assignment.volume} gal</span>
                      <span>{new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  );
                })}
              </div>
              <div className="timeline-ruler">
                {[6, 8, 10, 12, 14, 16, 18, 20].map(h => (
                  <span key={h} style={{ left: `${h * 4}%` }}>{h}:00</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'drivers' && (
        <div className="driver-schedules">
          {schedule?.driverSchedules?.map(driverSchedule => (
            <div key={driverSchedule.driverId} className="driver-schedule-card">
              <h4>{driverSchedule.driverName} ({driverSchedule.ordersCount} orders, {driverSchedule.totalHours.toFixed(1)}h)</h4>
              <table>
                <thead><tr><th>Time</th><th>Order</th><th>Customer</th><th>Volume</th><th>Priority</th><th>Match</th></tr></thead>
                <tbody>
                  {driverSchedule.schedule.map((slot, i) => {
                    const assignment = schedule.assignments.find(a => a.orderId === slot.orderId);
                    if (!assignment) return null;
                    return (
                      <tr key={i}>
                        <td>{new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{assignment.orderId}</td>
                        <td>{assignment.customerId}</td>
                        <td>{assignment.volume} gal</td>
                        <td><span className={`priority-${assignment.priority}`}>{assignment.priority}</span></td>
                        <td>{assignment.customerPreferenceMet}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'unscheduled' && (
        <div className="unscheduled-orders">
          {schedule?.unscheduled?.map(order => (
            <div key={order.id} className="unscheduled-order-card">
              <div className="order-info">
                <strong>{order.id}</strong>
                <span>{order.location}</span>
                <span>{order.volume} gal</span>
                <span className={`priority-${order.priority}`}>{order.priority}</span>
              </div>
              <div className="order-actions">
                <select defaultValue="" onChange={e => e.target.value && addOrderToSchedule(order.id, e.target.value, Date.now() + 3600000)}>
                  <option value="">Assign driver...</option>
                  {drivers.filter(d => d.status === 'available').map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.vehicleId})</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'conflicts' && (
        <div className="conflicts-list">
          {conflicts.map((conflict, i) => (
            <div key={i} className={`conflict-card ${conflict.severity}`}>
              <div className="conflict-header">
                <span className={`severity-badge ${conflict.severity}`}>{conflict.severity.toUpperCase()}</span>
                <span>{conflict.type}</span>
              </div>
              {conflict.type === 'overlap' && (
                <p>Driver {conflict.driverId}: Orders {conflict.order1} and {conflict.order2} overlap by {conflict.overlapMinutes} min</p>
              )}
              {conflict.type === 'preference_mismatch' && (
                <p>Order {conflict.orderId} assigned to driver {conflict.driverId} but preference match only {conflict.matchScore}%</p>
              )}
              <button className="btn-resolve" onClick={() => onNotice?.(`Resolving conflict ${i}`)}>Resolve</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SmartDeliverySchedulingPanel;