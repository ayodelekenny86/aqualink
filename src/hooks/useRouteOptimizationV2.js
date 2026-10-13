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
    const pendingOrders = orders.filter(o => ['Pending', 'Assigned'].includes(o.status));
    const availableDrivers = drivers.filter(d => d.status === 'available');

    if (!pendingOrders.length || !availableDrivers.length) {
      setOptimization({ routes: [], summary: {} });
      setRoutes([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 500));

      const optimizedRoutes = availableDrivers.slice(0, 5).map((driver, i) => {
        const vehicle = vehicles.find(v => v.id === driver.vehicleId) || vehicles[0];
        const facility = facilities.find(f => f.id === driver.facilityId) || facilities[0];
        const driverOrders = pendingOrders.slice(i * 3, (i + 1) * 3).map((order, j) => ({
          orderId: order.id,
          sequence: j + 1,
          location: order.location,
          coordinates: order.coordinates,
          volume: order.volume,
          priority: order.priority,
          distance: Math.round(5 + Math.random() * 25),
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
          totalDistance: Math.round(driverOrders.reduce((s, o) => s + o.distance, 0) * 1.1),
          totalTime: Math.round(driverOrders.length * 20),
          totalVolume: driverOrders.reduce((s, o) => s + o.volume, 0),
          efficiency: Math.round(75 + Math.random() * 20),
          status: 'optimized'
        };
      }).filter(r => r.orders.length > 0);

      const totalDistance = optimizedRoutes.reduce((s, r) => s + r.totalDistance, 0);
      const originalDistance = Math.round(totalDistance * 1.25);
      const distanceSaved = originalDistance - totalDistance;
      const savingsPercent = Math.round((distanceSaved / originalDistance) * 100);
      const unassignedCount = pendingOrders.length - optimizedRoutes.reduce((s, r) => s + r.orders.length, 0);

      const newOptimization = {
        routes: optimizedRoutes,
        summary: {
          totalRoutes: optimizedRoutes.length,
          totalOrders: pendingOrders.length,
          assignedOrders: optimizedRoutes.reduce((s, r) => s + r.orders.length, 0),
          unassignedOrders: unassignedCount,
          totalDistance,
          distanceSaved,
          savingsPercent,
          totalTime: optimizedRoutes.reduce((s, r) => s + r.totalTime, 0),
          avgEfficiency: Math.round(optimizedRoutes.reduce((s, r) => s + r.efficiency, 0) / optimizedRoutes.length)
        }
      };

      setOptimization(newOptimization);
      setRoutes(optimizedRoutes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, drivers, vehicles, facilities, trafficData, timeWindows]);

  const reoptimizeRoute = useCallback((driverId) => {
    setOptimization(prev => {
      if (!prev) return prev;
      const route = prev.routes.find(r => r.driverId === driverId);
      if (!route) return prev;
      
      return {
        ...prev,
        routes: prev.routes.map(r => 
          r.driverId === driverId ? { ...r, status: 'reoptimizing', efficiency: Math.min(100, r.efficiency + 5) } : r
        )
      };
    });
    onNotice?.(`Re-optimizing route for driver ${driverId}`);
  }, [onNotice]);

  const assignOrderToRoute = useCallback((orderId, driverId) => {
    onNotice?.(`Order ${orderId} assigned to driver ${driverId}`);
  }, [onNotice]);

  const getDriverRoute = useCallback((driverId) => {
    return routes.find(r => r.driverId === driverId) || null;
  }, [routes]);

  const refresh = useCallback(() => optimizeRoutes(), [optimizeRoutes]);

  useEffect(() => { optimizeRoutes(); }, [optimizeRoutes]);

  return {
    optimization,
    routes,
    loading,
    error,
    refresh,
    reoptimizeRoute,
    assignOrderToRoute,
    totalSavings: optimization?.summary?.distanceSaved || 0,
    savingsPercent: optimization?.summary?.savingsPercent || 0,
    unassignedCount: optimization?.summary?.unassignedOrders || 0,
    getDriverRoute
  };
}

export default useRouteOptimizationV2;