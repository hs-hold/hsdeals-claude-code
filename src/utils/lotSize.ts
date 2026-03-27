export const SQFT_PER_ACRE = 43560;

/**
 * Coerce an unknown lot-size value into square-feet.
 *
 * In our app we store/display lot size as sqft, but some upstream APIs sometimes return:
 * - acres (e.g. 0.55)
 * - "hundredth acres" without the decimal (e.g. 55 meaning 0.55 acres)
 *
 * Heuristics are intentionally conservative and use buildingSqft when available.
 */
export function coerceLotSizeSqft(
  rawLotSize: number | null | undefined,
  buildingSqft?: number | null
): { sqft: number | null; corrected: boolean } {
  if (rawLotSize == null) return { sqft: null, corrected: false };
  if (!Number.isFinite(rawLotSize) || rawLotSize <= 0) return { sqft: null, corrected: false };

  const v = rawLotSize;
  const building = buildingSqft ?? null;

  const isInteger = Number.isInteger(v);
  const looksTooSmallToBeSqft = building != null ? v < Math.max(500, building) : v < 500;

  // User-reported recurring pattern: two-digit number that should be 0.xx acres (e.g. 55 => 0.55 acre)
  if (looksTooSmallToBeSqft && isInteger && v >= 10 && v <= 99) {
    const acres = v / 100;
    return { sqft: Math.round(acres * SQFT_PER_ACRE), corrected: true };
  }

  // If it still looks too small to be sqft and is a plausible acreage value, treat as acres.
  // (e.g. 0.55, 0.71, 1.2, 5)
  if (looksTooSmallToBeSqft && v > 0 && v <= 50) {
    return { sqft: Math.round(v * SQFT_PER_ACRE), corrected: true };
  }

  // Default: treat as sqft already.
  return { sqft: v, corrected: false };
}
