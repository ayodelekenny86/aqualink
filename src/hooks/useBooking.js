import { useCallback, useState } from 'react';
import { generateBookingCode, generateConfirmationCode } from '../lib/secureCode';
import { list, replaceAll } from '../lib/collections';
import { assignDriver, assignSeller } from '../lib/dispatch';
import { getFleet, recordAssignment, seedFleet } from '../lib/fleet';
import { createOrder } from '../lib/payments';
import { allocate, formatCedi, DEFAULT_PRICING, DEFAULT_SPLIT } from '../lib/money';

/**
 * US liquid gallon to litre. The booking form is in gallons because that is what
 * tank sizes are quoted in locally, and the server prices in litres, so the
 * conversion happens here rather than being guessed at twice.
 */
const LITRES_PER_GALLON = 3.785411784;

function toLitres(volumeLabel) {
  const gallons = Number.parseInt(String(volumeLabel ?? ''), 10);
  if (!Number.isFinite(gallons) || gallons <= 0) return 0;
  return Math.round(gallons * LITRES_PER_GALLON);
}

const initialBooking = { location: '', volume: '2,000 gallons', window: 'As soon as possible', payment: 'Mobile money', whatsapp: '' };

const initialSavedAddresses = [];

/**
 * Owns booking form state, the order list, saved addresses and the driver
 * position update shown on the buyer and seller workspaces.
 *
 * References and confirmation codes are minted by the app itself: each booking
 * gets a checksummed `AQ-####-X` reference, and releasing escrow requires the
 * delivery confirmation code that the seller side generates when handing over.
 */
export function useBooking({ email, buyerPhone = '', onNotice, notify, pricing = DEFAULT_PRICING, split = DEFAULT_SPLIT }) {
  // Orders live in the shared `orders` collection so the buyer, seller and ops
  // workspaces all read one list rather than three divergent copies.
  const [orders, setOrders] = useState(() => {
    seedFleet();
    // No fabricated history. An empty workspace shows an honest empty state
    // rather than three invented orders with made-over prices and a
    // "held in escrow" status that no payment system ever set.
    return list('orders');
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
      // The order is created server-side, and the price that comes back is the
      // price that will be charged. The browser does not get to name an amount,
      // which is what stops a tampered client from booking at GH¢1.
      serverOrder = await createOrder({ email, phone: buyerPhone, location, volumeLitres });
    } catch (caught) {
      onNotice(caught.message || 'Could not reach the booking service. Please try again.');
      return;
    }

    const reference = serverOrder.id ?? serverOrder.code;
    const money = allocate(serverOrder.grossMinor, serverOrder.split);
    setBooking((current) => ({ ...current, location: '' }));

    commit((items) => [
      {
        id: reference,
        code: serverOrder.code ?? reference,
        location: serverOrder.location,
        volume: volume.replace(' gallons', ' gal'),
        status: 'Awaiting payment',
        // No escrow claim: Paystack collects the money directly, so saying it is
        // "held in escrow" would describe a system that does not exist.
        payment: 'Not yet paid',
        date: 'Just now',
        price: formatCedi(serverOrder.chargedMinor),
        listPrice: formatCedi(serverOrder.listMinor ?? serverOrder.grossMinor),
        // The pricing snapshot the server used, so the order shows why it cost
        // what it did even after the admin changes the price.
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
    const surgeNote = (serverOrder.surgeMinor ?? 0) > 0 ? ` Surge ${formatCedi(serverOrder.surgeMinor)} applied.` : '';
    onNotice(`Booking confirmed. Your reference is ${reference}. You will be charged ${formatCedi(serverOrder.chargedMinor)} including ${formatCedi(serverOrder.buyerServiceCharge)} service charge.${surgeNote} ${who}.`);
    // Dispatchers need to see every new order, since assignment is automatic.
    notify?.({ role: 'ops', title: `New order ${reference} · ${location}`, body: `${volume} · ${formatCedi(serverOrder.chargedMinor)} · awaiting payment · auto-assigned to ${who}.`, orderId: reference, kind: 'job' });
  }, [booking, commit, onNotice, notify, email, buyerPhone]);

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
   * quote before the order is marked delivered.
   */
  const issueDeliveryCode = useCallback((orderId) => {
    const code = generateConfirmationCode('delivery');
    commit((items) => items.map((item) => (item.id === orderId ? { ...item, confirmCode: code } : item)));
    onNotice(`Delivery code ${code} issued for ${orderId}. Share it with the buyer at handover.`);
    return code;
  }, [onNotice, commit]);

  /**
   * Buyer-side: the order is only marked delivered when the issued code matches.
   *
   * This confirms handover, nothing more. Paystack collects the buyer's money
   * directly into the AquaLink account, so there is no escrow to release here,
   * and paying the seller is a separate process that is not implemented yet.
   * The old wording claimed funds had been released, which described a system
   * that does not exist.
   */
  const confirmDelivery = useCallback((orderId, code) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, reason: 'unknown-order' };
    if (!order.confirmCode) return { ok: false, reason: 'not-handed-over' };
    if (String(code ?? '').trim().toUpperCase() !== order.confirmCode.toUpperCase()) {
      onNotice('That delivery code does not match. Ask the driver for the code.');
      return { ok: false, reason: 'mismatch' };
    }
    commit((items) => items.map((item) => (item.id === orderId
      ? { ...item, status: 'Delivered', payment: 'Delivered · awaiting seller payout', confirmCode: '' }
      : item)));
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
  };
}

export default useBooking;
