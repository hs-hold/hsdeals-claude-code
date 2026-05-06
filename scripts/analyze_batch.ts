// Pick top N unanalyzed candidates in Atlanta metro, run them through the
// analyze-property edge function, write api_data back, and report.
//
// Caps DealBeast calls at MAX_CALLS (default 20). Skips deals that already
// have api_data.rawResponse (idempotent re-runs).

import { mapToDealApiData } from '../src/services/deals/analyzeAndCreateDeal';
import { calculateFinancials } from '../src/utils/financialCalculations';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? '';
const FUNCTIONS_URL = `https://${PROJECT_REF}.functions.supabase.co`;
const MAX_CALLS = Number(process.env.MAX_CALLS || 20);

// Atlanta metro zips ≤25 mi from city center, minus FindMeDeals exclusions.
// Loaded inline to avoid a JSON import in node.
import atlantaZipsRaw from '../src/data/atlantaZips.json';

const FMD_EXCLUDE = new Set(['30263', '30265']); // Newnan
const TOO_FAR_MI = 25;
const METRO_ZIPS = new Set(
  (atlantaZipsRaw as Array<{ zip: string; distanceMiles?: number }>)
    .filter(z => (z.distanceMiles ?? 99) <= TOO_FAR_MI && !FMD_EXCLUDE.has(z.zip))
    .map(z => z.zip),
);

async function fetchAllDeals(): Promise<any[]> {
  // Light SELECT (no rawResponse) — paginated. Order by created_at DESC so
  // newest leads come first; old email-extracted addresses tend to be off-
  // market by the time we get to them.
  const out: any[] = [];
  const PAGE = 250;
  for (let off = 0; ; off += PAGE) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/deals?select=id,address_full,address_zip,address_city,status,findmedeals_processed_at,api_data,created_at&order=created_at.desc&offset=${off}&limit=${PAGE}`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    );
    if (!r.ok) {
      console.error(`fetch page ${off} HTTP ${r.status}`);
      break;
    }
    const page = await r.json();
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

function getZip(d: any): string | null {
  if (d.address_zip) return d.address_zip;
  const m = (d.address_full || '').match(/\b(3\d{4})\b/);
  return m ? m[1] : null;
}

function rankCandidate(d: any): number {
  // Heuristic ranking. Higher = more promising:
  //  - FRESH (created recently) — old email-extracted leads often off-market
  //  - Real list price in $50K flip-friendly band
  //  - Atlanta metro, prefer ITP/Decatur over outer suburbs
  const api = d.api_data || {};
  const price = api.emailPurchasePrice ?? api.purchasePrice ?? null;
  let score = 0;
  // Freshness — half-life around 14 days. Newer = much higher signal that
  // the listing is still active.
  if (d.created_at) {
    const ageDays = (Date.now() - Date.parse(d.created_at)) / 86_400_000;
    if (ageDays <= 7) score += 40;
    else if (ageDays <= 21) score += 25;
    else if (ageDays <= 60) score += 10;
    // Older than 60 days: stale, no bonus
  }
  // Sweet-spot price: $80-180K = best for $50K net flip
  if (price != null) {
    if (price >= 80_000 && price <= 180_000) score += 30;
    else if (price >= 60_000 && price <= 250_000) score += 15;
    else if (price > 0) score += 5;
  } else {
    score += 10;
  }
  // Zip quality
  const ITP = new Set(['30030', '30033', '30307', '30308', '30309', '30312', '30317', '30318', '30319']);
  const INNER = new Set(['30311', '30314', '30315', '30316', '30310', '30032', '30354', '30344']);
  const z = getZip(d);
  if (z && ITP.has(z)) score += 30;
  else if (z && INNER.has(z)) score += 20;
  else if (z && METRO_ZIPS.has(z)) score += 10;
  return score;
}

async function callAnalyzeProperty(address: string): Promise<any | null> {
  const r = await fetch(`${FUNCTIONS_URL}/analyze-property`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address }),
  });
  if (!r.ok) {
    const txt = await r.text();
    console.error(`  ✗ ${address} → HTTP ${r.status}: ${txt.slice(0, 200)}`);
    return null;
  }
  const j = await r.json();
  if (!j?.success && !j?.data?.analysis) {
    console.error(`  ✗ ${address} → no analysis: ${JSON.stringify(j).slice(0, 200)}`);
    return null;
  }
  return j;
}

async function patchDealApiData(dealId: string, apiData: any): Promise<boolean> {
  const financials = calculateFinancials(apiData, {} as any);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/deals?id=eq.${dealId}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      api_data: apiData,
      financials,
      analyzed_at: new Date().toISOString(),
      status: 'qualified',
    }),
  });
  return r.ok;
}

async function main() {
  console.error(`Fetching deals…`);
  const rows = await fetchAllDeals();
  console.error(`Fetched ${rows.length}`);

  // Eligible candidates: status active, no api_data.rawResponse, in metro zip,
  // not yet FMD-rejected, address has a leading street number (no street-only
  // entries — those waste DealBeast calls).
  const HAS_HOUSE_NUMBER = /^\s*\d{2,6}\s+\S/;
  const candidates = rows.filter(d => {
    if (['rejected', 'closed', 'not_relevant', 'filtered_out', 'pending_other'].includes(d.status)) return false;
    if (d.findmedeals_processed_at) return false;
    const api = d.api_data || {};
    if (api?.rawResponse) return false;
    const z = getZip(d);
    if (!z || !METRO_ZIPS.has(z)) return false;
    const addr = (d.address_full || '').trim();
    if (!addr) return false;
    if (!HAS_HOUSE_NUMBER.test(addr)) return false;
    return true;
  });

  console.error(`Eligible candidates: ${candidates.length}`);

  // Dedupe by normalized address — multiple deal rows often share the same
  // property and would burn parallel DealBeast calls otherwise.
  const normalizeAddr = (s: string) => s.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  const deduped = candidates.filter(d => {
    const k = normalizeAddr(d.address_full);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const ranked = deduped
    .map(d => ({ d, score: rankCandidate(d) }))
    .sort((a, b) => b.score - a.score);

  const PREVIEW = Number(process.env.PREVIEW || 0);
  const sliceTo = PREVIEW > 0 ? PREVIEW : MAX_CALLS;
  const top = ranked.slice(0, sliceTo);
  console.error(`Selected top ${top.length} for DealBeast${PREVIEW ? ' (preview only)' : ''}:`);
  for (const { d, score } of top) {
    const z = getZip(d);
    const price = d.api_data?.emailPurchasePrice ?? '?';
    console.error(`  [${score}] ${z} | $${price} | ${d.address_full}`);
  }
  if (PREVIEW > 0) {
    console.log(JSON.stringify({ preview: true, candidates: top.map(t => ({ id: t.d.id, addr: t.d.address_full, zip: getZip(t.d), price: t.d.api_data?.emailPurchasePrice })) }, null, 2));
    return;
  }

  console.error(`\nRunning DealBeast calls (cap ${MAX_CALLS})…`);
  let succeeded = 0;
  let failed = 0;
  const results: any[] = [];
  for (const { d } of top) {
    const json = await callAnalyzeProperty(d.address_full);
    if (!json) { failed++; continue; }
    const analysis = json?.data?.analysis;
    const property = json?.data?.property;
    if (!analysis) { failed++; console.error(`  ✗ ${d.address_full} → missing analysis`); continue; }
    let apiData;
    try {
      apiData = mapToDealApiData(analysis, property);
    } catch (e: any) {
      failed++;
      console.error(`  ✗ ${d.address_full} → mapToDealApiData error: ${e?.message}`);
      continue;
    }
    const ok = await patchDealApiData(d.id, apiData);
    if (ok) {
      succeeded++;
      console.error(`  ✓ ${d.address_full}  arv=${apiData.arv} sqft=${apiData.sqft}`);
      results.push({ id: d.id, address: d.address_full, arv: apiData.arv, sqft: apiData.sqft });
    } else {
      failed++;
      console.error(`  ✗ ${d.address_full} → patch failed`);
    }
  }
  console.error(`\nDone. succeeded=${succeeded} failed=${failed}`);
  console.log(JSON.stringify({ succeeded, failed, results }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
