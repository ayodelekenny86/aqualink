import { useEffect, useState, useCallback } from 'react';
import { db } from './firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { list, replaceAll, createBookingCode } from './collections';
import { generateBookingCode, generateConfirmationCode } from './secureCode';
import { assignDriver, assignSeller } from './dispatch';
import { getFleet, recordAssignment, seedFleet } from './fleet';
import { createOrder } from './payments';
import { allocate, formatCedi, DEFAULT_PRICING, DEFAULT_SPLIT } from './money';

const LITRES_PER_GALLON = 3.785411784;

function toLitres(volumeLabel) {
  const gallons = Number.parseInt(String(volumeLabel ?? ''), 10);
  if (!Number.isFinite(gallons) || gallons <= 0) return 0;
  return Math.round(gallons * LITRES_PER_GALLON);
}

const initialBooking = { location: '', volume: '2,000 gallons', window: 'As soon as possible', payment: 'Mobile money', whatsapp: '' };
const initialSavedAddresses = [];

const USE_FIRESTORE = typeof window !== 'undefined' && !!import.meta.env.VITE_FIREBASE_API_KEY;

function getOrdersCollection() {
  return collection(db, 'orders');
}

export function useBooking({ email, buyerPhone = '', onNotice, notify, pricing = DEFAULT_PRICING, split = DEFAULT_SPLIT }) {
  const [orders, setOrders] = useState(() => {
    seedFleet();
    return list('orders');
  });
  const [booking, setBooking] = useState(initialBooking);
  const [savedAddresses, setSavedAddresses] = useState(initialSavedAddresses);
  const [driverUpdate, setDriverUpdate] = useState('Driver Kojo · assigned seller · ETA 18 min');
  const [loading, setLoading] = useState(USE_FIRESTORE);
  const [error, setError] = useState(null);

  const commit = useCallback((updater) => {
    const next = updater(orders);
    if (!USE_FIRESTORE) {
      replaceAll('orders', next);
    }
    setOrders(next);
  }, [orders]);

  useEffect(() => {
    if (!USE_FIRESTORE || !db) {
      setLoading(false);
      return;
    }

    const ordersQuery = query(getOrdersCollection(), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const firestoreOrders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (!USE_FIRESTORE) {
        replaceAll('orders', firestoreOrders);
      }
      setOrders(firestoreOrders);
      setLoading(false);
    }, (err) => {
      console.error('Firestore orders listener error:', err);
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
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
    try {
      serverOrder = await createOrder({ email, phone: buyerPhone, location, volumeLitres });
    } catch (caught) {
      onNotice(caught.message || 'Could not reach the booking service. Please try again.');
      return;
    }

    const reference = serverOrder.id ?? serverOrder.code;
    const money = allocate(serverOrder.grossMinor, serverOrder.split);
    setBooking((current) => ({ ...current, location: '' }));

    const newOrder = {
      id: reference,
      code: serverOrder.code ?? reference,
      location: serverOrder.location,
      volume: volume.replace(' gallons', ' gal'),
      status: 'Awaiting payment',
      payment: 'Not yet paid',
      date: new Date().toISOString(),
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
      createdAt: serverTimestamp(),
    };

    if (USE_FIRESTORE && db) {
      try {
        await addDoc(getOrdersCollection(), newOrder);
      } catch (err) {
        console.error('Failed to write order to Firestore:', err);
        onNotice('Order created but failed to sync. Will retry on next load.');
        commit((items) => [newOrder, ...items]);
      }
    } else {
      commit((items) => [newOrder, ...items]);
    }

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
    setDriverUpdate('Driver Kojo · En Route from East Legon · ETA 12 min');
    onNotice('Live delivery update received from the seller app.');
  }, [onNotice]);

  const updateOrderStatus = useCallback(async (orderId, status, notify) => {
    const updates = { status, updatedAt: serverTimestamp() };
    if (USE_FIRESTORE && db) {
      try {
        await updateDoc(doc(getOrdersCollection(), orderId), updates);
      } catch (err) {
        console.error('Failed to update order status:', err);
        commit((items) => items.map((item) => (item.id === orderId ? { ...item, status } : item)));
      }
    } else {
      commit((items) => items.map((item) => (item.id === orderId ? { ...item, status } : item)));
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
    const updates = { confirmCode: code, updatedAt: serverTimestamp() };
    if (USE_FIRESTORE && db) {
      try {
        await updateDoc(doc(getOrdersCollection(), orderId), updates);
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
      updatedAt: serverTimestamp(),
    };
    if (USE_FIRESTORE && db) {
      try {
        await updateDoc(doc(getOrdersCollection(), orderId), updates);
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