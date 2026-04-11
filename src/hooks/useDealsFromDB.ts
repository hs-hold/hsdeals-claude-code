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
  gmail_thread_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
  email_snippet: string | null;
  created_at: string;
  updated_at: string;
  analyzed_at: string | null;
  is_locked: boolean;
  is_off_market: boolean;
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
    gmailThreadId: dbDeal.gmail_thread_id || null,
    senderName: dbDeal.sender_name,
    senderEmail: dbDeal.sender_email,
    emailSnippet: dbDeal.email_snippet,
    createdAt: dbDeal.created_at,
    updatedAt: dbDeal.updated_at,
    analyzedAt: dbDeal.analyzed_at,
    owner: 'Default User',
    createdBy: (dbDeal as any).created_by || null,
    isLocked: dbDeal.is_locked || false,
    isOffMarket: dbDeal.is_off_market || false,
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

      // Deduplicate by normalized address.
      // Priority: analyzed deal > unanalyzed deal (regardless of creation date).
      // Tie-break: most recently updated/created wins.
      const seen = new Map<string, Deal>();
      for (const deal of mappedDeals) {
        const key = deal.address.full
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, deal);
        } else {
          // Prefer the analyzed deal; if both have same analysis state, keep most recent
          const dealAnalyzed = !!(deal.apiData && Object.keys(deal.apiData).length > 0 &&
            (deal.apiData.grade || deal.apiData.aiSummary || deal.apiData.rawResponse || (deal.apiData.arv && deal.apiData.arv > 0)));
          const existingAnalyzed = !!(existing.apiData && Object.keys(existing.apiData).length > 0 &&
            (existing.apiData.grade || existing.apiData.aiSummary || existing.apiData.rawResponse || (existing.apiData.arv && existing.apiData.arv > 0)));
          if (dealAnalyzed && !existingAnalyzed) {
            seen.set(key, deal); // replace unanalyzed with analyzed
          }
          // if existing is already analyzed (or both unanalyzed), keep existing (more recent created_at)
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

    // Try local state first; if not found (e.g. newly inserted deal, stale closure),
    // fall back to a direct DB fetch so analysis always works immediately after creation.
    let deal = deals.find(d => d.id === id);
    if (!deal) {
      const { data: dbRow, error: fetchErr } = await supabase
        .from('deals')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr || !dbRow) throw new Error('Deal not found');
      deal = mapDBDealToDeal(dbRow as DBDeal, loanDefaults);
    }

    // Block analysis for addresses with no street number — DealBeast cannot work without one
    const hasStreetNumber = /^\d+\s/.test(deal.address.street?.trim() || '');
    if (!hasStreetNumber) {
      throw new Error(`Address "${deal.address.full}" has no street number — cannot analyze. Please edit the address first.`);
    }

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

    // Extract data from nested API response.
    // API shape A (with analysis key): { success, data: { analysis: {...}, property: {...} } }
    // API shape B (property only):     { success, data: { success, property: {...} } }
    // In shape B, 'analysis' is absent — fall back to the property object so field lookups
    // like analysis.grade / analysis.ai_summary / analysis.metrics still resolve correctly.
    const inner    = data?.data || data;
    const property = inner?.property || {};
    const analysis = inner?.analysis || inner?.property || {};
    // metrics may live at analysis.metrics OR as top-level fields on the property/analysis object
    const metrics  = analysis?.metrics || property?.metrics || {};
    
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
    
    // Extract ARV — prefer validated_arv (confirmed by comps), fall back to metrics.arv
    const numericArv = metrics.validated_arv ?? metrics.arv ?? analysis.arv ?? property.arv ?? null;
    const aiSummaryText = analysis.ai_summary || analysis.aiSummary || property.ai_summary || property.aiSummary || null;
    const arv = (numericArv && numericArv > 0) ? numericArv : extractArvFromSummary(aiSummaryText);

    console.log('[analyzeDeal] inner keys:', Object.keys(inner));
    console.log('[analyzeDeal] analysis keys:', Object.keys(analysis));
    console.log('[analyzeDeal] metrics keys:', Object.keys(metrics));
    console.log('[analyzeDeal] arv:', arv, '| grade:', analysis.grade ?? property.grade, '| rent:', metrics.monthly_rent ?? property.monthly_rent);

    const apiData = {
      // Core property values from AI analysis metrics
      arv: arv,
      sellerArv: null as number | null, // Populated below from emailExtractedData if available
      purchasePrice: analysis.asking_price || analysis.price || property.price || property.asking_price || null,
      rent: metrics.monthly_rent || property.monthly_rent || null,
      rehabCost: metrics.rehab_cost || property.rehab_cost || null,
      propertyTax: propertyTaxAnnual,
      insurance: metrics.monthly_insurance ? metrics.monthly_insurance * 12 : (property.annual_homeowners_insurance || null),

      // Property details
      bedrooms: analysis.bedrooms || property.bedrooms || null,
      bathrooms: analysis.bathrooms || property.bathrooms || null,
      sqft: analysis.living_area || analysis.sqft || property.living_area || property.sqft || null,
      yearBuilt: property.year_built || analysis.year_built || null,
      propertyType: property.property_type || analysis.property_type || null,
      lotSize: property.lot_area || analysis.lot_area || null,

      // Location & Listing
      latitude: analysis.latitude || property.latitude || null,
      longitude: analysis.longitude || property.longitude || null,
      daysOnMarket: property.days_on_zillow || null,
      daysOnMarketFetchedAt: new Date().toISOString(),
      county: property.county || analysis.county || null,
      detailUrl: analysis.detail_url || property.detail_url || null,
      imgSrc: analysis.img_src || property.img_src || null,

      // Location scores
      crimeScore: null,
      schoolScore: null,
      medianIncome: null,
      neighborhoodRating: analysis.grade || property.grade || null,

      // AI Analysis values - USE THESE DIRECTLY, don't recalculate!
      grade: analysis.grade || property.grade || null,
      aiSummary: aiSummaryText,
      monthlyCashFlow: metrics.monthly_cash_flow || property.monthly_cash_flow || null,
      cashOnCashRoi: metrics.cash_on_cash_roi || property.cash_on_cash_roi || null,
      capRate: metrics.cap_rate || property.cap_rate || null,
      monthlyExpenses: metrics.monthly_expenses || property.monthly_expenses || null,
      monthlyPiti: metrics.monthly_piti || property.monthly_piti || null,
      monthlyMortgage: metrics.monthly_mortgage_payment || property.monthly_mortgage_payment || null,
      downPayment: metrics.down_payment || property.down_payment || null,
      loanAmount: metrics.loan_amount || property.loan_amount || null,
      wholesalePrice: metrics.wholesale_price || property.wholesale_price || null,
      arvMargin: metrics.arv_margin || property.arv_margin || null,
      
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
      
      section8: (() => { const s8 = metrics.section8 || property.section8 || null; return s8 ? { areaName: s8.areaName || '', minRent: s8.minRent || 0, maxRent: s8.maxRent || 0, bedrooms: s8.bedrooms || 0 } : null; })(),

      saleComps: (metrics.comps || property.comps || property.saleComps || []).slice(0, 4).map((c: any) => ({
        address: c.address || '',
        salePrice: c.sale_price || 0,
        saleDate: c.sale_date || '',
        bedrooms: c.bedrooms || 0,
        bathrooms: c.bathrooms || 0,
        sqft: c.sqft || 0,
        distance: c.distance || 0,
        similarityScore: c.similarity?.overall_score || 0,
        notes: c.similarity?.notes || [],
        daysOnMarket: c.days_on_market ?? c.daysOnMarket ?? null,
      })),
      
      rentComps: (metrics.rent_comps || property.rent_comps || property.rentComps || []).map((r: any) => ({
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

    // Merge trusted email-extracted fields into API data gaps.
    // Factual property attributes from the seller's own listing are often more accurate
    // than Zillow estimates for off-market / wholesaler deals.
    // NEVER merge: arv, rent, capRate, cashFlow — get these from DealBeast API only.
    const emailData = deal.emailExtractedData;
    if (emailData && typeof emailData === 'object') {
      const trusted = emailData as any;
      if (!apiData.bedrooms   && trusted.bedrooms)    apiData.bedrooms    = trusted.bedrooms;
      if (!apiData.bathrooms  && trusted.bathrooms)   apiData.bathrooms   = trusted.bathrooms;
      if (!apiData.sqft       && trusted.sqft)        apiData.sqft        = trusted.sqft;
      if (!apiData.yearBuilt  && trusted.yearBuilt)   apiData.yearBuilt   = trusted.yearBuilt;
      if (!apiData.lotSize    && trusted.lotSize)     apiData.lotSize     = trusted.lotSize;
      if (!apiData.propertyType && trusted.propertyType) apiData.propertyType = trusted.propertyType;
      // Seller ARV is stored separately — used as a cap in financialCalculations
      if (trusted.arv) apiData.sellerArv = trusted.arv;
    }

    // Verify purchasePrice override from email is preserved
    // (already set in overrides.purchasePrice when deal was created from email)

    // Calculate financials with new API data
    const financials = calculateFinancials(apiData, deal.overrides, loanDefaults);

    console.log('[analyzeDeal] saving to DB — arv:', apiData.arv, 'grade:', apiData.grade, 'aiSummary:', !!apiData.aiSummary, 'rawResponse:', !!apiData.rawResponse);

    const nowIso = new Date().toISOString();

    // Update the database
    const { error: updateError } = await supabase
      .from('deals')
      .update({
        api_data: apiData as any,
        financials: financials as any,
        status: 'under_analysis',
        analyzed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', id);

    if (updateError) {
      console.error('[analyzeDeal] DB update error:', updateError);
      throw updateError;
    }
    console.log('[analyzeDeal] DB update success for deal:', id);

    // Update local state
    setDeals(prev => prev.map(d => {
      if (d.id !== id) return d;
      return {
        ...d,
        apiData,
        financials,
        status: 'under_analysis' as DealStatus,
        analyzedAt: nowIso,
        updatedAt: nowIso,
      };
    }));

    return data;
  }, [deals]);

  const refreshDealFromApi = useCallback(async (id: string) => {
    return analyzeDeal(id);
  }, [analyzeDeal]);

  const deleteDeal = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('deals')
      .delete()
      .eq('id', id);

    if (error) throw error;

    setDeals(prev => prev.filter(d => d.id !== id));
  }, []);

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
    deleteDeal,
  };
}
