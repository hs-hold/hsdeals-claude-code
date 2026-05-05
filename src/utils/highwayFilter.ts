// Detect addresses on major roads — investors generally avoid these because
// proximity to high-traffic roads tanks rentability and resale.
//
// Pure heuristic on the street string. We match common US road designators
// for highways, freeways, expressways, parkways, and numbered routes
// (Interstate, US, State). False positives we accept on purpose:
// - "Highway 78" used colloquially in marketing — usually means the property
//   IS on/near it, so excluding is the correct call.
// We deliberately do NOT flag "Blvd" / "Avenue" / "Road" since those are
// far too common and many are quiet residential streets.

const HIGHWAY_PATTERNS: RegExp[] = [
  /\bhwy\b/i,
  /\bhighway\b/i,
  /\bfwy\b/i,
  /\bfreeway\b/i,
  /\bexpy\b/i,
  /\bexpressway\b/i,
  /\bpkwy\b/i,
  /\bparkway\b/i,
  /\bturnpike\b/i,
  /\btpke\b/i,
  /\binterstate\b/i,
  /\bI[-\s]?\d{1,3}\b/,        // I-285, I 75
  /\bUS[-\s]?\d{1,3}\b/,       // US-78, US 1
  /\bSR[-\s]?\d{1,3}\b/,       // SR-400
  /\bState Route\b/i,
  /\bRoute\s+\d{1,3}\b/i,      // Route 9
  /\bRt\.?\s*\d{1,3}\b/i,
];

/**
 * Returns true when the given address string is likely on a major road
 * (highway / freeway / parkway / numbered route).
 *
 * Pass the most specific street-line you have. Full address with city is OK
 * — we only check road designators.
 */
export function isOnMajorRoad(address: string | null | undefined): boolean {
  if (!address) return false;
  const s = String(address);
  return HIGHWAY_PATTERNS.some(re => re.test(s));
}
