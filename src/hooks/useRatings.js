import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getRatings,
  getRatingsForOrder,
  getRatingsForSeller,
  getRatingsForDriver,
  getRatingsByBuyer,
  hasRatedOrder,
  createRating,
  updateRating,
  computeAverages,
  computeDistribution,
  syncRatingsFromServer,
} from '../lib/ratings';
import { trackEvent, EVENTS } from '../lib/analytics';

export function useRatings() {
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRatings();
      setRatings(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  /**
   * Submit a rating, then notify the seller and driver so their own dashboards
   * show the new score without a manual refresh.
   *
   * `notify` is the same `useNotifications` callback the rest of the app uses,
   * passed in here rather than imported directly so this hook stays testable
   * in isolation: the notification table is an implementation detail of the
   * buyer's own session, not something a rating library should know about.
   */
  const submitRating = useCallback(async (orderId, buyerId, sellerId, driverId, ratingData, notify) => {
    const payload = {
      orderId,
      buyerId,
      sellerId,
      driverId,
      ...ratingData,
    };
    const result = await createRating(payload);
    if (result.ok) {
      setRatings((prev) => [result.rating, ...prev]);
      trackEvent(EVENTS.RATING_SUBMITTED, { orderId, overall: ratingData.overall });

      const starLine = '★'.repeat(Math.round(ratingData.overall || 0));
      const summary = ratingData.comment
        ? `${starLine} — "${ratingData.comment}"`
        : starLine;
      const sellerName = ratingData.sellerName || 'Your seller';
      const driverName = ratingData.driverName || 'Your driver';

      if (sellerId && notify) {
        notify({
          role: 'seller',
          title: `New rating for order ${orderId}`,
          body: `${buyerId} rated ${sellerName} ${summary}.`,
          orderId,
          kind: 'rating',
        });
      }
      if (driverId && notify) {
        notify({
          role: 'driver',
          title: `New rating for order ${orderId}`,
          body: `${buyerId} rated ${driverName} ${summary}.`,
          orderId,
          kind: 'rating',
        });
      }
    }
    return result;
  }, []);

  const editRating = useCallback(async (id, updates) => {
    const result = await updateRating(id, updates);
    if (result.ok) {
      setRatings((prev) => prev.map((r) => (r.id === id ? result.rating : r)));
    }
    return result;
  }, []);

  const getOrderRating = useCallback((orderId) => {
    return ratings.find((r) => r.orderId === orderId);
  }, [ratings]);

  const getSellerRatings = useCallback((sellerId) => {
    return ratings.filter((r) => r.sellerId === sellerId);
  }, [ratings]);

  const getDriverRatings = useCallback((driverId) => {
    return ratings.filter((r) => r.driverId === driverId);
  }, [ratings]);

  const getBuyerRatings = useCallback((buyerId) => {
    return ratings.filter((r) => r.buyerId === buyerId);
  }, [ratings]);

  const checkHasRated = useCallback(async (buyerId, orderId) => {
    return hasRatedOrder(buyerId, orderId);
  }, []);

  const getSellerSummary = useCallback((sellerId) => {
    const sellerRatings = getSellerRatings(sellerId);
    return {
      averages: computeAverages(sellerRatings),
      distribution: computeDistribution(sellerRatings),
      count: sellerRatings.length,
      ratings: sellerRatings,
    };
  }, [getSellerRatings]);

  const getDriverSummary = useCallback((driverId) => {
    const driverRatings = getDriverRatings(driverId);
    return {
      averages: computeAverages(driverRatings),
      distribution: computeDistribution(driverRatings),
      count: driverRatings.length,
      ratings: driverRatings,
    };
  }, [getDriverRatings]);

  const sync = useCallback(async () => {
    const result = await syncRatingsFromServer();
    if (result.ok) {
      await load();
    }
    return result;
  }, [load]);

  return {
    ratings,
    loading,
    error,
    refresh,
    submitRating,
    editRating,
    getOrderRating,
    getSellerRatings,
    getDriverRatings,
    getBuyerRatings,
    checkHasRated,
    getSellerSummary,
    getDriverSummary,
    sync,
  };
}

export function useSellerRatings(sellerId) {
  const { getSellerSummary, loading, error, refresh } = useRatings();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (sellerId) {
      setSummary(getSellerSummary(sellerId));
    }
  }, [sellerId, getSellerSummary]);

  return { summary, loading, error, refresh };
}

export function useDriverRatings(driverId) {
  const { getDriverSummary, getDriverRatings, loading, error, refresh, ratings } = useRatings();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (driverId) {
      setSummary(getDriverSummary(driverId));
    } else {
      // No driverId: return every rating in the collection so a fleet view can
      // look up any driver's reputation without mounting a hook per driver.
      setSummary({
        averages: computeAverages(ratings),
        distribution: computeDistribution(ratings),
        count: ratings.length,
        ratings,
      });
    }
  }, [driverId, getDriverSummary, ratings]);

  return { summary, loading, error, refresh };
}

export function useOrderRating(orderId, buyerId) {
  const { getOrderRating, checkHasRated, loading, error } = useRatings();
  const [rating, setRating] = useState(null);
  const [hasRated, setHasRated] = useState(false);

  useEffect(() => {
    if (orderId) {
      setRating(getOrderRating(orderId));
    }
  }, [orderId, getOrderRating]);

  useEffect(() => {
    if (buyerId && orderId) {
      checkHasRated(buyerId, orderId).then(setHasRated);
    }
  }, [buyerId, orderId, checkHasRated]);

  return { rating, hasRated, loading, error };
}

/**
 * Returns orders with their rating stamped on, plus helpers for opening the
 * rating modal for a specific order. Used by the buyer's order list so a
 * delivered order shows "Rate delivery" or the score it already got.
 */
export function useRatingsByBuyer(buyerId) {
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!buyerId) {
      setRatings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getRatingsByBuyer(buyerId);
      setRatings(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [buyerId]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  return { ratings, loading, error, refresh };
}

export function useRatedOrders(orders, buyerId) {
  const { ratings, loading } = useRatings();
  const [modalOrderId, setModalOrderId] = useState(null);

  const enriched = useMemo(() => {
    const byOrder = new Map(ratings.map((r) => [r.orderId, r]));
    return (orders ?? []).map((order) => {
      const r = byOrder.get(order.id);
      return r ? { ...order, rating: r.overall ?? null, ratingId: r.id } : { ...order, rating: null };
    });
  }, [orders, ratings]);

  const openRating = useCallback((order) => {
    setModalOrderId(order.id);
  }, []);

  const closeRating = useCallback(() => {
    setModalOrderId(null);
  }, []);

  return {
    orders: enriched,
    loading,
    modalOrderId,
    openRating,
    closeRating,
  };
}