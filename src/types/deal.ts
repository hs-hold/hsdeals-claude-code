export type DealStatus =
  | 'new'
  | 'under_analysis'
  | 'qualified'
  | 'offer_sent'
  | 'under_contract'
  | 'pending_other'
  | 'closed'
  | 'not_relevant'
  | 'filtered_out';

export type DealSource = 'email' | 'manual' | 'import' | 'api';

export type PropertyType = 'single_family' | 'multi_family' | 'condo' | 'townhouse' | 'duplex' | 'triplex' | 'fourplex' | 'other';

export interface PropertyAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  full: string;
}

export interface RentComp {
  address: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  originalRent: number;
  adjustedRent: number;
  adjustment: number;
  adjustmentReason: string;
}

export interface SaleComp {
  address: string;
  salePrice: number;
  saleDate: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  distance: number;
  similarityScore: number;
  notes?: string[];
  daysOnMarket?: number | null;
}

export type CompVerificationStatus = 'verified' | 'needs_review' | 'not_relevant' | 'excluded';
export type CompSource = 'manual' | 'auto' | 'zillow' | 'api';
export type CompImportedFrom = 'more_info_recently_sold' | 'manual' | 'address_lookup' | 'zillow_link' | 'api';
export type CompPropertyStatus = 'sold' | 'active' | 'pending' | 'for_sale' | 'off_market';
export type CompCategory = 'high_market' | 'low_market_for_sale';
export type ComparisonToSubject = 'much_inferior' | 'slightly_inferior' | 'similar' | 'slightly_superior' | 'much_superior';

export interface CompPrecisionComp {
  id: string;
  dealId: string;
  source: CompSource;
  importedFrom: CompImportedFrom;
  verificationStatus: CompVerificationStatus;
  isIncludedInArv: boolean;
  category: CompCategory;
  address: string;
  externalUrl?: string;
  status: CompPropertyStatus;
  price: number;
  soldDate?: string;
  livingAreaSqft?: number;
  bedrooms?: number;
  bathrooms?: number;
  lotSizeSqft?: number;
  yearBuilt?: number;
  distanceMiles?: number;
  compTitle?: string;
  relevanceNote?: string;
  notes?: string;
  similarityScore?: number;
  comparisonToSubject?: ComparisonToSubject;
  adjustedPrice?: number;
  adjustedPpsf?: number;
  isBestComp?: boolean;
  createdByUser?: boolean;
  updatedManually?: boolean;
  approvedByUser?: boolean;
  approvedAt?: string;
  rawPayload?: any;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistoryItem {
  date: string;
  price: number;
  event: string;
}

export interface TaxHistoryItem {
  time: number;
  taxPaid: number | null;
  value: number | null;
  taxIncreaseRate?: number;
  valueIncreaseRate?: number;
}

export interface Section8Data {
  areaName: string;
  minRent: number;
  maxRent: number;
  bedrooms: number;
}

export interface DealApiData {
  // Property basics
  arv: number | null;
  sellerArv: number | null; // Seller's stated ARV from email — used as cap if lower than analyzed ARV
  purchasePrice: number | null;
  rent: number | null;
  rehabCost: number | null;
  propertyTax: number | null;
  insurance: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: PropertyType | null;
  lotSize: number | null;
  
  // Location & Listing
  latitude: number | null;
  longitude: number | null;
  daysOnMarket: number | null;
  daysOnMarketFetchedAt: string | null; // ISO date when DOM was fetched from API
  county: string | null;
  detailUrl: string | null;
  imgSrc: string | null;
  
  // Location scores
  crimeScore: number | null;
  schoolScore: number | null;
  medianIncome: number | null;
  neighborhoodRating: string | null;
  
  // AI Analysis values - these come directly from the API analysis
  grade: string | null;
  aiSummary: string | null;
  monthlyCashFlow: number | null;
  cashOnCashRoi: number | null;
  capRate: number | null;
  monthlyExpenses: number | null;
  monthlyPiti: number | null;
  monthlyMortgage: number | null;
  downPayment: number | null;
  loanAmount: number | null;
  wholesalePrice: number | null;
  arvMargin: number | null;
  
  // Agent / Broker info
  agentName: string | null;
  agentEmail: string | null;
  agentPhone: string | null;
  agentLicense: string | null;
  brokerName: string | null;
  brokerPhone: string | null;
  mlsId: string | null;
  mlsName: string | null;
  
  // Additional data
  priceHistory: PriceHistoryItem[];
  taxHistory: TaxHistoryItem[];
  section8: Section8Data | null;
  saleComps: SaleComp[];
  rentComps: RentComp[];
  
  // Full raw response for reference
  rawResponse?: any;
}

export interface DealOverrides {
  arv: number | null;
  rent: number | null;
  rehabCost: number | null;
  purchasePrice: number | null;      // Override for off-market deals
  downPaymentPercent: number | null; // Override loan LTV (e.g., 25 = 25% down)
  interestRate: number | null;       // Override interest rate (e.g., 7.5 = 7.5%)
  loanTermYears: number | null;      // Override loan term (e.g., 30)
  targetBedrooms: number | null;     // Target bedrooms after renovation (for comp filtering)
  targetBathrooms: number | null;    // Target bathrooms after renovation (for comp filtering)
  holdingMonths: number | null;      // Holding period for flip analysis (default: 6 months)
  propertyTaxMonthly: number | null; // Override monthly property tax
  insuranceMonthly: number | null;   // Override monthly insurance
  rentalInsuranceMonthly: number | null; // Override monthly insurance for Rental only
  stateTaxMonthly: number | null;    // Override monthly state tax
  hoaMonthly: number | null;         // Override monthly HOA
  utilitiesMonthly: number | null;   // Override monthly utilities
  propertyManagementPercent: number | null; // Override property management % (e.g., 10 = 10%)
  maintenanceVacancyPercent: number | null; // Override maintenance+vacancy % (e.g., 7 = 7%)
  // Flip deal overrides
  closingCostsPercent: number | null;       // Override closing costs % (e.g., 2 = 2%)
  closingCostsDollar: number | null;        // Override closing costs fixed $ (overrides %)
  contingencyPercent: number | null;        // Override rehab contingency % (e.g., 12 = 12%)
  agentCommissionPercent: number | null;    // Override agent commission % (e.g., 6 = 6%)
  notaryFees: number | null;                // Override notary fees (fixed $)
  titleFees: number | null;                 // Override title fees (fixed $)
  // HML overrides
  hmlLoanType: string | null;                // 'ltv' (% of ARV) or 'ltc' (% of purchase price), default ltc
  brrrrPhase1Type: string | null;            // 'hml' or 'cash' (default hml)
  hmlLtvPurchasePercent: number | null;     // HML LTV for purchase (e.g., 90 = 90%)
  hmlLtvRehabPercent: number | null;        // HML LTV for rehab (e.g., 100 = 100%)
  hmlPointsPercent: number | null;          // HML points (e.g., 2 = 2%)
  hmlInterestRate: number | null;           // HML annual interest rate (e.g., 12 = 12%)
  hmlProcessingFee: number | null;          // HML processing fee (fixed $)
  hmlAppraisalCost: number | null;           // HML appraisal/BPO cost (fixed $)
  hmlUnderwritingFee: number | null;         // HML underwriting fee (fixed $)
  hmlOtherFees: number | null;               // HML other/misc post-closing fees (fixed $)
  hmlAnnualInsurance: number | null;          // HML annual insurance paid at closing (fixed $)
  // BRRRR Refi overrides
  refiLenderName: string | null;            // Refi lender name (display only)
  refiLtvPercent: number | null;            // Refi LTV on ARV (e.g., 75 = 75%)
  refiInterestRate: number | null;          // Refi annual interest rate (e.g., 7.5 = 7.5%)
  refiAppraisalCost: number | null;         // Refi appraisal/BPO cost (fixed $)
  refiUnderwritingFee: number | null;       // Refi underwriting fee (fixed $)
  refiPointsPercent: number | null;         // Refi points/origination % (e.g., 1 = 1%)
  refiOtherFees: number | null;             // Refi other/misc fees (fixed $)
  refiClosingPercent: number | null;        // Refi closing costs % (e.g., 2 = 2%)
  capexPercent: number | null;              // CapEx reserve % (e.g., 5 = 5%)
  // Lot size override
  lotSizeSqft: number | null;               // Override lot size in square feet
  // Holding other costs
  holdingOtherMonthly: number | null;       // Other monthly holding costs (fixed $)
  // Rental loan fee overrides
  rentalAppraisalCost: number | null;       // Rental appraisal cost (default $1150)
  rentalUnderwritingFee: number | null;     // Rental underwriting fee (default $750)
  rentalPointsPercent: number | null;       // Rental points % of ARV (default 1%)
  rentalOtherFees: number | null;           // Rental other fees (default $3500)
  // Comp Precision
  compPrecisionComps?: CompPrecisionComp[];
  compPrecisionImportedAt?: string;
}

export interface DealFinancials {
  arv: number;
  arvValidationDelta: number;
  purchasePrice: number;
  rehabCost: number;
  totalAcquisitionCost: number;
  closingCosts: number;
  monthlyGrossRent: number;
  yearlyGrossRent: number;
  monthlyExpenses: number;
  yearlyExpenses: number;
  monthlyNOI: number;
  yearlyNOI: number;
  capRate: number;
  monthlyDebtService: number;
  yearlyDebtService: number;
  monthlyCashflow: number;
  yearlyCashflow: number;
  cashOnCashReturn: number;
  equityAtPurchase: number;
  totalCashRequired: number;
}

export interface Deal {
  id: string;
  address: PropertyAddress;
  status: DealStatus;
  source: DealSource;
  apiData: DealApiData;
  overrides: DealOverrides;
  financials: DealFinancials | null;
  rejectionReason: string | null;
  notes: string;
  emailSubject: string | null;
  emailDate: string | null;
  emailId: string | null;
  gmailThreadId: string | null;
  // Sender info from email import
  senderName: string | null;
  senderEmail: string | null;
  emailSnippet: string | null;
  createdAt: string;
  updatedAt: string;
  analyzedAt?: string | null;
  owner: string;
  createdBy: string | null;
  isLocked: boolean;
  isOffMarket: boolean;
  dealType: string | null;
  emailExtractedData: Record<string, any> | null;
  scoutAiData: Record<string, any> | null;
}

export const DEAL_STATUS_CONFIG: Record<DealStatus, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-primary/20 text-primary' },
  under_analysis: { label: 'Under Analysis', color: 'bg-warning/20 text-warning' },
  qualified: { label: 'Qualified', color: 'bg-success/20 text-success' },
  offer_sent: { label: 'Offer Sent', color: 'bg-chart-4/20 text-chart-4' },
  under_contract: { label: 'Under Contract (Me)', color: 'bg-accent/20 text-accent' },
  pending_other: { label: 'Pending - Other Buyer', color: 'bg-orange-500/20 text-orange-400' },
  closed: { label: 'Closed', color: 'bg-success/20 text-success' },
  not_relevant: { label: 'Not Relevant', color: 'bg-muted text-muted-foreground' },
  filtered_out: { label: 'Filtered Out', color: 'bg-destructive/20 text-destructive' },
};

export const DEAL_SOURCE_LABELS: Record<DealSource, string> = {
  email: 'Email',
  manual: 'Manual',
  import: 'Import',
  api: 'API',
};
