import { list, replaceAll, findBy, update } from './collections';
import { explain } from './dispatch';

/**
 * Fleet and assignment state.
 *
 * Seeds a small demo fleet of drivers and sellers so dispatch has something to
 * rank on first run, then records which driver and seller were auto-assigned to
 * each order. Assignment is deliberately automatic with an inspectable score:
 * the buyer sees a named driver immediately, and ops can still override.
 */

export const DEMO_DRIVERS = [
  { id: 'drv_kojo', name: 'Kojo Mensah', phone: '0545009046', whatsapp: '', base: 'East Legon, Accra', capacityGallons: 5000, rating: 4.8, activeJobs: 0, status: 'online', vehicle: 'GR-4432' },
  { id: 'drv_ama', name: 'Ama Boateng', phone: '0544002233', whatsapp: '', base: 'Cantonments, Accra', capacityGallons: 3000, rating: 4.9, activeJobs: 0, status: 'online', vehicle: 'GR-1187' },
  { id: 'drv_yaw', name: 'Yaw Osei', phone: '0547008899', whatsapp: '', base: 'Tema, Accra', capacityGallons: 10000, rating: 4.6, activeJobs: 0, status: 'online', vehicle: 'GR-9021' },
  { id: 'drv_aba', name: 'Abena Quartey', phone: '0551004477', whatsapp: '', base: 'Osu, Accra', capacityGallons: 2000, rating: 4.7, activeJobs: 0, status: 'offline', vehicle: 'GR-7745' },
];

export const DEMO_SELLERS = [
  { id: 'slr_aquaflow', name: 'AquaFlow Tankers', phone: '0244000000', whatsapp: '', base: 'East Legon, Accra', capacityGallons: 10000, rating: 4.8, status: 'online' },
  { id: 'slr_lakeside', name: 'Lakeside Water Co.', phone: '0244005566', whatsapp: '', base: 'Cantonments, Accra', capacityGallons: 5000, rating: 4.6, status: 'online' },
  { id: 'slr_tema', name: 'Tema Bulk Supply', phone: '0244007788', whatsapp: '', base: 'Tema, Accra', capacityGallons: 20000, rating: 4.4, status: 'online' },
];

/** Seed fleet rows once, preserving later edits. */
export function seedFleet() {
  if (!list('drivers').length) replaceAll('drivers', DEMO_DRIVERS);
  if (!list('sellers').length) replaceAll('sellers', DEMO_SELLERS);
  return { drivers: list('drivers'), sellers: list('sellers') };
}

export function getFleet() {
  return { drivers: list('drivers'), sellers: list('sellers') };
}

/**
 * Persist dispatch results onto the order row.
 *
 * A seller is committed immediately because inventory must be secured. The
 * driver is only *recommended*: `driverName` stays empty so the job remains in
 * the drivers' available feed until one of them accepts.
 */
export function recordAssignment(orderId, { seller, recommendedDriver }) {
  const order = findBy('orders', (row) => row.id === orderId);
  if (!order) return null;

  return update('orders', orderId, {
    sellerName: seller?.candidate?.name ?? order.sellerName ?? '',
    sellerId: seller?.candidate?.id ?? order.sellerId ?? '',
    recommendedDriverId: recommendedDriver?.candidate?.id ?? order.recommendedDriverId ?? '',
    recommendedDriverName: recommendedDriver?.candidate?.name ?? order.recommendedDriverName ?? '',
    recommendedDriverScore: recommendedDriver?.score ?? order.recommendedDriverScore ?? null,
    assignmentReason: [
      seller ? `seller ${explain(seller)}` : null,
      recommendedDriver ? `recommended driver ${explain(recommendedDriver)}` : null,
    ].filter(Boolean).join('; '),
  });
}

/** Ops override: point an order at a different driver. */
export function reassignDriver(orderId, driverId) {
  const driver = list('drivers').find((row) => row.id === driverId);
  if (!driver) return null;
  const order = findBy('orders', (row) => row.id === orderId);
  if (!order) return null;
  return update('orders', orderId, {
    driverId: driver.id,
    driverName: driver.name,
    driverPhone: driver.phone,
    assignmentReason: `manually assigned to ${driver.name}`,
  });
}
