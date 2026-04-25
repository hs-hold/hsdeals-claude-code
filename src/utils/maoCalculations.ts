import { Deal, SaleComp } from '@/types/deal';
import { validateArvAgainstComps, calculateArvFromRecentComps, calculateFinancials } from '@/utils/financialCalculations';

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

export interface AtAskAnalysis {
  profit: number;
  roi: number;
  totalInvestment: number;
  verdict: 'strong_flip' | 'target_met' | 'near_target' | 'marginal' | 'thin' | 'not_a_flip';
  verdictLabel: string;
}

export interface TargetMaoAnalysis {
  targetProfit: number;
  mao: number;
  gapFromAsk: number;
  discountPctNeeded: number;
  offerLow: number;
  offerHigh: number;
  ruleof70Ref: number;
}

export interface RiskAdjustedOffer {
  conservative: number | null;
  base: number | null;
  ceiling: number | null;
  arvHaircutPct: number;
  reasons: string[];
}

export interface FlipVerdict {
  action: 'send_offer' | 'review_arv' | 'review_rehab' | 'contractor_review' | 'lowball_only' | 'pass';
  actionLabel: string;
  reasoning: string;
  profitScore: number;
  arvConfScore: number;
  rehabConfScore: number;
  finalScore: number;
}

export interface BrrrrVerdict {
  refiLtv: number;
  refiProceeds: number;
  totalCashIn: number;
  cashLeftInDeal: number;
  cashLeftPct: number;
  monthlyMortgage: number;
  monthlyCashflow: number | null;
  annualCashflow: number | null;
  cocReturn: number | null;
  classification: 'full_brrrr' | 'partial_brrrr' | 'trapped_equity' | 'not_brrrr';
  classificationLabel: string;
  hasRentData: boolean;
}

export interface AcquisitionAnalysis {
  listPrice: number;
  arv: number;
  rent: number | null;
  arvAnalysis: ArvAnalysis;
  rehabAnalysis: RehabAnalysis;
  atAsk: AtAskAnalysis;
  targetMao: TargetMaoAnalysis;
  riskAdjustedOffer: RiskAdjustedOffer;
  flipVerdict: FlipVerdict;
  brrrrVerdict: BrrrrVerdict;
  flipMao: MaoScenarios;
  brrrrMao: MaoScenarios;
  /** Max purchase price for flip to work with $50K profit — uses actual calc (not 70% rule) */
  worksAsFlipBelow: number | null;
  /** Max purchase price for full BRRRR capital recovery */
  worksAsBrrrrBelow: number | null;
  /** Gap from ask to targetMao; 0 if deal works at ask */
  requiredDiscount: number | null;
  /** Offer range to send */
  safeOfferLow: number | null;
  safeOfferHigh: number | null;
}

// Target net profit for a flip
const TARGET_FLIP_PROFIT = 50_000;
// Transaction costs as % of ARV (closing in ~2%, holding ~4%, selling ~5%)
const FLIP_TRANSACTION_RATE = 0.11;
const BRRRR_TRANSACTION_RATE = 0.05; // No selling costs for BRRRR

// Defaults for Acquisition Engine (no per-deal overrides available)
const ACQ_CLOSING_PCT = 0.02;
const ACQ_CONTINGENCY_PCT = 0.10;
const ACQ_HOLDING_FLAT = 6_000;   // 4 months × ~$1,500/mo flat estimate
const ACQ_AGENT_PCT = 0.05;
const ACQ_NOTARY = 400;
const ACQ_TITLE = 500;
const ACQ_REFI_LTV = 0.75;
const ACQ_REFI_INTEREST_RATE = 0.075;
const ACQ_REFI_TERM_YEARS = 30;

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

  // High rehab ratio — prefer validated financials.arv over raw apiData.arv
  const arv = overrides.arv ?? deal.financials?.arv ?? apiData.arv ?? 0;
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

// ─── New Acquisition Engine helpers ─────────────────────────────────────────

function calcAtAsk(arv: number, askPrice: number, rehabBase: number): AtAskAnalysis {
  const closingCostsBuy = askPrice * ACQ_CLOSING_PCT;
  const contingency = rehabBase * ACQ_CONTINGENCY_PCT;
  const agentCommission = arv * ACQ_AGENT_PCT;
  const totalInvestment = askPrice + closingCostsBuy + rehabBase + contingency + ACQ_HOLDING_FLAT;
  const profit = arv - totalInvestment - agentCommission - ACQ_NOTARY - ACQ_TITLE;
  const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;

  let verdict: AtAskAnalysis['verdict'];
  let verdictLabel: string;
  if (profit >= 60_000) {
    verdict = 'strong_flip'; verdictLabel = 'Strong Flip at Ask';
  } else if (profit >= 50_000) {
    verdict = 'target_met'; verdictLabel = 'Target Flip at Ask';
  } else if (profit >= 40_000) {
    verdict = 'near_target'; verdictLabel = 'Near Target Flip';
  } else if (profit >= 20_000) {
    verdict = 'marginal'; verdictLabel = 'Marginal Flip';
  } else if (profit >= 0) {
    verdict = 'thin'; verdictLabel = 'Thin Flip at Ask';
  } else {
    verdict = 'not_a_flip'; verdictLabel = 'Not a Flip at Ask';
  }

  return { profit: Math.round(profit), roi: Math.round(roi * 10) / 10, totalInvestment: Math.round(totalInvestment), verdict, verdictLabel };
}

function calcTargetMaoAnalysis(arv: number, rehab: RehabAnalysis, listPrice: number): TargetMaoAnalysis {
  const calcMAO = (rehabAmt: number) => {
    const n = arv - rehabAmt * (1 + ACQ_CONTINGENCY_PCT) - ACQ_HOLDING_FLAT
              - arv * ACQ_AGENT_PCT - ACQ_NOTARY - ACQ_TITLE - TARGET_FLIP_PROFIT;
    return Math.round(n / (1 + ACQ_CLOSING_PCT));
  };
  const mao = calcMAO(rehab.base);
  const gapFromAsk = listPrice - mao;
  const discountPctNeeded = gapFromAsk > 0 && listPrice > 0 ? (gapFromAsk / listPrice) * 100 : 0;
  return {
    targetProfit: TARGET_FLIP_PROFIT,
    mao,
    gapFromAsk,
    discountPctNeeded,
    offerLow: Math.round(mao * 0.95),
    offerHigh: mao,
    ruleof70Ref: Math.round(arv * 0.70 - rehab.base),
  };
}

function calcRiskAdjustedOffer(arv: number, rehab: RehabAnalysis, arvConf: ArvConfidence): RiskAdjustedOffer {
  const reasons: string[] = [];
  let arvHaircutPct = 0;
  if (arvConf === 'yellow') { arvHaircutPct = 5; reasons.push('ARV moderate confidence (-5% haircut)'); }
  else if (arvConf === 'red') { arvHaircutPct = 10; reasons.push('ARV weak confidence (-10% haircut)'); }
  if (rehab.confidence === 'low') reasons.push('Rehab confidence unknown (using 1.5× range)');
  else if (rehab.confidence === 'medium') reasons.push('Rehab estimate uncertain (using 1.25× range)');

  const adjArv = arv * (1 - arvHaircutPct / 100);
  const calcMAO = (rehabAmt: number): number | null => {
    const n = adjArv - rehabAmt * (1 + ACQ_CONTINGENCY_PCT) - ACQ_HOLDING_FLAT
              - adjArv * ACQ_AGENT_PCT - ACQ_NOTARY - ACQ_TITLE - TARGET_FLIP_PROFIT;
    const mao = Math.round(n / (1 + ACQ_CLOSING_PCT));
    return mao > 0 ? mao : null;
  };
  return {
    conservative: calcMAO(rehab.high),
    base: calcMAO(rehab.base),
    ceiling: calcMAO(rehab.low),
    arvHaircutPct,
    reasons,
  };
}

function calcFlipVerdictFn(atAsk: AtAskAnalysis, arvConf: ArvConfidence, rehabConf: RehabConfidence): FlipVerdict {
  const profitScore = (() => {
    const p = atAsk.profit;
    if (p >= 75000) return 10; if (p >= 60000) return 9; if (p >= 50000) return 8;
    if (p >= 40000) return 7; if (p >= 30000) return 6; if (p >= 20000) return 5;
    if (p >= 10000) return 4; if (p >= 0) return 3; if (p >= -20000) return 2; return 1;
  })();
  const arvConfScore = arvConf === 'green' ? 10 : arvConf === 'yellow' ? 6 : 2;
  const rehabConfScore = rehabConf === 'high' ? 10 : rehabConf === 'medium' ? 6 : 2;
  const finalScore = Math.round((profitScore * 0.4 + arvConfScore * 0.3 + rehabConfScore * 0.3) * 10) / 10;

  let action: FlipVerdict['action'];
  let actionLabel: string;
  let reasoning: string;

  if (atAsk.verdict === 'not_a_flip') {
    action = 'pass'; actionLabel = 'Pass';
    reasoning = 'Insufficient profit at asking price even with favorable assumptions.';
  } else if (atAsk.verdict === 'thin') {
    action = 'pass'; actionLabel = 'Pass';
    reasoning = 'Very thin profit at ask. Only works with significant price reduction.';
  } else if (atAsk.verdict === 'marginal') {
    action = 'lowball_only'; actionLabel = 'Lowball Only';
    reasoning = 'Marginal profit at ask — deal only works with meaningful discount.';
  } else {
    // near_target, target_met, strong_flip
    if (rehabConf === 'low') {
      action = 'contractor_review'; actionLabel = 'Contractor Review Needed';
      reasoning = 'Good profit potential but rehab confidence is low — get a contractor quote before offering.';
    } else if (arvConf === 'red') {
      action = 'review_arv'; actionLabel = 'Review ARV First';
      reasoning = 'Profit looks good but ARV data is weak — verify comps before committing.';
    } else if (arvConf === 'yellow' || rehabConf === 'medium') {
      action = 'review_rehab'; actionLabel = 'Review ARV & Rehab';
      reasoning = `${atAsk.verdictLabel} — verify ARV and rehab estimate before offer.`;
    } else {
      action = 'send_offer'; actionLabel = 'Send Offer';
      reasoning = `${atAsk.verdictLabel} with strong confidence.`;
    }
  }

  return { action, actionLabel, reasoning, profitScore, arvConfScore, rehabConfScore, finalScore };
}

function calcBrrrrVerdictFn(arv: number, askPrice: number, rehab: RehabAnalysis, rent: number | null): BrrrrVerdict {
  const closingCostsBuy = askPrice * ACQ_CLOSING_PCT;
  const contingency = rehab.base * ACQ_CONTINGENCY_PCT;
  const totalCashIn = askPrice + closingCostsBuy + rehab.base + contingency + ACQ_HOLDING_FLAT;

  const refiLoanAmount = arv * ACQ_REFI_LTV;
  const refiClosing = refiLoanAmount * 0.02;
  const refiProceeds = refiLoanAmount - refiClosing - ACQ_NOTARY;
  const cashLeftInDeal = totalCashIn - Math.max(0, refiProceeds);
  const cashLeftPct = totalCashIn > 0 ? cashLeftInDeal / totalCashIn : 1;

  const monthlyRate = ACQ_REFI_INTEREST_RATE / 12;
  const numPmts = ACQ_REFI_TERM_YEARS * 12;
  const monthlyMortgage = refiLoanAmount > 0
    ? refiLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPmts)) / (Math.pow(1 + monthlyRate, numPmts) - 1)
    : 0;

  const monthlyCashflow = rent && rent > 0 ? rent * 0.65 - monthlyMortgage : null;
  const annualCashflow = monthlyCashflow != null ? monthlyCashflow * 12 : null;
  const cocReturn = monthlyCashflow != null && cashLeftInDeal > 0
    ? (annualCashflow! / cashLeftInDeal) * 100
    : (monthlyCashflow != null && cashLeftInDeal <= 0 && monthlyCashflow > 0 ? 999 : null);

  let classification: BrrrrVerdict['classification'];
  let classificationLabel: string;
  if (cashLeftInDeal <= 0) {
    classification = 'full_brrrr'; classificationLabel = 'Full BRRRR';
  } else if (cashLeftPct <= 0.25) {
    classification = 'partial_brrrr'; classificationLabel = 'Partial BRRRR';
  } else if (cashLeftPct <= 0.75 && monthlyCashflow != null && monthlyCashflow > 100) {
    classification = 'trapped_equity'; classificationLabel = 'Trapped Equity Hold';
  } else {
    classification = 'not_brrrr'; classificationLabel = 'Not a BRRRR';
  }

  return {
    refiLtv: ACQ_REFI_LTV,
    refiProceeds: Math.round(refiProceeds),
    totalCashIn: Math.round(totalCashIn),
    cashLeftInDeal: Math.round(cashLeftInDeal),
    cashLeftPct,
    monthlyMortgage: Math.round(monthlyMortgage),
    monthlyCashflow: monthlyCashflow != null ? Math.round(monthlyCashflow) : null,
    annualCashflow: annualCashflow != null ? Math.round(annualCashflow) : null,
    cocReturn: cocReturn != null ? Math.round(cocReturn * 10) / 10 : null,
    classification,
    classificationLabel,
    hasRentData: rent != null && rent > 0,
  };
}

export function analyzeAcquisition(deal: Deal): AcquisitionAnalysis | null {
  const { apiData, overrides, financials } = deal;
  // ARV priority:
  // 1. Manual override — user verified, most accurate
  // 2. min(comp-derived, apiData.arv) — comps can only lower the API value, never inflate it
  //    This handles both inflated API ARVs (Arctic Ct: 421K→227K) and
  //    outlier comps that would raise above the API value (Lester St: 501K capped at 341K)
  const arv = (() => {
    if (overrides.arv != null && overrides.arv > 0) return overrides.arv;
    const compFinancials = calculateFinancials(apiData, { ...overrides, arv: null });
    const compArv = compFinancials.arv;
    const apiArv = apiData.arv;
    if (apiArv != null && apiArv > 0) return Math.min(compArv, apiArv);
    return compArv;
  })();
  const listPrice = safeNum(overrides.purchasePrice) ?? safeNum(apiData.purchasePrice) ?? safeNum(financials?.purchasePrice);
  const rent = safeNum(overrides.rent) ?? safeNum(apiData.rent) ?? null;

  if (!arv || arv <= 0 || !listPrice || listPrice <= 0) return null;

  const arvAnalysis = analyzeArv(arv, apiData.saleComps ?? []);
  const rehabAnalysis = analyzeRehab(deal);

  const atAsk = calcAtAsk(arv, listPrice, rehabAnalysis.base);
  const targetMao = calcTargetMaoAnalysis(arv, rehabAnalysis, listPrice);
  const riskAdjustedOffer = calcRiskAdjustedOffer(arv, rehabAnalysis, arvAnalysis.confidence);
  const flipVerdict = calcFlipVerdictFn(atAsk, arvAnalysis.confidence, rehabAnalysis.confidence);
  const brrrrVerdict = calcBrrrrVerdictFn(arv, listPrice, rehabAnalysis, rent);

  // Legacy 70% rule MAO (kept for backward compat only)
  const flipMao = calcFlipMao(arv, rehabAnalysis);
  const brrrrMao = calcBrrrrMao(arv, rehabAnalysis);

  // Updated legacy fields — now use TARGET MAO (actual calc), not 70% rule
  const worksAsFlipBelow = targetMao.mao > 0 ? targetMao.mao : null;
  const worksAsBrrrrBelow = brrrrMao.worstCase;
  const requiredDiscount = Math.max(0, targetMao.gapFromAsk);
  const safeOfferHigh = riskAdjustedOffer.base ?? riskAdjustedOffer.conservative;
  const safeOfferLow = safeOfferHigh != null ? Math.round(safeOfferHigh * 0.95) : null;

  return {
    listPrice,
    arv,
    rent,
    arvAnalysis,
    rehabAnalysis,
    atAsk,
    targetMao,
    riskAdjustedOffer,
    flipVerdict,
    brrrrVerdict,
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
