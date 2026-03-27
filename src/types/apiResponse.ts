// Rent Comparable from API
export interface RentComp {
  address?: string;
  adjustedRent?: number;
  adjustment?: number;
  adjustmentReason?: string;
  bathrooms?: number;
  bedrooms?: number;
  originalRent?: number;
  source?: string;
  sqft?: number;
}

// Sale Comparable from API
export interface SaleComp {
  address?: string;
  bathrooms?: number;
  bedrooms?: number;
  distance?: number;
  is_in_arv?: boolean;
  latitude?: number;
  longitude?: number;
  lot_size?: number | null;
  property_type?: string;
  sale_date?: string;
  sale_price?: number;
  sqft?: number;
  year_built?: number | null;
  zpid?: string;
  similarity?: {
    overall_score?: number;
    summary_reason?: string;
    notes?: string[];
    excluded?: boolean;
    exclusion_reason?: {
      code?: string;
      tooltip?: string;
    } | null;
  };
}

// Section 8 data
export interface Section8Data {
  areaName?: string;
  bedrooms?: number;
  maxRent?: number;
  minRent?: number;
  source?: string;
  zipCode?: string;
}

// Analysis metrics from the AI
export interface AnalysisMetrics {
  arv?: number;
  arv_margin?: number;
  arv_percentage?: number;
  cap_rate?: number;
  cash_on_cash_roi?: number;
  down_payment?: number;
  interest_rate?: number;
  is_cash_offer?: boolean;
  loan_amount?: number;
  monthly_cash_flow?: number;
  monthly_expenses?: number;
  monthly_insurance?: number;
  monthly_mortgage_payment?: number;
  monthly_piti?: number;
  monthly_property_taxes?: number;
  monthly_rent?: number;
  rehab_cost?: number;
  rent_comparable_count?: number;
  rent_comps?: RentComp[];
  rent_is_estimate?: boolean;
  section8?: Section8Data;
  validated_arv?: number;
  wholesale_price?: number;
  zestimate?: number;
  comps?: SaleComp[];
}

// Full analysis object from API
export interface PropertyAnalysis {
  address?: string;
  ai_summary?: string;
  asking_price?: number;
  bathrooms?: number;
  bedrooms?: number;
  city?: string;
  state?: string;
  detail_url?: string;
  grade?: string;
  img_src?: string;
  latitude?: number;
  longitude?: number;
  living_area?: number;
  metrics: AnalysisMetrics;
}

// Listing agent info from attributionInfo
export interface ListingAgent {
  associatedAgentType?: string;
  memberFullName?: string;
  memberStateLicense?: string;
}

// Listing office info
export interface ListingOffice {
  associatedOfficeType?: string;
  officeName?: string;
}

// Attribution info (MLS and agent data)
export interface AttributionInfo {
  agentEmail?: string | null;
  agentLicenseNumber?: string | null;
  agentName?: string | null;
  agentPhoneNumber?: string | null;
  brokerName?: string | null;
  brokerPhoneNumber?: string | null;
  mlsId?: string | null;
  mlsName?: string | null;
  listingAgreement?: string | null;
  lastChecked?: string | null;
  lastUpdated?: string | null;
  trueStatus?: string | null;
  listingAgents?: ListingAgent[];
  listingOffices?: ListingOffice[];
}

// Price history event
export interface PriceHistoryEvent {
  date?: string;
  price?: number;
  time?: number;
  pricePerSquareFoot?: number;
  priceChangeRate?: number;
  event?: string;
  source?: string;
  postingIsRental?: boolean;
  sellerAgent?: {
    name?: string;
    profileUrl?: string;
  } | null;
  buyerAgent?: {
    name?: string;
    profileUrl?: string;
  } | null;
}

// Tax history record
export interface TaxHistoryRecord {
  time?: number;
  taxPaid?: number | null;
  taxIncreaseRate?: number;
  value?: number;
  valueIncreaseRate?: number;
}

// Listed by info
export interface ListedByInfo {
  agent_reason?: number;
  badge_type?: string;
  business_name?: string;
  display_name?: string;
  image_url?: string;
  phone?: string;
  profile_url?: string;
  rating_average?: number;
  recent_sales?: number;
  review_count?: number;
  zpro?: boolean;
  zuid?: string;
}

// Full property data from API
export interface PropertyData {
  address?: string;
  asking_price?: number;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  living_area?: number;
  sqft?: number;
  lot_area?: number;
  year_built?: number;
  property_type?: string;
  zestimate?: number;
  rent_zestimate?: number;
  img_src?: string;
  detail_url?: string;
  days_on_zillow?: number;
  homeStatus?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  county?: string;
  zip_code?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  brokerageName?: string;
  
  // MLS and agent info
  attributionInfo?: AttributionInfo;
  listed_by?: ListedByInfo;
  
  // History
  priceHistory?: PriceHistoryEvent[];
  tax_history?: TaxHistoryRecord[];
  
  // Latest tax info
  latest_tax_assessment?: number;
  
  // Additional property details
  annual_homeowners_insurance?: number;
  monthlyHoaFee?: number | null;
  propertyTaxRate?: number;
}

// Full API response structure
export interface ApiResponse {
  success: boolean;
  data?: {
    success?: boolean;
    property?: PropertyData;
    analysis?: PropertyAnalysis;
  };
  error?: string;
  details?: string;
}
