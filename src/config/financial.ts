// Financial assumptions configuration
// All percentages are expressed as decimals (e.g., 0.08 = 8%)

export const FINANCIAL_CONFIG = {
  // Closing costs as percentage of purchase price (buy side)
  closingCostsPercent: 0.02, // 2%
  
  // Property management fee as percentage of monthly rent
  propertyManagementPercent: 0.10,
  
  // Maintenance/repairs as percentage of monthly rent
  maintenancePercent: 0.07,
  
  // Vacancy rate as percentage of annual rent
  vacancyPercent: 0.08,
  
  // Loan assumptions
  loan: {
    // Loan-to-value ratio (percentage of purchase price financed)
    ltvPercent: 0.70,
    // Annual interest rate
    interestRate: 0.075,
    // Loan term in years
    termYears: 30,
  },
  
  // Flip deal assumptions
  flip: {
    // Rehab contingency as percentage of rehab cost
    rehabContingencyPercent: 0.10, // 10%
    // Default months for rehab
    defaultRehabMonths: 4,
    // Monthly holding costs breakdown (without utilities)
    holdingCosts: {
      propertyTaxMonthly: 150,
      insuranceMonthly: 100,
      stateTaxMonthly: 0,
      hoaMonthly: 0,
    },
    // Utilities monthly
    utilitiesMonthly: 300,
    // Sale costs
    saleCosts: {
      agentCommissionPercent: 0.05, // 5%
    },
  },
  
  // Notary fee per loan signing (HML, mortgage, refi each count as a signing)
  notaryFeePerSigning: 500,
  // Title fees per transaction
  titleFees: 500,
  
  // Hard Money Lender (HML) assumptions
  hml: {
    // LTV - percentage of purchase price + rehab the HML will lend
    ltvPurchasePercent: 0.90, // 90% of purchase price
    ltvRehabPercent: 1.00, // 100% of rehab cost
    // Points (origination fee) as percentage of loan amount
    pointsPercent: 0.02, // 2 points
    // Annual interest rate
    interestRate: 0.12, // 12%
    // Processing/doc fees
    processingFee: 1500,
  },
  
  // Minimum thresholds for "qualified" deals
  minimums: {
    cashOnCashReturn: 0.08, // 8%
    capRate: 0.06, // 6%
    monthlyCashflow: 200, // $200
    equity: 20000, // $20,000
  },
} as const;

// Hot Deals / Flip Score scoring configuration.
// Used by the unified flip score calculator (src/utils/flipScore.ts) consumed by
// HotDealsPage, AgentDealsPage, and AgentManagementPage. Kept separate from
// FINANCIAL_CONFIG.flip because the scoring view uses different assumptions
// (live property tax/insurance, 6% agent commission) than the generic flip
// modeling in calculateFinancials.
export const FLIP_SCORE_CONFIG = {
  // Max purchase price for Hot Deals filter
  maxPurchasePrice: 300_000,
  // Rehab floors by deal source — applied when no manual rehab override exists
  rehabFloor: {
    email: 80_000,
    api: 60_000,
  },
  // Layout change costs (added on top of base rehab when targetBedrooms/Bathrooms set)
  layoutCost: {
    perBedroom: 20_000,
    perBathroom: 15_000,
  },
  // Estimated monthly utilities during holding period
  utilitiesMonthly: 300,
  // Sale-side costs
  agentCommissionPercent: 0.06,
  notaryFee: 500,
  // Buy-side closing costs (% of purchase price)
  closingCostsPercent: 0.02,
  // ROI → score brackets (descending). First match wins.
  scoreBrackets: [
    { minRoi: 25, score: 10 },
    { minRoi: 20, score: 9 },
    { minRoi: 18, score: 8 },
    { minRoi: 16, score: 7 },
    { minRoi: 15, score: 6 },
    { minRoi: 13, score: 5 },
    { minRoi: 11, score: 4 },
    { minRoi: 9, score: 3 },
    { minRoi: 8, score: 2 },
  ],
  // Default holding period in months (overridden by loanDefaults.holdingMonths)
  defaultHoldingMonths: 4,
  // Target ROI used to back out MAO from ARV
  maoTargetRoi: 0.18,
} as const;

export const API_CONFIG = {
  // Placeholder for external API configuration
  baseUrl: '',
  apiKey: '',
  timeout: 30000,
} as const;
