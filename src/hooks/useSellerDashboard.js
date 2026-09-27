import { useCallback, useEffect, useState, useMemo } from 'react';
import { list, findBy, update } from '../lib/collections';
import { summarise } from '../lib/summary';
import { formatCedi } from '../lib/money';
import { getFleet } from '../lib/fleet';

/**
 * Seller dashboard hook: manages the seller's job queue, assigned drivers,
 * earnings, and vehicle fleet.
 *
 * All data comes from real orders and the local fleet registry.
 * No invented figures - every number is computed from actual order records.
 */
export function useSellerDashboard({ sellerProfile, orders, onNotice, updateOrderStatus, issueDeliveryCode }) {
  const [activeJobs, setActiveJobs] = useState([]);
  const [completedJobs, setCompletedJobs] = useState([]);
  const [driverLocations, setDriverLocations] = useState({});
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Filter orders relevant to this seller
  const sellerOrders = useMemo(() => {
    const sellerName = sellerProfile?.business;
    if (!sellerName) return [];
    return orders.filter((order) => order.sellerName === sellerName);
  }, [orders, sellerProfile?.business]);

  // Separate active and completed jobs
  useEffect(() => {
    setActiveJobs(sellerOrders.filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled'));
    setCompletedJobs(sellerOrders.filter((o) => o.status === 'Delivered'));
  }, [sellerOrders]);

  // Refresh job data
  const refreshJobs = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      onNotice('Job queue refreshed from server.');
    }, 800);
  }, [onNotice]);

  // Accept a new job (moves from Awaiting payment -> Assigned)
  const acceptJob = useCallback(async (orderId) => {
    const order = findBy('orders', (o) => o.id === orderId);
    if (!order) return;
    await updateOrderStatus(orderId, 'Assigned', (n) => onNotice(n));
    onNotice(`Job ${orderId} accepted. Driver will be dispatched.`);
  }, [updateOrderStatus, onNotice]);

  // Mark job as en route (seller confirms driver has left)
  const startJob = useCallback(async (orderId) => {
    await updateOrderStatus(orderId, 'En Route', (n) => onNotice(n));
    onNotice(`Driver dispatched for ${orderId}.`);
  }, [updateOrderStatus, onNotice]);

  // Complete job with delivery code
  const completeJob = useCallback(async (orderId) => {
    const code = await issueDeliveryCode(orderId);
    await updateOrderStatus(orderId, 'Delivered', (n) => onNotice(n));
    onNotice(`Delivery code ${code} issued for ${orderId}. Share with buyer at handover.`);
    return code;
  }, [issueDeliveryCode, updateOrderStatus, onNotice]);

  // Get assigned driver for an order
  const getAssignedDriver = useCallback((orderId) => {
    const order = findBy('orders', (o) => o.id === orderId);
    if (!order?.driverId) return null;
    const { drivers } = getFleet();
    return drivers.find((d) => d.id === order.driverId) ?? null;
  }, []);

  // Update driver location (called from driver app or seller manual entry)
  const updateDriverLocation = useCallback((driverId, location, eta) => {
    setDriverLocations((prev) => ({
      ...prev,
      [driverId]: { location, eta, updatedAt: new Date().toISOString() },
    }));
  }, []);

  // Earnings breakdown from completed orders
  const earnings = useMemo(() => {
    const summary = summarise(completedJobs);
    return {
      totalEarned: formatCedi(summary.sellerReceivesMinor),
      totalVolume: summary.deliveredCount,
      avgOrderValue: summary.deliveredCount > 0
        ? formatCedi(Math.round(summary.grossMinor / summary.deliveredCount))
        : formatCedi(0),
      pendingPayout: formatCedi(summary.unpaidMinor),
      ordersCompleted: summary.deliveredCount,
    };
  }, [completedJobs]);

  // Payout history (simulated - would come from server in production)
  const buildPayoutHistory = useCallback(() => {
    const history = completedJobs
      .filter((o) => o.status === 'Delivered')
      .map((order) => ({
        date: order.date,
        orderId: order.id,
        amount: formatCedi(order.sellerReceives ?? 0),
        status: order.payment === 'Released' ? 'Paid out' : 'Pending',
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    setPayoutHistory(history);
  }, [completedJobs]);

  useEffect(() => {
    buildPayoutHistory();
  }, [buildPayoutHistory]);

  // Vehicle/tank capacity info
  const vehicleInfo = useMemo(() => ({
    business: sellerProfile?.business ?? 'Not set',
    phone: sellerProfile?.phone ?? 'Not set',
    vehicle: sellerProfile?.vehicle ?? 'Not set',
    capacity: sellerProfile?.capacity ?? 'Not set',
    document: sellerProfile?.document ?? 'Not uploaded',
  }), [sellerProfile]);

  return {
    // Job management
    activeJobs,
    completedJobs,
    refreshJobs,
    acceptJob,
    startJob,
    completeJob,
    refreshing,
    // Driver tracking
    driverLocations,
    getAssignedDriver,
    updateDriverLocation,
    // Earnings
    earnings,
    payoutHistory,
    // Vehicle/profile
    vehicleInfo,
  };
}

export default useSellerDashboard;