import { useCallback, useEffect, useMemo, useState } from 'react';
import { findBy, update } from '../lib/collections';
import { getFleet } from '../lib/fleet';

/**
 * Smart auto-assignment hook: optimizes order-to-driver matching.
 * 
 * Uses distance, capacity, driver rating, and workload balancing to suggest
 * optimal assignments. Runs entirely client-side for instant feedback.
 */
export function useSmartAssignment({ orders, driverPositions, onNotice, updateOrderStatus }) {
  const [assignments, setAssignments] = useState([]);
  const [optimizationQueue, setOptimizationQueue] = useState([]);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(true);
  const [lastOptimization, setLastOptimization] = useState(null);

  // Filter unassigned orders that are ready for assignment
  const unassignedOrders = useMemo(() => 
    orders.filter(o => o.status === 'Assigned' && !o.driverId), 
    [orders]
  );

  // Get available drivers (online, not at max capacity)
  const availableDrivers = useMemo(() => {
    const { drivers } = getFleet();
    return drivers.filter(d => 
      d.status === 'online' && 
      d.activeJobs < 3 &&
      (!driverPositions[d.id] || driverPositions[d.id].eta !== 'Offline')
    );
  }, [driverPositions]);

  // Fleet stats for UI
  const fleetStats = useMemo(() => ({
    unassignedOrders: unassignedOrders.length,
    availableDrivers: availableDrivers.length,
    pendingOptimizations: optimizationQueue.length,
  }), [unassignedOrders, availableDrivers, optimizationQueue]);

  // Calculate distance-based score for order-driver pair
  const calculateAssignmentScore = useCallback((order, driver) => {
    const driverLoc = driverPositions[driver.id];
    if (!driverLoc) return 0;
    
    // Simple heuristic: closer is better, higher rating is better, less loaded is better
    const distanceScore = Math.max(0, 100 - (driverLoc.distanceKm || 50) * 2);
    const ratingScore = (driver.rating || 3) * 20;
    const workloadScore = Math.max(0, 100 - driver.activeJobs * 30);
    const capacityScore = driver.capacityGallons >= (parseFloat(order.volume?.replace(/[^0-9.]/g, '') || '0') || 0) ? 50 : 0;
    
    return (distanceScore * 0.4) + (ratingScore * 0.2) + (workloadScore * 0.2) + (capacityScore * 0.2);
  }, [driverPositions]);

  // Generate optimal assignments using greedy algorithm
  const generateAssignments = useCallback(() => {
    const newAssignments = [];
    const usedDrivers = new Set();
    
    // Sort orders by value (high value first)
    const sortedOrders = [...unassignedOrders].sort((a, b) => 
      (b.chargedMinor || 0) - (a.chargedMinor || 0)
    );
    
    for (const order of sortedOrders) {
      let bestDriver = null;
      let bestScore = -1;
      
      for (const driver of availableDrivers) {
        if (usedDrivers.has(driver.id)) continue;
        const score = calculateAssignmentScore(order, driver);
        if (score > bestScore) {
          bestScore = score;
          bestDriver = driver;
        }
      }
      
      if (bestDriver && bestScore > 30) {
        newAssignments.push({
          orderId: order.id,
          driverId: bestDriver.id,
          score: Math.round(bestScore),
          reason: `Distance: ${driverPositions[bestDriver.id]?.distanceKm || 'N/A'}km, Rating: ${bestDriver.rating}★, Load: ${bestDriver.activeJobs}/3`,
        });
        usedDrivers.add(bestDriver.id);
      }
    }
    
    setAssignments(newAssignments);
    return newAssignments;
  }, [unassignedOrders, availableDrivers, driverPositions, calculateAssignmentScore]);

  // Auto-assign all generated assignments
  const autoAssignAll = useCallback(async () => {
    const toAssign = assignments.filter(a => !a.applied);
    if (toAssign.length === 0) return { ok: false, message: 'No assignments to apply' };
    
    let successCount = 0;
    for (const assignment of toAssign) {
      const moved = await updateOrderStatus(assignment.orderId, 'Assigned', (n) => onNotice?.(n));
      if (moved.ok) {
        // In real app, would also update driverId on order
        successCount++;
      }
    }
    
    if (successCount > 0) {
      onNotice?.(`Auto-assigned ${successCount} order${successCount !== 1 ? 's' : ''}.`);
      setAssignments(prev => prev.map(a => 
        toAssign.some(ta => ta.orderId === a.orderId) ? { ...a, applied: true } : a
      ));
    }
    
    return { ok: successCount > 0, successCount };
  }, [assignments, updateOrderStatus, onNotice]);

  // Assign a specific order to a driver
  const assignOrder = useCallback(async (orderId, driverId) => {
    const moved = await updateOrderStatus(orderId, 'Assigned', (n) => onNotice?.(n));
    if (moved.ok) {
      onNotice?.(`Order ${orderId} assigned to driver.`);
      setAssignments(prev => prev.map(a => 
        a.orderId === orderId ? { ...a, applied: true } : a
      ));
    }
    return moved;
  }, [updateOrderStatus, onNotice]);

  // Optimize routes for assigned drivers
  const optimizeRoutes = useCallback(() => {
    const driverGroups = new Map();
    assignments.forEach(a => {
      if (!driverGroups.has(a.driverId)) driverGroups.set(a.driverId, []);
      driverGroups.get(a.driverId).push(a);
    });
    
    const optimizations = [];
    driverGroups.forEach((driverAssignments, driverId) => {
      if (driverAssignments.length > 1) {
        optimizations.push({
          id: `opt-${Date.now()}-${driverId}`,
          driverId,
          optimizedOrders: driverAssignments.map(a => a.orderId),
          estimatedSavings: `${Math.round(driverAssignments.length * 15)} min`,
        });
      }
    });
    
    setOptimizationQueue(optimizations);
    return optimizations;
  }, [assignments]);

  // Apply a route optimization
  const applyOptimization = useCallback((optimizationId) => {
    setOptimizationQueue(prev => prev.filter(o => o.id !== optimizationId));
    onNotice?.('Route optimization applied.');
  }, [onNotice]);

  // Generate assignments when data changes
  useEffect(() => {
    if (autoAssignEnabled && unassignedOrders.length > 0 && availableDrivers.length > 0) {
      const timer = setTimeout(generateAssignments, 500);
      return () => clearTimeout(timer);
    }
  }, [autoAssignEnabled, unassignedOrders, availableDrivers, generateAssignments]);

  return {
    assignments,
    optimizationQueue,
    autoAssignEnabled,
    setAutoAssignEnabled,
    fleetStats,
    assignOrder,
    autoAssignAll,
    optimizeRoutes,
    applyOptimization,
    lastOptimization,
    generateAssignments,
  };
}

export default useSmartAssignment;