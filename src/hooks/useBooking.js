import { useCallback, useState } from 'react';
import { generateBookingCode, generateConfirmationCode } from '../lib/secureCode';
import { persistedState } from '../lib/storage';

export const initialOrders = [
  { id: 'AQ-1048-2', location: 'East Legon, Accra', volume: '2,000 gal', status: 'Delivered', payment: 'Released', date: 'Today, 09:42', price: 'GH₵250', confirmCode: '' },
  { id: 'AQ-1032-7', location: 'Cantonments, Accra', volume: '1,000 gal', status: 'Delivered', payment: 'Released', date: 'Jun 18, 14:20', price: 'GH₵250', confirmCode: '' },
];

const initialBooking = { location: '', volume: '2,000 gallons', window: 'As soon as possible', payment: 'Mobile money' };

const initialSavedAddresses = ['Home · East Legon, Accra', 'Office · Cantonments, Accra'];

/**
 * Owns booking form state, the order list, saved addresses and the driver
 * position update shown on the buyer and seller workspaces.
 *
 * References and confirmation codes are minted by the app itself: each booking
 * gets a checksummed `AQ-####-X` reference, and releasing escrow requires the
 * delivery confirmation code that the seller side generates when handing over.
 */
export function useBooking({ email, onNotice }) {
  const [orders, setOrders] = useState(persistedState('orders', initialOrders));
  const [booking, setBooking] = useState(initialBooking);
  const [savedAddresses, setSavedAddresses] = useState(initialSavedAddresses);
  const [driverUpdate, setDriverUpdate] = useState('Driver Kojo · assigned seller · ETA 18 min');

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
    setOrders((items) => [
      {
        id: reference,
        location,
        volume: volume.replace(' gallons', ' gal'),
        status: 'Confirmed',
        payment: 'Held in escrow',
        date: 'Just now',
        price: 'GH₵250',
        confirmCode: '',
      },
      ...items,
    ]);
    onNotice(`Booking confirmed. Your reference is ${reference}. Payment is held in escrow until delivery.`);
  }, [booking, orders, onNotice]);

  const repeatBooking = useCallback((address) => {
    setBooking((current) => ({ ...current, location: address.replace(/^.* · /, '') }));
    onNotice('Saved address loaded. Review the volume and confirm when ready.');
  }, [onNotice]);

  const refreshDriverUpdate = useCallback(() => {
    setDriverUpdate('Driver Kojo · En Route from East Legon · ETA 12 min');
    onNotice('Live delivery update received from the seller app.');
  }, [onNotice]);

  const updateOrderStatus = useCallback((orderId, status) => {
    setOrders((items) => items.map((item) => (item.id === orderId ? { ...item, status } : item)));
    onNotice(`Order ${orderId} is now ${status.toLowerCase()}.`);
  }, [onNotice]);

  /**
   * Seller-side handover: issues the delivery confirmation code the buyer must
   * quote before escrow is released.
   */
  const issueDeliveryCode = useCallback((orderId) => {
    const code = generateConfirmationCode('delivery');
    setOrders((items) => items.map((item) => (item.id === orderId ? { ...item, confirmCode: code } : item)));
    onNotice(`Delivery code ${code} issued for ${orderId}. Share it with the buyer at handover.`);
    return code;
  }, [onNotice]);

  /** Buyer-side: escrow only releases when the issued code matches. */
  const confirmDelivery = useCallback((orderId, code) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, reason: 'unknown-order' };
    if (!order.confirmCode) return { ok: false, reason: 'not-handed-over' };
    if (String(code ?? '').trim().toUpperCase() !== order.confirmCode.toUpperCase()) {
      onNotice('That delivery code does not match. Ask the driver for the code.');
      return { ok: false, reason: 'mismatch' };
    }
    setOrders((items) => items.map((item) => (item.id === orderId ? { ...item, payment: 'Released', confirmCode: '' } : item)));
    onNotice('Delivery confirmed. Escrow funds released to the seller.');
    return { ok: true };
  }, [orders, onNotice]);

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
