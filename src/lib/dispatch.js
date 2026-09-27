/**
 * Dispatch: choosing which driver and which seller serve an order.
 *
 * "Seamless" is only credible if the system can say *why* it picked someone, so
 * every recommendation returns a score with the factors that produced it. Ops
 * staff override recommendations constantly; a ranked list they can inspect
 * beats an opaque assignment.
 *
 * Geography is handled with locality matching rather than coordinates. The app
 * has no geocoder and no network by design, so it matches on the locality token
 * in the free-text address ("East Legon, Accra" -> "east legon"). That is enough
 * to prefer a driver already in the neighbourhood, and it degrades honestly to
 * "unknown" rather than pretending to a precision it does not have.
 */

/** Localities are compared after stripping punctuation and filler words. */
const FILLER = new Set(['accra', 'ghana', 'greater', 'the', 'a', 'an', 'near', 'by', 'at']);

export function normalizeLocality(location) {
  if (typeof location !== 'string') return '';
  return location
    .toLowerCase()
    .split(/[,/\n]/)
    .map((part) => part
      // Hyphens and underscores are word separators, not characters to keep:
      // "East-Legon" and "East Legon" must normalise identically.
      .replace(/[-_/]/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .flatMap((part) => part.split(' '))
    .filter((word) => word.length > 2 && !FILLER.has(word))
    .sort()
    .join(' ');
}

/** 1 when the localities match exactly, 0 when nothing is known. */
export function localityAffinity(orderLocation, candidateBase) {
  const order = normalizeLocality(orderLocation);
  const base = normalizeLocality(candidateBase);
  if (!order || !base) return 0;
  if (order === base) return 1;

  const orderWords = new Set(order.split(' '));
  const baseWords = new Set(base.split(' '));
  const shared = [...orderWords].filter((word) => baseWords.has(word)).length;
  const union = new Set([...orderWords, ...baseWords]).size;
  return union ? shared / union : 0;
}

const WEIGHTS = { proximity: 45, capacity: 25, rating: 20, load: 10 };

/**
 * Score one candidate. Factors are weighted to sum to 100 so a candidate's score
 * is directly comparable to a percentage, and every factor is returned so the
 * UI can show the reasoning.
 */
export function scoreCandidate({ order, candidate, kind }) {
  const factors = {};

  factors.proximity = localityAffinity(order.location, candidate.base ?? candidate.location) * WEIGHTS.proximity;

  // Capacity fit: enough room is a hard requirement, and carrying far more than
  // needed is penalised because it suggests a poor route pairing.
  const needed = Number(order.volumeGallons ?? 0);
  const capacity = Number(candidate.capacityGallons ?? 0);
  if (!needed || !capacity) {
    factors.capacity = WEIGHTS.capacity / 2;
  } else if (capacity < needed) {
    factors.capacity = 0;
  } else {
    const slack = (capacity - needed) / needed;
    factors.capacity = WEIGHTS.capacity * Math.max(0, 1 - slack / 2);
  }

  const rating = Number(candidate.rating ?? 0);
  // Maps 0..5 onto 0..1, so a 4.0-rated driver scores 80% of the rating weight.
  factors.rating = Math.max(0, Math.min(1, rating / 5)) * WEIGHTS.rating;

  const activeJobs = Number(candidate.activeJobs ?? 0);
  factors.load = Math.max(0, 1 - activeJobs / 3) * WEIGHTS.load;

  const score = Object.values(factors).reduce((sum, value) => sum + value, 0);

  // A candidate who cannot physically carry the order is never recommended,
  // however well they score on everything else.
  const eligible = kind === 'seller' ? capacity >= needed : true;

  return {
    candidate,
    score: eligible ? Math.round(score) : 0,
    eligible,
    factors: Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, Math.round(value)])),
  };
}

/**
 * Rank candidates for an order, best first. Ties break on a stable id so the
 * same inputs always produce the same ordering.
 */
export function rankCandidates({ order, candidates = [], kind }) {
  return candidates
    .filter((candidate) => candidate.status !== 'offline')
    .map((candidate) => scoreCandidate({ order, candidate, kind }))
    .sort((a, b) => b.score - a.score || String(a.candidate.id).localeCompare(String(b.candidate.id)));
}

/** Best available driver for an order, or null when nobody is eligible. */
export function assignDriver({ order, drivers = [] }) {
  return rankCandidates({ order, candidates: drivers, kind: 'driver' }).find((row) => row.eligible) ?? null;
}

/** Best available seller that can physically fulfil the volume. */
export function assignSeller({ order, sellers = [] }) {
  return rankCandidates({ order, candidates: sellers, kind: 'seller' }).find((row) => row.eligible) ?? null;
}

/** Human-readable justification, for the ops console. */
export function explain(row) {
  if (!row) return 'No eligible candidate.';
  const parts = Object.entries(row.factors)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key} ${value}`);
  return `${row.candidate.name} (${row.score}) - ${parts.join(', ')}`;
}
