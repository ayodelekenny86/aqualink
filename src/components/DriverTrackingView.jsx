import { useState, useEffect, useMemo } from 'react';
import { formatCedi } from '../lib/money';
import useDriverTracking from '../hooks/useDriverTracking';

function DriverMarker({ driver, onClick }) {
  const statusColors = {
    online: '#10b981',
    offline: '#6b7280',
    'on-job': '#3b82f6',
  };

  return (
    <button
      className="driver-marker"
      style={{
        left: `${driver.x}%`,
        top: `${driver.y}%`,
        borderColor: statusColors[driver.status] || statusColors.online,
        backgroundColor: statusColors[driver.status] || statusColors.online,
      }}
      onClick={() => onClick(driver)}
      aria-label={`${driver.driverName} - ${driver.status}`}
    >
      <span className="marker-dot" />
      {driver.currentOrder && <span className="marker-pulse" />}
    </button>
  );
}

function RouteLine({ route }) {
  if (!route) return null;

  return (
    <svg className="route-line" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
        </marker>
      </defs>
      <line
        x1={route.originX}
        y1={route.originY}
        x2={route.destX}
        y2={route.destY}
        stroke="#3b82f6"
        strokeWidth="2"
        strokeDasharray="5,5"
        markerEnd="url(#arrowhead)"
      />
      <circle cx={route.originX} cy={route.originY} r="4" fill="#10b981" />
      <circle cx={route.destX} cy={route.destY} r="4" fill="#ef4444" />
    </svg>
  );
}

function DriverCard({ driver, route, onViewRoute }) {
  const statusLabels = {
    online: 'Available',
    offline: 'Offline',
    'on-job': 'On Delivery',
  };

  return (
    <article className="driver-track-card panel">
      <div className="driver-track-header">
        <div>
          <strong>{driver.driverName}</strong>
          <small>{driver.vehicle} · {driver.location}</small>
        </div>
        <span className={`status ${driver.status === 'online' ? 'status-online' : driver.status === 'on-job' ? 'status-enroute' : 'status-offline'}`}>
          {statusLabels[driver.status] || driver.status}
        </span>
      </div>

      <div className="driver-track-stats">
        <div><span>Speed:</span> <strong>{driver.speed} km/h</strong></div>
        <div><span>Heading:</span> <strong>{driver.heading ? `${Math.round(driver.heading)}°` : '—'}</strong></div>
        <div><span>Last update:</span> <strong>{new Date(driver.lastUpdate).toLocaleTimeString()}</strong></div>
      </div>

      {driver.currentOrder && route && (
        <div className="route-summary">
          <div><span>To:</span> <strong>{route.destination}</strong></div>
          <div><span>Distance:</span> <strong>{route.distance.toFixed(1)} km</strong></div>
          <div><span>ETA:</span> <strong>{route.eta}</strong></div>
          <div><span>Progress:</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${route.progress}%` }} />
            </div>
            <small>{route.progress}%</small>
          </div>
          <button className="outline-button" type="button" onClick={() => onViewRoute(driver.currentOrder)}>
            View Route
          </button>
        </div>
      )}

      {!driver.currentOrder && driver.status === 'online' && (
        <p className="driver-idle">Waiting for assignment...</p>
      )}
    </article>
  );
}

function OrderTrackingCard({ order, driverPosition, route, onViewRoute }) {
  const statusColors = {
    'Awaiting payment': 'status-awaiting',
    'Assigned': 'status-assigned',
    'En Route': 'status-enroute',
    'Delivered': 'status-delivered',
  };

  return (
    <article className="order-track-card panel">
      <div className="order-track-header">
        <div>
          <strong>{order.code}</strong>
          <small>{order.location}</small>
        </div>
        <span className={`status ${statusColors[order.status] || ''}`}>{order.status}</span>
      </div>

      {driverPosition && (
        <div className="driver-track-mini">
          <div className="driver-mini-info">
            <span>🚛</span>
            <strong>{driverPosition.driverName}</strong>
            <small>{driverPosition.vehicle}</small>
          </div>
          <div className="driver-mini-eta">
            <span>{driverPosition.eta}</span>
            <small>{driverPosition.progress}% complete</small>
          </div>
        </div>
      )}

      <div className="order-track-details">
        <div><span>Volume:</span> <strong>{order.volume}</strong></div>
        <div><span>Value:</span> <strong>{formatCedi(order.chargedMinor ?? 0)}</strong></div>
        {driverPosition && <div><span>Current location:</span> <strong>{driverPosition.location}</strong></div>}
      </div>

      {route && (
        <button className="outline-button" type="button" onClick={() => onViewRoute(order.id)}>
          View Full Route
        </button>
      )}
    </article>
  );
}

function MapView({ drivers, selectedRoute, onCloseRoute }) {
  return (
    <div className="map-container panel">
      <div className="map-header">
        <h3>Live Driver Map</h3>
        <div className="map-legend">
          <span className="legend-item"><span className="legend-dot online" /> Available</span>
          <span className="legend-item"><span className="legend-dot on-job" /> On Delivery</span>
          <span className="legend-item"><span className="legend-dot offline" /> Offline</span>
        </div>
      </div>

      <div className="map-canvas">
        {/* Simplified map representation - in production would use Mapbox/Leaflet */}
        <div className="map-grid">
          {Object.entries(LOCATION_LABELS).map(([key, label]) => (
            <div key={key} className="map-location" style={{ gridArea: key }}>
              <span className="location-name">{label}</span>
            </div>
          ))}

          {drivers.map((driver) => (
            <DriverMarker
              key={driver.driverId}
              driver={{
                ...driver,
                x: LOCATION_POSITIONS[normalizeLocationKey(driver.location)]?.x ?? 50,
                y: LOCATION_POSITIONS[normalizeLocationKey(driver.location)]?.y ?? 50,
              }}
              onClick={() => {}}
            />
          ))}

          {selectedRoute && (
            <RouteLine
              route={{
                originX: LOCATION_POSITIONS[normalizeLocationKey(selectedRoute.origin)]?.x ?? 50,
                originY: LOCATION_POSITIONS[normalizeLocationKey(selectedRoute.origin)]?.y ?? 50,
                destX: LOCATION_POSITIONS[normalizeLocationKey(selectedRoute.destination)]?.x ?? 50,
                destY: LOCATION_POSITIONS[normalizeLocationKey(selectedRoute.destination)]?.y ?? 50,
              }}
            />
          )}
        </div>
      </div>

      {selectedRoute && (
        <div className="route-detail-panel">
          <div className="route-detail-header">
            <h4>Route: {selectedRoute.origin} → {selectedRoute.destination}</h4>
            <button className="icon-button" onClick={onCloseRoute}>×</button>
          </div>
          <div className="route-detail-stats">
            <div><span>Driver:</span> <strong>{selectedRoute.driver}</strong></div>
            <div><span>Vehicle:</span> <strong>{selectedRoute.vehicle}</strong></div>
            <div><span>Distance:</span> <strong>{selectedRoute.distance.toFixed(1)} km</strong></div>
            <div><span>ETA:</span> <strong>{selectedRoute.eta}</strong></div>
            <div><span>Progress:</span> <strong>{selectedRoute.progress}%</strong></div>
            <div><span>Status:</span> <strong>{selectedRoute.status}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simplified map layout for Accra localities
const LOCATION_LABELS = {
  'east-legon': 'East Legon',
  'cantonments': 'Cantonments',
  'osu': 'Osu',
  'airport': 'Airport Res.',
  'tema': 'Tema',
  'spintex': 'Spintex',
  'madina': 'Madina',
  'abeka': 'Abeka',
  'achimota': 'Achimota',
  'dansoman': 'Dansoman',
  'central': 'Accra Central',
  'labadi': 'Labadi',
  'adenta': 'Adenta',
};

const LOCATION_POSITIONS = {
  'east-legon': { x: 65, y: 35 },
  'cantonments': { x: 45, y: 55 },
  'osu': { x: 50, y: 60 },
  'airport': { x: 55, y: 40 },
  'tema': { x: 85, y: 70 },
  'spintex': { x: 70, y: 55 },
  'madina': { x: 70, y: 25 },
  'abeka': { x: 40, y: 30 },
  'achimota': { x: 35, y: 20 },
  'dansoman': { x: 25, y: 65 },
  'central': { x: 50, y: 50 },
  'labadi': { x: 55, y: 70 },
  'adenta': { x: 80, y: 20 },
};

function normalizeLocationKey(location) {
  if (!location) return 'central';
  return location
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function DriverTrackingView({ orders, onNotice }) {
  const {
    driverPositions,
    trackingEnabled,
    startTracking,
    stopTracking,
    getDriverPosition,
    getActiveDrivers,
    getRoute,
    updateDriverPosition,
    setDriverStatus,
  } = useDriverTracking({ orders, onNotice });

  const [selectedRoute, setSelectedRoute] = useState(null);
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'

  const activeDrivers = getActiveDrivers();
  const allDrivers = useMemo(() => Object.values(driverPositions), [driverPositions]);

  // Build driver cards with routes
  const driverCards = useMemo(() => {
    return allDrivers.map((driver) => ({
      driver,
      route: driver.currentOrder ? getRoute(driver.currentOrder) : null,
    }));
  }, [allDrivers, getRoute]);

  // Build order tracking cards
  const activeOrders = orders.filter((o) =>
    o.driverId && (o.status === 'Assigned' || o.status === 'En Route')
  );

  const orderCards = useMemo(() => {
    return activeOrders.map((order) => ({
      order,
      driverPosition: getDriverPosition(order.id),
      route: getRoute(order.id),
    }));
  }, [activeOrders, getDriverPosition, getRoute]);

  const handleViewRoute = (orderId) => {
    const route = getRoute(orderId);
    if (route) setSelectedRoute(route);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <p className="section-kicker">DRIVER TRACKING · ACCRA</p>
          <h1>Live fleet monitoring</h1>
          <p>Track driver locations, routes, and ETAs in real time.</p>
        </div>
        <div className="tracking-controls">
          <button
            className={trackingEnabled ? 'primary-button' : 'outline-button'}
            type="button"
            onClick={trackingEnabled ? stopTracking : startTracking}
          >
            {trackingEnabled ? '⏸ Stop Tracking' : '▶ Start Tracking'}
          </button>
          <button
            className={viewMode === 'map' ? 'primary-button' : 'outline-button'}
            type="button"
            onClick={() => setViewMode('map')}
          >
            Map
          </button>
          <button
            className={viewMode === 'list' ? 'primary-button' : 'outline-button'}
            type="button"
            onClick={() => setViewMode('list')}
          >
            List
          </button>
        </div>
      </div>

      {viewMode === 'map' && (
        <MapView
          drivers={allDrivers}
          selectedRoute={selectedRoute}
          onCloseRoute={() => setSelectedRoute(null)}
        />
      )}

      {viewMode === 'list' && (
        <>
          <section className="panel">
            <div className="panel-title">
              <span className="section-kicker">ACTIVE DRIVERS</span>
              <h2>{activeDrivers.length} on job · {allDrivers.filter(d => d.status === 'online').length} available</h2>
            </div>
            <div className="driver-track-grid">
              {driverCards.map(({ driver, route }) => (
                <DriverCard
                  key={driver.driverId}
                  driver={driver}
                  route={route}
                  onViewRoute={handleViewRoute}
                />
              ))}
            </div>
            {allDrivers.length === 0 && (
              <p className="empty-feed">No drivers in fleet. Add drivers in the fleet management section.</p>
            )}
          </section>

          <section className="panel">
            <div className="panel-title">
              <span className="section-kicker">ACTIVE DELIVERIES</span>
              <h2>{activeOrders.length} order{activeOrders.length !== 1 ? 's' : ''} in progress</h2>
            </div>
            {activeOrders.length === 0 ? (
              <p className="empty-feed">No active deliveries. Orders appear here when assigned to a driver.</p>
            ) : (
              <div className="order-track-grid">
                {orderCards.map(({ order, driverPosition, route }) => (
                  <OrderTrackingCard
                    key={order.id}
                    order={order}
                    driverPosition={driverPosition}
                    route={route}
                    onViewRoute={handleViewRoute}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default DriverTrackingView;