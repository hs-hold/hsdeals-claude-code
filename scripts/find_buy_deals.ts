// Score every deal in the DB through the same pipeline the Acquisition Engine
// uses (analyzeAcquisition + calculateInvestmentScore). Filter to decision="Buy"
// and sort by finalScore desc. Outputs JSON.

import { analyzeAcquisition } from '../src/utils/maoCalculations';
import {
  calculateInvestmentScore,
  DEFAULT_INVESTMENT_SCORE_SETTINGS,
} from '../src/utils/investmentScore';
import { calculateFinancials } from '../src/utils/financialCalculations';
import { isOnMajorRoad } from '../src/utils/highwayFilter';
import type { Deal } from '../src/types/deal';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function fetchAllDeals(): Promise<any[]> {
  const out: any[] = [];
  const PAGE = 1000;
  for (let off = 0; ; off += PAGE) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/deals?select=*&order=created_at.asc&offset=${off}&limit=${PAGE}`,
      {
        headers: {
          apikey: SERVICE,
          Authorization: `Bearer ${SERVICE}`,
        },
      },
    );
    const page = await r.json();
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

// Replicates mapDBDealToDeal minimally — just enough for analyzeAcquisition.
function rowToDeal(row: any): Deal | null {
  const apiData: Record<string, any> = { ...((row.api_data as any) || {}) };
  const overrides: Record<string, any> = { ...((row.overrides as any) || {}) };
  if (!apiData || Object.keys(apiData).length === 0) return null;
  const financials = calculateFinancials(apiData, overrides);

  return {
    id: row.id,
    address: {
      full: row.address_full ?? '',
      street: row.address_street ?? '',
      city: row.address_city ?? '',
      state: row.address_state ?? '',
      zip: row.address_zip ?? '',
    },
    apiData: apiData as any,
    overrides: overrides as any,
    financials: financials as any,
    status: row.status,
    notes: row.notes,
    dealType: row.deal_type,
    isLocked: row.is_locked,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as any;
}

async function main() {
  const rows = await fetchAllDeals();
  console.error(`Fetched ${rows.length} deals from DB`);

  type ScoredDeal = {
    id: string;
    address: string;
    zip: string;
    status: string;
    fmd_verdict: string | null;
    finalScore: number;
    decision: string;
    cashFlowScore: number;
    equityScore: number;
    locationScore: number;
    monthlyCashflow: number;
    trueEquity: number;
    arv: number;
    purchasePrice: number;
    rehab: number;
    isFullBrrrr: boolean;
    schoolTotal: number;
    sqft: number | null;
    grade: string | null;
    cap: number | null;
    onMajorRoad: boolean;
  };

  const scored: ScoredDeal[] = [];
  let analyzed = 0, skipped_no_apidata = 0, skipped_no_analysis = 0, skipped_no_score = 0;

  for (const row of rows) {
    if (row.status === 'rejected' || row.status === 'closed' || row.status === 'not_relevant' || row.status === 'filtered_out' || row.status === 'pending_other') {
      continue;
    }
    const deal = rowToDeal(row);
    if (!deal) { skipped_no_apidata++; continue; }
    const analysis = analyzeAcquisition(deal);
    if (!analysis) { skipped_no_analysis++; continue; }
    const inv = calculateInvestmentScore(
      {
        monthlyCashflow: analysis.brrrrVerdict.monthlyCashflow,
        cashLeftInDeal: analysis.brrrrVerdict.cashLeftInDeal,
        arv: analysis.arv,
        purchasePrice: deal.overrides?.purchasePrice ?? deal.apiData.purchasePrice ?? 0,
        rehabCost: deal.overrides?.rehabCost ?? deal.apiData.rehabCost ?? 0,
        schoolTotal: deal.apiData.schoolScore,
        inventoryMonths: deal.overrides?.inventoryMonths ?? null,
      },
      DEFAULT_INVESTMENT_SCORE_SETTINGS,
    );
    if (!inv) { skipped_no_score++; continue; }
    analyzed++;
    scored.push({
      id: deal.id,
      address: deal.address.full || `${deal.address.street}, ${deal.address.city}, ${deal.address.state} ${deal.address.zip}`,
      zip: deal.address.zip,
      status: row.status,
      fmd_verdict: row.findmedeals_verdict,
      finalScore: inv.finalScore,
      decision: inv.decision,
      cashFlowScore: inv.cashFlowScore,
      equityScore: inv.equityScore,
      locationScore: inv.locationScore,
      monthlyCashflow: inv.monthlyCashflow,
      trueEquity: inv.trueEquity,
      arv: analysis.arv,
      purchasePrice: deal.overrides?.purchasePrice ?? deal.apiData.purchasePrice ?? 0,
      rehab: deal.overrides?.rehabCost ?? deal.apiData.rehabCost ?? 0,
      isFullBrrrr: inv.isFullBrrrr,
      schoolTotal: inv.schoolTotal,
      sqft: deal.apiData.sqft ?? null,
      grade: deal.apiData.grade ?? null,
      cap: deal.apiData.capRate ?? null,
      onMajorRoad: isOnMajorRoad(deal.address.street) || isOnMajorRoad(deal.address.full),
    });
  }

  scored.sort((a, b) => b.finalScore - a.finalScore);
  const buys = scored.filter(s => s.decision === 'Buy' && !s.onMajorRoad);

  console.error(`Analyzed ${analyzed} deals; skipped_no_apidata=${skipped_no_apidata} skipped_no_analysis=${skipped_no_analysis} skipped_no_score=${skipped_no_score}`);
  console.error(`Buys: ${buys.length}  Pass: ${scored.length - buys.length}`);

  // Specific deal IDs to always include (e.g. current claude_picks)
  const watchIds = (process.env.WATCH_IDS || '').split(',').filter(Boolean);
  const watched = scored.filter(s => watchIds.includes(s.id));

  const out = {
    summary: {
      total_in_db: rows.length,
      analyzed,
      skipped_no_apidata,
      skipped_no_analysis,
      skipped_no_score,
      buys: buys.length,
      buy_threshold: DEFAULT_INVESTMENT_SCORE_SETTINGS.buyThreshold,
    },
    top_buys: buys.slice(0, 30),
    near_buys: scored.filter(s => s.finalScore >= 6 && s.decision !== 'Buy' && !s.onMajorRoad).slice(0, 30),
    watched,
    score_distribution: {
      ge_8: scored.filter(s => s.finalScore >= 8).length,
      ge_7: scored.filter(s => s.finalScore >= 7).length,
      ge_6: scored.filter(s => s.finalScore >= 6).length,
      ge_5: scored.filter(s => s.finalScore >= 5).length,
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
