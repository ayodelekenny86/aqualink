import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, findBy, update } from '../lib/collections';
import { getFleet } from '../lib/fleet';

/**
 * Driver tracking hook: real-time driver location, status, and route monitoring.
 * 
 * Features:
 * - Live driver positions (from driver app or manual updates)
 * - Route tracking and ETA calculation
 * - Driver status management (online/offline/on_job)
 * - Geofencing and zone monitoring
 * - Trip history and performance metrics
 */
const INITIAL_DRIVER_LOCATIONS = {
  'drv-1': { location: 'Accra Central', lat: 5.5600, lng: -0.2057, eta: '5 min', updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), status: 'en_route' },
  'drv-2': { location: 'East Legon', lat: 5.6143, lng: -0.1675, eta: '12 min', updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), status: 'en_route' },
  'drv-3': { location: 'Spintex Road', lat: 5.6037, lng: -0.0783, eta: 'Available', updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), status: 'online' },
  'drv-4': { location: 'Tema', lat: 5.6698, lng: -0.0166, eta: '8 min', updatedAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(), status: 'en_route' },
  'drv-5': { location: 'Madina', lat: 5.6833, lng: -0.1667, eta: 'Offline', updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), status: 'offline' },
};

const ZONES = [
  { id: 'zone-accra-central', name: 'Accra Central', center: { lat: 5.5600, lng: -0.2057 }, radiusKm: 5 },
  { id: 'zone-east-legon', name: 'East Legon', center: { lat: 5.6143, lng: -0.1675 }, radiusKm: 4 },
  { id: 'zone-spintex', name: 'Spintex', center: { lat: 5.6037, lng: -0.0783 }, radiusKm: 6 },
  { id: 'zone-tema', name: 'Tema', center: { lat: 5.6698, lng: -0.0166 }, radiusKm: 8 },
  { id: 'zone-kasoa', name: 'Kasoa', center: { lat: 5.5333, lng: -0.4333 }, radiusKm: 7 },
  { id: 'zone-madina', name: 'Madina', center: { lat: 5.6833, lng: -0.1667 }, radiusKm: 5 },
  { id: 'zone-ashaiman', name: 'Ashaiman', center: { lat: 5.6833, lng: -0.0500 }, radiusKm: 6 },
];

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getZoneForLocation(lat, lng) {
  for (const zone of ZONES) {
    const dist = haversineDistance(lat, lng, zone.center.lat, zone.center.lng);
    if (dist <= zone.radiusKm) return zone;
  }
  return ZONES[0];
}

export function useDriverTracking({ orders, sellerProfile }) {
  const [driverLocations, setDriverLocations] = useState(() => {
    const stored = localStorage.getItem('aq_driver_locations');
    return stored ? JSON.parse(stored) : INITIAL_DRIVER_LOCATIONS;
  });
  const [driverStatuses, setDriverStatuses] = useState({});
  const [tripHistory, setTripHistory] = useState(() => {
    const stored = localStorage.getItem('aq_trip_history');
    return stored ? JSON.parse(stored) : [];
  });
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Persist
  useEffect(() => {
    localStorage.setItem('aq_driver_locations', JSON.stringify(driverLocations));
  }, [driverLocations]);

  useEffect(() => {
    localStorage.setItem('aq_trip_history', JSON.stringify(tripHistory));
  }, [tripHistory]);

  // Get fleet data
  const { drivers } = getFleet();

  // Merge fleet data with live locations
  const driversWithLocation = useMemo(() => {
    return drivers.map(driver => {
      const liveLocation = driverLocations[driver.id];
      return {
        ...driver,
        liveLocation: liveLocation ? {
          ...liveLocation,
          zone: liveLocation.lat && liveLocation.lng ? getZoneForLocation(liveLocation.lat, liveLocation.lng) : null,
        } : null,
        currentStatus: liveLocation?.status || driver.status,
        lastUpdate: liveLocation?.updatedAt,
      };
    });
  }, [drivers, driverLocations]);

  // Online drivers
  const onlineDrivers = useMemo(() => 
    driversWithLocation.filter(d => d.currentStatus === 'online' || d.currentStatus === 'en_route'),
    [driversWithLocation]
  );

  // Drivers on job
  const onJobDrivers = useMemo(() => 
    driversWithLocation.filter(d => d.currentStatus === 'en_route' || d.activeJobs > 0),
    [driversWithLocation]
  );

  // Available drivers
  const availableDrivers = useMemo(() => 
    driversWithLocation.filter(d => d.currentStatus === 'online' && d.activeJobs === 0),
    [driversWithLocation]
  );

  // Update driver location (from driver app or manual)
  const updateDriverLocation = useCallback((driverId, location, eta = 'Unknown') => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    
    // Simple geocoding - in real app would use Maps API
    const zone = getZoneForLocation(5.5600 + (Math.random() - 0.5) * 0.3, -0.2057 + (Math.random() - 0.5) * 0.3);
    
    const newLocation = {
      location,
      lat: zone.center.lat + (Math.random() - 0.5) * 0.05,
      lng: zone.center.lng + (Math.random() - 0.5) * 0.05,
      eta,
      updatedAt: new Date().toISOString(),
      status: eta !== 'Available' && eta !== 'Offline' ? 'en_route' : 'online',
    };
    
    setDriverLocations(prev => ({ ...prev, [driverId]: newLocation }));
    
    // If driver was offline, mark online
    setDriverStatuses(prev => ({ ...prev, [driverId]: 'online' }));
  }, [drivers]);

  // Update driver status
  const updateDriverStatus = useCallback((driverId, status) => {
    setDriverStatuses(prev => ({ ...prev, [driverId]: status }));
    setDriverLocations(prev => {
      if (!prev[driverId]) return prev;
      return { ...prev, [driverId]: { ...prev[driverId], status, updatedAt: new Date().toISOString() } };
    });
  }, []);

  // Start trip (driver accepts order)
  const startTrip = useCallback((driverId, orderId) => {
    const driver = drivers.find(d => d.id === driverId);
    const order = orders.find(o => o.id === orderId);
    if (!driver || !order) return;
    
    const trip = {
      id: `trip-${Date.now()}`,
      driverId,
      driverName: driver.name,
      orderId,
      orderCode: order.code,
      startLocation: driverLocations[driverId]?.location || 'Unknown',
      startTime: new Date().toISOString(),
      endTime: null,
      endLocation: null,
      distanceKm: 0,
      status: 'active',
    };
    
    setTripHistory(prev => [trip, ...prev]);
    updateDriverStatus(driverId, 'en_route');
    
    // Update order with driver
    // In real app, would call updateOrderStatus
  }, [drivers, orders, driverLocations, updateDriverStatus]);

  // Complete trip
  const completeTrip = useCallback((driverId, orderId) => {
    setTripHistory(prev => prev.map(trip => {
      if (trip.driverId === driverId && trip.orderId === orderId && trip.status === 'active') {
        const startLoc = trip.startLocation;
        const endLoc = driverLocations[driverId]?.location || 'Delivered';
        
        return {
          ...trip,
          endTime: new Date().toISOString(),
          endLocation: endLoc,
          distanceKm: Math.round((Math.random() * 15 + 2) * 10) / 10, // Simulated distance
          status: 'completed',
        };
      }
      return trip;
    }));
    
    updateDriverStatus(driverId, 'online');
  }, [driverLocations, updateDriverStatus]);

  // Get driver's current trip
  const getCurrentTrip = useCallback((driverId) => {
    return tripHistory.find(t => t.driverId === driverId && t.status === 'active');
  }, [tripHistory]);

  // Get driver's trip history
  const getDriverTripHistory = useCallback((driverId, limit = 20) => {
    return tripHistory
      .filter(t => t.driverId === driverId)
      .slice(0, limit);
  }, [tripHistory]);

  // Calculate ETA to a location
  const calculateETA = useCallback((driverId, targetLat, targetLng) => {
    const driverLoc = driverLocations[driverId];
    if (!driverLoc || !driverLoc.lat || !driverLoc.lng) return 'Unknown';
    
    const distanceKm = haversineDistance(driverLoc.lat, driverLoc.lng, targetLat, targetLng);
    const avgSpeedKmh = 30; // Urban average
    const etaMinutes = Math.round((distanceKm / avgSpeedKmh) * 60);
    
    return `${etaMinutes} min`;
  }, [driverLocations]);

  // Get drivers in zone
  const getDriversInZone = useCallback((zoneId) => {
    return driversWithLocation.filter(d => 
      d.liveLocation?.zone?.id === zoneId && 
      (d.currentStatus === 'online' || d.currentStatus === 'en_route')
    );
  }, [driversWithLocation]);

  // Zone driver counts
  const zoneDriverCounts = useMemo(() => {
    const counts = {};
    ZONES.forEach(zone => {
      counts[zone.id] = {
        zoneName: zone.name,
        online: 0,
        enRoute: 0,
        offline: 0,
      };
    });
    
    driversWithLocation.forEach(driver => {
      if (driver.liveLocation?.zone) {
        const zoneId = driver.liveLocation.zone.id;
        if (counts[zoneId]) {
          if (driver.currentStatus === 'en_route') counts[zoneId].enRoute++;
          else if (driver.currentStatus === 'online') counts[zoneId].online++;
          else counts[zoneId].offline++;
        }
      }
    });
    
    return counts;
  }, [driversWithLocation]);

  // Performance metrics
  const driverMetrics = useMemo(() => {
    return drivers.map(driver => {
      const trips = tripHistory.filter(t => t.driverId === driver.id && t.status === 'completed');
      const totalDistance = trips.reduce((s, t) => s + (t.distanceKm || 0), 0);
      const avgDistance = trips.length > 0 ? totalDistance / trips.length : 0;
      const thisWeek = trips.filter(t => 
        new Date(t.startTime) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length;
      
      return {
        driverId: driver.id,
        driverName: driver.name,
        totalTrips: trips.length,
        totalDistanceKm: Math.round(totalDistance * 10) / 10,
        avgTripDistanceKm: Math.round(avgDistance * 10) / 10,
        tripsThisWeek: thisWeek,
        rating: driver.rating,
        currentStatus: driver.currentStatus,
      };
    });
  }, [drivers, tripHistory]);

  // Auto-simulate location updates for demo
  useEffect(() => {
    if (!sellerProfile) return; // Only run in seller dashboard context
    
    const interval = setInterval(() => {
      // Randomly update online drivers' locations
      onlineDrivers.forEach(driver => {
        if (Math.random() < 0.3) { // 30% chance each interval
          const zones = ZONES.map(z => z.name);
          const newLocation = zones[Math.floor(Math.random() * zones.length)];
          const etas = ['3 min', '7 min', '12 min', 'Available', '5 min', '10 min'];
          const newEta = etas[Math.floor(Math.random() * etas.length)];
          
          updateDriverLocation(driver.id, newLocation, newEta);
        }
      });
    }, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [onlineDrivers, updateDriverLocation, sellerProfile]);

  return {
    drivers: driversWithLocation,
    driverLocations,
    onlineDrivers,
    onJobDrivers,
    availableDrivers,
    selectedDriverId,
    setSelectedDriverId,
    tripHistory,
    zoneDriverCounts,
    driverMetrics,
    loading,
    updateDriverLocation,
    updateDriverStatus,
    startTrip,
    completeTrip,
    getCurrentTrip,
    getDriverTripHistory,
    calculateETA,
    getDriversInZone,
    refresh: () => setLoading(false),
  };
}

export default useDriverTracking;