import { Deal, DealFinancials, DealApiData, DealOverrides } from '@/types/deal';
import { FINANCIAL_CONFIG } from '@/config/financial';
import type { LoanDefaults } from '@/context/SettingsContext';

export function getEffectiveValue<K extends keyof Omit<DealOverrides, 'hmlLoanType'>>(
  apiData: DealApiData,
  overrides: DealOverrides,
  key: K
): number {
  const apiKey = key === 'rehabCost' ? 'rehabCost' : key;
  const overrideValue = overrides[key];
  const apiValue = apiData[apiKey as keyof DealApiData] as number | null;
  
  if (overrideValue !== null && overrideValue !== undefined) {
    return overrideValue as number;
  }
  return apiValue ?? 0;
}

export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  termYears: number
): number {
  const monthlyRate = annualRate / 12;
  const numPayments = termYears * 12;
  
  if (monthlyRate === 0) return principal / numPayments;
  
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1)
  );
}

// Layout change cost and value constants
const LAYOUT_CONSTANTS = {
  bedroomAdditionCost: 20000,   // Cost to add a bedroom
  bedroomValueIncrease: 30000,  // ARV increase per bedroom added
  bedroomRentIncrease: 400,     // Monthly rent increase per bedroom added
  bathroomAdditionCost: 15000,  // Cost to add a bathroom
  bathroomValueIncrease: 20000, // ARV increase per bathroom added
  bathroomRentIncrease: 200,    // Monthly rent increase per bathroom added
};

const MIN_MONTHLY_INSURANCE = 50; // If API returns less than $50/mo, use $100/mo default
const DEFAULT_MONTHLY_INSURANCE = 100;

/**
 * Get effective monthly insurance from API annual value.
 * If the API value is below $50/mo (likely erroneous), defaults to $100/mo.
 */
export function getEffectiveMonthlyInsurance(apiAnnualInsurance: number | null | undefined): number {
  const annual = apiAnnualInsurance ?? 0;
  const monthly = annual / 12;
  if (monthly < MIN_MONTHLY_INSURANCE) return DEFAULT_MONTHLY_INSURANCE;
  return Math.round(monthly);
}

// Validate ARV against sale comps
// Updated rules:
// 1. If only 1 comp in last 6 months - compare by bedrooms/bathrooms/sqft to determine ARV
// 2. If 3+ comps and one is significantly higher (>20% above average) - apply 5% safety margin
// 3. Always provide clear explanation
const ARV_SAFETY_MARGIN = 0.05; // 5% discount from highest comp for safety
const SIGNIFICANT_OUTLIER_THRESHOLD = 0.20; // 20% above average = outlier

// Calculate ARV from recent comps (last 6 months only)
// If API ARV is within 90% of calculated, use API ARV
export function calculateArvFromRecentComps(
  apiArv: number,
  saleComps: { salePrice: number; sqft: number; bedrooms: number; bathrooms: number; saleDate?: string }[],
  targetBedrooms: number,
  targetBathrooms: number,
  propertySqft: number
): { calculatedArv: number; useApiArv: boolean; compsUsed: number; explanation: string } {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  
  // Filter to only last 6 months
  const recentComps = saleComps.filter(c => {
    if (!c.saleDate) return false;
    return new Date(c.saleDate) >= sixMonthsAgo;
  });
  
  if (recentComps.length === 0) {
    return {
      calculatedArv: apiArv,
      useApiArv: true,
      compsUsed: 0,
      explanation: 'No recent comps (last 6 months) - using API ARV'
    };
  }
  
  // Prefer exact layout matches — only use comps with a valid salePrice
  const validRecentComps = recentComps.filter(c => c.salePrice && isFinite(c.salePrice) && c.salePrice > 0);

  if (validRecentComps.length === 0) {
    return {
      calculatedArv: apiArv,
      useApiArv: true,
      compsUsed: 0,
      explanation: 'No recent comps with valid sale price — using API ARV'
    };
  }

  const exactMatchComps = validRecentComps.filter(c =>
    c.bedrooms === targetBedrooms && c.bathrooms === targetBathrooms
  );

  // Layout-range fallback (±1 bed/bath) — mirrors DealDetailPage so Hot Deals'
  // ARV doesn't get inflated by comps whose layout is far from the subject.
  const layoutRangeComps = validRecentComps.filter(c =>
    Math.abs((c.bedrooms || 0) - targetBedrooms) <= 1 &&
    Math.abs((c.bathrooms || 0) - targetBathrooms) <= 1
  );

  const compsToUse = exactMatchComps.length > 0
    ? exactMatchComps.slice(0, 5)
    : layoutRangeComps.slice(0, 5);

  // No comps survived the layout filter — fall back to API ARV rather than
  // averaging unrelated layouts.
  if (compsToUse.length === 0) {
    return {
      calculatedArv: apiArv,
      useApiArv: true,
      compsUsed: 0,
      explanation: 'No recent comps within ±1 bed/bath of target layout — using API ARV',
    };
  }

  // Normalize by price-per-sqft so a much larger/smaller comp doesn't skew ARV.
  // Falls back to raw price averaging when sqft data is missing.
  const compsWithSqft = compsToUse.filter(c => c.sqft && c.sqft > 0);
  const calculatedArv = (propertySqft > 0 && compsWithSqft.length > 0)
    ? Math.round(
        (compsWithSqft.reduce((sum, c) => sum + c.salePrice / c.sqft, 0) / compsWithSqft.length) * propertySqft
      )
    : Math.round(compsToUse.reduce((sum, c) => sum + c.salePrice, 0) / compsToUse.length);

  // Guard: if calculatedArv is 0 or NaN, fall back to apiArv
  if (!calculatedArv || !isFinite(calculatedArv)) {
    return { calculatedArv: apiArv, useApiArv: true, compsUsed: 0, explanation: 'Calculated ARV invalid — using API ARV' };
  }

  // Compare: If API ARV is within 10% of calculated, use API ARV
  const differencePercent = Math.abs(apiArv - calculatedArv) / calculatedArv;
  const useApiArv = differencePercent <= 0.10;
  
  return {
    calculatedArv: useApiArv ? apiArv : calculatedArv,
    useApiArv,
    compsUsed: compsToUse.length,
    explanation: useApiArv 
      ? `API ARV (${apiArv.toLocaleString()}) within 10% of calculated (${calculatedArv.toLocaleString()}) - using API`
      : `Calculated ARV from ${compsToUse.length} recent comps (API diff: ${(differencePercent * 100).toFixed(1)}%)`
  };
}

export interface ArvValidationResult {
  validatedArv: number;
  wasAdjusted: boolean;
  maxComp: number | null;
  reason: string | null;
  explanation: string; // Always provide clear explanation
  method: 'single_comp' | 'safety_margin' | 'no_adjustment' | 'no_comps';
}

export function validateArvAgainstComps(
  arv: number,
  saleComps: { salePrice: number; sqft: number; bedrooms: number; bathrooms: number; saleDate?: string; address?: string }[],
  propertySqft: number,
  targetBedrooms: number,
  targetBathrooms: number
): ArvValidationResult {
  // Filter to only last 6 months comps
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  
  const recentComps = saleComps.filter(c => {
    if (!c.saleDate) return false;
    return new Date(c.saleDate) >= sixMonthsAgo;
  });

  // No recent comps - use API ARV as is
  if (!recentComps || recentComps.length === 0 || !propertySqft || propertySqft <= 0) {
    return { 
      validatedArv: arv, 
      wasAdjusted: false, 
      maxComp: null, 
      reason: null,
      explanation: 'Using API ARV - no recent comps available for comparison',
      method: 'no_comps'
    };
  }

  // CASE 1: Only 1 comp - compare by bedrooms/bathrooms/sqft
  if (recentComps.length === 1) {
    const comp = recentComps[0];
    const compPricePerSqft = comp.salePrice / comp.sqft;
    
    // Adjust for layout differences
    let layoutAdjustment = 0;
    const bedroomDiff = targetBedrooms - comp.bedrooms;
    const bathroomDiff = targetBathrooms - comp.bathrooms;
    layoutAdjustment += bedroomDiff * LAYOUT_CONSTANTS.bedroomValueIncrease;
    layoutAdjustment += bathroomDiff * LAYOUT_CONSTANTS.bathroomValueIncrease;
    
    // Calculate ARV based on sqft comparison + layout adjustment
    const calculatedArv = Math.round((propertySqft * compPricePerSqft) + layoutAdjustment);
    
    // Use the lower of API ARV and calculated ARV for safety
    const finalArv = Math.min(arv, calculatedArv);
    const wasAdjusted = finalArv !== arv;
    
    return {
      validatedArv: finalArv,
      wasAdjusted,
      maxComp: comp.salePrice,
      reason: wasAdjusted ? `Adjusted based on single comp at $${comp.salePrice.toLocaleString()}` : null,
      explanation: `Single comp: $${comp.salePrice.toLocaleString()} (${comp.bedrooms}bd/${comp.bathrooms}ba, ${comp.sqft.toLocaleString()} sqft). ` +
        `Price/sqft: $${Math.round(compPricePerSqft)}/sqft. ` +
        (bedroomDiff !== 0 || bathroomDiff !== 0 
          ? `Layout adjustment: ${bedroomDiff > 0 ? '+' : ''}${bedroomDiff} beds, ${bathroomDiff > 0 ? '+' : ''}${bathroomDiff} baths = ${layoutAdjustment >= 0 ? '+' : ''}$${layoutAdjustment.toLocaleString()}. `
          : '') +
        `Calculated: $${calculatedArv.toLocaleString()}`,
      method: 'single_comp'
    };
  }

  // CASE 2: Multiple comps - check for outliers
  const prices = recentComps.map(c => c.salePrice);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const highestPrice = Math.max(...prices);
  const highestComp = recentComps.find(c => c.salePrice === highestPrice);
  
  // Check if highest comp is significantly above average (outlier)
  const isOutlier = (highestPrice - avgPrice) / avgPrice > SIGNIFICANT_OUTLIER_THRESHOLD;
  
  // Filter comps that match the target layout
  const matchingComps = recentComps.filter(comp => 
    comp.bedrooms === targetBedrooms && comp.bathrooms === targetBathrooms
  );
  const relevantComps = matchingComps.length > 0 ? matchingComps : recentComps;

  // CASE 2a: 3+ comps with outlier - apply 5% safety margin
  if (recentComps.length >= 3 && isOutlier) {
    const safeArv = Math.round(highestPrice * (1 - ARV_SAFETY_MARGIN));
    
    if (arv > safeArv) {
      // Check if larger sqft justifies higher ARV
      if (highestComp && propertySqft > highestComp.sqft) {
        const highestCompPricePerSqft = highestPrice / highestComp.sqft;
        const maxJustifiedArv = Math.round(propertySqft * highestCompPricePerSqft * (1 - ARV_SAFETY_MARGIN));
        
        if (arv <= maxJustifiedArv) {
          return {
            validatedArv: arv,
            wasAdjusted: false,
            maxComp: highestPrice,
            reason: null,
            explanation: `ARV justified by larger sqft (${propertySqft.toLocaleString()} vs ${highestComp.sqft.toLocaleString()}). ` +
              `Highest comp: $${highestPrice.toLocaleString()} (outlier, ${((highestPrice - avgPrice) / avgPrice * 100).toFixed(0)}% above avg). ` +
              `${recentComps.length} comps analyzed.`,
            method: 'no_adjustment'
          };
        }
        
        return {
          validatedArv: maxJustifiedArv,
          wasAdjusted: true,
          maxComp: highestPrice,
          reason: `ARV adjusted based on $/sqft with 5% safety`,
          explanation: `Highest comp is outlier ($${highestPrice.toLocaleString()}, ${((highestPrice - avgPrice) / avgPrice * 100).toFixed(0)}% above avg of $${Math.round(avgPrice).toLocaleString()}). ` +
            `Applied 5% safety margin. Property sqft: ${propertySqft.toLocaleString()}, Comp sqft: ${highestComp.sqft.toLocaleString()}. ` +
            `${recentComps.length} comps analyzed.`,
          method: 'safety_margin'
        };
      }
      
      return {
        validatedArv: safeArv,
        wasAdjusted: true,
        maxComp: highestPrice,
        reason: `ARV capped at 95% of highest comp due to outlier`,
        explanation: `Highest comp ($${highestPrice.toLocaleString()}) is ${((highestPrice - avgPrice) / avgPrice * 100).toFixed(0)}% above average ($${Math.round(avgPrice).toLocaleString()}). ` +
          `Applied 5% safety margin → $${safeArv.toLocaleString()}. ` +
          `${recentComps.length} comps analyzed.`,
        method: 'safety_margin'
      };
    }
  }

  // CASE 2b: No outlier or ARV is reasonable - no adjustment needed
  const highestRelevantPrice = Math.max(...relevantComps.map(c => c.salePrice));
  
  if (arv <= highestRelevantPrice) {
    return {
      validatedArv: arv,
      wasAdjusted: false,
      maxComp: highestPrice,
      reason: null,
      explanation: `ARV within range of ${recentComps.length} recent comps. ` +
        `Highest: $${highestPrice.toLocaleString()}, Average: $${Math.round(avgPrice).toLocaleString()}. ` +
        (matchingComps.length > 0 ? `${matchingComps.length} matching layout.` : 'No exact layout match.'),
      method: 'no_adjustment'
    };
  }

  // ARV is higher than all comps - cap at highest with small margin for safety
  const cappedArv = Math.round(highestRelevantPrice * (1 - ARV_SAFETY_MARGIN / 2)); // 2.5% margin when no outlier
  
  return {
    validatedArv: cappedArv,
    wasAdjusted: true,
    maxComp: highestPrice,
    reason: `ARV capped - exceeds all recent comps`,
    explanation: `ARV exceeds highest comp ($${highestRelevantPrice.toLocaleString()}). ` +
      `Applied 2.5% safety margin → $${cappedArv.toLocaleString()}. ` +
      `${recentComps.length} comps analyzed, avg: $${Math.round(avgPrice).toLocaleString()}.`,
    method: 'safety_margin'
  };
}

export function calculateFinancials(
  apiData: DealApiData,
  overrides: DealOverrides,
  loanDefaults?: LoanDefaults
): DealFinancials {
  const config = FINANCIAL_CONFIG;
  
  // Use loanDefaults from settings if provided, otherwise fall back to FINANCIAL_CONFIG
  const defaultDownPaymentPercent = loanDefaults 
    ? loanDefaults.downPaymentPercent / 100 
    : (1 - config.loan.ltvPercent);
  const defaultInterestRate = loanDefaults 
    ? loanDefaults.interestRate / 100 
    : config.loan.interestRate;
  const defaultLoanTermYears = loanDefaults 
    ? loanDefaults.loanTermYears 
    : config.loan.termYears;
  const defaultPropertyManagementPercent = loanDefaults 
    ? loanDefaults.propertyManagementPercent / 100 
    : config.propertyManagementPercent;
  
  // Calculate layout changes (bedrooms/bathrooms additions)
  const currentBedrooms = apiData.bedrooms ?? 0;
  const currentBathrooms = apiData.bathrooms ?? 0;
  const targetBedrooms = overrides.targetBedrooms ?? currentBedrooms;
  const targetBathrooms = overrides.targetBathrooms ?? currentBathrooms;
  
  // Only count additions, not reductions
  const bedroomsAdded = Math.max(0, targetBedrooms - currentBedrooms);
  const bathroomsAdded = Math.max(0, targetBathrooms - currentBathrooms);
  
  // Calculate layout adjustment costs, value increases, and rent increases
  const layoutRehabCost = 
    (bedroomsAdded * LAYOUT_CONSTANTS.bedroomAdditionCost) + 
    (bathroomsAdded * LAYOUT_CONSTANTS.bathroomAdditionCost);
  const layoutArvIncrease = 
    (bedroomsAdded * LAYOUT_CONSTANTS.bedroomValueIncrease) + 
    (bathroomsAdded * LAYOUT_CONSTANTS.bathroomValueIncrease);
  const layoutRentIncrease = 
    (bedroomsAdded * LAYOUT_CONSTANTS.bedroomRentIncrease) + 
    (bathroomsAdded * LAYOUT_CONSTANTS.bathroomRentIncrease);
  
  // Get base values - check overrides first
  const baseRehabCost = getEffectiveValue(apiData, overrides, 'rehabCost');
  const baseRent = getEffectiveValue(apiData, overrides, 'rent');
  
  // For ARV: Use new calculation method (6 months comps with API comparison)
  let arv: number;
  let arvValidationDelta = 0;

  if (overrides.arv != null) {
    // User override - use directly
    arv = overrides.arv + layoutArvIncrease;
  } else {
    // Calculate ARV from recent comps (last 6 months only)
    const saleComps = apiData.saleComps || [];
    const apiArv = (apiData.arv ?? 0) + layoutArvIncrease;
    
    const arvCalc = calculateArvFromRecentComps(apiArv, saleComps, targetBedrooms, targetBathrooms, apiData.sqft ?? 0);
    arv = arvCalc.calculatedArv;
    
    // Also validate against highest comp for safety
    const propertySqft = apiData.sqft ?? 0;
    const arvValidation = validateArvAgainstComps(arv, saleComps, propertySqft, targetBedrooms, targetBathrooms);
    arvValidationDelta = arv - arvValidation.validatedArv;
    arv = arvValidation.validatedArv;

    // If seller stated an ARV (from email), use the lower of seller ARV vs analyzed ARV
    const sellerArv = apiData.sellerArv;
    if (sellerArv && sellerArv > 0) {
      const sellerArvWithLayout = sellerArv + layoutArvIncrease;
      if (sellerArvWithLayout < arv) {
        arvValidationDelta += arv - sellerArvWithLayout;
        arv = sellerArvWithLayout;
      }
    }
  }

  const rehabCost = baseRehabCost + layoutRehabCost;
  const rent = baseRent + layoutRentIncrease;
  
  // Purchase price: check override first, then apiData
  const purchasePrice = overrides.purchasePrice ?? apiData.purchasePrice ?? 0;
  
  const propertyTax = apiData.propertyTax ?? 0;
  const insurance = apiData.insurance ?? 0;
  
  // Get loan parameters from overrides or loanDefaults
  const downPaymentPercent = overrides.downPaymentPercent != null 
    ? overrides.downPaymentPercent / 100 
    : defaultDownPaymentPercent;
  const interestRate = overrides.interestRate != null 
    ? overrides.interestRate / 100 
    : defaultInterestRate;
  const loanTermYears = overrides.loanTermYears ?? defaultLoanTermYears;
  
  // Calculate acquisition costs (closing costs = 2% of purchase price)
  const closingCosts = purchasePrice * config.closingCostsPercent;
  const totalAcquisitionCost = purchasePrice + rehabCost + closingCosts;
  
  // Calculate rental income
  const monthlyGrossRent = rent;
  const yearlyGrossRent = rent * 12;
  
  // Calculate operating expenses (monthly)
  const monthlyPropertyTax = propertyTax / 12;
  const monthlyInsurance = getEffectiveMonthlyInsurance(insurance);
  const propertyManagementRate = overrides.propertyManagementPercent != null 
    ? overrides.propertyManagementPercent / 100 
    : defaultPropertyManagementPercent;
  const monthlyManagement = rent * propertyManagementRate;
  const monthlyMaintenance = rent * config.maintenancePercent;
  const monthlyVacancy = rent * config.vacancyPercent;
  
  const monthlyExpenses = 
    monthlyPropertyTax + 
    monthlyInsurance + 
    monthlyManagement + 
    monthlyMaintenance + 
    monthlyVacancy;
  
  const yearlyExpenses = monthlyExpenses * 12;
  
  // Calculate NOI
  const monthlyNOI = monthlyGrossRent - monthlyExpenses;
  const yearlyNOI = monthlyNOI * 12;
  
  // Calculate cap rate
  const capRate = purchasePrice > 0 ? yearlyNOI / purchasePrice : 0;
  
  // Calculate loan and debt service using overrides
  const ltvPercent = 1 - downPaymentPercent;
  const loanAmount = purchasePrice * ltvPercent;
  const monthlyDebtService = calculateMonthlyPayment(
    loanAmount,
    interestRate,
    loanTermYears
  );
  const yearlyDebtService = monthlyDebtService * 12;
  
  // Calculate cashflow
  const monthlyCashflow = monthlyNOI - monthlyDebtService;
  const yearlyCashflow = monthlyCashflow * 12;
  
  // Calculate total cash required (down payment + closing + rehab)
  const downPayment = purchasePrice * downPaymentPercent;
  const notaryFee = config.notaryFeePerSigning; // 1 loan signing for rental
  const totalCashRequired = downPayment + closingCosts + rehabCost + notaryFee;
  
  // Calculate cash-on-cash return
  const cashOnCashReturn = totalCashRequired > 0 
    ? yearlyCashflow / totalCashRequired 
    : 0;
  
  // Calculate equity at purchase
  const equityAtPurchase = arv - totalAcquisitionCost;
  
  return {
    arv,
    arvValidationDelta,
    purchasePrice,
    rehabCost,
    totalAcquisitionCost,
    closingCosts,
    monthlyGrossRent,
    yearlyGrossRent,
    monthlyExpenses,
    yearlyExpenses,
    monthlyNOI,
    yearlyNOI,
    capRate,
    monthlyDebtService,
    yearlyDebtService,
    monthlyCashflow,
    yearlyCashflow,
    cashOnCashReturn,
    equityAtPurchase,
    totalCashRequired,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export function isDealQualified(financials: DealFinancials): boolean {
  const mins = FINANCIAL_CONFIG.minimums;
  return (
    financials.cashOnCashReturn >= mins.cashOnCashReturn &&
    financials.capRate >= mins.capRate &&
    financials.monthlyCashflow >= mins.monthlyCashflow &&
    financials.equityAtPurchase >= mins.equity
  );
}
