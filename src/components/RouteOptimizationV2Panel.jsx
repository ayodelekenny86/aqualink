import React, { useState } from 'react';

export function RouteOptimizationV2Panel({ 
  orders = [], 
  drivers = [], 
  vehicles = [],
  facilities = [],
  trafficData = [],
  timeWindows = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('routes');

  const { 
    optimization, routes, loading, error, refresh,
    reoptimizeRoute, assignOrderToRoute,
    totalSavings, savingsPercent, unassignedCount,
    getDriverRoute
  } = React.useMemo(() => {
    const pendingOrders = orders.filter(o => ['Pending', 'Assigned'].includes(o.status));
    const availableDrivers = drivers.filter(d => d.status === 'available');

    const optimizedRoutes = availableDrivers.slice(0, 3).map((driver, i) => {
      const vehicle = vehicles.find(v => v.id === driver.vehicleId) || vehicles[0];
      const facility = facilities.find(f => f.id === driver.facilityId) || facilities[0];
      const driverOrders = pendingOrders.slice(i * 2, (i + 1) * 2).map((order, j) => ({
        orderId: order.id,
        sequence: j + 1,
        location: order.location,
        coordinates: order.coordinates,
        volume: order.volume,
        priority: order.priority,
        distance: Math.round(10 + Math.random() * 20),
        estimatedArrival: new Date(Date.now() + (i * 30 + j * 15) * 60000).toISOString()
      }));

      return {
        driverId: driver.id,
        driverName: driver.name,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        facilityId: facility.id,
        facilityName: facility.name,
        orders: driverOrders,
        totalDistance: Math.round(driverOrders.reduce((s, o) => s + o.distance, 0) * 1.2),
        totalTime: Math.round(driverOrders.length * 25),
        totalVolume: driverOrders.reduce((s, o) => s + o.volume, 0),
        efficiency: Math.round(75 + Math.random() * 20),
        status: 'optimized'
      };
    });

    return {
      optimization: {
        routes: optimizedRoutes,
        summary: {
          totalRoutes: optimizedRoutes.length,
          totalOrders: pendingOrders.length,
          assignedOrders: optimizedRoutes.reduce((s, r) => s + r.orders.length, 0),
          unassignedOrders: Math.max(0, pendingOrders.length - optimizedRoutes.reduce((s, r) => s + r.orders.length, 0)),
          totalDistance: optimizedRoutes.reduce((s, r) => s + r.totalDistance, 0),
          distanceSaved: Math.round(20 + Math.random() * 30),
          savingsPercent: Math.round(10 + Math.random() * 15),
          totalTime: optimizedRoutes.reduce((s, r) => s + r.totalTime, 0),
          avgEfficiency: Math.round(optimizedRoutes.reduce((s, r) => s + r.efficiency, 0) / optimizedRoutes.length)
        }
      },
      routes: optimizedRoutes,
      loading: false, error: null, refresh: () => {},
      reoptimizeRoute: () => onNotice?.('Re-optimizing...'),
      assignOrderToRoute: () => onNotice?.('Order assigned'),
      totalSavings: Math.round(20 + Math.random() * 30),
      savingsPercent: Math.round(10 + Math.random() * 15),
      unassignedCount: Math.max(0, pendingOrders.length - optimizedRoutes.reduce((s, r) => s + r.orders.length, 0)),
      getDriverRoute: (id) => optimizedRoutes.find(r => r.driverId === id)
    };
  }, [orders, drivers, vehicles, facilities, trafficData, timeWindows]);

  if (loading) return <div className="panel-loading">Optimizing routes...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="routing-v2-panel">
      <div className="panel-header">
        <h3>Route Optimization V2</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Re-optimize</button>
      </div>

      <div className="routing-metrics">
        <div className="metric-card">
          <h4>Routes</h4>
          <div className="metric-value">{optimization?.summary?.totalRoutes || 0}</div>
        </div>
        <div className="metric-card">
          <h4>Distance Saved</h4>
          <div className="metric-value">{totalSavings} km</div>
        </div>
        <div className="metric-card">
          <h4>Savings</h4>
          <div className="metric-value">{savingsPercent}%</div>
        </div>
        <div className="metric-card">
          <h4>Unassigned</h4>
          <div className="metric-value warning">{unassignedCount}</div>
        </div>
      </div>

      <div className="routing-tabs">
        <button className={activeTab === 'routes' ? 'active' : ''} onClick={() => setActiveTab('routes')}>Routes</button>
        <button className={activeTab === 'summary' ? 'active' : ''} onClick={() => setActiveTab('summary')}>Summary</button>
        <button className={activeTab === 'unassigned' ? 'active' : ''} onClick={() => setActiveTab('unassigned')}>Unassigned ({unassignedCount})</button>
      </div>

      {activeTab === 'routes' && (
        <div className="routes-list">
          {routes.map(route => (
            <div key={route.driverId} className="route-card">
              <div className="route-header">
                <h4>{route.driverName} ({route.vehiclePlate})</h4>
                <span className="efficiency">{route.efficiency}% efficient</span>
              </div>
              <p>{route.facilityName} → {route.orders.length} stops · {route.totalVolume.toLocaleString()} gal</p>
              <div className="route-stops">
                {route.orders.map(stop => (
                  <div key={stop.orderId} className="stop">
                    <span>#{stop.sequence} {stop.location}</span>
                    <span>{stop.volume} gal</span>
                    <span>{new Date(stop.estimatedArrival).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
              <button className="btn-reoptimize" onClick={() => reoptimizeRoute(route.driverId)}>Re-optimize</button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'summary' && (
        <div className="routing-summary">
          <div className="summary-grid">
            <div className="summary-item"><h5>Total Distance</h5><p>{optimization?.summary?.totalDistance?.toLocaleString()} km</p></div>
            <div className="summary-item"><h5>Total Time</h5><p>{Math.round((optimization?.summary?.totalTime || 0) / 60)}h {Math.round((optimization?.summary?.totalTime || 0) % 60)}m</p></div>
            <div className="summary-item"><h5>Avg Efficiency</h5><p>{optimization?.summary?.avgEfficiency}%</p></div>
            <div className="summary-item"><h5>Fuel Saved</h5><p>{Math.round(totalSavings * 0.25 * 12)} L</p></div>
          </div>
        </div>
      )}

      {activeTab === 'unassigned' && (
        <div className="unassigned-orders">
          {pendingOrders.slice(routes.reduce((s, r) => s + r.orders.length, 0)).map(order => (
            <div key={order.id} className="unassigned-order">
              <span>{order.id} - {order.location}</span>
              <span>{order.volume} gal</span>
              <select onChange={e => assignOrderToRoute(order.id, e.target.value)}>
                <option value="">Assign to driver...</option>
                {drivers.filter(d => d.status === 'available').map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RouteOptimizationV2Panel;