import { list, insert, update, findBy, replaceAll } from './collections';
import { supabase, supabaseUrl, anonKey, writeResult } from './supabase';

const COLLECTION = 'ratings';

const USE_SERVER = typeof window !== 'undefined' && !!supabaseUrl && !!anonKey;

export const RATING_CATEGORIES = [
  { id: 'overall', label: 'Overall experience', weight: 1.0 },
  { id: 'timeliness', label: 'On-time delivery', weight: 1.0 },
  { id: 'communication', label: 'Driver communication', weight: 0.8 },
  { id: 'water_quality', label: 'Water quality', weight: 1.2 },
  { id: 'professionalism', label: 'Professionalism', weight: 0.9 },
];

export function validateRating(rating) {
  const errors = [];
  if (!rating.orderId) errors.push('Order ID is required');
  if (!rating.buyerId) errors.push('Buyer ID is required');
  if (!rating.sellerId) errors.push('Seller ID is required');
  if (!rating.driverId) errors.push('Driver ID is required');
  if (typeof rating.overall !== 'number' || rating.overall < 1 || rating.overall > 5) {
    errors.push('Overall rating must be 1-5');
  }
  RATING_CATEGORIES.forEach((cat) => {
    const val = rating[cat.id];
    if (val !== undefined && (typeof val !== 'number' || val < 1 || val > 5)) {
      errors.push(`${cat.label} must be 1-5`);
    }
  });
  if (rating.comment && rating.comment.length > 1000) {
    errors.push('Comment must be 1000 characters or less');
  }
  return { valid: errors.length === 0, errors };
}

export function computeAverages(ratings) {
  if (!ratings.length) return null;
  const sums = {};
  const counts = {};
  RATING_CATEGORIES.forEach((cat) => {
    sums[cat.id] = 0;
    counts[cat.id] = 0;
  });
  sums.overall = 0;
  counts.overall = 0;

  ratings.forEach((r) => {
    RATING_CATEGORIES.forEach((cat) => {
      if (typeof r[cat.id] === 'number') {
        sums[cat.id] += r[cat.id];
        counts[cat.id] += 1;
      }
    });
    if (typeof r.overall === 'number') {
      sums.overall += r.overall;
      counts.overall += 1;
    }
  });

  const avgs = { total: ratings.length };
  RATING_CATEGORIES.forEach((cat) => {
    avgs[cat.id] = counts[cat.id] ? Number((sums[cat.id] / counts[cat.id]).toFixed(1)) : null;
  });
  avgs.overall = counts.overall ? Number((sums.overall / counts.overall).toFixed(1)) : null;
  return avgs;
}

export function computeDistribution(ratings) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratings.forEach((r) => {
    if (typeof r.overall === 'number' && r.overall >= 1 && r.overall <= 5) {
      dist[r.overall] += 1;
    }
  });
  return dist;
}

export async function getRatings() {
  if (USE_SERVER && supabase) {
    try {
      const { data, error } = await supabase.from(COLLECTION).select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      if (data?.length) return data;
    } catch (e) {
      console.warn('Server ratings fetch failed, using local:', e.message);
    }
  }
  return list(COLLECTION);
}

export async function getRatingsForOrder(orderId) {
  const all = await getRatings();
  return all.filter((r) => r.orderId === orderId);
}

export async function getRatingsForSeller(sellerId) {
  const all = await getRatings();
  return all.filter((r) => r.sellerId === sellerId);
}

export async function getRatingsForDriver(driverId) {
  const all = await getRatings();
  return all.filter((r) => r.driverId === driverId);
}

export async function getRatingsByBuyer(buyerId) {
  const all = await getRatings();
  return all.filter((r) => r.buyerId === buyerId);
}

export async function hasRatedOrder(buyerId, orderId) {
  const all = await getRatings();
  return all.some((r) => r.buyerId === buyerId && r.orderId === orderId);
}

export async function createRating(rating) {
  const validation = validateRating(rating);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const payload = {
    ...rating,
    id: rating.id ?? `RTG-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let synced = true;
  if (USE_SERVER && supabase) {
    try {
      const result = await supabase.from(COLLECTION).insert(payload);
      const written = writeResult(await result);
      if (!written.ok) throw new Error(written.error.message);
    } catch (e) {
      synced = false;
      console.warn('Server rating write failed, saving locally:', e.message);
    }
  }

  if (!synced || !USE_SERVER) {
    insert(COLLECTION, payload);
  }

  return { ok: true, rating: payload, synced };
}

export async function updateRating(id, updates) {
  const allowed = ['overall', 'timeliness', 'communication', 'water_quality', 'professionalism', 'comment'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );
  filtered.updatedAt = new Date().toISOString();

  const existing = findBy(COLLECTION, id);
  if (!existing) return { ok: false, error: 'Rating not found' };

  const merged = { ...existing, ...filtered };
  const validation = validateRating(merged);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  let synced = true;
  if (USE_SERVER && supabase) {
    try {
      const result = await supabase.from(COLLECTION).update(filtered).eq('id', id);
      const written = writeResult(await result);
      if (!written.ok) throw new Error(written.error.message);
    } catch (e) {
      synced = false;
      console.warn('Server rating update failed:', e.message);
    }
  }

  if (!synced || !USE_SERVER) {
    update(COLLECTION, id, filtered);
  }

  return { ok: true, rating: merged, synced };
}

export async function syncRatingsFromServer() {
  if (!USE_SERVER || !supabase) return { ok: false, reason: 'no-server' };
  try {
    const { data, error } = await supabase.from(COLLECTION).select('*');
    if (error) throw error;
    if (data?.length) {
      replaceAll(COLLECTION, data);
      return { ok: true, count: data.length };
    }
    return { ok: true, count: 0 };
  } catch (e) {
    console.warn('Rating sync failed:', e.message);
    return { ok: false, error: e.message };
  }
}

export function getCategoryLabel(categoryId) {
  const cat = RATING_CATEGORIES.find((c) => c.id === categoryId);
  return cat?.label ?? categoryId;
}