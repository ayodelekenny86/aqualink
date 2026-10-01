/**
 * Firebase client — kept only as a compatibility shim.
 *
 * The app now talks to a Supabase backend (see `src/lib/supabase.js` and
 * `src/lib/api.js`). This module used to initialise Firebase, and a couple of
 * tests still mock it, so it stays as a harmless stub rather than being
 * deleted: importing it can never fail, and every export is null when no
 * Firebase project is configured. Nothing in the app calls it at runtime
 * anymore — `useBooking.js` reads `supabase`, and `usePushNotifications.js`
 * talks to the server through `apiRequest`.
 */

const firebaseConfig = {};

const app = null;
const db = null;
const auth = null;
const messaging = null;

export { app, db, auth, messaging, firebaseConfig };