import { Deal } from '@/types/deal';
import { calculateFinancials, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { FLIP_SCORE_CONFIG } from '@/config/financial';

export interface FlipScoreResult {
  score: number;
  flipRoi: number;
  netProfit: number;
  purchasePrice: number;
  arv: number;
  rehabCost: number;
  totalInvestment: number;
  // MAO (Maximum Allowable Offer) for the configured target ROI. null if non-positive.
  mao: number | null;
  // % difference between current purchase price and MAO. null if purchasePrice <= 0.
  priceDiffPercent: number | null;
}

export interface FlipScoreOptions {
  // Skip the maxPurchasePrice cap. Hot Deals page sets false; agent pages set true.
  ignoreMaxPrice?: boolean;
}

// Single source of truth for the flip-score calculation displayed across
// HotDealsPage, AgentDealsPage, and AgentManagementPage.
//
// Rehab handling mirrors DealDetailPage: a rehab floor (per source) is applied
// only when there's no manual override; once the user sets `overrides.rehabCost`
// we trust that value and only add layout-change costs on top.
//
// ARV is recalculated via calculateFinancials so comp-validation and overrides
// are honored uniformly (DealDetailPage does the same).
export function calculateFlipScore(
  deal: Deal,
  loanDefaults: { holdingMonths?: number } | undefined,
  options: FlipScoreOptions = {},
): FlipScoreResult | null {
  const apiData = deal.apiData;
  if (!deal.financials || !apiData) return null;

  const purchasePrice = deal.overrides?.purchasePrice ?? apiData.purchasePrice ?? 0;
  if (purchasePrice <= 0) return null;
  if (!options.ignoreMaxPrice && purchasePrice > FLIP_SCORE_CONFIG.maxPurchasePrice) return null;

  const liveFinancials = calculateFinancials(apiData, deal.overrides ?? {}, loanDefaults);
  const arv = liveFinancials.arv;
  if (arv <= 0) return null;

  const baseRehabCost = deal.overrides?.rehabCost ?? apiData.rehabCost ?? 0;
  const bedroomsAdded = deal.overrides?.targetBedrooms != null
    ? Math.max(0, deal.overrides.targetBedrooms - (apiData.bedrooms ?? 0))
    : 0;
  const bathroomsAdded = deal.overrides?.targetBathrooms != null
    ? Math.max(0, deal.overrides.targetBathrooms - (apiData.bathrooms ?? 0))
    : 0;
  const layoutRehabCost =
    bedroomsAdded * FLIP_SCORE_CONFIG.layoutCost.perBedroom +
    bathroomsAdded * FLIP_SCORE_CONFIG.layoutCost.perBathroom;

  const sourceFloor =
    deal.source === 'email' ? FLIP_SCORE_CONFIG.rehabFloor.email :
    deal.source === 'api' ? FLIP_SCORE_CONFIG.rehabFloor.api :
    0;
  const rehabCost = deal.overrides?.rehabCost != null
    ? baseRehabCost + layoutRehabCost
    : Math.max(baseRehabCost + layoutRehabCost, sourceFloor);

  const flipClosingCosts = purchasePrice * FLIP_SCORE_CONFIG.closingCostsPercent;
  const holdingMonths = loanDefaults?.holdingMonths ?? FLIP_SCORE_CONFIG.defaultHoldingMonths;
  const propertyTaxMonthly = (apiData.propertyTax ?? 0) / 12;
  const insuranceMonthly = getEffectiveMonthlyInsurance(apiData.insurance);
  const holdingCostsMonthly = propertyTaxMonthly + insuranceMonthly + FLIP_SCORE_CONFIG.utilitiesMonthly;
  const totalHoldingCosts = holdingCostsMonthly * holdingMonths;

  const agentCommission = arv * FLIP_SCORE_CONFIG.agentCommissionPercent;
  const notaryFees = FLIP_SCORE_CONFIG.notaryFee;
  const totalInvestment = purchasePrice + rehabCost + flipClosingCosts + totalHoldingCosts;
  const netProfit = arv - totalInvestment - agentCommission - notaryFees;
  const flipRoi = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;

  const bracket = FLIP_SCORE_CONFIG.scoreBrackets.find(b => flipRoi >= b.minRoi);
  const score = bracket ? bracket.score : 1;

  // MAO: solve purchasePrice such that ROI == maoTargetRoi.
  // netSale = arv*(1 - commission%) - notary
  // totalInvestment = (1 + closing%)*P + fixedCosts, where fixedCosts = rehab + holding
  // ROI target r => netSale - totalInvestment = r * totalInvestment
  //              => totalInvestment = netSale / (1 + r)
  //              => P = [netSale/(1+r) - fixedCosts] / (1 + closing%)
  const fixedCosts = rehabCost + totalHoldingCosts;
  const netSale = arv * (1 - FLIP_SCORE_CONFIG.agentCommissionPercent) - notaryFees;
  const maoRaw = (netSale / (1 + FLIP_SCORE_CONFIG.maoTargetRoi) - fixedCosts) / (1 + FLIP_SCORE_CONFIG.closingCostsPercent);
  const mao = maoRaw > 0 ? maoRaw : null;
  const priceDiffPercent = purchasePrice > 0 && mao != null
    ? ((purchasePrice - mao) / purchasePrice) * 100
    : null;

  return {
    score,
    flipRoi,
    netProfit,
    purchasePrice,
    arv,
    rehabCost,
    totalInvestment,
    mao,
    priceDiffPercent,
  };
}
