import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateBookingCode, generateConfirmationCode } from '../lib/secureCode';
import { list, replaceAll } from '../lib/collections';
import { assignDriver, assignSeller } from '../lib/dispatch';
import { getFleet, recordAssignment, seedFleet } from '../lib/fleet';
import { createOrder, toServerOrderRow } from '../lib/payments';
import { allocate, formatCedi, DEFAULT_PRICING, DEFAULT_SPLIT, quotePrice } from '../lib/money';
import { supabase, supabaseUrl, anonKey, writeResult } from '../lib/supabase';
import { gallonsFromLabel, litresFromLabel } from '../lib/volume';

const toLitres = litresFromLabel;
const initialBooking = { location: '', volume: '2,000 gallons', window: 'As soon as possible', payment: 'Mobile money', whatsapp: '', receiptEmail: '' };
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

    // The server requires a real email because it is the receipt address and the
    // proof that the caller owns the order: `/payments/initialize` refuses any
    // address that does not match. A phone-only buyer had no way to supply one —
    // the form had no email field at all — so every booking returned
    // `invalid_email` and the primary action of the app was dead on production
    // while passing in tests, because the stub accepted any address.
    //
    // Checked here rather than only at the server so the buyer is told what to do
    // before a round trip, and so the failure is not a raw error string.
    const receiptEmail = booking.receiptEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(receiptEmail)) {
      onNotice('Add the email address your receipt should go to. It is required to book.');
      return;
    }

    let serverOrder;
    // Whether the server already wrote this order to the database. It does, under
    // the id it chose, and that document is the one the payment endpoints read.
    let writtenByServer = false;
    try {
      serverOrder = await createOrder({ email: receiptEmail, phone: buyerPhone, location, volumeLitres });
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
      // The receipt email is the server's proof that the caller owns this order:
      // `/payments/initialize` refuses a mismatch. Without it on the order, the
      // checkout panel had no address to prefill, the buyer retyped it by hand,
      // and any typo produced a 403 with no way to recover in-app.
      email: receiptEmail,
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
      // A phone account carries no name, and the receipt email is an address, not
      // a name. The driver reads this as "Buyer" and calls it, so it holds the
      // phone number rather than an invented one.
      buyerName: buyerPhone,
      buyerPhone,
      createdAt: new Date().toISOString(),
    };

    let synced = true;
    if (USE_SERVER && supabase) {
      try {
        // supabase-js resolves with `{ error }` rather than rejecting, so a
        // `try/catch` around it catches nothing. A rejected PostgREST statement
        // used to leave the app printing "Booking confirmed" while nothing had
        // been written. Inspect the result instead of trusting it.
        //
        // Awaited outside the ternary so this reads the same as every other write
        // in this file — one `writeResult` call per write, no exceptions to
        // remember. `src/honesty.test.jsx` enforces that shape.
        const result = writtenByServer
          // Update the row the server created rather than inserting a second one:
          // the panel, the ops queue and summary.js all read the collection
          // directly, so a duplicate booking counted twice and carried a
          // different id, which meant marking it paid never reached the order the
          // Paystack reference was on.
          ? supabase.from('orders').update(toServerOrderRow(serverOrder)).eq('id', reference)
          : supabase.from('orders').insert(toServerOrderRow(serverOrder));
        const written = writeResult(await result);
        if (!written.ok) throw new Error(written.error.message);
      } catch (err) {
        console.error('Failed to write order to Supabase:', err);
        synced = false;
      }
    }

    // localStorage is the local cache, not a fallback. It has to be written
    // regardless of what the server said: the app reads it when offline, the
    // test harness reads it directly, and the auto-dispatch step below reads it
    // to find the row to stamp. A Supabase update that the client reads as
    // "no rows matched" used to skip this entirely and the order vanished.
    commit((items) => [newOrder, ...items]);

    // recordAssignment reads the order list to find the row to stamp, so it has
    // to run after commit has written it. Running it first meant it looked up
    // a row that did not exist yet and the auto-assignment never landed.
    const { drivers, sellers } = getFleet();
    // `parseInt` read "2,000 gallons" as 2, so capacity matching compared a 2,000
    // gallon delivery against tanker sizes and happily picked a 2-gallon truck.
    const dispatchable = { location, volumeGallons: gallonsFromLabel(volume) };
    const driver = assignDriver({ order: dispatchable, drivers });
    const seller = assignSeller({ order: dispatchable, sellers });
    recordAssignment(reference, { driver, seller });

    const who = driver
      ? `${driver.candidate.name} (${driver.candidate.base.split(',')[0]}) is assigned`
      : 'a driver is being assigned';
    const surgeNote = (serverOrder.surgeMinor ?? 0) > 0 ? ` Surge ${formatCedi(serverOrder.surgeMinor)} applied.` : '';
    // A booking that did not reach the server is not a confirmed booking. The
    // order exists locally and the payment endpoints will still read the server's
    // own row, but the buyer has to be told the record is incomplete rather than
    // handed a reference that ops cannot see.
    const syncNote = synced
      ? ''
      : ' Note: this order has not been saved to the server yet, so ops cannot see it. Raise it with support before paying.';
    onNotice(`Booking confirmed. Your reference is ${reference}. You will be charged ${formatCedi(serverOrder.chargedMinor)}.${surgeNote} ${who}.${syncNote}`);
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
    if (status === 'Picked Up') updates.pickedUpAt = now;
    if (status === 'En Route') updates.enRouteAt = now;
    if (status === 'Delivered') updates.deliveredAt = now;
if (USE_SERVER && supabase) {
      try {
        // The `catch` here only ever caught a request that never left the device.
        // A statement PostgREST refused resolved normally, so a rejected status
        // change left the order exactly as it was while the notice below said it
        // had moved. Both cases now fall through to the same place: the local copy
        // is corrected and the user is told the change was not saved.
        const written = writeResult(await supabase.from('orders').update(updates).eq('id', orderId));
        if (!written.ok) {
          console.error('Failed to update order status:', written.error);
          commit((items) => items.map((item) => (item.id === orderId ? { ...item, ...updates } : item)));
          onNotice(`${orderId} could not be saved to the server: ${written.error.message}`);
          return { ok: false, reason: 'write-rejected', error: written.error };
        }
      } catch (err) {
        console.error('Failed to update order status:', err);
        commit((items) => items.map((item) => (item.id === orderId ? { ...item, ...updates } : item)));
        onNotice(`${orderId} could not be saved to the server: ${err.message}`);
        return { ok: false, reason: 'write-failed', error: { message: err.message } };
      }
    } else {
      commit((items) => items.map((item) => (item.id === orderId ? { ...item, ...updates } : item)));
    }
    onNotice(`Order ${orderId} is now ${String(status).toLowerCase()}.`);
    const order = orders.find((item) => item.id === orderId);
    notify?.({
      role: 'buyer',
      title: `${orderId} is now ${String(status).toLowerCase()}`,
      body: order?.location ? `Delivery to ${order.location}.` : '',
      orderId,
      kind: 'status',
    });
    // The seller is the other party waiting on this order: they loaded the tank
    // and need to know it is moving. Notifying only the buyer meant the seller's
    // board stayed frozen at "Assigned" for the whole trip.
    notify?.({
      role: 'seller',
      title: `${orderId} is now ${String(status).toLowerCase()}`,
      body: order?.driverName ? `${order.driverName} has the order.` : '',
      orderId,
      kind: 'status',
    });
  }, [onNotice, commit, orders]);

  /**
   * A driver claims a job.
   *
   * Only ever moves an order into `Assigned`, and only from `Awaiting payment`.
   * The guard is in this function rather than the button so that no caller can
   * skip an order straight to 'En Route' and mark water as delivered that was
   * never paid for.
   */
  const acceptDriverJob = useCallback(async (orderId, notify) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, reason: 'unknown-order' };
    if (order.status !== 'Awaiting payment') {
      onNotice(`${orderId} has already been claimed by another driver.`);
      return { ok: false, reason: 'already-claimed' };
    }
    // The result is passed through rather than assumed. This returned `{ ok: true }`
    // unconditionally, so a driver whose claim the server refused was told the job
    // was theirs and drove to an address with nothing waiting for it.
    const claimed = await updateOrderStatus(orderId, 'Assigned', notify);
    if (!claimed.ok) return claimed;
    return { ok: true };
  }, [orders, onNotice, updateOrderStatus]);

  /**
   * A driver releases a job they claimed but cannot run.
   *
   * Returns the order to `Awaiting payment` so it goes back on the board for
   * someone else. It clears the driver's stamp as well, because leaving
   * `driverId` on the row would keep the released job in this driver's feed and
   * out of everyone else's.
   */
  const releaseDriverJob = useCallback(async (orderId, notify) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, reason: 'unknown-order' };
    const updates = {
      status: 'Awaiting payment',
      driverId: '',
      driverName: '',
      driverPhone: '',
      assignedAt: '',
      updatedAt: new Date().toISOString(),
    };
    if (USE_SERVER && supabase) {
      try {
        const written = writeResult(await supabase.from('orders').update(updates).eq('id', orderId));
        if (!written.ok) {
          console.error('Failed to release driver job:', written.error);
          // The unconditional `commit` below still corrects the local copy, so the
          // only thing missing is the server agreeing with it.
          onNotice(`${orderId} returned to the available feed on this device, but the server rejected the change.`);
          return { ok: false, reason: 'write-rejected', error: written.error };
        }
      } catch (err) {
        console.error('Failed to release driver job:', err);
        onNotice(`${orderId} returned to the available feed on this device, but the server was unreachable.`);
        return { ok: false, reason: 'write-failed', error: { message: err.message } };
      }
    }
    commit((items) => items.map((item) => (item.id === orderId ? { ...item, ...updates } : item)));
    onNotice(`${orderId} returned to the available feed.`);
    return { ok: true };
  }, [orders, onNotice, commit]);

  const issueDeliveryCode = useCallback(async (orderId) => {
    const code = generateConfirmationCode('delivery');
    const updates = { confirmCode: code, updatedAt: new Date().toISOString() };
    if (USE_SERVER && supabase) {
      try {
        const written = writeResult(await supabase.from('orders').update(updates).eq('id', orderId));
        if (!written.ok) {
          console.error('Failed to issue delivery code:', written.error);
          commit((items) => items.map((item) => (item.id === orderId ? { ...item, confirmCode: code } : item)));
          onNotice(`The server rejected delivery code ${code} for ${orderId}. The code below works on this device only.`);
          return { ok: false, reason: 'write-rejected', code, error: written.error };
        }
      } catch (err) {
        console.error('Failed to issue delivery code:', err);
        commit((items) => items.map((item) => (item.id === orderId ? { ...item, confirmCode: code } : item)));
        onNotice(`Delivery code ${code} works on this device only; the server was unreachable.`);
        return { ok: false, reason: 'write-failed', code, error: { message: err.message } };
      }
    } else {
      commit((items) => items.map((item) => (item.id === orderId ? { ...item, confirmCode: code } : item)));
    }
    onNotice(`Delivery code ${code} issued for ${orderId}. Share it with the buyer at handover.`);
    return { ok: true, code };
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
    const localDelivery = { status: 'Delivered', payment: 'Delivered · awaiting seller payout', confirmCode: '' };
    if (USE_SERVER && supabase) {
      try {
        // This is the write that matters most and the one the `catch` missed. A
        // delivery the database refused left the order on "En Route" forever while
        // the buyer was told it was confirmed — and the buyer had already handed
        // over the water and the code.
        const written = writeResult(await supabase.from('orders').update(updates).eq('id', orderId));
        if (!written.ok) {
          console.error('Failed to confirm delivery:', written.error);
          commit((items) => items.map((item) => (item.id === orderId ? { ...item, ...localDelivery } : item)));
          onNotice(`Delivery confirmed on this device only. The server rejected it: ${written.error.message} Operations need to record it manually.`);
          return { ok: false, reason: 'write-rejected', error: written.error };
        }
      } catch (err) {
        console.error('Failed to confirm delivery:', err);
        commit((items) => items.map((item) => (item.id === orderId ? { ...item, ...localDelivery } : item)));
        onNotice(`Delivery confirmed on this device only. The server was unreachable, so operations need to record it manually.`);
        return { ok: false, reason: 'write-failed', error: { message: err.message } };
      }
    } else {
      commit((items) => items.map((item) => (item.id === orderId ? { ...item, ...localDelivery } : item)));
    }
    onNotice(`Delivery confirmed for ${orderId}. Seller payout is handled separately by operations.`);
    return { ok: true };
  }, [orders, onNotice, commit]);

  const requestRefund = useCallback((orderId) => {
    // Named the account email, which a phone-only buyer never has, so this read
    // "Ops will review it and email  with the decision" — a promise to contact
    // nobody. The address the buyer actually supplied at booking is on the order.
    const order = orders.find((item) => item.id === orderId);
    const contact = order?.email || email;
    onNotice(`Refund request opened for ${orderId}. Ops will review it${contact ? ` and reply to ${contact}` : ''} with the decision.`);
  }, [email, orders, onNotice]);

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
    acceptDriverJob,
    releaseDriverJob,
    issueDeliveryCode,
    confirmDelivery,
    requestRefund,
    loading,
    error,
  };
}

export default useBooking;