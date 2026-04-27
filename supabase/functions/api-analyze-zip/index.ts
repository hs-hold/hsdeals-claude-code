import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

const RAPIDAPI_HOST = 'us-real-estate-listings.p.rapidapi.com';
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;
const PARTNERS_API_BASE = 'https://partnersapi-6cqhbrsewa-uc.a.run.app';

async function getPartnersKey(): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl && serviceKey) {
    try {
      const db = createClient(supabaseUrl, serviceKey);
      const result = await Promise.race([
        db.from('service_api_keys').select('api_key').eq('service_name', 'dealbeast').single(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 4000)),
      ]) as any;
      if (result?.data?.api_key) return result.data.api_key;
    } catch (e) {
      console.error('[getPartnersKey] DB error/timeout:', String(e));
    }
  }
  return Deno.env.get('PARTNERS_API_KEY') || null;
}

// ─── Financial Constants (mirror frontend config) ───
const FINANCIAL = {
  closingCostsPercent: 0.02,
  managementPercent: 0.10,
  maintenancePercent: 0.07,
  vacancyPercent: 0.08,
  capexPercent: 0.05,
  agentCommissionPercent: 0.06,
  holdingUtilitiesMonthly: 300,
  notaryFee: 500,
  contingencyPercent: 0.10,
  // HML
  hmlLtvPurchasePercent: 0.90,
  hmlLtvRehabPercent: 1.00,
  hmlPointsPercent: 0.02,
  hmlInterestRate: 0.12,
  hmlProcessingFee: 1500,
  hmlAppraisalCost: 700,
  rehabMonths: 4,
  // Rental / Refi
  loanLtvPercent: 0.70,
  loanInterestRate: 0.075,
  loanTermYears: 30,
  refiAppraisal: 700,
  refiTitlePercent: 0.02,
};

// ─── Preset search filters ───
const PRESET_FILTERS = {
  homeType: 'SingleFamily',
  listType: 'for-sale',
  minPrice: 80000,
  maxPrice: 250000,
  minBeds: 2,
  maxBeds: 4,
  minBaths: 1,
  minSqft: 1150,
  maxSqft: 2300,
};

// ─── Flip Score ───
function calculateFlipScore(apiData: any): { score: number; flipRoi: number; netProfit: number; totalInvestment: number } | null {
  const purchasePrice = apiData.purchasePrice ?? 0;
  const arv = apiData.arv ?? 0;
  const rehabCost = apiData.rehabCost ?? 0;
  if (purchasePrice <= 0 || purchasePrice > 300000 || arv <= 0) return null;

  const holdingMonths = FINANCIAL.rehabMonths;
  const propertyTaxMonthly = (apiData.propertyTax ?? 0) / 12;
  const insuranceRaw = (apiData.insurance ?? 0) / 12;
  const insuranceMonthly = insuranceRaw < 50 ? 100 : Math.round(insuranceRaw);
  const holdingCostsMonthly = propertyTaxMonthly + insuranceMonthly + FINANCIAL.holdingUtilitiesMonthly;
  const totalHoldingCosts = holdingCostsMonthly * holdingMonths;
  const closingCosts = purchasePrice * FINANCIAL.closingCostsPercent;
  const agentCommission = arv * FINANCIAL.agentCommissionPercent;
  const totalInvestment = purchasePrice + rehabCost + closingCosts + totalHoldingCosts;
  const netProfit = arv - totalInvestment - agentCommission - FINANCIAL.notaryFee;
  const flipRoi = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;

  let score = 0;
  if (flipRoi >= 25) score = 10;
  else if (flipRoi >= 20) score = 9;
  else if (flipRoi >= 18) score = 8;
  else if (flipRoi >= 16) score = 7;
  else if (flipRoi >= 15) score = 6;
  else if (flipRoi >= 13) score = 5;
  else if (flipRoi >= 11) score = 4;
  else if (flipRoi >= 9) score = 3;
  else if (flipRoi >= 8) score = 2;
  else score = 1;

  return { score, flipRoi, netProfit, totalInvestment };
}

// ─── MAO Calculation ───
function calculateMAO(arv: number, rehabCost: number, totalHoldingCosts: number): number {
  // mao = (arv * 0.94 - 500 - 1.18 * (rehabCost + totalHoldingCosts)) / 1.2036
  return Math.round((arv * 0.94 - 500 - 1.18 * (rehabCost + totalHoldingCosts)) / 1.2036);
}

// ─── Calculate full financial summary for address mode ───
function calculateFinancialSummary(apiData: any) {
  const purchasePrice = apiData.purchasePrice ?? 0;
  const arv = apiData.arv ?? 0;
  const rehabCost = apiData.rehabCost ?? 0;
  const rent = apiData.rent ?? 0;
  const propertyTax = apiData.propertyTax ?? 0;
  const insurance = apiData.insurance ?? 0;

  const propertyTaxMonthly = propertyTax / 12;
  const insuranceRaw = insurance / 12;
  const insuranceMonthly = insuranceRaw < 50 ? 100 : Math.round(insuranceRaw);
  
  // Operating expenses
  const managementMonthly = rent * FINANCIAL.managementPercent;
  const maintenanceMonthly = rent * FINANCIAL.maintenancePercent;
  const vacancyMonthly = rent * FINANCIAL.vacancyPercent;
  const capexMonthly = rent * FINANCIAL.capexPercent;
  const totalOpex = propertyTaxMonthly + insuranceMonthly + managementMonthly + maintenanceMonthly + vacancyMonthly + capexMonthly;

  // Holding costs (for flip period)
  const holdingCostsMonthly = propertyTaxMonthly + insuranceMonthly + FINANCIAL.holdingUtilitiesMonthly;
  const totalHoldingCosts = holdingCostsMonthly * FINANCIAL.rehabMonths;
  const closingCostsBuy = purchasePrice * FINANCIAL.closingCostsPercent;
  const contingency = rehabCost * FINANCIAL.contingencyPercent;

  // ─── FLIP (Cash) ───
  const agentCommission = arv * FINANCIAL.agentCommissionPercent;
  const cashTotalInvestment = purchasePrice + rehabCost + closingCostsBuy + totalHoldingCosts;
  const flipNetProfit = arv - cashTotalInvestment - agentCommission - FINANCIAL.notaryFee;
  const flipRoi = cashTotalInvestment > 0 ? (flipNetProfit / cashTotalInvestment) * 100 : 0;

  // ─── FLIP (HML) ───
  const hmlLoanPurchase = purchasePrice * FINANCIAL.hmlLtvPurchasePercent;
  const hmlLoanRehab = rehabCost * FINANCIAL.hmlLtvRehabPercent;
  const hmlTotalLoan = hmlLoanPurchase + hmlLoanRehab;
  const hmlPoints = hmlTotalLoan * FINANCIAL.hmlPointsPercent;
  const hmlAllFees = FINANCIAL.hmlProcessingFee + FINANCIAL.hmlAppraisalCost;
  const hmlMonthlyInterest = hmlTotalLoan * (FINANCIAL.hmlInterestRate / 12);
  const hmlTotalInterest = hmlMonthlyInterest * FINANCIAL.rehabMonths;
  const hmlTotalPayoff = hmlTotalLoan + hmlTotalInterest;
  
  const cashTotalInv = purchasePrice + closingCostsBuy + rehabCost + contingency + totalHoldingCosts;
  const hmlCashToClose = cashTotalInv - hmlTotalLoan + hmlPoints + hmlAllFees;
  const hmlCashOutOfPocket = hmlCashToClose + contingency;
  const hmlNetProfit = arv - hmlTotalPayoff - hmlCashOutOfPocket - 1000 - FINANCIAL.notaryFee - agentCommission + contingency;
  const hmlRoi = hmlCashOutOfPocket > 0 ? (hmlNetProfit / hmlCashOutOfPocket) * 100 : 0;

  // ─── RENTAL (with financing) ───
  const loanAmount = arv * FINANCIAL.loanLtvPercent;
  // Loan fees & closing (simplified)
  const rentalLoanFees = FINANCIAL.refiAppraisal + 750 + (loanAmount * 0.01) + 3500; // appraisal + underwriting + 1% points + other
  const rentalClosingCost = arv * FINANCIAL.refiTitlePercent + FINANCIAL.notaryFee;
  const cashToBorrower = loanAmount - rentalLoanFees - rentalClosingCost;
  const rentalMoneyInDeal = Math.max(0, cashTotalInv - cashToBorrower);

  const monthlyRate = FINANCIAL.loanInterestRate / 12;
  const numPayments = FINANCIAL.loanTermYears * 12;
  const mortgagePI = monthlyRate > 0
    ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : loanAmount / numPayments;
  
  const rentalCashflow = rent - totalOpex - mortgagePI;
  const rentalCoCReturn = rentalMoneyInDeal > 0 ? (rentalCashflow * 12 / rentalMoneyInDeal) * 100 : 0;
  const rentalCapRate = cashTotalInv > 0 ? ((rent - totalOpex) * 12 / cashTotalInv) * 100 : 0;

  // ─── BRRRR ───
  // Phase 1: Same HML as flip
  // Phase 2: Refi
  const refiLoanAmount = arv * FINANCIAL.loanLtvPercent;
  const refiLoanFees = FINANCIAL.refiAppraisal;
  const refiClosingCosts = arv * FINANCIAL.refiTitlePercent + FINANCIAL.notaryFee;
  const totalRefiCosts = refiLoanFees + refiClosingCosts;
  const brrrrCashToBorrower = refiLoanAmount - totalRefiCosts;
  const brrrrCashAfterHml = brrrrCashToBorrower - hmlTotalPayoff;
  const brrrrMoneyInDeal = Math.max(0, hmlCashOutOfPocket - Math.max(0, brrrrCashAfterHml));
  
  // Phase 3: Rent
  const brrrrMortgage = monthlyRate > 0
    ? refiLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : refiLoanAmount / numPayments;
  const brrrrCashflow = rent - totalOpex - brrrrMortgage;
  const brrrrCoCReturn = brrrrMoneyInDeal > 0 ? (brrrrCashflow * 12 / brrrrMoneyInDeal) * 100 : (brrrrCashflow > 0 ? 999 : 0);
  const brrrrEquity = arv - refiLoanAmount - brrrrMoneyInDeal;

  // ─── Best Strategy ───
  const flipScore = calculateFlipScore(apiData);
  
  // Rental score (cap rate based)
  let rentalScore = 1;
  if (rentalCapRate >= 12) rentalScore = 10;
  else if (rentalCapRate >= 11) rentalScore = 9;
  else if (rentalCapRate >= 10) rentalScore = 8;
  else if (rentalCapRate >= 9) rentalScore = 7;
  else if (rentalCapRate >= 8) rentalScore = 6;
  else if (rentalCapRate >= 7) rentalScore = 5;
  else if (rentalCapRate >= 6) rentalScore = 4;
  else if (rentalCapRate >= 5) rentalScore = 3;
  else rentalScore = 2;
  
  // BRRRR score
  let moneyScore = 1;
  if (brrrrMoneyInDeal <= 0) moneyScore = 10;
  else if (brrrrMoneyInDeal <= 10000) moneyScore = 9;
  else if (brrrrMoneyInDeal <= 20000) moneyScore = 8;
  else if (brrrrMoneyInDeal <= 30000) moneyScore = 7;
  else if (brrrrMoneyInDeal <= 40000) moneyScore = 6;
  else if (brrrrMoneyInDeal <= 50000) moneyScore = 5;
  else moneyScore = brrrrMoneyInDeal > 50000 ? 0 : 2; // Disqualified if >$50K

  let cashflowScore = 1;
  if (brrrrCashflow >= 300) cashflowScore = 10;
  else if (brrrrCashflow >= 250) cashflowScore = 8;
  else if (brrrrCashflow >= 200) cashflowScore = 7;
  else if (brrrrCashflow >= 150) cashflowScore = 6;
  else if (brrrrCashflow >= 100) cashflowScore = 5;
  else if (brrrrCashflow >= 50) cashflowScore = 4;
  else if (brrrrCashflow >= 0) cashflowScore = 3;
  else cashflowScore = 2;

  let equityScore = 1;
  if (brrrrEquity >= 100000) equityScore = 10;
  else if (brrrrEquity >= 80000) equityScore = 9;
  else if (brrrrEquity >= 60000) equityScore = 8;
  else if (brrrrEquity >= 45000) equityScore = 7;
  else if (brrrrEquity >= 35000) equityScore = 6;
  else if (brrrrEquity >= 30000) equityScore = 5;
  else if (brrrrEquity >= 20000) equityScore = 4;
  else equityScore = 2;

  const minBrrrrScore = Math.min(moneyScore, cashflowScore, equityScore);
  const avgBrrrrScore = Math.round((moneyScore + cashflowScore + equityScore) / 3);
  const brrrrScore = moneyScore === 0 ? 0 : (minBrrrrScore < 7 ? Math.min(avgBrrrrScore, 6) : avgBrrrrScore);

  // Determine best strategy
  const strategies = [
    { name: 'Flip (Cash)', score: flipScore?.score ?? 0 },
    { name: 'Flip (HML)', score: flipScore?.score ?? 0 }, // Same flip score
    { name: 'Rental', score: rentalScore },
    { name: 'BRRRR', score: brrrrScore },
  ];
  const bestStrategy = strategies.reduce((a, b) => b.score > a.score ? b : a);

  // ─── MAO ───
  let mao: number | null = null;
  if (flipScore && flipScore.score < 8) {
    const priceDropPercent = purchasePrice > 0 ? 1 : 0;
    const calculatedMao = calculateMAO(arv, rehabCost, totalHoldingCosts);
    // Only return MAO if the required discount is ≤ 8%
    if (calculatedMao > 0 && purchasePrice > 0) {
      const discountPercent = ((purchasePrice - calculatedMao) / purchasePrice) * 100;
      if (discountPercent <= 8 && discountPercent > 0) {
        mao = calculatedMao;
      }
    }
  }

  return {
    grade: apiData.grade,
    purchase_price: purchasePrice,
    arv,
    rehab_cost: rehabCost,
    monthly_rent: rent,
    flip: {
      cash: {
        net_profit: Math.round(flipNetProfit),
        roi_percent: Math.round(flipRoi * 10) / 10,
        total_investment: Math.round(cashTotalInvestment),
      },
      hml: {
        net_profit: Math.round(hmlNetProfit),
        roi_percent: Math.round(hmlRoi * 10) / 10,
        cash_out_of_pocket: Math.round(hmlCashOutOfPocket),
      },
      score: flipScore?.score ?? 0,
    },
    rental: {
      monthly_cashflow: Math.round(rentalCashflow),
      annual_cashflow: Math.round(rentalCashflow * 12),
      cash_on_cash_percent: Math.round(rentalCoCReturn * 10) / 10,
      cap_rate_percent: Math.round(rentalCapRate * 10) / 10,
      money_in_deal: Math.round(rentalMoneyInDeal),
      score: rentalScore,
    },
    brrrr: {
      money_in_deal: Math.round(brrrrMoneyInDeal),
      monthly_cashflow: Math.round(brrrrCashflow),
      annual_cashflow: Math.round(brrrrCashflow * 12),
      cash_on_cash_percent: brrrrCoCReturn > 100 ? 'infinite' : Math.round(brrrrCoCReturn * 10) / 10,
      equity: Math.round(brrrrEquity),
      score: brrrrScore,
      recommended: brrrrScore >= 7,
    },
    best_strategy: bestStrategy.name,
    best_score: bestStrategy.score,
    mao,
    ...(mao ? { mao_discount_percent: Math.round(((purchasePrice - mao) / purchasePrice) * 1000) / 10 } : {}),
  };
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Validate API key ───
async function validateApiKey(req: Request, supabase: any): Promise<Response | null> {
  const apiKeyHeader = req.headers.get('x-api-key');
  if (!apiKeyHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing x-api-key header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  const { data: apiKeyRow, error: keyError } = await supabase
    .from('api_keys').select('id, is_active').eq('key', apiKeyHeader).maybeSingle();
  if (keyError || !apiKeyRow || !apiKeyRow.is_active) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid or inactive API key' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKeyRow.id);
  return null; // Valid
}

// ─── Log activity event ───
async function logActivity(supabase: any, jobId: string | null, eventType: string, message: string, address?: string, metadata?: any) {
  try {
    await supabase.from('api_activity_log').insert({
      job_id: jobId,
      event_type: eventType,
      address: address || null,
      message,
      metadata: metadata || {},
    });
  } catch (e) {
    console.error('Failed to log activity:', e);
  }
}

// ─── Address mode: single property analysis ───
async function handleAddressMode(address: string, supabase: any): Promise<Response> {
  console.log(`Address mode: analyzing "${address}"`);

  const normalizedAddr = normalizeAddress(address);

  // ── Dedup: check api_deal_history first, then fallback to deals table ──
  const { data: existingHistory } = await supabase
    .from('api_deal_history')
    .select('address_normalized, purchase_price, deal_id, updated_at')
    .eq('address_normalized', normalizedAddr)
    .maybeSingle();

  // Try to find existing deal - either from history link or by searching deals table directly
  let existingDeal: any = null;

  if (existingHistory?.deal_id) {
    const { data } = await supabase
      .from('deals')
      .select('id, address_full, api_data, created_at')
      .eq('id', existingHistory.deal_id)
      .maybeSingle();
    existingDeal = data;
  }

  // Fallback: search deals table by address text match if history had no deal_id
  if (!existingDeal) {
    // Extract key parts for a DB-level filter to avoid loading all deals
    const addrParts = address.split(',').map((s: string) => s.trim()).filter(Boolean);
    const streetPart = addrParts[0] || address; // e.g. "1514 Peachcrest Rd"
    
    const { data: dealsByAddress } = await supabase
      .from('deals')
      .select('id, address_full, api_data, created_at')
      .not('api_data', 'is', null)
      .ilike('address_full', `%${streetPart}%`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (dealsByAddress) {
      existingDeal = dealsByAddress.find((d: any) => 
        normalizeAddress(d.address_full || '') === normalizedAddr
      );
    }
  }

  if (existingDeal?.api_data) {
    console.log(`Address already analyzed: ${address} (deal ${existingDeal.id})`);
    await logActivity(supabase, null, 'duplicate', `Already analyzed — returning cached result`, address, { deal_id: existingDeal.id });
    const summary = calculateFinancialSummary(existingDeal.api_data);

    // Update api_deal_history with deal_id if it was missing
    if (existingHistory && !existingHistory.deal_id) {
      await supabase.from('api_deal_history')
        .update({ deal_id: existingDeal.id })
        .eq('address_normalized', normalizedAddr);
    } else if (!existingHistory) {
      // Create history record if it didn't exist
      await supabase.from('api_deal_history').upsert({
        address_normalized: normalizedAddr,
        zipcode: address.split(',').pop()?.trim().split(' ').pop() || 'unknown',
        purchase_price: existingDeal.api_data.purchasePrice ?? 0,
        deal_id: existingDeal.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'address_normalized' });
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'address',
        already_analyzed: true,
        deal_id: existingDeal.id,
        analyzed_at: existingHistory?.updated_at || existingDeal.created_at,
        address: existingDeal.address_full || address,
        ...summary,
        ai_summary: existingDeal.api_data.aiSummary ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const partnersApiKey = await getPartnersKey();
  if (!partnersApiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Analysis API not configured', source: 'config' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

   // No timeout - let analysis engine take as long as it needs
  try {
    console.log(`Analyzing property: ${address}`);
    await logActivity(supabase, null, 'analyzing', `Analyzing property...`, address);
    const analyzeResponse = await fetch(`${PARTNERS_API_BASE}/partners/sniper-mode`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${partnersApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address,
        filters: {},
        extraParams: {},
      }),
    });

    if (!analyzeResponse.ok) {
      const errText = await analyzeResponse.text();
      await logActivity(supabase, null, 'error', `Analysis failed (HTTP ${analyzeResponse.status})`, address);
      return new Response(
        JSON.stringify({ 
          success: false, 
           error: `Analysis failed (HTTP ${analyzeResponse.status})`, 
          source: 'analysis_engine',
          details: errText 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const analysisData = await analyzeResponse.json();
    const analysis = analysisData?.data?.analysis;
    const property = analysisData?.data?.property;

    if (!analysis) {
      await logActivity(supabase, null, 'error', `No analysis data returned`, address);
      return new Response(
        JSON.stringify({ 
          success: false, 
           error: 'No analysis data returned for this address', 
          source: 'analysis_engine' 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build apiData object
    const apiData: any = {
      arv: analysis.metrics?.arv ?? null,
      purchasePrice: analysis.asking_price ?? null,
      rent: analysis.metrics?.monthly_rent ?? null,
      rehabCost: analysis.metrics?.rehab_cost ?? null,
      propertyTax: analysis.metrics?.monthly_property_taxes ?? null,
      insurance: analysis.metrics?.monthly_insurance ?? null,
      bedrooms: analysis.bedrooms ?? null,
      bathrooms: analysis.bathrooms ?? null,
      sqft: analysis.living_area ?? null,
      yearBuilt: property?.year_built ?? null,
      grade: analysis.grade ?? null,
      aiSummary: analysis.ai_summary ?? null,
    };

    const summary = calculateFinancialSummary(apiData);

    // Save to dedup history
    await supabase.from('api_deal_history').upsert({
      address_normalized: normalizedAddr,
      zipcode: address.split(',').pop()?.trim().split(' ').pop() || 'unknown',
      purchase_price: apiData.purchasePrice ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'address_normalized' });

    const flipScore = summary.flip?.score ?? 0;
    await logActivity(supabase, null, 'completed', `Analysis complete — Flip Score: ${flipScore}/10, Best: ${summary.best_strategy}`, address, { score: flipScore, strategy: summary.best_strategy, price: summary.purchase_price });

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'address',
        already_analyzed: false,
        address,
        ...summary,
        ai_summary: apiData.aiSummary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: e instanceof Error ? e.message : 'Unknown error',
        source: 'analysis_engine',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ─── Helper: send error to webhook ───
async function sendWebhookError(callback_url: string | undefined, webhook_secret: string | undefined, payload: Record<string, any>) {
  if (!callback_url) return;
  let webhookUrl = callback_url;
  if (webhook_secret) { const sep = callback_url.includes('?') ? '&' : '?'; webhookUrl = `${callback_url}${sep}token=${encodeURIComponent(webhook_secret)}`; }
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15000);
    await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: c.signal });
    clearTimeout(t);
  } catch (_) {}
}

// ─── ZIP mode: bulk search + analyze ───
async function handleZipMode(zipcode: string, body: any, supabase: any): Promise<Response> {
  const { max_results, min_sqft, max_price, callback_url, webhook_secret } = body;

  // callback_url is required for ZIP mode
  if (!callback_url) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'callback_url is required for ZIP code searches. Results will be POSTed to this URL when analysis is complete.',
        example: { zipcode: '30032', max_results: 10, callback_url: 'https://your-server.com/webhook' },
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ─── Detect and clean up stale jobs for this zipcode ───
  const STUCK_THRESHOLD_MS = 10 * 60 * 1000;
  const staleCancelledThresholdMs = 30 * 1000;
  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();
  const cancelledCutoff = new Date(Date.now() - staleCancelledThresholdMs).toISOString();

  const { data: stuckJobs } = await supabase
    .from('api_jobs')
    .select('id, processed_count, total_properties, params')
    .eq('zipcode', zipcode)
    .eq('status', 'processing')
    .lt('started_at', stuckCutoff);

  if (stuckJobs && stuckJobs.length > 0) {
    console.log(`Found ${stuckJobs.length} stuck jobs for ZIP ${zipcode}, marking as failed`);
    for (const sj of stuckJobs) {
      await supabase.from('api_jobs').update({
        status: 'failed',
        error: `Job stuck — processed ${sj.processed_count || 0}/${sj.total_properties || 0}. Superseded by new request.`,
        completed_at: new Date().toISOString(),
      }).eq('id', sj.id);
      await logActivity(supabase, sj.id, 'error', `Job marked as failed (stuck >10min). New request will pick up remaining addresses.`);
    }
  }

  const { data: staleCancelledJobs } = await supabase
    .from('api_jobs')
    .select('id, processed_count, total_properties')
    .eq('zipcode', zipcode)
    .eq('status', 'cancelled')
    .is('completed_at', null)
    .lt('created_at', cancelledCutoff);

  if (staleCancelledJobs && staleCancelledJobs.length > 0) {
    console.log(`Cleaning up ${staleCancelledJobs.length} cancelled jobs for ZIP ${zipcode}`);
    for (const cancelledJob of staleCancelledJobs) {
      await supabase.from('api_jobs').update({
        status: 'completed',
        error: `Cancelled by user — stopped after ${cancelledJob.processed_count || 0}/${cancelledJob.total_properties || 0}.`,
        completed_at: new Date().toISOString(),
      }).eq('id', cancelledJob.id);
      await logActivity(supabase, cancelledJob.id, 'job_completed', 'Cancelled job cleaned up before starting new request', null, {
        cancelled: true,
        processed_count: cancelledJob.processed_count || 0,
        total_properties: cancelledJob.total_properties || 0,
      });
    }
  }

  const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
  if (!rapidApiKey) {
    const errPayload = { success: false, error: 'Market search API not configured', source: 'config', zipcode };
    await logActivity(supabase, null, 'error', 'Market search API not configured', null, { zipcode, source: 'config' });
    await sendWebhookError(callback_url, webhook_secret, errPayload);
    return new Response(JSON.stringify(errPayload), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const maxResults = Math.min(max_results || 5, 60);
  console.log(`ZIP mode: searching ${zipcode}, max ${maxResults}`);

  // Build search params with preset filters
  const searchParams = new URLSearchParams();
  searchParams.append('location', zipcode);
  searchParams.append('price_min', (PRESET_FILTERS.minPrice).toString());
  searchParams.append('price_max', (PRESET_FILTERS.maxPrice).toString());
  searchParams.append('beds_min', (PRESET_FILTERS.minBeds).toString());
  searchParams.append('baths_min', (PRESET_FILTERS.minBaths).toString());
  searchParams.append('sqft_min', (PRESET_FILTERS.minSqft).toString());
  searchParams.append('sqft_max', (PRESET_FILTERS.maxSqft).toString());
  searchParams.append('limit', '42');

  let searchResponse;
  try {
    searchResponse = await fetch(`${RAPIDAPI_BASE}/for-sale?${searchParams.toString()}`, {
      method: 'GET',
      headers: { 'X-RapidAPI-Key': rapidApiKey, 'X-RapidAPI-Host': RAPIDAPI_HOST },
    });
  } catch (e) {
    const errMsg = `Market search service unreachable: ${e instanceof Error ? e.message : 'connection failed'}`;
    const errPayload = { success: false, error: errMsg, source: 'market_search', zipcode };
    await logActivity(supabase, null, 'error', errMsg, null, { zipcode, source: 'market_search' });
    if (callback_url) {
      let webhookUrl = callback_url;
      if (webhook_secret) { const sep = callback_url.includes('?') ? '&' : '?'; webhookUrl = `${callback_url}${sep}token=${encodeURIComponent(webhook_secret)}`; }
      try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000); await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(errPayload), signal: c.signal }); clearTimeout(t); } catch (_) {}
    }
    return new Response(JSON.stringify(errPayload), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (!searchResponse.ok) {
    const errText = await searchResponse.text();
    console.error('Search API error:', searchResponse.status, errText);
    const isQuotaExceeded = searchResponse.status === 429;
    const errMsg = isQuotaExceeded
      ? `Market search API quota exceeded (monthly limit reached). Upgrade the plan or wait for quota reset.`
      : `Market search failed (HTTP ${searchResponse.status})`;
    const errPayload = { 
      success: false, 
      error: errMsg,
      source: 'market_search',
      zipcode,
      http_status: searchResponse.status,
      ...(isQuotaExceeded ? { quota_exceeded: true } : { details: errText }),
    };
    await logActivity(supabase, null, 'error', errMsg, null, { zipcode, source: 'market_search', http_status: searchResponse.status });
    if (callback_url) {
      let webhookUrl = callback_url;
      if (webhook_secret) { const sep = callback_url.includes('?') ? '&' : '?'; webhookUrl = `${callback_url}${sep}token=${encodeURIComponent(webhook_secret)}`; }
      try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000); await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(errPayload), signal: c.signal }); clearTimeout(t); } catch (_) {}
    }
    return new Response(JSON.stringify(errPayload), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const searchData = await searchResponse.json();
  // Filter for_sale only and normalize to internal format
  const rawListings: any[] = (searchData?.listings || []).filter((l: any) => l.status === 'for_sale');
  const allProperties = rawListings.map((l: any) => {
    const addr = l.location?.address || {};
    const desc = l.description || {};
    return {
      list_price: l.list_price || 0,
      // Legacy field aliases used by downstream code
      unformattedPrice: l.list_price || 0,
      price: l.list_price || 0,
      livingArea: desc.sqft || 0,
      sqft: desc.sqft || 0,
      beds: desc.beds || 0,
      baths: desc.baths || 0,
      homeType: desc.type || '',
      yearBuilt: desc.year_built || null,
      imgSrc: l.primary_photo?.href || null,
      detailUrl: l.href || null,
      address: {
        street: addr.line || '',
        city: addr.city || '',
        state: addr.state_code || '',
        zipcode: addr.postal_code || zipcode,
      },
    };
  });

  if (allProperties.length === 0) {
    const noPropsPayload = { 
      success: true, mode: 'zipcode', zipcode, total_found: 0, total_good_deals: 0, deals: [],
      message: 'No properties found in this ZIP code matching the search filters',
      filters_applied: PRESET_FILTERS,
    };
    // Send webhook even for empty results
    if (callback_url) {
      let webhookUrl = callback_url;
      if (webhook_secret) { const sep = callback_url.includes('?') ? '&' : '?'; webhookUrl = `${callback_url}${sep}token=${encodeURIComponent(webhook_secret)}`; }
      try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000); await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(noPropsPayload), signal: c.signal }); clearTimeout(t); } catch (_) {}
    }
    return new Response(JSON.stringify(noPropsPayload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Pre-filter
  const MIN_SQFT = min_sqft || PRESET_FILTERS.minSqft;
  const MAX_PRICE = max_price || PRESET_FILTERS.maxPrice;
  const skipped: string[] = [];

  const filteredProperties = allProperties.filter((prop: any) => {
    const sqft = prop.livingArea || prop.sqft || 0;
    const price = prop.unformattedPrice || prop.price || 0;
    const address = prop.address?.street || prop.address || prop.streetAddress || 'Unknown';

    if (sqft > 0 && sqft < MIN_SQFT) { skipped.push(`${address}: too small (${sqft} sqft)`); return false; }
    if (price > MAX_PRICE) { skipped.push(`${address}: price too high`); return false; }
    if (price > 0 && price < 10000) { skipped.push(`${address}: price suspiciously low`); return false; }
    if (sqft > 0 && price > 0 && price / sqft > 250) { skipped.push(`${address}: likely renovated`); return false; }
    return true;
  });

  console.log(`Pre-filter: ${allProperties.length} total → ${filteredProperties.length} passed`);

  if (filteredProperties.length === 0) {
    const filteredPayload = { 
      success: true, mode: 'zipcode', zipcode, total_found: allProperties.length,
      total_after_filter: 0, total_good_deals: 0, deals: [],
      message: 'Properties found but all were filtered out by quality criteria',
      skipped,
    };
    if (callback_url) {
      let webhookUrl = callback_url;
      if (webhook_secret) { const sep = callback_url.includes('?') ? '&' : '?'; webhookUrl = `${callback_url}${sep}token=${encodeURIComponent(webhook_secret)}`; }
      try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000); await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(filteredPayload), signal: c.signal }); clearTimeout(t); } catch (_) {}
    }
    return new Response(JSON.stringify(filteredPayload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Build addresses from ALL filtered properties (dedup first, then limit)
  const allAddresses = filteredProperties.map((prop: any) => {
    const street = prop.address?.street || prop.address || prop.streetAddress || '';
    const city = prop.address?.city || prop.city || '';
    const state = prop.address?.state || prop.state || '';
    const zip = prop.address?.zipcode || prop.zipcode || zipcode;
    return `${street}, ${city}, ${state} ${zip}`;
  });

  // ─── Dedup check: remove already-analyzed addresses ───
  const { data: existingHistory } = await supabase
    .from('api_deal_history')
    .select('address_normalized, purchase_price, deal_id')
    .eq('zipcode', zipcode);

  const historyMap = new Map<string, { price: number; dealId: string | null }>();
  (existingHistory || []).forEach((h: any) => {
    historyMap.set(h.address_normalized, { price: Number(h.purchase_price) || 0, dealId: h.deal_id });
  });

  const alreadyAnalyzed: string[] = [];
  const alreadyAnalyzedDealIds: string[] = [];
  const newAddresses: string[] = [];
  const priceDropAddresses: string[] = [];

  for (const addr of allAddresses) {
    const normalized = normalizeAddress(addr);
    const existing = historyMap.get(normalized);
    
    if (!existing) {
      newAddresses.push(addr);
    } else {
      // Check price from search results
      const matchingProp = filteredProperties.find((p: any) => {
        const street = p.address?.street || p.address || p.streetAddress || '';
        const city = p.address?.city || p.city || '';
        const state = p.address?.state || p.state || '';
        const zip = p.address?.zipcode || p.zipcode || zipcode;
        return normalizeAddress(`${street}, ${city}, ${state} ${zip}`) === normalized;
      });
      const currentPrice = matchingProp?.list_price || matchingProp?.price || 0;
      
      if (currentPrice > 0 && currentPrice < existing.price) {
        priceDropAddresses.push(addr);
        newAddresses.push(addr); // Re-analyze price drops
      } else {
        alreadyAnalyzed.push(addr);
        if (existing.dealId) alreadyAnalyzedDealIds.push(existing.dealId);
      }
    }
  }

  // Limit new addresses to maxResults AFTER dedup
  const addressesToAnalyze = newAddresses.slice(0, maxResults);

  console.log(`Dedup: ${newAddresses.length} new (analyzing ${addressesToAnalyze.length}), ${alreadyAnalyzed.length} already analyzed, ${priceDropAddresses.length} price drops`);

  // ─── Helper: fetch previously analyzed good deals from DB ───
  async function fetchPreviouslyAnalyzedDeals(dealIds: string[]) {
    if (dealIds.length === 0) return [];
    // Only return good deals (not filtered_out)
    const { data: deals } = await supabase
      .from('deals')
      .select('id, address_full, api_data, status')
      .in('id', dealIds)
      .neq('status', 'filtered_out');
    
    if (!deals) return [];
    return deals
      .filter((d: any) => d.api_data)
      .map((d: any) => {
        const summary = calculateFinancialSummary(d.api_data);
        return {
          deal_id: d.id,
          address: d.address_full,
          previously_analyzed: true,
          ...summary,
          ai_summary: d.api_data.aiSummary ?? null,
        };
      });
  }

  // If ALL addresses already analyzed — return cached results + send webhook
  if (addressesToAnalyze.length === 0) {
    const previousDeals = await fetchPreviouslyAnalyzedDeals(alreadyAnalyzedDealIds);
    
    await logActivity(supabase, null, 'job_created', `ZIP ${zipcode}: All ${alreadyAnalyzed.length} properties already analyzed — returning ${previousDeals.length} cached deals`, null, { zipcode, cached: true, total_found: allProperties.length, already_analyzed: alreadyAnalyzed.length });
    await logActivity(supabase, null, 'job_completed', `ZIP ${zipcode}: ${previousDeals.length} good deals returned from cache`, null, { zipcode, cached: true, good_deals: previousDeals.length });

    const cachedPayload = {
      success: true,
      mode: 'zipcode',
      zipcode,
      status: 'completed',
      cached: true,
      total_found: allProperties.length,
      total_after_filter: filteredProperties.length,
      total_new: 0,
      total_good_deals: previousDeals.length,
      message: `All ${alreadyAnalyzed.length} properties already analyzed. Returning ${previousDeals.length} good deals from cache.`,
      deals: previousDeals,
      already_analyzed_count: alreadyAnalyzed.length,
      ...(skipped.length > 0 ? { skipped } : {}),
    };

    // Always send webhook to callback_url
    if (callback_url) {
      let webhookUrl = callback_url;
      if (webhook_secret) {
        const sep = callback_url.includes('?') ? '&' : '?';
        webhookUrl = `${callback_url}${sep}token=${encodeURIComponent(webhook_secret)}`;
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const webhookResp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cachedPayload),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const webhookStatus = webhookResp.ok ? 'delivered' : `failed (${webhookResp.status})`;
        await logActivity(supabase, null, webhookResp.ok ? 'completed' : 'error', `Webhook ${webhookStatus} for cached results`, null, { callback_url, status: webhookResp.status });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        await logActivity(supabase, null, 'error', `Webhook failed for cached results: ${errMsg}`, null, { callback_url, error: errMsg });
      }
    }

    return new Response(
      JSON.stringify(cachedPayload),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create job with only new addresses
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { data: job, error: jobError } = await supabase
    .from('api_jobs')
    .insert({
      zipcode,
      status: 'processing',
      callback_url: callback_url || null,
      params: { addresses: addressesToAnalyze, skipped, ...(webhook_secret ? { webhook_secret } : {}) },
      total_properties: addressesToAnalyze.length,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (jobError || !job) {
    const errPayload = { success: false, error: 'Failed to create processing job', source: 'database', zipcode };
    await logActivity(supabase, null, 'error', 'Failed to create processing job', null, { zipcode, source: 'database' });
    await sendWebhookError(callback_url, webhook_secret, errPayload);
    return new Response(JSON.stringify(errPayload), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  console.log(`Created job ${job.id} with ${addressesToAnalyze.length} addresses`);
  await logActivity(supabase, job.id, 'job_created', `ZIP ${zipcode}: searching ${allProperties.length} found → ${filteredProperties.length} filtered → ${addressesToAnalyze.length} to analyze (${alreadyAnalyzed.length} already done)`, null, { zipcode, total_found: allProperties.length, to_analyze: addressesToAnalyze.length });

  // Fire worker
  const workerUrl = `${supabaseUrl}/functions/v1/api-process-job`;
  fetch(workerUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: job.id }),
  }).catch(err => console.error('Failed to trigger worker:', err));

  // Fetch previously analyzed deals to include in response
  const previousDeals = await fetchPreviouslyAnalyzedDeals(alreadyAnalyzedDealIds);

  return new Response(
    JSON.stringify({
      success: true,
      mode: 'zipcode',
      status: 'processing',
      job_id: job.id,
      zipcode,
      total_found: allProperties.length,
      total_after_filter: filteredProperties.length,
      total_to_analyze: addressesToAnalyze.length,
      total_already_analyzed: alreadyAnalyzed.length,
      ...(previousDeals.length > 0 ? { previously_analyzed_deals: previousDeals } : {}),
      ...(priceDropAddresses.length > 0 ? { price_drops: priceDropAddresses } : {}),
      filters_applied: PRESET_FILTERS,
      message: `Processing ${addressesToAnalyze.length} new properties (${alreadyAnalyzed.length} already analyzed, ${previousDeals.length} cached deals included). Results will be sent to ${callback_url}.`,
      ...(skipped.length > 0 ? { skipped } : {}),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ─── Main handler ───
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate API key
    const authError = await validateApiKey(req, supabase);
    if (authError) return authError;

    const body = await req.json();
    const { address, zipcode } = body;

    if (!address && !zipcode) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Either "address" (for single property analysis) or "zipcode" (for bulk search) is required',
          usage: {
            address_mode: { address: '123 Main St, Atlanta, GA 30032' },
            zipcode_mode: { zipcode: '30032', max_results: 5, callback_url: 'https://...' },
          }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log that request was received
    await logActivity(supabase, null, 'job_created', 
      address 
        ? `Request received — address mode: "${address}"` 
        : `Request received — ZIP ${zipcode} (max ${body.max_results || 5})`,
      address || null,
      { zipcode: zipcode || null, address: address || null, mode: address ? 'address' : 'zipcode', callback_url: body.callback_url || null }
    );

    // Route to appropriate handler
    if (address) {
      return await handleAddressMode(address, supabase);
    } else {
      return await handleZipMode(zipcode, body, supabase);
    }

  } catch (error) {
    console.error('Error in api-analyze-zip:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const errPayload = { success: false, error: errMsg, source: 'internal' };
    // Try to send error to webhook if callback_url was provided
    try {
      const body2 = await req.clone().json().catch(() => ({}));
      if (body2.callback_url) {
        await sendWebhookError(body2.callback_url, body2.webhook_secret, { ...errPayload, zipcode: body2.zipcode || body2.address || null });
      }
    } catch (_) {}
    return new Response(JSON.stringify(errPayload), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
