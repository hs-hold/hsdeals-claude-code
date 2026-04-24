import { Deal, SaleComp } from '@/types/deal';

export type ArvConfidence = 'green' | 'yellow' | 'red';
export type RehabConfidence = 'high' | 'medium' | 'low';
export type RehabTier = 'cosmetic' | 'light' | 'medium' | 'heavy' | 'full_gut' | 'unknown';

export interface ArvAnalysis {
  confidence: ArvConfidence;
  compsCount: number;
  recentCompsCount: number;
  medianCompPrice: number | null;
  avgDistanceMi: number | null;
  arvVsMedianPct: number | null;
  reason: string;
}

export interface RehabAnalysis {
  confidence: RehabConfidence;
  tier: RehabTier;
  low: number;
  base: number;
  high: number;
  signals: string[];
}

export interface MaoScenarios {
  /** Worst-case assumptions (high rehab, lower ARV mult) — this is what you send */
  worstCase: number | null;
  /** Expected assumptions */
  base: number | null;
  /** Best-case assumptions (low rehab, higher ARV mult) — ceiling, do not exceed */
  bestCase: number | null;
  transactionCosts: number;
}

export interface AcquisitionAnalysis {
  listPrice: number;
  arv: number;
  arvAnalysis: ArvAnalysis;
  rehabAnalysis: RehabAnalysis;
  flipMao: MaoScenarios;
  brrrrMao: MaoScenarios;
  /** Max purchase price for flip to work with $50K profit — equals flipMao.worstCase */
  worksAsFlipBelow: number | null;
  /** Max purchase price for full BRRRR capital recovery */
  worksAsBrrrrBelow: number | null;
  /** listPrice - worksAsFlipBelow; positive = need this discount; null if no MAO */
  requiredDiscount: number | null;
  /** Offer range to send: 93%–100% of worstCase MAO */
  safeOfferLow: number | null;
  safeOfferHigh: number | null;
}

// Target net profit for a flip
const TARGET_FLIP_PROFIT = 50_000;
// Transaction costs as % of ARV (closing in ~2%, holding ~4%, selling ~5%)
const FLIP_TRANSACTION_RATE = 0.11;
const BRRRR_TRANSACTION_RATE = 0.05; // No selling costs for BRRRR

const DISTRESS_KEYWORDS = [
  'as-is', 'as is', 'cash only', 'cash-only', 'investor special', 'needs tlc',
  'handyman', 'fixer', 'fire damage', 'water damage', 'estate sale',
  'tenant occupied', 'no access', 'wholesale', 'sold as is', 'needs work',
  'no showings', 'boarded', 'vacant',
];

function getRecentComps(comps: SaleComp[]): SaleComp[] {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  return comps.filter(c => c.saleDate && new Date(c.saleDate) >= cutoff);
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function analyzeArv(
  arv: number,
  comps: SaleComp[],
): ArvAnalysis {
  const recent = getRecentComps(comps);
  const prices = recent.map(c => c.salePrice).filter(p => p > 0);
  const medianCompPrice = median(prices);

  const distances = recent.map(c => c.distance).filter(d => d != null && d > 0) as number[];
  const avgDistanceMi = distances.length > 0
    ? distances.reduce((s, d) => s + d, 0) / distances.length
    : null;

  const arvVsMedianPct = medianCompPrice
    ? Math.round(((arv - medianCompPrice) / medianCompPrice) * 100)
    : null;

  let confidence: ArvConfidence;
  let reason: string;

  const distOk = avgDistanceMi == null || avgDistanceMi <= 1.0;
  const arvOk = arvVsMedianPct == null || arvVsMedianPct <= 20;

  if (recent.length >= 3 && distOk && arvOk) {
    confidence = 'green';
    reason = `${recent.length} comps in last 6mo, avg ${avgDistanceMi?.toFixed(1) ?? '?'} mi`;
  } else if (recent.length >= 2 || comps.length >= 2) {
    confidence = 'yellow';
    if (recent.length < 2) reason = `Only ${recent.length} comp(s) in last 6mo`;
    else if (!distOk) reason = `Comps avg ${avgDistanceMi!.toFixed(1)} mi away`;
    else if (!arvOk) reason = `ARV ${arvVsMedianPct}% above comp median`;
    else reason = `${recent.length} recent comps`;
  } else {
    confidence = 'red';
    reason = recent.length === 0
      ? 'No sold comps in last 6 months'
      : arvVsMedianPct && arvVsMedianPct > 20
        ? `ARV ${arvVsMedianPct}% above comp median`
        : 'Insufficient comparable sales';
  }

  return {
    confidence,
    compsCount: comps.length,
    recentCompsCount: recent.length,
    medianCompPrice,
    avgDistanceMi,
    arvVsMedianPct,
    reason,
  };
}

export function analyzeRehab(deal: Deal): RehabAnalysis {
  const { apiData, overrides } = deal;
  const baseRehab = overrides.rehabCost ?? apiData.rehabCost ?? 0;
  const yearBuilt = apiData.yearBuilt;
  const signals: string[] = [];

  // Distress keywords in AI summary
  const text = (apiData.aiSummary ?? '').toLowerCase();
  const found = DISTRESS_KEYWORDS.filter(kw => text.includes(kw));
  if (found.length > 0) signals.push(...found.slice(0, 2).map(k => `"${k}"`));

  // Age signals
  if (yearBuilt && yearBuilt < 1960) signals.push(`Built ${yearBuilt} (pre-1960)`);
  else if (yearBuilt && yearBuilt < 1975) signals.push(`Built ${yearBuilt}`);

  // Price cuts
  const cuts = (apiData.priceHistory ?? []).filter(h =>
    h.event?.toLowerCase().includes('price') || h.event?.toLowerCase().includes('cut')
  );
  if (cuts.length > 0) signals.push(`${cuts.length} price reduction(s)`);

  // No photos
  if (!apiData.imgSrc) signals.push('No photos');

  // Long DOM
  if (apiData.daysOnMarket && apiData.daysOnMarket > 90) {
    signals.push(`${apiData.daysOnMarket} days on market`);
  }

  // High rehab ratio
  const arv = overrides.arv ?? apiData.arv ?? 0;
  const rehabRatio = arv > 0 ? baseRehab / arv : 0;
  if (rehabRatio > 0.20) signals.push(`Rehab is ${Math.round(rehabRatio * 100)}% of ARV`);

  // Tier from base estimate
  let tier: RehabTier;
  if (baseRehab === 0) tier = 'unknown';
  else if (baseRehab < 15_000) tier = 'cosmetic';
  else if (baseRehab < 30_000) tier = 'light';
  else if (baseRehab < 55_000) tier = 'medium';
  else if (baseRehab < 90_000) tier = 'heavy';
  else tier = 'full_gut';

  const hasDistress = found.length > 0 || !apiData.imgSrc;
  const isVeryOld = yearBuilt != null && yearBuilt < 1960;
  const isOld = yearBuilt != null && yearBuilt < 1975;

  let confidence: RehabConfidence;
  if (isVeryOld || (isOld && hasDistress) || tier === 'full_gut') {
    confidence = 'low';
  } else if (isOld || hasDistress || rehabRatio > 0.20) {
    confidence = 'medium';
  } else {
    confidence = 'high';
  }

  const low = baseRehab > 0 ? Math.round(baseRehab * 0.8) : 0;
  const high = baseRehab > 0 ? Math.round(baseRehab * 1.5) : 0;

  return { confidence, tier, low, base: baseRehab, high, signals };
}

export function calcFlipMao(arv: number, rehabAnalysis: RehabAnalysis): MaoScenarios {
  const txCosts = Math.round(arv * FLIP_TRANSACTION_RATE);

  const calc = (rehabAmt: number, arvMult: number) => {
    const val = Math.round(arv * arvMult - rehabAmt - txCosts - TARGET_FLIP_PROFIT);
    return val > 0 ? val : null;
  };

  return {
    worstCase: calc(rehabAnalysis.high, 0.65),   // high rehab + conservative ARV = lowest safe offer
    base: calc(rehabAnalysis.base, 0.70),
    bestCase: calc(rehabAnalysis.low, 0.75),      // low rehab + optimistic ARV = ceiling, don't exceed
    transactionCosts: txCosts,
  };
}

export function calcBrrrrMao(arv: number, rehabAnalysis: RehabAnalysis, refiLtv = 0.75): MaoScenarios {
  const txCosts = Math.round(arv * BRRRR_TRANSACTION_RATE);
  const refiProceeds = Math.round(arv * refiLtv);

  const calc = (rehabAmt: number) => {
    const val = refiProceeds - rehabAmt - txCosts;
    return val > 0 ? val : null;
  };

  return {
    worstCase: calc(rehabAnalysis.high),
    base: calc(rehabAnalysis.base),
    bestCase: calc(rehabAnalysis.low),
    transactionCosts: txCosts,
  };
}

/** Returns a valid finite number, or null for null/undefined/NaN/non-numeric strings */
export function safeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return isFinite(n) && !isNaN(n) ? n : null;
}

export function analyzeAcquisition(deal: Deal): AcquisitionAnalysis | null {
  const { apiData, overrides, financials } = deal;
  // safeNum guards against NaN, "NaN" strings, and other invalid values
  const arv = safeNum(overrides.arv) ?? safeNum(apiData.arv) ?? safeNum(financials?.arv);
  const listPrice = safeNum(overrides.purchasePrice) ?? safeNum(apiData.purchasePrice) ?? safeNum(financials?.purchasePrice);

  if (!arv || arv <= 0 || !listPrice || listPrice <= 0) return null;

  const arvAnalysis = analyzeArv(arv, apiData.saleComps ?? []);
  const rehabAnalysis = analyzeRehab(deal);
  const flipMao = calcFlipMao(arv, rehabAnalysis);
  const brrrrMao = calcBrrrrMao(arv, rehabAnalysis);

  const worksAsFlipBelow = flipMao.worstCase;
  const worksAsBrrrrBelow = brrrrMao.worstCase;
  const requiredDiscount = worksAsFlipBelow != null ? listPrice - worksAsFlipBelow : null;

  const safeOfferHigh = worksAsFlipBelow;
  const safeOfferLow = safeOfferHigh != null ? Math.round(safeOfferHigh * 0.93) : null;

  return {
    listPrice,
    arv,
    arvAnalysis,
    rehabAnalysis,
    flipMao,
    brrrrMao,
    worksAsFlipBelow,
    worksAsBrrrrBelow,
    requiredDiscount,
    safeOfferLow,
    safeOfferHigh,
  };
}

export function generateOfferEmail(
  deal: Deal,
  analysis: AcquisitionAnalysis,
  offerPrice: number,
): string {
  const agentName = deal.apiData.agentName ?? 'there';
  const address = deal.address.full;
  const formattedOffer = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(offerPrice);

  return `Hi ${agentName},

We reviewed ${address} and would be interested in making a clean cash offer.

Based on the current comps, condition of the property, estimated repair scope, and our resale and holding costs, we'd be comfortable at ${formattedOffer}.

We can purchase as-is, close quickly (2–3 weeks), and keep the process straightforward — no financing contingencies.

I understand this is below asking, but the number reflects the repair budget we need to underwrite and our cost to carry and resell.

Please let me know if the seller would consider it, or if there's a number they'd be more open to.

Best,
[Your Name]
[Phone]`;
}
