import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

const PARTNERS_API_BASE = 'https://partnersapi-6cqhbrsewa-uc.a.run.app';

// ─── Financial Constants (same as api-analyze-zip) ───
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
  hmlLtvPurchasePercent: 0.90,
  hmlLtvRehabPercent: 1.00,
  hmlPointsPercent: 0.02,
  hmlInterestRate: 0.12,
  hmlProcessingFee: 1500,
  hmlAppraisalCost: 700,
  rehabMonths: 4,
  loanLtvPercent: 0.70,
  loanInterestRate: 0.075,
  loanTermYears: 30,
  refiAppraisal: 700,
  refiTitlePercent: 0.02,
};

// ─── Flip score calculation ───
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
  return Math.round((arv * 0.94 - 500 - 1.18 * (rehabCost + totalHoldingCosts)) / 1.2036);
}

// ─── Concise financial summary (same as Address Mode) ───
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

  const managementMonthly = rent * FINANCIAL.managementPercent;
  const maintenanceMonthly = rent * FINANCIAL.maintenancePercent;
  const vacancyMonthly = rent * FINANCIAL.vacancyPercent;
  const capexMonthly = rent * FINANCIAL.capexPercent;
  const totalOpex = propertyTaxMonthly + insuranceMonthly + managementMonthly + maintenanceMonthly + vacancyMonthly + capexMonthly;

  const holdingCostsMonthly = propertyTaxMonthly + insuranceMonthly + FINANCIAL.holdingUtilitiesMonthly;
  const totalHoldingCosts = holdingCostsMonthly * FINANCIAL.rehabMonths;
  const closingCostsBuy = purchasePrice * FINANCIAL.closingCostsPercent;
  const contingency = rehabCost * FINANCIAL.contingencyPercent;

  // FLIP (Cash)
  const agentCommission = arv * FINANCIAL.agentCommissionPercent;
  const cashTotalInvestment = purchasePrice + rehabCost + closingCostsBuy + totalHoldingCosts;
  const flipNetProfit = arv - cashTotalInvestment - agentCommission - FINANCIAL.notaryFee;
  const flipRoi = cashTotalInvestment > 0 ? (flipNetProfit / cashTotalInvestment) * 100 : 0;

  // FLIP (HML)
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

  // RENTAL
  const loanAmount = arv * FINANCIAL.loanLtvPercent;
  const rentalLoanFees = FINANCIAL.refiAppraisal + 750 + (loanAmount * 0.01) + 3500;
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

  // BRRRR
  const refiLoanAmount = arv * FINANCIAL.loanLtvPercent;
  const refiLoanFees = FINANCIAL.refiAppraisal;
  const refiClosingCosts = arv * FINANCIAL.refiTitlePercent + FINANCIAL.notaryFee;
  const totalRefiCosts = refiLoanFees + refiClosingCosts;
  const brrrrCashToBorrower = refiLoanAmount - totalRefiCosts;
  const brrrrCashAfterHml = brrrrCashToBorrower - hmlTotalPayoff;
  const brrrrMoneyInDeal = Math.max(0, hmlCashOutOfPocket - Math.max(0, brrrrCashAfterHml));

  const brrrrMortgage = monthlyRate > 0
    ? refiLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : refiLoanAmount / numPayments;
  const brrrrCashflow = rent - totalOpex - brrrrMortgage;
  const brrrrCoCReturn = brrrrMoneyInDeal > 0 ? (brrrrCashflow * 12 / brrrrMoneyInDeal) * 100 : (brrrrCashflow > 0 ? 999 : 0);
  const brrrrEquity = arv - refiLoanAmount - brrrrMoneyInDeal;

  // Scores
  const flipScore = calculateFlipScore(apiData);

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

  let moneyScore = 1;
  if (brrrrMoneyInDeal <= 0) moneyScore = 10;
  else if (brrrrMoneyInDeal <= 10000) moneyScore = 9;
  else if (brrrrMoneyInDeal <= 20000) moneyScore = 8;
  else if (brrrrMoneyInDeal <= 30000) moneyScore = 7;
  else if (brrrrMoneyInDeal <= 40000) moneyScore = 6;
  else if (brrrrMoneyInDeal <= 50000) moneyScore = 5;
  else moneyScore = brrrrMoneyInDeal > 50000 ? 0 : 2;

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

  const strategies = [
    { name: 'Flip (Cash)', score: flipScore?.score ?? 0 },
    { name: 'Flip (HML)', score: flipScore?.score ?? 0 },
    { name: 'Rental', score: rentalScore },
    { name: 'BRRRR', score: brrrrScore },
  ];
  const bestStrategy = strategies.reduce((a, b) => b.score > a.score ? b : a);

  let mao: number | null = null;
  if (flipScore && flipScore.score < 8) {
    const calculatedMao = calculateMAO(arv, rehabCost, totalHoldingCosts);
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

const MIN_FLIP_SCORE = 8;

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

async function sendWebhookWithRetries(
  supabase: any,
  jobId: string,
  callbackUrl: string,
  payload: any,
  maxAttempts = 3,
  webhookSecret?: string,
): Promise<{ success: boolean; status?: number; error?: string }> {
  let finalUrl = callbackUrl;
  if (webhookSecret) {
    const separator = callbackUrl.includes('?') ? '&' : '?';
    finalUrl = `${callbackUrl}${separator}token=${encodeURIComponent(webhookSecret)}`;
  }

  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Job-Id': jobId },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        console.log(`[Job ${jobId}] Webhook sent to ${callbackUrl}: ${response.status} (attempt ${attempt})`);
        await logActivity(supabase, jobId, 'completed', `Webhook delivered (${response.status})`, undefined, {
          callback_url: callbackUrl,
          status: response.status,
        });
        return { success: true, status: response.status };
      }

      const responseText = await response.text();
      lastError = `HTTP ${response.status}: ${responseText?.slice(0, 300) || 'empty response'}`;
      throw new Error(lastError);
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err.message : 'Unknown webhook error';
      console.error(`[Job ${jobId}] Webhook attempt ${attempt}/${maxAttempts} failed:`, lastError);

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  await logActivity(supabase, jobId, 'error', `Webhook failed after all attempts`, undefined, {
    callback_url: callbackUrl,
    error: lastError,
  });
  return { success: false, error: lastError };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // GET: Poll for job status/results
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const jobId = url.searchParams.get('job_id');

    if (!jobId) {
      return new Response(
        JSON.stringify({ success: false, error: 'job_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKeyHeader = req.headers.get('x-api-key');
    if (!apiKeyHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing x-api-key header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { data: apiKeyRow } = await supabase
      .from('api_keys').select('id, is_active').eq('key', apiKeyHeader).maybeSingle();
    if (!apiKeyRow?.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid API key' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: job, error } = await supabase
      .from('api_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error || !job) {
      return new Response(
        JSON.stringify({ success: false, error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        status: job.status,
        zipcode: job.zipcode,
        total_properties: job.total_properties,
        processed_count: job.processed_count,
        created_at: job.created_at,
        completed_at: job.completed_at,
        ...(job.status === 'completed' ? { results: job.results } : {}),
        ...(job.error ? { error: job.error } : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // POST: Internal — process job (called by api-analyze-zip)
  // Supports batch processing: processes BATCH_SIZE properties per invocation,
  // then triggers itself for the next batch to avoid Edge Function timeout.
  const BATCH_SIZE = 1;

  try {
    const body = await req.json();
    const { action = 'process', job_id, batch_offset = 0, accumulated_results } = body;

    if (!job_id) {
      return new Response(JSON.stringify({ error: 'job_id required' }), { status: 400, headers: corsHeaders });
    }

    const { data: job } = await supabase.from('api_jobs').select('*').eq('id', job_id).single();
    if (!job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: corsHeaders });
    }

    const jobParams = (job.params && typeof job.params === 'object') ? job.params : {};
    const webhookSecret = (jobParams as any).webhook_secret as string | undefined;

    // Manual webhook resend endpoint (one-time delivery)
    if (action === 'resend_webhook') {
      const targetUrl = body?.callback_url || job.callback_url;
      if (!targetUrl) {
        return new Response(JSON.stringify({ success: false, error: 'No callback_url configured for this job' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const storedResults = body?.results ?? job.results;
      if (!storedResults) {
        return new Response(JSON.stringify({ success: false, error: 'No results available to resend' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const webhookPayload = { success: true, job_id, ...storedResults, one_time_resend: true };
      
      // Single attempt with 20s timeout to fit within edge function limits
      const controller = new AbortController();
      const abortTimeout = setTimeout(() => controller.abort(), 20000);
      let resendResult: { success: boolean; status?: number; error?: string };
      
      try {
        // Append token if webhook_secret configured
        let resendUrl = targetUrl;
        if (webhookSecret) {
          const sep = targetUrl.includes('?') ? '&' : '?';
          resendUrl = `${targetUrl}${sep}token=${encodeURIComponent(webhookSecret)}`;
        }
        const response = await fetch(resendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload),
          signal: controller.signal,
        });
        clearTimeout(abortTimeout);
        const responseText = await response.text();
        
        if (response.ok) {
          console.log(`[Job ${job_id}] Resend webhook success: ${response.status}`);
          resendResult = { success: true, status: response.status };
        } else {
          resendResult = { success: false, error: `HTTP ${response.status}: ${responseText?.slice(0, 300)}` };
        }
      } catch (err) {
        clearTimeout(abortTimeout);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Job ${job_id}] Resend webhook failed:`, msg);
        resendResult = { success: false, error: msg };
      }

      return new Response(JSON.stringify({
        success: resendResult.success,
        resent: true,
        job_id,
        callback_url: targetUrl,
        ...(resendResult.success ? {} : { error: resendResult.error }),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (job.completed_at || job.status === 'completed' || job.status === 'failed') {
      return new Response(JSON.stringify({ success: true, job_id, status: job.status, skipped: 'already_finalized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (job.status !== 'processing' && job.status !== 'cancelled') {
      return new Response(JSON.stringify({ error: 'Job not pending/processing/cancelled' }), { status: 404, headers: corsHeaders });
    }

    // If job was cancelled, finalize immediately with accumulated results
    if (job.status === 'cancelled') {
      const zipcode = job.zipcode;
      const deals: any[] = accumulated_results?.deals || [];
      const filteredOut: string[] = accumulated_results?.filteredOut || [];
      const duplicateSkipped: string[] = accumulated_results?.duplicateSkipped || [];
      const priceDropUpdated: string[] = accumulated_results?.priceDropUpdated || [];
      const errors: string[] = accumulated_results?.errors || [];
      const totalAnalyzed = deals.length + filteredOut.length + duplicateSkipped.length + priceDropUpdated.length;
      const summary_message = `Job cancelled. Analyzed ${totalAnalyzed} of ${job.total_properties} properties. ${deals.length} good deals found.`;

      const results = {
        zipcode,
        summary: summary_message,
        total_analyzed: totalAnalyzed,
        total_good_deals: deals.length,
        total_filtered_out: filteredOut.length,
        cancelled: true,
        deals: deals.sort((a: any, b: any) => (b.flip?.score ?? 0) - (a.flip?.score ?? 0)),
        ...(errors.length > 0 ? { errors } : {}),
      };

      const { data: cancelledFinalize } = await supabase
        .from('api_jobs')
        .update({
          status: 'completed',
          results,
          error: null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job_id)
        .eq('status', 'cancelled')
        .is('completed_at', null)
        .select('id')
        .maybeSingle();

      if (!cancelledFinalize) {
        return new Response(JSON.stringify({ success: true, job_id, skipped: 'already_finalized' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[Job ${job_id}] Cancelled — finalized with ${deals.length} good deals out of ${totalAnalyzed} analyzed`);
      await logActivity(supabase, job_id, 'job_completed', `Job stopped — ${deals.length} good deals from ${totalAnalyzed} analyzed`, null, { good: deals.length, cancelled: true });

      // Send webhook if configured
      if (job.callback_url) {
        const webhookResult = await sendWebhookWithRetries(
          supabase,
          job_id,
          job.callback_url,
          { success: true, job_id, ...results },
          3,
          webhookSecret,
        );

        if (!webhookResult.success) {
          await supabase.from('api_jobs').update({
            error: `Webhook delivery failed after cancel: ${webhookResult.error}`,
          }).eq('id', job_id);
        }
      }

      return new Response(JSON.stringify({ success: true, job_id, cancelled: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const partnersApiKey = Deno.env.get('PARTNERS_API_KEY');
    if (!partnersApiKey) {
      await supabase.from('api_jobs').update({ status: 'failed', error: 'API key not configured' }).eq('id', job_id);
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: corsHeaders });
    }

    const { addresses, skipped } = job.params;
    const zipcode = job.zipcode;

    // Load dedup history
    const { data: existingHistory } = await supabase
      .from('api_deal_history')
      .select('address_normalized, purchase_price, deal_id')
      .eq('zipcode', zipcode);

    const historyMap = new Map<string, { price: number; dealId: string | null }>();
    (existingHistory || []).forEach((h: any) => {
      historyMap.set(h.address_normalized, { price: Number(h.purchase_price) || 0, dealId: h.deal_id });
    });

    // Restore accumulated results from previous batches
    const deals: any[] = accumulated_results?.deals || [];
    const filteredOut: string[] = accumulated_results?.filteredOut || [];
    const duplicateSkipped: string[] = accumulated_results?.duplicateSkipped || [];
    const priceDropUpdated: string[] = accumulated_results?.priceDropUpdated || [];
    const errors: string[] = accumulated_results?.errors || [];

    // Process one property at a time (sequential to avoid crashes and rate limits)
    const batchEnd = Math.min(batch_offset + BATCH_SIZE, addresses.length);
    console.log(`[Job ${job_id}] Processing property ${batch_offset + 1} of ${addresses.length} (sequential)`);

    for (let i = batch_offset; i < batchEnd; i++) {
      const idx = i;
      const fullAddress = addresses[idx];

      // Cooldown between properties to prevent rate limiting and give API breathing room
      if (idx > batch_offset) {
        await new Promise(r => setTimeout(r, 4000));
      }

      console.log(`[Job ${job_id}] Analyzing ${idx + 1}/${addresses.length}: ${fullAddress}`);
      await logActivity(supabase, job_id, 'analyzing', `Analyzing ${idx + 1}/${addresses.length}...`, fullAddress, { index: idx + 1, total: addresses.length });

      const normalizedAddr = normalizeAddress(fullAddress);
      const existing = historyMap.get(normalizedAddr);

      let existingDealId = existing?.dealId ?? null;
      if (!existingDealId) {
        // Check ALL deals (any source — manual, email, api) to avoid re-analyzing
        const { data: existingDeal } = await supabase
          .from('deals')
          .select('id, source')
          .ilike('address_full', fullAddress)
          .limit(1)
          .maybeSingle();
        if (existingDeal) {
          existingDealId = existingDeal.id;
          if (!existing) {
            historyMap.set(normalizedAddr, { price: 0, dealId: existingDeal.id });
          }
        }
      }

      // ─── DEDUP: Skip DealBeast call entirely if address already analyzed ───
      if (existing || existingDealId) {
        const previousPrice = existing?.price ?? 0;

        // Check if it's a price drop (will still need DealBeast for updated data)
        // For now, if price is unknown (0) or same/higher, just skip
        duplicateSkipped.push(`${fullAddress}: already analyzed — skipped API call`);
        await logActivity(supabase, job_id, 'duplicate', `Already analyzed — skipped`, fullAddress, { deal_id: existingDealId });
        continue;
      }

      const ANALYSIS_TIMEOUT = 220000;
      const MAX_ANALYSIS_RETRIES = 3;
      let analyzeResponse: Response | null = null;

      for (let attempt = 1; attempt <= MAX_ANALYSIS_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT);

        try {
          analyzeResponse = await fetch(`${PARTNERS_API_BASE}/partners/sniper-mode`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${partnersApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ address: fullAddress, filters: {}, extraParams: {} }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          break;
        } catch (retryErr) {
          clearTimeout(timeout);
          const isTimeout = retryErr instanceof Error && retryErr.name === 'AbortError';
          if (attempt < MAX_ANALYSIS_RETRIES && isTimeout) {
            console.warn(`[Job ${job_id}] Timeout on ${fullAddress}, retrying (${attempt}/${MAX_ANALYSIS_RETRIES})...`);
            await logActivity(supabase, job_id, 'analyzing', `Retry ${attempt}/${MAX_ANALYSIS_RETRIES} after timeout...`, fullAddress);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          const msg = retryErr instanceof Error && retryErr.name === 'AbortError' ? 'timeout (300s)' : (retryErr instanceof Error ? retryErr.message : 'unknown');
          errors.push(`${fullAddress}: ${msg}`);
          await logActivity(supabase, job_id, 'error', msg, fullAddress);
          analyzeResponse = null;
          break;
        }
      }

      if (!analyzeResponse) {
        continue; // Skip to next property
      }

      try {
        if (!analyzeResponse.ok) {
          errors.push(`${fullAddress}: analysis failed (${analyzeResponse.status})`);
          await logActivity(supabase, job_id, 'error', `Analysis failed (HTTP ${analyzeResponse.status})`, fullAddress);
          continue;
        }

        const analysisData = await analyzeResponse.json();
        const analysis = analysisData?.data?.analysis;
        const property = analysisData?.data?.property;

        if (!analysis) {
          errors.push(`${fullAddress}: no analysis data returned`);
          await logActivity(supabase, job_id, 'error', `No analysis data returned`, fullAddress);
          continue;
        }

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
          propertyType: property?.property_type ?? 'other',
          lotSize: property?.lot_area ?? null,
          latitude: analysis.latitude ?? property?.latitude ?? null,
          longitude: analysis.longitude ?? property?.longitude ?? null,
          daysOnMarket: property?.days_on_zillow ?? null,
          daysOnMarketFetchedAt: new Date().toISOString(),
          county: property?.county ?? null,
          detailUrl: analysis.detail_url ?? property?.detail_url ?? null,
          imgSrc: analysis.img_src ?? property?.img_src ?? null,
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
          agentName: property?.attributionInfo?.agentName ?? null,
          agentEmail: property?.attributionInfo?.agentEmail ?? null,
          agentPhone: property?.attributionInfo?.agentPhoneNumber ?? null,
          brokerName: property?.attributionInfo?.brokerName ?? null,
          mlsId: property?.attributionInfo?.mlsId ?? null,
          section8: analysis.metrics?.section8 ?? null,
          saleComps: analysis.metrics?.comps?.map((c: any) => ({
            address: c.address || '', salePrice: c.sale_price || 0, saleDate: c.sale_date || '',
            bedrooms: c.bedrooms || 0, bathrooms: c.bathrooms || 0, sqft: c.sqft || 0,
            distance: c.distance || 0, similarityScore: c.similarity?.overall_score || 0,
          })) || [],
          rentComps: analysis.metrics?.rent_comps?.map((c: any) => ({
            address: c.address || '', originalRent: c.originalRent || c.adjustedRent || 0,
            adjustedRent: c.adjustedRent || 0, bedrooms: c.bedrooms || 0, bathrooms: c.bathrooms || 0,
            sqft: c.sqft || 0, adjustment: c.adjustment || 0, adjustmentReason: c.adjustmentReason || '',
          })) || [],
          priceHistory: property?.priceHistory?.map((p: any) => ({
            date: p.date || '', price: p.price || 0, event: p.event || '',
          })) || [],
          taxHistory: property?.tax_history?.map((t: any) => ({
            time: t.time || 0, taxPaid: t.taxPaid ?? null, value: t.value ?? null,
          })) || [],
          rawResponse: { analysis, property },
        };

        const currentPrice = apiData.purchasePrice ?? 0;

        // === NEW DEAL: Check flip score ===
        const flipResult = calculateFlipScore(apiData);
        const addressParts = fullAddress.split(',').map((s: string) => s.trim());

        if (!flipResult || flipResult.score < MIN_FLIP_SCORE) {
          const reason = !flipResult
            ? 'missing price/ARV data'
            : `flip score ${flipResult.score}/10 (ROI ${flipResult.flipRoi.toFixed(1)}%) - below ${MIN_FLIP_SCORE}`;
          filteredOut.push(`${fullAddress}: ${reason}`);
          await logActivity(supabase, job_id, 'filtered_out', `Filtered out — ${reason}`, fullAddress, { score: flipResult?.score, roi: flipResult?.flipRoi });

          const { data: filteredDeal } = await supabase.from('deals').insert([{
            address_full: fullAddress,
            address_street: addressParts[0] || fullAddress,
            address_city: addressParts[1] || '',
            address_state: addressParts[2]?.split(' ')[0] || '',
            address_zip: addressParts[2]?.split(' ')[1] || null,
            source: 'api',
            status: 'filtered_out',
            api_data: apiData,
            rejection_reason: reason,
            job_id,
          }]).select('id').single();

          await supabase.from('api_deal_history').upsert({
            address_normalized: normalizedAddr,
            zipcode,
            purchase_price: currentPrice,
            deal_id: filteredDeal?.id ?? null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'address_normalized' });

          continue;
        }

        // Good deal — insert to DB
        const { data: insertedDeal, error: insertError } = await supabase
          .from('deals')
          .insert([{
            address_full: fullAddress,
            address_street: addressParts[0] || fullAddress,
            address_city: addressParts[1] || '',
            address_state: addressParts[2]?.split(' ')[0] || '',
            address_zip: addressParts[2]?.split(' ')[1] || null,
            source: 'api', status: 'under_analysis', api_data: apiData,
            job_id,
          }])
          .select('id')
          .single();

        if (insertError) {
          errors.push(`${fullAddress}: DB save failed`);
        }

        await supabase.from('api_deal_history').upsert({
          address_normalized: normalizedAddr,
          zipcode,
          purchase_price: currentPrice,
          deal_id: insertedDeal?.id ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'address_normalized' });

        const summary = calculateFinancialSummary(apiData);
        await logActivity(supabase, job_id, 'good_deal', `✅ Good deal! Flip Score: ${flipResult.score}/10 (ROI ${flipResult.flipRoi.toFixed(1)}%)`, fullAddress, { score: flipResult.score, roi: flipResult.flipRoi, deal_id: insertedDeal?.id });
        deals.push({
          deal_id: insertedDeal?.id ?? null,
          address: fullAddress,
          ...summary,
          ai_summary: apiData.aiSummary ?? null,
        });
      } catch (e) {
        const msg = e instanceof Error && e.name === 'AbortError' ? 'timeout (300s)' : (e instanceof Error ? e.message : 'unknown');
        errors.push(`${fullAddress}: ${msg}`);
        await logActivity(supabase, job_id, 'error', msg, fullAddress);
      }
    }

    // Update processed count once per batch (avoids parallel race conditions)
    await supabase.from('api_jobs').update({ processed_count: batchEnd }).eq('id', job_id);

    // ─── Re-check if job was cancelled during batch processing ───
    const { data: jobCheck } = await supabase.from('api_jobs').select('status').eq('id', job_id).single();
    const wasCancelled = jobCheck?.status === 'cancelled';

    // ─── Check if there are more addresses to process ───
    if (batchEnd < addresses.length && !wasCancelled) {
      console.log(`[Job ${job_id}] Batch done (${batchEnd}/${addresses.length}). Triggering next batch...`);

      // Fire next batch with retry logic for stability
      const workerUrl = `${supabaseUrl}/functions/v1/api-process-job`;
      const nextBatchBody = JSON.stringify({
        job_id,
        batch_offset: batchEnd,
        accumulated_results: { deals, filteredOut, duplicateSkipped, priceDropUpdated, errors },
      });

      // Fire-and-forget with retries: avoids chain timeouts and prevents stuck jobs
      (async () => {
        let lastError = '';

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const response = await fetch(workerUrl, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
              body: nextBatchBody,
            });

            if (response.ok) {
              return;
            }

            const responseText = await response.text();
            lastError = `HTTP ${response.status}: ${responseText?.slice(0, 300) || 'empty response'}`;
            throw new Error(lastError);
          } catch (err) {
            lastError = err instanceof Error ? err.message : 'Unknown trigger error';
            console.error(`[Job ${job_id}] Next batch trigger attempt ${attempt}/3 failed:`, lastError);

            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
            }
          }
        }

        // Final failure: finalize with partial results so job never stays stuck
        const totalAnalyzedPartial = deals.length + filteredOut.length + duplicateSkipped.length + priceDropUpdated.length;
        const partialResults = {
          zipcode,
          summary: `Partial completion: analyzed ${totalAnalyzedPartial} of ${addresses.length}. Worker could not trigger next batch.`,
          total_analyzed: totalAnalyzedPartial,
          total_good_deals: deals.length,
          total_filtered_out: filteredOut.length,
          total_duplicate_skipped: duplicateSkipped.length,
          total_price_drop_updated: priceDropUpdated.length,
          partial: true,
          deals: deals.sort((a: any, b: any) => (b.flip?.score ?? 0) - (a.flip?.score ?? 0)),
          ...(skipped?.length > 0 ? { skipped } : {}),
          ...(filteredOut.length > 0 ? { filtered_out_deals: filteredOut } : {}),
          ...(duplicateSkipped.length > 0 ? { duplicate_skipped: duplicateSkipped } : {}),
          ...(priceDropUpdated.length > 0 ? { price_drop_updated: priceDropUpdated } : {}),
          ...(errors.length > 0 ? { errors } : {}),
        };

        const { data: partialFinalize } = await supabase
          .from('api_jobs')
          .update({
            status: 'completed',
            results: partialResults,
            processed_count: batchEnd,
            error: `Partial completion: failed to trigger next batch at offset ${batchEnd}: ${lastError}`,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job_id)
          .eq('status', 'processing')
          .is('completed_at', null)
          .select('id')
          .maybeSingle();

        if (!partialFinalize) {
          return;
        }

        await logActivity(supabase, job_id, 'job_completed', 'Job completed with partial results (next batch trigger failed)', undefined, {
          offset: batchEnd,
          error: lastError,
          partial: true,
          analyzed: totalAnalyzedPartial,
        });

        if (job.callback_url) {
          await sendWebhookWithRetries(
            supabase,
            job_id,
            job.callback_url,
            { success: true, job_id, ...partialResults, one_time_partial: true },
            3,
            webhookSecret,
          );
        }
      })();

      return new Response(JSON.stringify({ success: true, job_id, batch: `${batch_offset}-${batchEnd}`, next_batch: batchEnd }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── All batches done (or cancelled) — finalize job ───
    const totalAnalyzed = deals.length + filteredOut.length + duplicateSkipped.length + priceDropUpdated.length;
    const summary_message = wasCancelled
      ? `Job stopped. Analyzed ${totalAnalyzed} of ${addresses.length} properties. ${deals.length} good deals found.`
      : `Found ${totalAnalyzed} properties in ZIP ${zipcode}. ${deals.length} are good deals (Flip Score ≥ ${MIN_FLIP_SCORE}), ${filteredOut.length} filtered out (below threshold), ${duplicateSkipped.length} already analyzed, ${priceDropUpdated.length} price drops updated.`;

    const results = {
      zipcode,
      summary: summary_message,
      total_analyzed: totalAnalyzed,
      total_good_deals: deals.length,
      total_filtered_out: filteredOut.length,
      total_duplicate_skipped: duplicateSkipped.length,
      total_price_drop_updated: priceDropUpdated.length,
      deals: deals.sort((a: any, b: any) => (b.flip?.score ?? 0) - (a.flip?.score ?? 0)),
      ...(skipped?.length > 0 ? { skipped } : {}),
      ...(filteredOut.length > 0 ? { filtered_out_deals: filteredOut } : {}),
      ...(duplicateSkipped.length > 0 ? { duplicate_skipped: duplicateSkipped } : {}),
      ...(priceDropUpdated.length > 0 ? { price_drop_updated: priceDropUpdated } : {}),
      ...(errors.length > 0 ? { errors } : {}),
    };

    const { data: finalizedJob } = await supabase
      .from('api_jobs')
      .update({
        status: 'completed',
        results,
        processed_count: addresses.length,
        error: null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job_id)
      .eq('status', wasCancelled ? 'cancelled' : 'processing')
      .is('completed_at', null)
      .select('id')
      .maybeSingle();

    if (!finalizedJob) {
      return new Response(JSON.stringify({ success: true, job_id, skipped: 'already_finalized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Job ${job_id}] Completed: ${deals.length} good deals out of ${addresses.length} analyzed`);
    await logActivity(supabase, job_id, 'job_completed', `Job completed — ${deals.length} good deals, ${filteredOut.length} filtered out, ${errors.length} errors`, null, { good: deals.length, filtered: filteredOut.length, errors: errors.length });

    if (job.callback_url) {
      const webhookResult = await sendWebhookWithRetries(
        supabase,
        job_id,
        job.callback_url,
        { success: true, job_id, ...results },
        3,
        webhookSecret,
      );

      if (!webhookResult.success) {
        await supabase.from('api_jobs').update({
          error: `Webhook delivery failed: ${webhookResult.error}`,
        }).eq('id', job_id);
      }
    }

    return new Response(JSON.stringify({ success: true, job_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in api-process-job:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
