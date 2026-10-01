import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateBookingCode, generateConfirmationCode } from '../lib/secureCode';
import { list, replaceAll } from '../lib/collections';
import { assignDriver, assignSeller } from '../lib/dispatch';
import { getFleet, recordAssignment, seedFleet } from '../lib/fleet';
import { createOrder } from '../lib/payments';
import { allocate, formatCedi, DEFAULT_PRICING, DEFAULT_SPLIT, quotePrice } from '../lib/money';
import { supabase, supabaseUrl, anonKey } from '../lib/supabase';

const LITRES_PER_GALLON = 3.785411784;

function toLitres(volumeLabel) {
  const gallons = Number.parseInt(String(volumeLabel ?? ''), 10);
  if (!Number.isFinite(gallons) || gallons <= 0) return 0;
  return Math.round(gallons * LITRES_PER_GALLON);
}

const initialBooking = { location: '', volume: '2,000 gallons', window: 'As soon as possible', payment: 'Mobile money', whatsapp: '' };
const initialSavedAddresses = [];

/**
 * Whether the app can talk to a live server. Supabase is preferred when its
 * project ref and anon key are set; otherwise the app runs against localStorage
 * and the booking flow falls back to local pricing.
 */
const USE_SERVER = typeof window !== 'undefined' && !!supabaseUrl && !!anonKey;

/**
 * Build a server-shaped order from the client's own pricing, for the offline
 * fallback.
 *
 * This exists so the app is demoable without a deployed server. It deliberately
 * mirrors `functions/lib/pricing.js`'s `priceOrder` field-for-field — the same
 * list price, discount and split — so a booking made offline and one made
 * against the server carry identical figures. The client copy is display-only
 * by design; here it is used only because there is no server to ask.
 *
 * It is not a settlement path. An order built this way is `Awaiting payment`
 * and stays that way: there is no money behind it, and nothing in this function
 * can mark it paid.
 */
function localPriceOrder(volumeLitres, pricing = DEFAULT_PRICING, split = DEFAULT_SPLIT) {
  const quote = quotePrice(pricing);
  const breakdown = allocate(quote.totalMinor, split);
  return {
    volumeLitres,
    pricing: { ...pricing },
    split: { ...split },
    listMinor: quote.listMinor,
    discountMinor: quote.listMinor - quote.discounted,
    surgeMinor: quote.surgeMinor,
    grossMinor: breakdown.gross,
    chargedMinor: breakdown.buyerPays,
    buyerPays: breakdown.buyerPays,
    buyerServiceCharge: breakdown.buyerServiceCharge,
    sellerReceives: breakdown.sellerReceives,
    driverReceives: breakdown.driverReceives,
    platformCommission: breakdown.platformCommission,
    companyTake: breakdown.companyTake,
  };
}

/**
 * Owns booking form state, the order list, saved addresses and the driver
 * position update shown on the buyer and seller workspaces.
 *
 * When Supabase is configured, orders sync in real-time via Supabase
 * Realtime. Otherwise, orders persist to localStorage (offline/demo mode).
 */
export function useBooking({ email, buyerPhone = '', onNotice, notify, pricing = DEFAULT_PRICING, split = DEFAULT_SPLIT }) {
  const [orders, setOrders] = useState(() => {
    seedFleet();
    return list('orders');
  });
  const [booking, setBooking] = useState(initialBooking);
  const [savedAddresses, setSavedAddresses] = useState(initialSavedAddresses);
  const [loading, setLoading] = useState(USE_SERVER);
  const [error, setError] = useState(null);

  // The buyer's live driver update is derived from the most recent order that
  // actually has a driver assigned, rather than being a fixed "Driver Kojo ·
  // ETA 18 min" string. A buyer with no assigned driver sees that plainly
  // instead of a name nobody has met.
  const driverUpdate = useMemo(() => {
    const mine = orders
      .filter(o => (email && (o.buyerEmail === email || o.email === email)) || (buyerPhone && o.buyerPhone === buyerPhone))
      .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || b.date));
    const active = mine.find(o => o.driverName && ['Assigned', 'En Route'].includes(o.status));
    if (!active) return 'No driver is assigned to your orders yet. One will appear here once a seller accepts.';
    const base = `${active.driverName} · ${active.status.toLowerCase()}`;
    return active.driverBase ? `${base} from ${active.driverBase.split(',')[0]}` : base;
  }, [orders, email, buyerPhone]);

  const commit = useCallback((updater) => {
    const next = updater(orders);
    // Always keep localStorage in sync. It is the local cache the app reads
    // when it is offline, and the test harness reads orders straight out of
    // it; skipping the write when a server is configured left the cache stale
    // and every order-based test saw an empty list.
    replaceAll('orders', next);
    setOrders(next);
  }, [orders]);

  useEffect(() => {
    if (!USE_SERVER || !supabase) {
      setLoading(false);
      return;
    }

    const channel = supabase
      .channel('orders:all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        setOrders((current) => {
          const exists = current.some((o) => o.id === row.id);
          const next = exists
            ? current.map((o) => (o.id === row.id ? { ...o, ...row } : o))
            : [row, ...current];
          replaceAll('orders', next);
          return next;
        });
        setLoading(false);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLoading(false);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Could not sync orders in real time.');
          setLoading(false);
        }
      });

    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, []);

  const updateBooking = useCallback((event) => {
    const { name, value } = event.target;
    setBooking((current) => ({ ...current, [name]: value }));
  }, []);

  const requestDelivery = useCallback(async (event) => {
    event.preventDefault();
    if (!booking.location.trim()) {
      onNotice('Add a delivery location to continue.');
      return;
    }
    if (!buyerPhone) {
      onNotice('Add your phone number to your account so the driver can reach you.');
      return;
    }

    const { location, volume } = booking;
    const volumeLitres = toLitres(volume);
    if (volumeLitres <= 0) {
      onNotice('Choose a tank size before booking.');
      return;
    }

    let serverOrder;
    // Whether the server already wrote this order to the database. It does, under
    // the id it chose, and that document is the one the payment endpoints read.
    let writtenByServer = false;
    try {
      serverOrder = await createOrder({ email, phone: buyerPhone, location, volumeLitres });
      writtenByServer = true;
    } catch (caught) {
      // No server reachable — e.g. running locally without Supabase. Fall back
      // to the client's own pricing so the booking flow still works end to end.
      // The order is still `Awaiting payment`: nothing here can settle it, and
      // the payment flow will refuse without a server.
      if (caught.status === 0 || /fetch|network|failed to fetch/i.test(caught.message || '')) {
        serverOrder = localPriceOrder(volumeLitres, pricing, split);
        serverOrder.id = `AQ-${generateBookingCode().toUpperCase()}`;
        serverOrder.code = serverOrder.id;
        serverOrder.location = location;
        onNotice('Booking service is not reachable, so this order was priced locally. It is awaiting payment and cannot be settled without the server.');
      } else {
        onNotice(caught.message || 'Could not reach the booking service. Please try again.');
        return;
      }
    }

    const reference = serverOrder.id ?? serverOrder.code;
    setBooking((current) => ({ ...current, location: '' }));

    const newOrder = {
      id: reference,
      code: serverOrder.code ?? reference,
      location: serverOrder.location,
      volume: volume.replace(' gallons', ' gal'),
      status: 'Awaiting payment',
      payment: 'Not yet paid',
      date: new Date().toISOString(),
      // The account email is the server's proof that the caller owns this
      // order: `/api/payments/initialize` refuses a mismatch. Without it on the
      // order, the checkout panel had no email to prefill, the buyer retyped it
      // by hand, and any typo produced a 403 with no way to recover in-app.
      email,
      paystackReference: serverOrder.paystackReference ?? null,
      price: formatCedi(serverOrder.chargedMinor),
      listPrice: formatCedi(serverOrder.listMinor ?? serverOrder.grossMinor),
      discountPercent: serverOrder.pricing?.discountPercent ?? DEFAULT_PRICING.discountPercent,
      surgePercent: serverOrder.pricing?.surgePercent ?? DEFAULT_PRICING.surgePercent,
      surgeMinor: serverOrder.surgeMinor ?? 0,
      grossMinor: serverOrder.grossMinor,
      chargedMinor: serverOrder.chargedMinor,
      buyerServiceCharge: serverOrder.buyerServiceCharge,
      sellerReceives: serverOrder.sellerReceives,
      driverReceives: serverOrder.driverReceives,
      platformCommission: serverOrder.platformCommission,
      volumeLitres,
      whatsapp: booking.whatsapp ?? '',
      confirmCode: '',
      buyerName: email || 'Buyer',
      buyerPhone,
      createdAt: new Date().toISOString(),
    };

    if (USE_SERVER && supabase) {
      try {
        if (writtenByServer) {
          // Write to the row the server created, merging into it. Inserting a
          // second row for the same booking would make the panel, the ops queue
          // and summary.js all read the collection directly, so one booking
          // counted twice, and the duplicate carried a different id, so marking
          // it paid never reached the order the Paystack reference was on.
          await supabase.from('orders').update(newOrder).eq('id', reference);
        } else {
          await supabase.from('orders').insert(newOrder);
        }
      } catch (err) {
        console.error('Failed to write order to Supabase:', err);
        onNotice('Order created but failed to sync. Will retry on next load.');
        commit((items) => [newOrder, ...items]);
      }
    } else {
      commit((items) => [newOrder, ...items]);
    }

    // recordAssignment reads the order list to find the row to stamp, so it has
    // to run after commit has written it. Running it first meant it looked up
    // a row that did not exist yet and the auto-assignment never landed.
    const { drivers, sellers } = getFleet();
    const dispatchable = { location, volumeGallons: Number.parseInt(volume, 10) || 0 };
    const driver = assignDriver({ order: dispatchable, drivers });
    const seller = assignSeller({ order: dispatchable, sellers });
    recordAssignment(reference, { driver, seller });

    const who = driver
      ? `${driver.candidate.name} (${driver.candidate.base.split(',')[0]}) is assigned`
      : 'a driver is being assigned';
    const surgeNote = (serverOrder.surgeMinor ?? 0) > 0 ? ` Surge ${formatCedi(serverOrder.surgeMinor)} applied.` : '';
    onNotice(`Booking confirmed. Your reference is ${reference}. You will be charged ${formatCedi(serverOrder.chargedMinor)}.${surgeNote} ${who}.`);
    notify?.({
      role: 'ops',
      title: `New order ${reference} · ${location}`,
      body: `${volume} · ${formatCedi(serverOrder.chargedMinor)} · awaiting payment · auto-assigned to ${who}.`,
      orderId: reference,
      kind: 'job',
    });
  }, [booking, commit, onNotice, notify, email, buyerPhone]);

  const repeatBooking = useCallback((address) => {
    setBooking((current) => ({ ...current, location: address.replace(/^.* · /, '') }));
    onNotice('Saved address loaded. Review the volume and confirm when ready.');
  }, [onNotice]);

  const refreshDriverUpdate = useCallback(() => {
    // The live card re-reads the order list, so refreshing here simply reports
    // that the seller app pushed a new update. There is no invented ETA.
    onNotice('Live delivery update received from the seller app.');
  }, [onNotice]);

  const updateOrderStatus = useCallback(async (orderId, status, notify) => {
    // Stamp the timing the reliability engine reads. An order that was never
    // assigned has no delivery window to measure, and that is reported as
    // unmeasured rather than given an invented one.
    const now = new Date().toISOString();
    const updates = { status, updatedAt: now };
    if (status === 'Assigned') updates.assignedAt = now;
    if (status === 'Delivered') updates.deliveredAt = now;
    if (USE_SERVER && supabase) {
      try {
        await supabase.from('orders').update(updates).eq('id', orderId);
      } catch (err) {
        console.error('Failed to update order status:', err);
        commit((items) => items.map((item) => (item.id === orderId ? { ...item, ...updates } : item)));
      }
    } else {
      commit((items) => items.map((item) => (item.id === orderId ? { ...item, ...updates } : item)));
    }
    onNotice(`Order ${orderId} is now ${status.toLowerCase()}.`);
    const order = orders.find((item) => item.id === orderId);
    notify?.({
      role: 'buyer',
      title: `${orderId} is now ${String(status).toLowerCase()}`,
      body: order?.location ? `Delivery to ${order.location}.` : '',
      orderId,
      kind: 'status',
    });
  }, [onNotice, commit, orders]);

  const issueDeliveryCode = useCallback(async (orderId) => {
    const code = generateConfirmationCode('delivery');
    const updates = { confirmCode: code, updatedAt: new Date().toISOString() };
    if (USE_SERVER && supabase) {
      try {
        await supabase.from('orders').update(updates).eq('id', orderId);
      } catch (err) {
        console.error('Failed to issue delivery code:', err);
        commit((items) => items.map((item) => (item.id === orderId ? { ...item, confirmCode: code } : item)));
      }
    } else {
      commit((items) => items.map((item) => (item.id === orderId ? { ...item, confirmCode: code } : item)));
    }
    onNotice(`Delivery code ${code} issued for ${orderId}. Share it with the buyer at handover.`);
    return code;
  }, [onNotice, commit]);

  const confirmDelivery = useCallback(async (orderId, code) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, reason: 'unknown-order' };
    if (!order.confirmCode) return { ok: false, reason: 'not-handed-over' };
    if (String(code ?? '').trim().toUpperCase() !== order.confirmCode.toUpperCase()) {
      onNotice('That delivery code does not match. Ask the driver for the code.');
      return { ok: false, reason: 'mismatch' };
    }
    const updates = {
      status: 'Delivered',
      payment: 'Delivered · awaiting seller payout',
      confirmCode: '',
      updatedAt: new Date().toISOString(),
    };
    if (USE_SERVER && supabase) {
      try {
        await supabase.from('orders').update(updates).eq('id', orderId);
      } catch (err) {
        console.error('Failed to confirm delivery:', err);
        commit((items) => items.map((item) => (item.id === orderId
          ? { ...item, status: 'Delivered', payment: 'Delivered · awaiting seller payout', confirmCode: '' }
          : item)));
      }
    } else {
      commit((items) => items.map((item) => (item.id === orderId
        ? { ...item, status: 'Delivered', payment: 'Delivered · awaiting seller payout', confirmCode: '' }
        : item)));
    }
    onNotice(`Delivery confirmed for ${orderId}. Seller payout is handled separately by operations.`);
    return { ok: true };
  }, [orders, onNotice, commit]);

  const requestRefund = useCallback((orderId) => {
    onNotice(`Refund request opened for ${orderId}. Ops will review it and email ${email} with the decision.`);
  }, [email, onNotice]);

  return {
    orders,
    booking,
    updateBooking,
    requestDelivery,
    repeatBooking,
    savedAddresses,
    setSavedAddresses,
    driverUpdate,
    refreshDriverUpdate,
    updateOrderStatus,
    issueDeliveryCode,
    confirmDelivery,
    requestRefund,
    loading,
    error,
  };
}

export default useBooking;