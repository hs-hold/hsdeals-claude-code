import { Deal, DealStatus } from '@/types/deal';
import { calculateFinancials } from '@/utils/financialCalculations';

const generateId = () => Math.random().toString(36).substr(2, 9);

const createMockDeal = (
  street: string,
  zip: string,
  status: DealStatus,
  purchasePrice: number,
  arv: number,
  rent: number,
  rehabCost: number,
  propertyTax: number,
  insurance: number,
  bedrooms: number,
  bathrooms: number,
  sqft: number,
  yearBuilt: number,
  source: 'email' | 'manual' = 'email',
  notes: string = ''
): Deal => {
  const apiData = {
    arv,
    purchasePrice,
    rent,
    rehabCost,
    propertyTax,
    insurance,
    bedrooms,
    bathrooms,
    sqft,
    yearBuilt,
    propertyType: 'single_family' as const,
    lotSize: Math.floor(Math.random() * 10000) + 5000,
    // New location fields
    latitude: null,
    longitude: null,
    daysOnMarket: null,
    daysOnMarketFetchedAt: null,
    county: null,
    detailUrl: null,
    imgSrc: null,
    crimeScore: Math.floor(Math.random() * 40) + 60,
    schoolScore: Math.floor(Math.random() * 30) + 70,
    medianIncome: Math.floor(Math.random() * 40000) + 45000,
    neighborhoodRating: ['A', 'B+', 'B', 'B-', 'C+'][Math.floor(Math.random() * 5)],
    // AI Analysis fields - null for mock data
    grade: null,
    aiSummary: null,
    monthlyCashFlow: null,
    cashOnCashRoi: null,
    capRate: null,
    monthlyExpenses: null,
    monthlyPiti: null,
    monthlyMortgage: null,
    downPayment: null,
    loanAmount: null,
    wholesalePrice: null,
    arvMargin: null,
    // Agent / Broker info - null for mock data
    agentName: null,
    agentEmail: null,
    agentPhone: null,
    agentLicense: null,
    brokerName: null,
    brokerPhone: null,
    mlsId: null,
    mlsName: null,
    // Additional data
    priceHistory: [],
    taxHistory: [],
    section8: null,
    saleComps: [],
    rentComps: [],
  };
  
  const overrides = { arv: null, rent: null, rehabCost: null, purchasePrice: null, downPaymentPercent: null, interestRate: null, loanTermYears: null, targetBedrooms: null, targetBathrooms: null, holdingMonths: null, propertyTaxMonthly: null, insuranceMonthly: null, rentalInsuranceMonthly: null, stateTaxMonthly: null, hoaMonthly: null, utilitiesMonthly: null, propertyManagementPercent: null, maintenanceVacancyPercent: null, closingCostsPercent: null, closingCostsDollar: null, contingencyPercent: null, agentCommissionPercent: null, notaryFees: null, titleFees: null, hmlLoanType: null, hmlLtvPurchasePercent: null, hmlLtvRehabPercent: null, hmlPointsPercent: null, hmlInterestRate: null, hmlProcessingFee: null, hmlAppraisalCost: null, hmlUnderwritingFee: null, hmlOtherFees: null, hmlAnnualInsurance: null, refiLenderName: null, refiLtvPercent: null, refiInterestRate: null, refiAppraisalCost: null, refiUnderwritingFee: null, refiPointsPercent: null, refiOtherFees: null, refiClosingPercent: null, capexPercent: null, lotSizeSqft: null, holdingOtherMonthly: null, rentalAppraisalCost: null, rentalUnderwritingFee: null, rentalPointsPercent: null, rentalOtherFees: null };
  const financials = calculateFinancials(apiData, overrides);
  
  return {
    id: generateId(),
    address: {
      street,
      city: 'Sample City',
      state: 'US',
      zip,
      full: `${street}, Sample City, US ${zip}`,
    },
    status,
    source,
    apiData,
    overrides,
    financials,
    rejectionReason: status === 'not_relevant' ? 'Low cash-on-cash return' : null,
    notes,
    emailSubject: source === 'email' ? `New Property: ${street}` : null,
    emailDate: source === 'email' ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString() : null,
    emailId: source === 'email' ? `email_${generateId()}` : null,
    senderName: source === 'email' ? 'John Wholesaler' : null,
    senderEmail: source === 'email' ? 'john@wholesaledeals.com' : null,
    emailSnippet: source === 'email' ? `Great deal on ${street}. Contact me for details.` : null,
    createdAt: new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    owner: 'Default User',
    createdBy: null,
    isLocked: false,
    dealType: null,
    emailExtractedData: null,
  };
};

export const mockDeals: Deal[] = [
  // Great deals - Qualified
  createMockDeal('1234 Peachtree St NE', '30309', 'qualified', 185000, 280000, 1850, 35000, 2200, 1100, 4, 2, 1850, 1965, 'email', 'Great flip potential in Midtown'),
  createMockDeal('567 Memorial Dr SE', '30312', 'qualified', 145000, 225000, 1500, 25000, 1800, 900, 3, 2, 1400, 1958, 'email', 'Good rental area near BeltLine'),
  createMockDeal('890 Glenwood Ave SE', '30316', 'qualified', 165000, 260000, 1700, 30000, 2000, 1000, 3, 2, 1600, 1952, 'manual'),
  
  // Under analysis
  createMockDeal('2345 Ponce de Leon Ave NE', '30307', 'under_analysis', 220000, 310000, 2100, 40000, 2600, 1300, 4, 3, 2200, 1940, 'email'),
  createMockDeal('456 Edgewood Ave SE', '30312', 'under_analysis', 175000, 250000, 1650, 35000, 2100, 1050, 3, 2, 1500, 1955, 'email'),
  
  // New / Inbound
  createMockDeal('789 Ralph McGill Blvd NE', '30308', 'new', 195000, 285000, 1900, 38000, 2300, 1150, 4, 2, 1900, 1948, 'email'),
  createMockDeal('321 Auburn Ave NE', '30303', 'new', 155000, 235000, 1550, 28000, 1900, 950, 3, 2, 1350, 1960, 'email'),
  createMockDeal('654 Boulevard SE', '30312', 'new', 140000, 215000, 1450, 22000, 1700, 850, 3, 1, 1250, 1962, 'email'),
  
  // Offer sent
  createMockDeal('987 Moreland Ave SE', '30316', 'offer_sent', 178000, 275000, 1800, 32000, 2100, 1050, 4, 2, 1750, 1955, 'email', 'Offer submitted at $175k'),
  
  // Under contract
  createMockDeal('147 Dekalb Ave NE', '30307', 'under_contract', 168000, 265000, 1750, 28000, 2000, 1000, 3, 2, 1650, 1958, 'manual', 'Closing scheduled for next month'),
  
  // Closed
  createMockDeal('258 Flat Shoals Ave SE', '30316', 'closed', 152000, 240000, 1600, 25000, 1850, 925, 3, 2, 1450, 1960, 'email', 'Closed and rented'),
  
  // Not relevant - low returns
  createMockDeal('369 North Ave NE', '30308', 'not_relevant', 285000, 320000, 1800, 45000, 3400, 1700, 3, 2, 1600, 1945, 'email'),
  createMockDeal('741 Marietta St NW', '30318', 'not_relevant', 265000, 290000, 1650, 50000, 3200, 1600, 3, 2, 1400, 1950, 'email'),
  createMockDeal('852 Simpson St NW', '30314', 'not_relevant', 95000, 140000, 950, 40000, 1200, 600, 2, 1, 950, 1955, 'email'),
];
