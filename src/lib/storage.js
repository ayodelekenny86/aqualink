const PREFIX = 'aqualink.v1.';

/**
 * Tiny JSON wrapper over localStorage so the app keeps its own state across
 * reloads without a backend. Every read is defensive: private-mode browsers and
 * disabled storage must not take the app down, they just fall back to defaults.
 */

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readValue(key, fallback) {
  try {
    const raw = storage()?.getItem(PREFIX + key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeValue(key, value) {
  try {
    storage()?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: keep running from memory */
  }
}

export function clearValue(key) {
  try {
    storage()?.removeItem(PREFIX + key);
  } catch {
    /* nothing to do */
  }
}

/** Reset every AquaLink key. Used by the "reset demo data" control. */
export function clearAll() {
  try {
    const store = storage();
    if (!store) return;
    const doomed = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key?.startsWith(PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => store.removeItem(key));
  } catch {
    /* nothing to do */
  }
}

/** `useState` initialiser that rehydrates from storage. */
export function persistedState(key, fallback) {
  return () => readValue(key, fallback);
}
