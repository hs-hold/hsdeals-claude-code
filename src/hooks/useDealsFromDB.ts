import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Deal, DealStatus, DealOverrides } from '@/types/deal';
import { calculateFinancials } from '@/utils/financialCalculations';
import { extractArvFromSummary } from '@/utils/arv';
import { useSettings } from '@/context/SettingsContext';

interface DBDeal {
  id: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string | null;
  address_full: string;
  status: string;
  source: string;
  api_data: any;
  overrides: any;
  financials: any;
  rejection_reason: string | null;
  notes: string | null;
  email_subject: string | null;
  email_date: string | null;
  gmail_message_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
  email_snippet: string | null;
  created_at: string;
  updated_at: string;
  is_locked: boolean;
  deal_type: string | null;
  email_extracted_data: any;
}

function mapDBDealToDeal(dbDeal: DBDeal, loanDefaults?: ReturnType<typeof import('@/context/SettingsContext').useSettings>['settings']['loanDefaults']): Deal {
  const apiData = dbDeal.api_data || {};
  const overrides = dbDeal.overrides || { arv: null, rent: null, rehabCost: null, purchasePrice: null, downPaymentPercent: null, interestRate: null, loanTermYears: null };
  
  // Calculate financials if we have API data
  let financials = dbDeal.financials;
  if (apiData && Object.keys(apiData).length > 0) {
    financials = calculateFinancials(apiData, overrides, loanDefaults);
  }

  // Enrich saleComps with notes from rawResponse if missing
  // Try both possible paths: rawResponse.analysis.metrics.comps or rawResponse.data.analysis.metrics.comps
  const rawComps =
    apiData.rawResponse?.analysis?.metrics?.comps ||
    apiData.rawResponse?.data?.analysis?.metrics?.comps ||
    [];

  const normalizeAddr = (value: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  if (Array.isArray(apiData.saleComps) && apiData.saleComps.length > 0 && rawComps.length > 0) {
    apiData.saleComps = apiData.saleComps.map((comp: any) => {
      if (Array.isArray(comp?.notes) && comp.notes.length > 0) return comp;

      const byAddress = rawComps.find((rc: any) => normalizeAddr(rc?.address) === normalizeAddr(comp?.address));
      const byFacts =
        byAddress ||
        rawComps.find(
          (rc: any) =>
            (rc?.sale_price ?? null) === (comp?.salePrice ?? null) &&
            normalizeAddr(rc?.sale_date) === normalizeAddr(comp?.saleDate) &&
            (rc?.sqft ?? null) === (comp?.sqft ?? null)
        );

      const notes = byFacts?.similarity?.notes;
      return Array.isArray(notes) && notes.length > 0 ? { ...comp, notes } : comp;
    });
  }

  // Enrich taxHistory from rawResponse if missing (for existing deals)
  if (!Array.isArray(apiData.taxHistory) || apiData.taxHistory.length === 0) {
    const rawTaxHistory =
      apiData.rawResponse?.property?.tax_history ||
      apiData.rawResponse?.data?.property?.tax_history ||
      [];
    
    if (rawTaxHistory.length > 0) {
      apiData.taxHistory = rawTaxHistory.map((t: any) => ({
        time: t.time || 0,
        taxPaid: t.taxPaid ?? null,
        value: t.value ?? null,
        taxIncreaseRate: t.taxIncreaseRate,
        valueIncreaseRate: t.valueIncreaseRate,
      }));
    }
  }

  // Fix propertyTax: Use latest taxPaid from taxHistory if available (annual amount)
  // This fixes deals that were saved with monthly values instead of annual
  if (Array.isArray(apiData.taxHistory) && apiData.taxHistory.length > 0) {
    const latestTaxEntry = apiData.taxHistory.reduce((latest: any, entry: any) => 
      (!latest || (entry.time && entry.time > latest.time)) ? entry : latest, null
    );
    if (latestTaxEntry?.taxPaid && latestTaxEntry.taxPaid > (apiData.propertyTax ?? 0)) {
      // If taxHistory has a higher taxPaid value, use it (it's the correct annual amount)
      apiData.propertyTax = latestTaxEntry.taxPaid;
    }
  }

  // Fix ARV: Extract from AI summary if numeric field is 0 or missing
  // NOTE: Must be strict to avoid accidentally capturing other $ amounts (e.g. rent)
  if (!apiData.arv || apiData.arv === 0) {
    const aiSummary =
      apiData.aiSummary ||
      apiData.rawResponse?.analysis?.ai_summary ||
      apiData.rawResponse?.data?.analysis?.ai_summary;

    const extracted = extractArvFromSummary(aiSummary);
    if (extracted != null) {
      apiData.arv = extracted;
    }
  }

  const result: any = {
    id: dbDeal.id,
    address: {
      street: dbDeal.address_street,
      city: dbDeal.address_city,
      state: dbDeal.address_state,
      zip: dbDeal.address_zip || '',
      full: dbDeal.address_full,
    },
    status: dbDeal.status as DealStatus,
    source: dbDeal.source as 'email' | 'manual',
    apiData,
    overrides,
    financials,
    rejectionReason: dbDeal.rejection_reason,
    notes: dbDeal.notes || '',
    emailSubject: dbDeal.email_subject,
    emailDate: dbDeal.email_date,
    emailId: dbDeal.gmail_message_id,
    senderName: dbDeal.sender_name,
    senderEmail: dbDeal.sender_email,
    emailSnippet: dbDeal.email_snippet,
    createdAt: dbDeal.created_at,
    updatedAt: dbDeal.updated_at,
    owner: 'Default User',
    createdBy: (dbDeal as any).created_by || null,
    isLocked: dbDeal.is_locked || false,
    dealType: dbDeal.deal_type || null,
    emailExtractedData: dbDeal.email_extracted_data || null,
    _jobId: (dbDeal as any).job_id || null,
  };
  return result as Deal;
}

export function useDealsFromDB() {
  const { settings } = useSettings();
  const loanDefaults = settings.loanDefaults;
  
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedDeals = (data || []).map(d => mapDBDealToDeal(d, loanDefaults));
      
      // Deduplicate by normalized address - keep the most recent (first, since ordered desc)
      const seen = new Map<string, Deal>();
      for (const deal of mappedDeals) {
        const key = deal.address.full
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        if (!seen.has(key)) {
          seen.set(key, deal);
        }
      }
      setDeals(Array.from(seen.values()));
      setError(null);
    } catch (err) {
      console.error('Error fetching deals:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch deals');
    } finally {
      setIsLoading(false);
    }
  }, [loanDefaults]);

  useEffect(() => {
    fetchDeals();

    // Subscribe to realtime changes for auto-refresh
    const channel = supabase
      .channel('deals-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals',
        },
        () => {
          // Refetch deals when any change occurs
          fetchDeals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDeals]);

  const getDeal = useCallback((id: string) => {
    return deals.find(d => d.id === id);
  }, [deals]);

  const updateDealStatus = useCallback(async (id: string, status: DealStatus, rejectionReason?: string) => {
    // Note: Status changes (including close/not relevant) are allowed even for locked deals
    // Lock only prevents data changes (overrides, notes, etc.), not workflow status updates
    try {
      const { error } = await supabase
        .from('deals')
        .update({ 
          status, 
          rejection_reason: status === 'not_relevant' ? rejectionReason : null 
        })
        .eq('id', id);

      if (error) throw error;

      setDeals(prev => prev.map(deal => {
        if (deal.id !== id) return deal;
        return {
          ...deal,
          status,
          rejectionReason: status === 'not_relevant' ? (rejectionReason || deal.rejectionReason) : null,
          updatedAt: new Date().toISOString(),
        };
      }));
    } catch (err) {
      console.error('Error updating deal status:', err);
    }
  }, [deals]);

  const updateDealOverrides = useCallback(async (id: string, overrides: Partial<DealOverrides>) => {
    const deal = deals.find(d => d.id === id);
    if (!deal) return;
    
    // Check if deal is locked
    if (deal.isLocked) {
      console.warn('Cannot update locked deal');
      return;
    }

    const newOverrides = { ...deal.overrides, ...overrides };
    const financials = calculateFinancials(deal.apiData, newOverrides, loanDefaults);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase
        .from('deals')
        .update({ 
          overrides: newOverrides as any, 
          financials: financials as any 
        })
        .eq('id', id);

      if (error) throw error;

      setDeals(prev => prev.map(d => {
        if (d.id !== id) return d;
        return {
          ...d,
          overrides: newOverrides,
          financials,
          updatedAt: new Date().toISOString(),
        };
      }));
    } catch (err) {
      console.error('Error updating deal overrides:', err);
    }
  }, [deals]);
  
  const toggleDealLock = useCallback(async (id: string) => {
    const deal = deals.find(d => d.id === id);
    if (!deal) return;

    const newLockState = !deal.isLocked;

    try {
      const { error } = await supabase
        .from('deals')
        .update({ is_locked: newLockState })
        .eq('id', id);

      if (error) throw error;

      setDeals(prev => prev.map(d => {
        if (d.id !== id) return d;
        return {
          ...d,
          isLocked: newLockState,
          updatedAt: new Date().toISOString(),
        };
      }));
    } catch (err) {
      console.error('Error toggling deal lock:', err);
    }
  }, [deals]);
  
  const recalculateAllDealsFinancials = useCallback(async () => {
    // Recalculate financials for all unlocked deals
    // IMPORTANT: Clear ALL settings-related overrides so deals use current settings
    // Only keep core property data overrides (ARV, rent, rehabCost, purchasePrice)
    const unlockedDeals = deals.filter(d => !d.isLocked);
    
    for (const deal of unlockedDeals) {
      if (!deal.apiData || Object.keys(deal.apiData).length === 0) continue;
      
      // Keep only core property data overrides - clear all settings-related overrides
      const cleanedOverrides: DealOverrides = {
        // Keep property-specific overrides
        arv: deal.overrides.arv,
        rent: deal.overrides.rent,
        rehabCost: deal.overrides.rehabCost,
        purchasePrice: deal.overrides.purchasePrice,
        propertyTaxMonthly: deal.overrides.propertyTaxMonthly,
        insuranceMonthly: deal.overrides.insuranceMonthly,
        rentalInsuranceMonthly: deal.overrides.rentalInsuranceMonthly ?? null,
        stateTaxMonthly: deal.overrides.stateTaxMonthly,
        hoaMonthly: deal.overrides.hoaMonthly,
        utilitiesMonthly: deal.overrides.utilitiesMonthly,
        targetBedrooms: deal.overrides.targetBedrooms,
        targetBathrooms: deal.overrides.targetBathrooms,
        closingCostsDollar: deal.overrides.closingCostsDollar,
        notaryFees: deal.overrides.notaryFees,
        titleFees: deal.overrides.titleFees,
        
        // Clear ALL settings-related overrides so they use current defaults
        downPaymentPercent: null,
        interestRate: null,
        loanTermYears: null,
        holdingMonths: deal.overrides.holdingMonths,
        closingCostsPercent: null,
        contingencyPercent: null,
        agentCommissionPercent: null,
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
        propertyManagementPercent: null,
        maintenanceVacancyPercent: null,
        capexPercent: null,
        lotSizeSqft: deal.overrides.lotSizeSqft ?? null,
        holdingOtherMonthly: deal.overrides.holdingOtherMonthly ?? null,
        rentalAppraisalCost: deal.overrides.rentalAppraisalCost ?? null,
        rentalUnderwritingFee: deal.overrides.rentalUnderwritingFee ?? null,
        rentalPointsPercent: deal.overrides.rentalPointsPercent ?? null,
        rentalOtherFees: deal.overrides.rentalOtherFees ?? null,
      };
      
      const financials = calculateFinancials(deal.apiData, cleanedOverrides, loanDefaults);
      
      try {
        await supabase
          .from('deals')
          .update({ 
            overrides: cleanedOverrides as any,
            financials: financials as any 
          })
          .eq('id', deal.id);
      } catch (err) {
        console.error('Error recalculating deal financials:', err);
      }
    }
    
    // Refetch to get updated data
    await fetchDeals();
  }, [deals, fetchDeals, loanDefaults]);

  const updateDealNotes = useCallback(async (id: string, notes: string) => {
    // Check if deal is locked
    const deal = deals.find(d => d.id === id);
    if (deal?.isLocked) {
      console.warn('Cannot update locked deal');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('deals')
        .update({ notes })
        .eq('id', id);

      if (error) throw error;

      setDeals(prev => prev.map(deal => {
        if (deal.id !== id) return deal;
        return {
          ...deal,
          notes,
          updatedAt: new Date().toISOString(),
        };
      }));
    } catch (err) {
      console.error('Error updating deal notes:', err);
    }
  }, [deals]);

  const analyzeDeal = useCallback(async (id: string) => {
    const MAX_ANALYSIS_PRICE = 300000;
    const deal = deals.find(d => d.id === id);
    if (!deal) throw new Error('Deal not found');

    // Check if deal price exceeds budget limit
    const dealPrice = deal.overrides?.purchasePrice ?? deal.apiData?.purchasePrice ?? 0;
    if (dealPrice > MAX_ANALYSIS_PRICE) {
      throw new Error(`Deal price ($${dealPrice.toLocaleString()}) exceeds $${MAX_ANALYSIS_PRICE.toLocaleString()} limit. Skipping analysis.`);
    }

    // Call the analyze-property edge function
    const { data, error } = await supabase.functions.invoke('analyze-property', {
      body: {
        address: deal.address.full,
      },
    });

    if (error) throw error;

    // Extract data from nested API response - prioritize analysis.metrics over property data
    const property = data?.data?.property || data?.property || {};
    const analysis = data?.data?.analysis || data?.analysis || {};
    const metrics = analysis?.metrics || {};
    
    // Map API response to our apiData format
    // IMPORTANT: Use analysis.metrics values (AI analysis) over property values (Zillow estimates)
    const attribution = property.attributionInfo || {};
    const listedBy = property.listed_by || {};
    
    // Get latest property tax from tax_history (most accurate source)
    const taxHistory = property.tax_history || [];
    const latestTaxHistory = taxHistory.length > 0 
      ? taxHistory.reduce((latest: any, entry: any) => 
          !latest || (entry.time && entry.time > latest.time) ? entry : latest, null)
      : null;
    const latestTaxPaid = latestTaxHistory?.taxPaid;
    
    // Priority for propertyTax (annual):
    // 1. Latest taxPaid from tax_history (most accurate)
    // 2. API monthly_property_taxes * 12
    // 3. Fallback calculation
    const propertyTaxAnnual = latestTaxPaid 
      || (metrics.monthly_property_taxes ? metrics.monthly_property_taxes * 12 : null) 
      || (property.latest_tax_assessment ? Math.round(property.latest_tax_assessment * (property.propertyTaxRate || 0.01)) : null);
    
    // Extract ARV - prefer numeric field, fallback to extracting from AI summary
    const numericArv = metrics.arv;
    const arv = (numericArv && numericArv > 0) ? numericArv : extractArvFromSummary(analysis.ai_summary);
    
    const apiData = {
      // Core property values from AI analysis metrics
      arv: arv,
      purchasePrice: analysis.asking_price || property.price || property.asking_price || null,
      rent: metrics.monthly_rent || null,
      rehabCost: metrics.rehab_cost || null,
      propertyTax: propertyTaxAnnual,
      insurance: metrics.monthly_insurance ? metrics.monthly_insurance * 12 : (property.annual_homeowners_insurance || null),
      
      // Property details
      bedrooms: analysis.bedrooms || property.bedrooms || null,
      bathrooms: analysis.bathrooms || property.bathrooms || null,
      sqft: analysis.living_area || property.living_area || null,
      yearBuilt: property.year_built || null,
      propertyType: property.property_type || null,
      lotSize: property.lot_area || null,
      
      // Location & Listing
      latitude: analysis.latitude || property.latitude || null,
      longitude: analysis.longitude || property.longitude || null,
      daysOnMarket: property.days_on_zillow || null,
      daysOnMarketFetchedAt: new Date().toISOString(),
      county: property.county || null,
      detailUrl: analysis.detail_url || property.detail_url || null,
      imgSrc: analysis.img_src || property.img_src || null,
      
      // Location scores
      crimeScore: null,
      schoolScore: null,
      medianIncome: null,
      neighborhoodRating: analysis.grade || null,
      
      // AI Analysis values - USE THESE DIRECTLY, don't recalculate!
      grade: analysis.grade || null,
      aiSummary: analysis.ai_summary || null,
      monthlyCashFlow: metrics.monthly_cash_flow || null,
      cashOnCashRoi: metrics.cash_on_cash_roi || null,
      capRate: metrics.cap_rate || null,
      monthlyExpenses: metrics.monthly_expenses || null,
      monthlyPiti: metrics.monthly_piti || null,
      monthlyMortgage: metrics.monthly_mortgage_payment || null,
      downPayment: metrics.down_payment || null,
      loanAmount: metrics.loan_amount || null,
      wholesalePrice: metrics.wholesale_price || null,
      arvMargin: metrics.arv_margin || null,
      
      // Agent / Broker info
      agentName: attribution.agentName || listedBy.display_name || null,
      agentEmail: attribution.agentEmail || null,
      agentPhone: attribution.agentPhoneNumber || listedBy.phone || null,
      agentLicense: attribution.agentLicenseNumber || null,
      brokerName: attribution.brokerName || listedBy.business_name || null,
      brokerPhone: attribution.brokerPhoneNumber || null,
      mlsId: attribution.mlsId || null,
      mlsName: attribution.mlsName || null,
      
      // Additional data
      priceHistory: (property.priceHistory || []).map((h: any) => ({
        date: h.date || (h.time ? new Date(h.time * 1000).toISOString().split('T')[0] : null),
        price: h.price || 0,
        event: h.event || 'Unknown',
      })).filter((h: any) => h.price > 0),
      
      taxHistory: (property.tax_history || []).map((t: any) => ({
        time: t.time || 0,
        taxPaid: t.taxPaid ?? null,
        value: t.value ?? null,
        taxIncreaseRate: t.taxIncreaseRate,
        valueIncreaseRate: t.valueIncreaseRate,
      })),
      
      section8: metrics.section8 ? {
        areaName: metrics.section8.areaName || '',
        minRent: metrics.section8.minRent || 0,
        maxRent: metrics.section8.maxRent || 0,
        bedrooms: metrics.section8.bedrooms || 0,
      } : null,
      
      saleComps: (metrics.comps || []).slice(0, 4).map((c: any) => ({
        address: c.address || '',
        salePrice: c.sale_price || 0,
        saleDate: c.sale_date || '',
        bedrooms: c.bedrooms || 0,
        bathrooms: c.bathrooms || 0,
        sqft: c.sqft || 0,
        distance: c.distance || 0,
        similarityScore: c.similarity?.overall_score || 0,
        notes: c.similarity?.notes || [],
      })),
      
      rentComps: (metrics.rent_comps || []).map((r: any) => ({
        address: r.address || '',
        bedrooms: r.bedrooms || 0,
        bathrooms: r.bathrooms || 0,
        sqft: r.sqft || 0,
        originalRent: r.originalRent || 0,
        adjustedRent: r.adjustedRent || 0,
        adjustment: r.adjustment || 0,
        adjustmentReason: r.adjustmentReason || '',
      })),
      
      // Store the full API response for reference
      rawResponse: data,
    };

    // Calculate financials with new API data
    const financials = calculateFinancials(apiData, deal.overrides, loanDefaults);

    // Update the database
    const { error: updateError } = await supabase
      .from('deals')
      .update({
        api_data: apiData as any,
        financials: financials as any,
        status: 'under_analysis',
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Update local state
    setDeals(prev => prev.map(d => {
      if (d.id !== id) return d;
      return {
        ...d,
        apiData,
        financials,
        status: 'under_analysis' as DealStatus,
        updatedAt: new Date().toISOString(),
      };
    }));

    return data;
  }, [deals]);

  const refreshDealFromApi = useCallback(async (id: string) => {
    return analyzeDeal(id);
  }, [analyzeDeal]);

  return {
    deals,
    isLoading,
    error,
    getDeal,
    updateDealStatus,
    updateDealOverrides,
    updateDealNotes,
    analyzeDeal,
    refreshDealFromApi,
    refetch: fetchDeals,
    toggleDealLock,
    recalculateAllDealsFinancials,
  };
}
