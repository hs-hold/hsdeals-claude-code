/**
 * Suspicious Data Detection Utility
 * 
 * Identifies API values that are clearly unrealistic for residential real estate
 * and require manual confirmation before the deal can proceed normally.
 * 
 * Also compares values against sale/rent comps to detect outliers.
 */

import type { SaleComp, RentComp } from '@/types/deal';

export interface SuspiciousField {
  field: string;
  label: string;
  value: number;
  reason: string;
  suggestedMax?: number;
  compAverage?: number; // Average from comps for reference
}

export interface SuspiciousDataResult {
  hasSuspiciousData: boolean;
  fields: SuspiciousField[];
}

// Thresholds for residential real estate in the USA
const THRESHOLDS = {
  // ARV thresholds
  arvMax: 2_000_000,      // ARV over $2M is suspicious for typical residential
  arvMin: 15_000,         // ARV under $15K is suspicious
  
  // Purchase price thresholds
  purchasePriceMax: 2_000_000,
  purchasePriceMin: 5_000,
  
  // Rent thresholds
  rentMax: 10_000,        // Monthly rent over $10K is suspicious
  rentMin: 100,           // Monthly rent under $100 is suspicious
  
  // Rehab cost thresholds
  rehabCostMax: 500_000,  // Rehab over $500K is suspicious
  
  // Price per sqft thresholds (when sqft is available)
  pricePerSqftMax: 1_000, // Over $1000/sqft is suspicious for most markets
  
  // Ratio checks
  arvToPurchaseRatioMax: 5, // ARV should not be more than 5x purchase price
  arvToPurchaseRatioMin: 0.5, // ARV should not be less than 50% of purchase price
  
  // Comp deviation threshold (100% = 2x or 0.5x the comp average)
  compDeviationPercent: 100,
};

/**
 * Calculate average sale price from sale comps
 */
function calculateSaleCompAverage(saleComps: SaleComp[] | null | undefined): number | null {
  if (!saleComps || saleComps.length === 0) return null;
  const total = saleComps.reduce((sum, comp) => sum + (comp.salePrice || 0), 0);
  return Math.round(total / saleComps.length);
}

/**
 * Calculate average rent from rent comps
 */
function calculateRentCompAverage(rentComps: RentComp[] | null | undefined): number | null {
  if (!rentComps || rentComps.length === 0) return null;
  // Use adjustedRent if available, otherwise originalRent
  const total = rentComps.reduce((sum, comp) => sum + (comp.adjustedRent || comp.originalRent || 0), 0);
  return Math.round(total / rentComps.length);
}

/**
 * Check if a value deviates more than X% from reference
 */
function deviatesFromReference(value: number, reference: number, percentThreshold: number): boolean {
  if (!reference || reference === 0) return false;
  const deviation = Math.abs(value - reference) / reference * 100;
  return deviation > percentThreshold;
}

/**
 * Detect suspicious values in deal API data
 */
export function detectSuspiciousData(
  apiData: {
    arv?: number | null;
    purchasePrice?: number | null;
    rent?: number | null;
    rehabCost?: number | null;
    sqft?: number | null;
    saleComps?: SaleComp[] | null;
    rentComps?: RentComp[] | null;
  },
  overrides?: {
    arv?: number | null;
    purchasePrice?: number | null;
    rent?: number | null;
    rehabCost?: number | null;
  }
): SuspiciousDataResult {
  const fields: SuspiciousField[] = [];
  
  // Get effective values (override or API)
  const arv = overrides?.arv ?? apiData.arv ?? 0;
  const purchasePrice = overrides?.purchasePrice ?? apiData.purchasePrice ?? 0;
  const rent = overrides?.rent ?? apiData.rent ?? 0;
  const rehabCost = overrides?.rehabCost ?? apiData.rehabCost ?? 0;
  const sqft = apiData.sqft ?? 0;
  
  // Calculate comp averages
  const saleCompAvg = calculateSaleCompAverage(apiData.saleComps);
  const rentCompAvg = calculateRentCompAverage(apiData.rentComps);
  
  // Check ARV against absolute thresholds
  if (arv > THRESHOLDS.arvMax) {
    fields.push({
      field: 'arv',
      label: 'ARV',
      value: arv,
      reason: `ARV of ${formatCurrency(arv)} exceeds $2M - unusual for typical residential`,
      suggestedMax: THRESHOLDS.arvMax,
    });
  } else if (arv > 0 && arv < THRESHOLDS.arvMin) {
    fields.push({
      field: 'arv',
      label: 'ARV',
      value: arv,
      reason: `ARV of ${formatCurrency(arv)} is unusually low`,
    });
  }
  
  // Check ARV against sale comps (>100% deviation)
  if (arv > 0 && saleCompAvg && deviatesFromReference(arv, saleCompAvg, THRESHOLDS.compDeviationPercent)) {
    const deviationPercent = Math.round(Math.abs(arv - saleCompAvg) / saleCompAvg * 100);
    const direction = arv > saleCompAvg ? 'higher' : 'lower';
    fields.push({
      field: 'arv',
      label: 'ARV vs Comps',
      value: arv,
      reason: `ARV (${formatCurrency(arv)}) is ${deviationPercent}% ${direction} than sale comps average (${formatCurrency(saleCompAvg)})`,
      compAverage: saleCompAvg,
    });
  }
  
  // Check purchase price
  if (purchasePrice > THRESHOLDS.purchasePriceMax) {
    fields.push({
      field: 'purchasePrice',
      label: 'Purchase Price',
      value: purchasePrice,
      reason: `Purchase price of ${formatCurrency(purchasePrice)} exceeds $2M`,
      suggestedMax: THRESHOLDS.purchasePriceMax,
    });
  } else if (purchasePrice > 0 && purchasePrice < THRESHOLDS.purchasePriceMin) {
    fields.push({
      field: 'purchasePrice',
      label: 'Purchase Price',
      value: purchasePrice,
      reason: `Purchase price of ${formatCurrency(purchasePrice)} is unusually low`,
    });
  }
  
  // Check rent against absolute thresholds
  if (rent > THRESHOLDS.rentMax) {
    fields.push({
      field: 'rent',
      label: 'Monthly Rent',
      value: rent,
      reason: `Monthly rent of ${formatCurrency(rent)} exceeds $10K`,
      suggestedMax: THRESHOLDS.rentMax,
    });
  } else if (rent > 0 && rent < THRESHOLDS.rentMin) {
    fields.push({
      field: 'rent',
      label: 'Monthly Rent',
      value: rent,
      reason: `Monthly rent of ${formatCurrency(rent)} is unusually low`,
    });
  }
  
  // Check rent against rent comps (>100% deviation)
  if (rent > 0 && rentCompAvg && deviatesFromReference(rent, rentCompAvg, THRESHOLDS.compDeviationPercent)) {
    const deviationPercent = Math.round(Math.abs(rent - rentCompAvg) / rentCompAvg * 100);
    const direction = rent > rentCompAvg ? 'higher' : 'lower';
    fields.push({
      field: 'rent',
      label: 'Rent vs Comps',
      value: rent,
      reason: `Rent (${formatCurrency(rent)}/mo) is ${deviationPercent}% ${direction} than rent comps average (${formatCurrency(rentCompAvg)}/mo)`,
      compAverage: rentCompAvg,
    });
  }
  
  // Check rehab cost
  if (rehabCost > THRESHOLDS.rehabCostMax) {
    fields.push({
      field: 'rehabCost',
      label: 'Rehab Cost',
      value: rehabCost,
      reason: `Rehab cost of ${formatCurrency(rehabCost)} exceeds $500K`,
      suggestedMax: THRESHOLDS.rehabCostMax,
    });
  }
  
  // Check price per sqft if sqft is available
  if (sqft > 0 && purchasePrice > 0) {
    const pricePerSqft = purchasePrice / sqft;
    if (pricePerSqft > THRESHOLDS.pricePerSqftMax) {
      fields.push({
        field: 'pricePerSqft',
        label: 'Price/Sqft',
        value: pricePerSqft,
        reason: `Price per sqft of $${Math.round(pricePerSqft)} is unusually high`,
      });
    }
  }
  
  // Check ARV to purchase price ratio
  if (arv > 0 && purchasePrice > 0) {
    const ratio = arv / purchasePrice;
    if (ratio > THRESHOLDS.arvToPurchaseRatioMax) {
      fields.push({
        field: 'arvRatio',
        label: 'ARV/Price Ratio',
        value: ratio,
        reason: `ARV is ${ratio.toFixed(1)}x the purchase price - usually indicates data error`,
      });
    } else if (ratio < THRESHOLDS.arvToPurchaseRatioMin) {
      fields.push({
        field: 'arvRatio',
        label: 'ARV/Price Ratio',
        value: ratio,
        reason: `ARV is only ${(ratio * 100).toFixed(0)}% of purchase price - usually indicates data error`,
      });
    }
  }
  
  return {
    hasSuspiciousData: fields.length > 0,
    fields,
  };
}

/**
 * Check if a specific field value is suspicious
 */
export function isFieldSuspicious(field: string, value: number): boolean {
  switch (field) {
    case 'arv':
      return value > THRESHOLDS.arvMax || (value > 0 && value < THRESHOLDS.arvMin);
    case 'purchasePrice':
      return value > THRESHOLDS.purchasePriceMax || (value > 0 && value < THRESHOLDS.purchasePriceMin);
    case 'rent':
      return value > THRESHOLDS.rentMax || (value > 0 && value < THRESHOLDS.rentMin);
    case 'rehabCost':
      return value > THRESHOLDS.rehabCostMax;
    default:
      return false;
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export { THRESHOLDS as SUSPICIOUS_THRESHOLDS };
