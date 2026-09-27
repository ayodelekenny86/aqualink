import { useCallback, useState } from 'react';
import { generateBookingCode, generateConfirmationCode } from '../lib/secureCode';
import { list, replaceAll } from '../lib/collections';
import { assignSeller, rankCandidates } from '../lib/dispatch';
import { getFleet, recordAssignment, seedFleet } from '../lib/fleet';
import { toMinor, allocate, formatCedi } from '../lib/money';

export const initialOrders = [
  { id: 'AQ-1048-2', code: 'AQ-1048-2', location: 'East Legon, Accra', volume: '2,000 gal', status: 'Delivered', payment: 'Released', date: 'Today, 09:42', price: 'GH₵250', confirmCode: '', driverName: 'Kojo Mensah', buyerName: 'Buyer', buyerPhone: '0544001122' },
  { id: 'AQ-1032-7', code: 'AQ-1032-7', location: 'Cantonments, Accra', volume: '1,000 gal', status: 'Delivered', payment: 'Released', date: 'Jun 18, 14:20', price: 'GH₵250', confirmCode: '', driverName: 'Ama Boateng', buyerName: 'Buyer', buyerPhone: '0544001122' },
  { id: 'AQ-1051-3', code: 'AQ-1051-3', location: 'Airport Residential, Accra', volume: '5,000 gal', status: 'Placed', payment: 'Held in escrow', date: 'Just now', price: 'GH₵980', confirmCode: '', driverName: '', buyerName: 'Buyer', buyerPhone: '0544001122' },
];

const initialBooking = { location: '', volume: '2,000 gallons', window: 'As soon as possible', payment: 'Mobile money', whatsapp: '' };

const initialSavedAddresses = ['Home · East Legon, Accra', 'Office · Cantonments, Accra'];

/**
 * Owns booking form state, the order list, saved addresses and the driver
 * position update shown on the buyer and seller workspaces.
 *
 * References and confirmation codes are minted by the app itself: each booking
 * gets a checksummed `AQ-####-X` reference, and releasing escrow requires the
 * delivery confirmation code that the seller side generates when handing over.
 */
export function useBooking({ email, onNotice, notify }) {
  // Orders live in the shared `orders` collection so the buyer, seller and driver
  // workspaces all read one list rather than three divergent copies.
  const [orders, setOrders] = useState(() => {
    seedFleet();
    const stored = list('orders');
    return stored.length ? stored : replaceAll('orders', initialOrders);
  });
  const [booking, setBooking] = useState(initialBooking);
  const [savedAddresses, setSavedAddresses] = useState(initialSavedAddresses);
  const [driverUpdate, setDriverUpdate] = useState('Driver Kojo · assigned seller · ETA 18 min');

  /** Write-through: update React state and persist so other roles see the change. */
  const commit = useCallback((updater) => {
    setOrders((items) => {
      const next = updater(items);
      replaceAll('orders', next);
      return next;
    });
  }, []);

  const updateBooking = useCallback((event) => {
    const { name, value } = event.target;
    setBooking((current) => ({ ...current, [name]: value }));
  }, []);

  const requestDelivery = useCallback((event) => {
    event.preventDefault();
    if (!booking.location.trim()) {
      onNotice('Add a delivery location to continue.');
      return;
    }
    const { location, volume } = booking;
    // The app issues the reference itself, continuing from the highest in use.
    const reference = generateBookingCode(orders.map((order) => order.id));
    setBooking((current) => ({ ...current, location: '' }));
    commit((items) => [
      {
        id: reference,
        code: reference,
        location,
        volume: volume.replace(' gallons', ' gal'),
        status: 'Confirmed',
        payment: 'Held in escrow',
        date: 'Just now',
        price: 'GH₵250',
        grossMinor: toMinor(250),
        whatsapp: booking.whatsapp ?? '',
        confirmCode: '',
        buyerName: email ? `Buyer ${email}` : 'Buyer',
        buyerPhone: '0544001122',
      },
      ...items,
    ]);

    // Secure a seller immediately: inventory has to be locked before anyone can
    // accept the job. Drivers are ranked and recommended, but the accept stays
    // with them so the gig-style flow and the dispatch feed both still work.
    const { drivers, sellers } = getFleet();
    const dispatchable = { location, volumeGallons: Number.parseInt(volume, 10) || 0 };
    const seller = assignSeller({ order: dispatchable, sellers });
    const ranked = rankCandidates({ order: dispatchable, candidates: drivers, kind: 'driver' });
    const recommended = ranked.find((row) => row.eligible) ?? null;
    recordAssignment(reference, { seller, recommendedDriver: recommended });

    const money = allocate(toMinor(250));
    const who = recommended ? `${recommended.candidate.name} (${recommended.candidate.base.split(',')[0]}) is closest and can take it` : 'a driver is being assigned';
    onNotice(`Booking confirmed. Your reference is ${reference}. Service charge ${formatCedi(money.buyerServiceCharge)} applied. ${who}.`);
    notify?.({ role: 'driver', title: `New job available · ${location}`, body: `${volume} · tap to accept.`, kind: 'job' });
  }, [booking, orders, onNotice, commit, notify]);

  const repeatBooking = useCallback((address) => {
    setBooking((current) => ({ ...current, location: address.replace(/^.* · /, '') }));
    onNotice('Saved address loaded. Review the volume and confirm when ready.');
  }, [onNotice]);

  const refreshDriverUpdate = useCallback(() => {
    setDriverUpdate('Driver Kojo · En Route from East Legon · ETA 12 min');
    onNotice('Live delivery update received from the seller app.');
  }, [onNotice]);

  const updateOrderStatus = useCallback((orderId, status) => {
    commit((items) => items.map((item) => (item.id === orderId ? { ...item, status } : item)));
    onNotice(`Order ${orderId} is now ${status.toLowerCase()}.`);
  }, [onNotice, commit]);

  /** Driver claims an unclaimed job. */
  const acceptOrder = useCallback((orderId, driverName = 'Kojo Mensah', notify) => {
    commit((items) => items.map((item) => (item.id === orderId ? { ...item, driverName, status: 'Accepted' } : item)));
    onNotice(`Job ${orderId} accepted. Head to the pickup point.`);
    const order = orders.find((item) => item.id === orderId);
    notify?.({
      role: 'buyer',
      title: `${driverName} accepted ${orderId}`,
      body: order?.location ? `Heading to your delivery at ${order.location}.` : 'Your driver is on the way.',
      orderId,
      kind: 'status',
    });
  }, [onNotice, commit, orders]);

  /** Driver advances a claimed job through the handover steps. */
  const advanceOrder = useCallback((orderId, status) => {
    commit((items) => items.map((item) => (item.id === orderId ? { ...item, status } : item)));
    onNotice(`${orderId} updated to ${status.toLowerCase()}. The buyer has been notified.`);
  }, [onNotice, commit]);

  /**
   * Driver closes a delivery. Escrow only releases when the buyer quotes the
   * code the seller issued at handover, so a wrong or empty code is rejected.
   */
  const completeDelivery = useCallback((orderId, code) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, reason: 'unknown-order' };
    if (!order.confirmCode) return { ok: false, reason: 'not-handed-over' };
    if (String(code ?? '').trim().toUpperCase() !== order.confirmCode.toUpperCase()) {
      onNotice('That delivery code does not match. Ask the buyer to confirm their code.');
      return { ok: false, reason: 'mismatch' };
    }
    commit((items) => items.map((item) => (item.id === orderId ? { ...item, status: 'Delivered', payment: 'Released', confirmCode: '' } : item)));
    onNotice(`Delivery completed for ${orderId}. Escrow released.`);
    return { ok: true };
  }, [orders, onNotice, commit]);

  /**
   * Seller-side handover: issues the delivery confirmation code the buyer must
   * quote before escrow is released.
   */
  const issueDeliveryCode = useCallback((orderId) => {
    const code = generateConfirmationCode('delivery');
    commit((items) => items.map((item) => (item.id === orderId ? { ...item, confirmCode: code } : item)));
    onNotice(`Delivery code ${code} issued for ${orderId}. Share it with the buyer at handover.`);
    return code;
  }, [onNotice, commit]);

  /** Buyer-side: escrow only releases when the issued code matches. */
  const confirmDelivery = useCallback((orderId, code) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, reason: 'unknown-order' };
    if (!order.confirmCode) return { ok: false, reason: 'not-handed-over' };
    if (String(code ?? '').trim().toUpperCase() !== order.confirmCode.toUpperCase()) {
      onNotice('That delivery code does not match. Ask the driver for the code.');
      return { ok: false, reason: 'mismatch' };
    }
    commit((items) => items.map((item) => (item.id === orderId ? { ...item, payment: 'Released', confirmCode: '' } : item)));
    onNotice('Delivery confirmed. Escrow funds released to the seller.');
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
    acceptOrder,
    advanceOrder,
    completeDelivery,
    issueDeliveryCode,
    confirmDelivery,
    requestRefund,
  };
}

export default useBooking;
