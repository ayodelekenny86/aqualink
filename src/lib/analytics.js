// Web Vitals and Performance Monitoring for AquaLink
// Lightweight, no external dependencies

let vitalsBuffer = [];
const VITALS_ENDPOINT = '/api/vitals'; // Replace with your endpoint
const FLUSH_INTERVAL = 30000; // 30 seconds
const MAX_BUFFER = 50;

function sendVitals(data) {
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(VITALS_ENDPOINT, JSON.stringify(data));
  } else {
    // Fallback for browsers without sendBeacon
    fetch(VITALS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {});
  }
}

function flushVitals() {
  if (vitalsBuffer.length === 0) return;
  const payload = { vitals: vitalsBuffer.splice(0, MAX_BUFFER), timestamp: Date.now() };
  sendVitals(payload);
}

// Periodic flush
if (typeof window !== 'undefined') {
  setInterval(flushVitals, FLUSH_INTERVAL);
  // Flush on page hide
  window.addEventListener('pagehide', flushVitals);
  window.addEventListener('beforeunload', flushVitals);
}

export function recordVital(name, value, meta = {}) {
  vitalsBuffer.push({ name, value, meta, ts: Date.now() });
  if (vitalsBuffer.length >= MAX_BUFFER) flushVitals();
}

// Web Vitals helpers (using web-vitals library concepts)
export function onCLS(callback) {
  if (typeof window === 'undefined') return;
  let clsValue = 0;
  let clsEntries = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        clsValue += entry.value;
        clsEntries.push(entry);
        callback({ name: 'CLS', value: clsValue, entries: clsEntries });
      }
    }
  }).observe({ type: 'layout-shift', buffered: true });
}

export function onFID(callback) {
  if (typeof window === 'undefined') return;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      callback({ name: 'FID', value: entry.processingStart - entry.startTime, entry });
    }
  }).observe({ type: 'first-input', buffered: true });
}

export function onLCP(callback) {
  if (typeof window === 'undefined') return;
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    callback({ name: 'LCP', value: lastEntry.startTime, entry: lastEntry });
  }).observe({ type: 'largest-contentful-paint', buffered: true });
}

export function onFCP(callback) {
  if (typeof window === 'undefined') return;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint') {
        callback({ name: 'FCP', value: entry.startTime, entry });
      }
    }
  }).observe({ type: 'paint', buffered: true });
}

export function onTTFB(callback) {
  if (typeof window === 'undefined') return;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      callback({ name: 'TTFB', value: entry.responseStart - entry.requestStart, entry });
    }
  }).observe({ type: 'navigation', buffered: true });
}

// Auto-record core web vitals
export function initWebVitals() {
  if (typeof window === 'undefined') return;
  
  onCLS((metric) => recordVital(metric.name, metric.value));
  onFID((metric) => recordVital(metric.name, metric.value));
  onLCP((metric) => recordVital(metric.name, metric.value));
  onFCP((metric) => recordVital(metric.name, metric.value));
  onTTFB((metric) => recordVital(metric.name, metric.value));
  
  // Record navigation timing
  window.addEventListener('load', () => {
    setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) {
        recordVital('DOMContentLoaded', nav.domContentLoadedEventEnd - nav.startTime);
        recordVital('LoadComplete', nav.loadEventEnd - nav.startTime);
        recordVital('DNS', nav.domainLookupEnd - nav.domainLookupStart);
        recordVital('TCP', nav.connectEnd - nav.connectStart);
        recordVital('TTFB_Nav', nav.responseStart - nav.requestStart);
        recordVital('Download', nav.responseEnd - nav.responseStart);
      }
    }, 0);
  });
}

// Custom event tracking for key user actions
export function trackEvent(eventName, properties = {}) {
  recordVital('custom_event', 1, { event: eventName, ...properties });
}

// Pre-defined event names for consistency
export const EVENTS = {
  BOOKING_STARTED: 'booking_started',
  BOOKING_COMPLETED: 'booking_completed',
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_COMPLETED: 'payment_completed',
  PAYMENT_FAILED: 'payment_failed',
  ORDER_CONFIRMED: 'order_confirmed',
  DRIVER_JOB_ACCEPTED: 'driver_job_accepted',
  DRIVER_JOB_COMPLETED: 'driver_job_completed',
  MESSAGE_SENT: 'message_sent',
  SELLER_PROFILE_UPDATED: 'seller_profile_updated',
  INSTITUTION_SCHEDULE_CREATED: 'institution_schedule_created',
  AI_QUERY: 'ai_query',
  NOTIFICATION_OPENED: 'notification_opened',
  OFFLINE_DETECTED: 'offline_detected',
  ONLINE_RESTORED: 'online_restored',
  ERROR_BOUNDARY_TRIGGERED: 'error_boundary_triggered',
};

export default {
  recordVital,
  trackEvent,
  initWebVitals,
  EVENTS,
  flushVitals,
};