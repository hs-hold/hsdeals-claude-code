import { supabase } from '@/integrations/supabase/client';
import type { ApiResponse, PropertyAnalysis, PropertyData } from '@/types/apiResponse';
import type { DealApiData, DealOverrides } from '@/types/deal';
import { calculateFinancials } from '@/utils/financialCalculations';
import { coerceLotSizeSqft } from '@/utils/lotSize';
import { extractArvFromSummary } from '@/utils/arv';

const defaultOverrides: DealOverrides = {
  arv: null,
  rent: null,
  rehabCost: null,
  purchasePrice: null,
  downPaymentPercent: null,
  interestRate: null,
  loanTermYears: null,
  targetBedrooms: null,
  targetBathrooms: null,
  holdingMonths: null,
  propertyTaxMonthly: null,
  insuranceMonthly: null,
  rentalInsuranceMonthly: null,
  stateTaxMonthly: null,
  hoaMonthly: null,
  utilitiesMonthly: null,
  propertyManagementPercent: null,
  maintenanceVacancyPercent: null,
  closingCostsPercent: null,
  closingCostsDollar: null,
  contingencyPercent: null,
  agentCommissionPercent: null,
  notaryFees: null,
  titleFees: null,
  hmlLoanType: null,
  hmlLtvPurchasePercent: null,
  hmlLtvRehabPercent: null,
  hmlPointsPercent: null,
  hmlInterestRate: null,
  hmlProcessingFee: null,
  hmlAppraisalCost: null,
  hmlUnderwritingFee: null,
  hmlOtherFees: null,
  hmlAnnualInsurance: null,
  refiLenderName: null,
  refiLtvPercent: null,
  refiInterestRate: null,
  refiAppraisalCost: null,
  refiUnderwritingFee: null,
  refiPointsPercent: null,
  refiOtherFees: null,
  refiClosingPercent: null,
  capexPercent: null,
  lotSizeSqft: null,
  holdingOtherMonthly: null,
  rentalAppraisalCost: null,
  rentalUnderwritingFee: null,
  rentalPointsPercent: null,
  rentalOtherFees: null,
};


function mapToDealApiData(analysis: PropertyAnalysis, property?: PropertyData): DealApiData {
  const mapPropertyType = (type?: string): DealApiData['propertyType'] => {
    const typeMap: Record<string, DealApiData['propertyType']> = {
      SINGLE_FAMILY: 'single_family',
      MULTI_FAMILY: 'multi_family',
      CONDO: 'condo',
      TOWNHOUSE: 'townhouse',
      DUPLEX: 'duplex',
      TRIPLEX: 'triplex',
      FOURPLEX: 'fourplex',
    };
    return typeMap[type?.toUpperCase() || ''] || 'other';
  };

  const buildingSqft = analysis.living_area ?? property?.living_area ?? property?.sqft ?? null;
  const lotSqft = coerceLotSizeSqft(property?.lot_area ?? null, buildingSqft).sqft;

  // Get ARV - prefer numeric field, fallback to extracting from AI summary
  const numericArv = analysis.metrics?.arv;
  const arv = (numericArv && numericArv > 0) ? numericArv : extractArvFromSummary(analysis.ai_summary);

  return {
    // Property basics
    arv: arv,
    sellerArv: null, // Populated later from emailExtractedData if available
    purchasePrice: analysis.asking_price ?? null,
    rent: analysis.metrics?.monthly_rent ?? null,
    rehabCost: analysis.metrics?.rehab_cost ?? null,
    propertyTax: analysis.metrics?.monthly_property_taxes ?? null,
    insurance: analysis.metrics?.monthly_insurance ?? null,
    bedrooms: analysis.bedrooms ?? null,
    bathrooms: analysis.bathrooms ?? null,
    sqft: analysis.living_area ?? null,
    yearBuilt: property?.year_built ?? null,
    propertyType: mapPropertyType(property?.property_type),
    lotSize: lotSqft,

    // Location & Listing
    latitude: analysis.latitude ?? property?.latitude ?? null,
    longitude: analysis.longitude ?? property?.longitude ?? null,
    daysOnMarket: property?.days_on_zillow ?? null,
    daysOnMarketFetchedAt: new Date().toISOString(),
    county: property?.county ?? null,
    detailUrl: analysis.detail_url ?? property?.detail_url ?? null,
    imgSrc: analysis.img_src ?? property?.img_src ?? null,

    // Location scores
    crimeScore: null,
    schoolScore: null,
    medianIncome: null,
    neighborhoodRating: null,

    // AI Analysis values
    grade: analysis.grade ?? null,
    aiSummary: analysis.ai_summary ?? null,
    monthlyCashFlow: analysis.metrics?.monthly_cash_flow ?? null,
    cashOnCashRoi: analysis.metrics?.cash_on_cash_roi ?? null,
    capRate: analysis.metrics?.cap_rate ?? null,
    monthlyExpenses: analysis.metrics?.monthly_expenses ?? null,
    monthlyPiti: analysis.metrics?.monthly_piti ?? null,
    monthlyMortgage: analysis.metrics?.monthly_mortgage_payment ?? null,
    downPayment: analysis.metrics?.down_payment ?? null,
    loanAmount: analysis.metrics?.loan_amount ?? null,
    wholesalePrice: analysis.metrics?.wholesale_price ?? null,
    arvMargin: analysis.metrics?.arv_margin ?? null,

    // Agent / Broker info
    agentName: property?.attributionInfo?.agentName ?? null,
    agentEmail: property?.attributionInfo?.agentEmail ?? null,
    agentPhone: property?.attributionInfo?.agentPhoneNumber ?? null,
    agentLicense: property?.attributionInfo?.agentLicenseNumber ?? null,
    brokerName: property?.attributionInfo?.brokerName ?? null,
    brokerPhone: property?.attributionInfo?.brokerPhoneNumber ?? null,
    mlsId: property?.attributionInfo?.mlsId ?? null,
    mlsName: property?.attributionInfo?.mlsName ?? null,

    // Additional data
    priceHistory:
      property?.priceHistory?.map((p) => ({
        date: p.date || '',
        price: p.price || 0,
        event: p.event || '',
      })) || [],
    taxHistory:
      property?.tax_history?.map((t) => ({
        time: t.time || 0,
        taxPaid: t.taxPaid ?? null,
        value: t.value ?? null,
        taxIncreaseRate: t.taxIncreaseRate,
        valueIncreaseRate: t.valueIncreaseRate,
      })) || [],
    section8: analysis.metrics?.section8
      ? {
          areaName: analysis.metrics.section8.areaName || '',
          minRent: analysis.metrics.section8.minRent || 0,
          maxRent: analysis.metrics.section8.maxRent || 0,
          bedrooms: analysis.metrics.section8.bedrooms || 0,
        }
      : null,
    saleComps:
      analysis.metrics?.comps?.map((c) => ({
        address: c.address || '',
        salePrice: c.sale_price || 0,
        saleDate: c.sale_date || '',
        bedrooms: c.bedrooms || 0,
        bathrooms: c.bathrooms || 0,
        sqft: c.sqft || 0,
        distance: c.distance || 0,
        similarityScore: c.similarity?.overall_score || 0,
      })) || [],
    rentComps:
      analysis.metrics?.rent_comps?.map((c) => ({
        address: c.address || '',
        originalRent: c.originalRent || c.adjustedRent || 0,
        adjustedRent: c.adjustedRent || 0,
        bedrooms: c.bedrooms || 0,
        bathrooms: c.bathrooms || 0,
        sqft: c.sqft || 0,
        adjustment: c.adjustment || 0,
        adjustmentReason: c.adjustmentReason || '',
      })) || [],

    rawResponse: { analysis, property },
  };
}

async function updateDealInDb(id: string, analysisData: PropertyAnalysis, propertyData?: PropertyData, scoutAiData?: Record<string, any>): Promise<string | null> {
  try {
    const apiData = mapToDealApiData(analysisData, propertyData);
    const financials = calculateFinancials(apiData, defaultOverrides);
    const { error } = await supabase
      .from('deals')
      .update({
        api_data: apiData,
        financials,
        scout_ai_data: scoutAiData || null,
        analyzed_at: new Date().toISOString(),
        status: 'new',
      })
      .eq('id', id);
    if (error) { console.error('Error updating deal:', error); return null; }
    return id;
  } catch (err) {
    console.error('Error:', err);
    return null;
  }
}

async function saveDealToDb(analysisData: PropertyAnalysis, propertyData?: PropertyData, scoutAiData?: Record<string, any>): Promise<string | null> {
  try {
    const addressParts = analysisData.address?.split(',').map((s) => s.trim()) || [];
    const street = addressParts[0] || analysisData.address || '';
    const city = analysisData.city || addressParts[1] || '';
    const stateZip = addressParts[2] || '';
    const [state, zip] = stateZip.split(' ').filter(Boolean);

    const apiData = mapToDealApiData(analysisData, propertyData);
    const financials = calculateFinancials(apiData, defaultOverrides);

    // Get current user for created_by
    const { data: { user: currentUser } } = await supabase.auth.getUser();

    const dealInsert: any = {
      address_full: analysisData.address,
      address_street: street,
      address_city: city,
      address_state: state || '',
      address_zip: zip || null,
      source: scoutAiData ? 'scout' : 'manual',
      status: 'new',
      api_data: apiData,
      financials: financials,
      created_by: currentUser?.id || null,
      scout_ai_data: scoutAiData || null,
      analyzed_at: new Date().toISOString(),
    };

    const { data: insertedDeal, error } = await supabase
      .from('deals')
      .insert([dealInsert])
      .select('id')
      .single();

    if (error) {
      console.error('Error saving deal:', error);
      return null;
    }

    return insertedDeal.id;
  } catch (err) {
    console.error('Error:', err);
    return null;
  }
}

export async function analyzeAndCreateDeal(address: string, scoutAiData?: Record<string, any>): Promise<{ dealId: string | null; error?: string; alreadyExists?: boolean }> {
  try {
    // Dedup check — skip only if this address was already analyzed
    const { data: existing } = await supabase
      .from('deals')
      .select('id, api_data')
      .ilike('address_full', address.trim())
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const existingApiData = existing.api_data || {};
      const alreadyAnalyzed = !!(
        existingApiData.arv ||
        existingApiData.purchasePrice ||
        existingApiData.grade ||
        existingApiData.aiSummary ||
        (existingApiData.rawResponse && Object.keys(existingApiData.rawResponse).length > 0)
      );
      if (alreadyAnalyzed) {
        return { dealId: existing.id, alreadyExists: true };
      }
      // Existing deal is not analyzed — fall through to re-analyze and update it
    }

    const { data, error } = await supabase.functions.invoke('analyze-property', {
      body: {
        address: address.trim(),
      },
    });

    if (error) {
      console.error('Function error:', error);
      return { dealId: null, error: 'Failed to analyze property' };
    }

    const apiResponse = data as ApiResponse;

    if (!apiResponse?.success || !apiResponse.data?.analysis) {
      return { dealId: null, error: apiResponse?.error || 'Analysis failed' };
    }

    // If an unanalyzed deal exists, update it instead of inserting a duplicate
    const dealId = existing?.id
      ? await updateDealInDb(existing.id, apiResponse.data.analysis, apiResponse.data.property, scoutAiData)
      : await saveDealToDb(apiResponse.data.analysis, apiResponse.data.property, scoutAiData);
    if (!dealId) return { dealId: null, error: 'Property analyzed but failed to save' };

    return { dealId };
  } catch (err) {
    console.error('Error:', err);
    return { dealId: null, error: 'Failed to connect to analysis service' };
  }
}
