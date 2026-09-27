import { useCallback, useState } from 'react';
import { generateBookingCode, generateConfirmationCode } from '../lib/secureCode';
import { list, replaceAll } from '../lib/collections';
import { assignDriver, assignSeller } from '../lib/dispatch';
import { getFleet, recordAssignment, seedFleet } from '../lib/fleet';
import { toMinor, allocate, formatCedi, quotePrice, DEFAULT_PRICING, DEFAULT_SPLIT } from '../lib/money';

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
export function useBooking({ email, onNotice, notify, pricing = DEFAULT_PRICING, split = DEFAULT_SPLIT }) {
  // Orders live in the shared `orders` collection so the buyer, seller and ops
  // workspaces all read one list rather than three divergent copies.
  const [orders, setOrders] = useState(() => {
    seedFleet();
    const stored = list('orders');
    return stored.length ? stored : replaceAll('orders', initialOrders);
  });
  const [booking, setBooking] = useState(initialBooking);
  const [savedAddresses, setSavedAddresses] = useState(initialSavedAddresses);
  const [driverUpdate, setDriverUpdate] = useState('Driver Kojo · assigned seller · ETA 18 min');

  /**
   * Write-through: persist first, then update React state.
   *
   * The collection is written synchronously rather than from inside a setState
   * updater, because a subsequent call in the same handler (dispatch assignment,
   * for one) must be able to read the row this one just wrote.
   */
  const commit = useCallback((updater) => {
    const next = updater(orders);
    replaceAll('orders', next);
    setOrders(next);
  }, [orders]);

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

    // Price comes from the admin's live pricing, not a hardcoded figure.
    const priced = quotePrice(pricing);
    const money = allocate(priced.totalMinor, split);

    commit((items) => [
      {
        id: reference,
        code: reference,
        location,
        volume: volume.replace(' gallons', ' gal'),
        status: 'Confirmed',
        payment: 'Held in escrow',
        date: 'Just now',
        price: formatCedi(priced.totalMinor),
        listPrice: formatCedi(priced.listMinor),
        discountPercent: pricing.discountPercent,
        surgePercent: pricing.surgePercent,
        grossMinor: priced.totalMinor,
        chargedMinor: money.buyerPays,
        whatsapp: booking.whatsapp ?? '',
        confirmCode: '',
        buyerName: email ? `Buyer ${email}` : 'Buyer',
        buyerPhone: '0544001122',
      },
      ...items,
    ]);

    // Dispatch automatically. There is no driver-side app to accept from, so the
    // best available driver and a seller with enough capacity are committed to
    // the order at creation time, and the buyer is told who is coming.
    const { drivers, sellers } = getFleet();
    const dispatchable = { location, volumeGallons: Number.parseInt(volume, 10) || 0 };
    const driver = assignDriver({ order: dispatchable, drivers });
    const seller = assignSeller({ order: dispatchable, sellers });
    recordAssignment(reference, { driver, seller });

    const who = driver
      ? `${driver.candidate.name} (${driver.candidate.base.split(',')[0]}) is assigned`
      : 'a driver is being assigned';
    const surgeNote = priced.surgeMinor > 0 ? ` Surge ${formatCedi(priced.surgeMinor)} applied.` : '';
    onNotice(`Booking confirmed. Your reference is ${reference}. Charged ${formatCedi(money.buyerPays)} including ${formatCedi(money.buyerServiceCharge)} service charge.${surgeNote} ${who}.`);
    // Dispatchers need to see every new order, since assignment is automatic.
    notify?.({ role: 'ops', title: `New order ${reference} · ${location}`, body: `${volume} · ${formatCedi(money.buyerPays)} · auto-assigned to ${who}.`, orderId: reference, kind: 'job' });
  }, [booking, orders, onNotice, commit, notify, pricing, split]);

  const repeatBooking = useCallback((address) => {
    setBooking((current) => ({ ...current, location: address.replace(/^.* · /, '') }));
    onNotice('Saved address loaded. Review the volume and confirm when ready.');
  }, [onNotice]);

  const refreshDriverUpdate = useCallback(() => {
    setDriverUpdate('Driver Kojo · En Route from East Legon · ETA 12 min');
    onNotice('Live delivery update received from the seller app.');
  }, [onNotice]);

  const updateOrderStatus = useCallback((orderId, status, notify) => {
    commit((items) => items.map((item) => (item.id === orderId ? { ...item, status } : item)));
    onNotice(`Order ${orderId} is now ${status.toLowerCase()}.`);
    // A status change is the buyer's cue to expect the tank, so tell them.
    const order = orders.find((item) => item.id === orderId);
    notify?.({
      role: 'buyer',
      title: `${orderId} is now ${String(status).toLowerCase()}`,
      body: order?.location ? `Delivery to ${order.location}.` : '',
      orderId,
      kind: 'status',
    });
  }, [onNotice, commit, orders]);

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
    issueDeliveryCode,
    confirmDelivery,
    requestRefund,
  };
}

export default useBooking;
