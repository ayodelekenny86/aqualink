import { useState, useEffect, useCallback, useMemo } from 'react';

export function useRouteOptimizationV2({ 
  orders = [], 
  drivers = [], 
  vehicles = [],
  facilities = [],
  trafficData = [],
  timeWindows = [],
  onNotice 
}) {
  const [optimization, setOptimization] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const optimizeRoutes = useCallback(async () => {
    if (!orders.length || !drivers.length) {
      setOptimization({ routes: [], savings: 0 });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 500));

      const pendingOrders = orders.filter(o => 
        ['Pending', 'Assigned'].includes(o.status) && o.coordinates
      );

      const availableDrivers = drivers.filter(d => d.status === 'available');
      const availableVehicles = vehicles.filter(v => v.status === 'available');

      const optimizedRoutes = [];
      let orderIndex = 0;

      for (const driver of availableDrivers) {
        if (orderIndex >= pendingOrders.length) break;

        const vehicle = availableVehicles.find(v => v.id === driver.vehicleId) || availableVehicles[0];
        const facility = facilities.find(f => f.id === driver.facilityId) || facilities[0];

        const driverOrders = [];
        let routeDistance = 0;
        let routeTime = 0;
        let currentLocation = { lat: facility.location?.lat || 0, lng: facility.location?.lng || 0 };

        while (orderIndex < pendingOrders.length && driverOrders.length < 5) {
          const order = pendingOrders[orderIndex];
          const distance = calculateDistance(
            currentLocation.lat, currentLocation.lng,
            order.coordinates.lat, order.coordinates.lng
          );
          
          const trafficFactor = getTrafficFactor(trafficData, order.location, new Date());
          const adjustedDistance = distance * trafficFactor;
          
          const timeWindow = timeWindows.find(tw => tw.orderId === order.id);
          const earliestArrival = timeWindow?.earliest ? new Date(timeWindow.earliest) : null;
          const latestArrival = timeWindow?.latest ? new Date(timeWindow.latest) : null;

          driverOrders.push({
            orderId: order.id,
            sequence: driverOrders.length + 1,
            location: order.location,
            coordinates: order.coordinates,
            volume: order.volume,
            priority: order.priority,
            distance: Math.round(adjustedDistance),
            estimatedArrival: new Date(Date.now() + routeTime * 60000 + adjustedDistance / 40 * 60 * 1000).toISOString(),
            timeWindow: timeWindow ? { earliest: timeWindow.earliest, latest: timeWindow.latest } : null
          });

          routeDistance += adjustedDistance;
          routeTime += adjustedDistance / 40 * 60 + 15;
          currentLocation = order.coordinates;
          orderIndex++;
        }

        if (driverOrders.length > 0) {
          const returnDistance = calculateDistance(
            currentLocation.lat, currentLocation.lng,
            facility.location?.lat || 0, facility.location?.lng || 0
          );
          routeDistance += returnDistance;
          routeTime += returnDistance / 40 * 60;

          optimizedRoutes.push({
            driverId: driver.id,
            driverName: driver.name,
            vehicleId: vehicle.id,
            vehiclePlate: vehicle.plate,
            facilityId: facility.id,
            facilityName: facility.name,
            orders: driverOrders,
            totalDistance: Math.round(routeDistance),
            totalTime: Math.round(routeTime),
            totalVolume: driverOrders.reduce((sum, o) => sum + o.volume, 0),
            efficiency: calculateRouteEfficiency(driverOrders, routeDistance),
            status: 'optimized'
          });
        }
      }

      const unassignedOrders = pendingOrders.slice(orderIndex);
      const totalDistance = optimizedRoutes.reduce((sum, r) => sum + r.totalDistance, 0);
      const totalTime = optimizedRoutes.reduce((sum, r) => sum + r.totalTime, 0);
      const totalVolume = optimizedRoutes.reduce((sum, r) => sum + r.totalVolume, 0);

      const baselineDistance = pendingOrders.reduce((sum, o) => {
        const facility = facilities.find(f => f.id === o.facilityId) || facilities[0];
        return sum + calculateDistance(
          facility.location?.lat || 0, facility.location?.lng || 0,
          o.coordinates.lat, o.coordinates.lng
        ) * 2;
      }, 0);

      const savings = baselineDistance - totalDistance;
      const savingsPercent = baselineDistance > 0 ? (savings / baselineDistance) * 100 : 0;

      const newOptimization = {
        routes: optimizedRoutes,
        unassignedOrders: unassignedOrders.map(o => o.id),
        summary: {
          totalRoutes: optimizedRoutes.length,
          totalOrders: pendingOrders.length,
          assignedOrders: pendingOrders.length - unassignedOrders.length,
          unassignedOrders: unassignedOrders.length,
          totalDistance: Math.round(totalDistance),
          baselineDistance: Math.round(baselineDistance),
          distanceSaved: Math.round(savings),
          savingsPercent: Math.round(savingsPercent * 10) / 10,
          totalTime: Math.round(totalTime),
          totalVolume,
          avgEfficiency: optimizedRoutes.length 
            ? Math.round(optimizedRoutes.reduce((sum, r) => sum + r.efficiency, 0) / optimizedRoutes.length)
            : 0,
          fuelSaved: Math.round(savings * 0.25 * 12),
          co2Reduced: Math.round(savings * 0.25 * 2.68)
        },
        generatedAt: new Date().toISOString()
      };

      setOptimization(newOptimization);
      setRoutes(optimizedRoutes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, drivers, vehicles, facilities, trafficData, timeWindows]);

  const reoptimizeRoute = useCallback((routeId) => {
    setRoutes(prev => prev.map(r => 
      r.driverId === routeId ? { ...r, status: 'reoptimizing' } : r
    ));
    onNotice?.(`Re-optimizing route for driver`);
    setTimeout(() => optimizeRoutes(), 1000);
  }, [optimizeRoutes, onNotice]);

  const assignOrderToRoute = useCallback((orderId, driverId) => {
    setRoutes(prev => {
      const route = prev.find(r => r.driverId === driverId);
      if (!route) return prev;
      
      const order = orders.find(o => o.id === orderId);
      if (!order) return prev;

      const newOrder = {
        orderId: order.id,
        sequence: route.orders.length + 1,
        location: order.location,
        coordinates: order.coordinates,
        volume: order.volume,
        priority: order.priority,
        distance: 0,
        estimatedArrival: new Date().toISOString()
      };

      return prev.map(r => 
        r.driverId === driverId 
          ? { ...r, orders: [...r.orders, newOrder], totalVolume: r.totalVolume + order.volume }
          : r
      );
    });
    onNotice?.(`Order ${orderId} assigned to driver`);
  }, [orders, onNotice]);

  useEffect(() => { optimizeRoutes(); }, [optimizeRoutes]);

  const getDriverRoute = useCallback((driverId) => {
    return routes.find(r => r.driverId === driverId) || null;
  }, [routes]);

  const getRouteMetrics = useCallback(() => {
    return optimization?.summary || {};
  }, [optimization]);

  return {
    optimization,
    routes,
    loading,
    error,
    refresh: optimizeRoutes,
    reoptimizeRoute,
    assignOrderToRoute,
    getDriverRoute,
    getRouteMetrics,
    totalSavings: optimization?.summary?.distanceSaved || 0,
    savingsPercent: optimization?.summary?.savingsPercent || 0,
    unassignedCount: optimization?.unassignedOrders?.length || 0
  };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getTrafficFactor(trafficData, location, time) {
  const hour = time.getHours();
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  const baseFactor = isRushHour ? 1.3 : 1.0;
  const locationTraffic = trafficData.find(t => t.area === location);
  return baseFactor * (locationTraffic?.factor || 1.0);
}

function calculateRouteEfficiency(orders, totalDistance) {
  if (!orders.length) return 100;
  const directDistance = orders.reduce((sum, o) => {
    return sum + calculateDistance(
      o.coordinates?.lat || 0, o.coordinates?.lng || 0,
      orders[orders.length - 1]?.coordinates?.lat || 0, orders[orders.length - 1]?.coordinates?.lng || 0
    );
  }, 0);
  return Math.max(0, Math.min(100, (directDistance / totalDistance) * 100));
}

export default useRouteOptimizationV2;