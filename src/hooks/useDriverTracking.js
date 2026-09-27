import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, findBy, update } from '../lib/collections';
import { getFleet } from '../lib/fleet';
import { summarise } from '../lib/summary';

/**
 * Real-time driver tracking hook: provides live location updates, route
 * visualization, and ETA calculations for drivers.
 *
 * In production, this would connect to a real-time location service (WebSocket,
 * Firestore real-time, or MQTT). For demo purposes, it simulates movement
 * based on order assignments and provides a realistic tracking experience.
 */
export function useDriverTracking({ orders, onNotice }) {
  const [driverPositions, setDriverPositions] = useState({});
  const [routes, setRoutes] = useState({});
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(null);

  // Get active orders with assigned drivers
  const activeOrders = useMemo(() => {
    return orders.filter((o) =>
      o.driverId &&
      (o.status === 'Assigned' || o.status === 'En Route')
    );
  }, [orders]);

  // Initialize driver positions from fleet data
  useEffect(() => {
    const { drivers } = getFleet();
    const initialPositions = {};
    drivers.forEach((driver) => {
      if (driver.status === 'online') {
        // Start at driver's base location
        initialPositions[driver.id] = {
          driverId: driver.id,
          driverName: driver.name,
          location: driver.base,
          coordinates: getCoordinatesFromLocation(driver.base),
          status: driver.status,
          heading: null,
          speed: 0,
          lastUpdate: new Date().toISOString(),
          currentOrder: null,
        };
      }
    });
    setDriverPositions(initialPositions);
  }, []);

  // Simulate driver movement towards delivery
  useEffect(() => {
    if (!trackingEnabled) return;

    const interval = setInterval(() => {
      setDriverPositions((prev) => {
        const updated = { ...prev };
        let hasChanges = false;

        activeOrders.forEach((order) => {
          const driverId = order.driverId;
          if (!driverId || !updated[driverId]) return;

          const driver = updated[driverId];
          const driverData = list('drivers').find((d) => d.id === driverId);
          if (!driverData) return;

          // Get destination coordinates
          const destCoords = getCoordinatesFromLocation(order.location);
          const currentCoords = driver.coordinates;

          if (!destCoords || !currentCoords) return;

          // Calculate movement towards destination
          const { newCoords, arrived, progress } = moveTowards(
            currentCoords,
            destCoords,
            driverData.capacityGallons // Use capacity as speed factor
          );

          // Calculate ETA based on remaining distance and speed
          const distance = calculateDistance(newCoords, destCoords);
          const speedKmh = 30; // Average urban speed
          const etaMinutes = distance > 0 ? Math.round((distance / speedKmh) * 60) : 0;

          // Update position
          updated[driverId] = {
            ...driver,
            coordinates: newCoords,
            location: arrived ? order.location : interpolateLocation(currentCoords, newCoords, order.location),
            heading: calculateHeading(currentCoords, newCoords),
            speed: speedKmh,
            lastUpdate: new Date().toISOString(),
            currentOrder: order.id,
            eta: arrived ? 'Arrived' : `${etaMinutes} min`,
            progress: Math.round(progress * 100),
          };

          // If arrived, update order status
          if (arrived && order.status === 'En Route') {
            // In real app, this would trigger a status update
            hasChanges = true;
          }

          hasChanges = true;
        });

        return hasChanges ? updated : prev;
      });
    }, 5000); // Update every 5 seconds

    setUpdateInterval(interval);
    return () => clearInterval(interval);
  }, [trackingEnabled, activeOrders]);

  // Start/stop tracking
  const startTracking = useCallback(() => {
    setTrackingEnabled(true);
    onNotice('Live driver tracking enabled.');
  }, [onNotice]);

  const stopTracking = useCallback(() => {
    setTrackingEnabled(false);
    onNotice('Live driver tracking disabled.');
  }, [onNotice]);

  // Get driver position for a specific order
  const getDriverPosition = useCallback((orderId) => {
    const order = findBy('orders', (o) => o.id === orderId);
    if (!order?.driverId) return null;
    return driverPositions[order.driverId] ?? null;
  }, [driverPositions]);

  // Get all active driver positions
  const getActiveDrivers = useCallback(() => {
    return Object.values(driverPositions).filter(
      (d) => d.status === 'online' && d.currentOrder
    );
  }, [driverPositions]);

  // Calculate route for an order
  const getRoute = useCallback((orderId) => {
    const order = findBy('orders', (o) => o.id === orderId);
    if (!order?.driverId) return null;

    const driver = driverPositions[order.driverId];
    if (!driver) return null;

    const destCoords = getCoordinatesFromLocation(order.location);
    if (!destCoords || !driver.coordinates) return null;

    return {
      driver: driver.driverName,
      vehicle: list('drivers').find((d) => d.id === order.driverId)?.vehicle ?? '',
      origin: driver.location,
      destination: order.location,
      originCoords: driver.coordinates,
      destCoords,
      distance: calculateDistance(driver.coordinates, destCoords),
      eta: driver.eta,
      progress: driver.progress,
      status: order.status,
    };
  }, [driverPositions, orders]);

  // Manual position update (for driver app integration)
  const updateDriverPosition = useCallback((driverId, location, coordinates) => {
    setDriverPositions((prev) => ({
      ...prev,
      [driverId]: {
        ...prev[driverId],
        location,
        coordinates: coordinates || getCoordinatesFromLocation(location),
        lastUpdate: new Date().toISOString(),
      },
    }));
  }, []);

  // Set driver status (online/offline/on-job)
  const setDriverStatus = useCallback((driverId, status) => {
    setDriverPositions((prev) => ({
      ...prev,
      [driverId]: {
        ...prev[driverId],
        status,
        currentOrder: status === 'offline' ? null : prev[driverId]?.currentOrder,
      },
    }));
  }, []);

  return {
    // State
    driverPositions,
    routes,
    trackingEnabled,
    // Actions
    startTracking,
    stopTracking,
    getDriverPosition,
    getActiveDrivers,
    getRoute,
    updateDriverPosition,
    setDriverStatus,
  };
}

// Helper functions for location simulation

// Map of known Accra localities to approximate coordinates
const LOCATION_COORDS = {
  'east legon': [5.668, -0.183],
  'cantonments': [5.578, -0.192],
  'osu': [5.558, -0.182],
  'airport residential': [5.605, -0.178],
  'tema': [5.669, -0.016],
  'spintex': [5.648, -0.083],
  'madina': [5.683, -0.167],
  'abeka': [5.592, -0.217],
  'achimoto': [5.605, -0.225],
  'dansoman': [5.535, -0.258],
  'accra central': [5.550, -0.205],
  'labadi': [5.542, -0.158],
  'adenta': [5.733, -0.150],
  'ashaiman': [5.702, -0.033],
  'sakumono': [5.617, -0.050],
};

function getCoordinatesFromLocation(location) {
  if (!location) return null;
  const normalized = normalizeLocality(location);
  return LOCATION_COORDS[normalized] ?? null;
}

function normalizeLocality(location) {
  if (typeof location !== 'string') return '';
  return location
    .toLowerCase()
    .split(/[,/\n]/)
    .map((part) =>
      part
        .replace(/[-_/]/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim())
    .filter(Boolean)
    .flatMap((part) => part.split(' '))
    .filter((word) => word.length > 2 && !['accra', 'ghana', 'greater', 'the', 'a', 'an', 'near', 'by', 'at'].includes(word))
    .sort()
    .join(' ');
}

function calculateDistance(coord1, coord2) {
  // Haversine formula for distance in km
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateHeading(from, to) {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function moveTowards(current, target, speedFactor) {
  const distance = calculateDistance(current, target);
  if (distance < 0.1) return { newCoords: target, arrived: true, progress: 1 };

  // Speed: faster for larger capacity vehicles (simplified)
  const speed = Math.max(5, Math.min(50, speedFactor / 200)); // km per update
  const maxStep = (speed / 3600) * 5; // km per 5 seconds in degrees (rough)
  const step = Math.min(maxStep, distance);

  const bearing = calculateHeading(current, target);
  const lat1 = (current[0] * Math.PI) / 180;
  const lon1 = (current[1] * Math.PI) / 180;
  const angularDistance = step / 6371;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos((bearing * Math.PI) / 180)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin((bearing * Math.PI) / 180) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  const newCoords = [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
  const newDistance = calculateDistance(newCoords, target);
  const progress = 1 - newDistance / distance;

  return { newCoords, arrived: false, progress };
}

function interpolateLocation(from, to, destinationName) {
  // Return a human-readable intermediate location
  const locality = normalizeLocality(destinationName);
  const known = Object.keys(LOCATION_COORDS);
  const nearest = known.find((k) => k.includes(locality) || locality.includes(k));
  return nearest ? `${nearest.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')} area` : 'En route';
}

export default useDriverTracking;