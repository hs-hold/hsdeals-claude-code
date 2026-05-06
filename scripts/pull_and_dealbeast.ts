// Pull fresh FOR_SALE listings via zillow-search edge function for target
// Atlanta zips, dedupe against existing DB, pre-filter by price band + sqft,
// then call analyze-property on the top N (capped by MAX_CALLS) to refresh
// or create deals with DealBeast data.

import { mapToDealApiData } from '../src/services/deals/analyzeAndCreateDeal';
import { calculateFinancials } from '../src/utils/financialCalculations';
import { isOnMajorRoad } from '../src/utils/highwayFilter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? '';
const FUNCTIONS_URL = `https://${PROJECT_REF}.functions.supabase.co`;
const MAX_CALLS = Number(process.env.MAX_CALLS || 30);

// High-quality Atlanta zips for BRRRR/flip — inner metro + select inner-suburb
// strongholds. Excludes Newnan / far-out zips per FindMeDeals exclusion.
const TARGET_ZIPS = [
  '30030',  // Decatur
  '30033',  // North Decatur
  '30310',  // West End / Adair Park
  '30311',  // Westview
  '30312',  // Old Fourth Ward
  '30314',  // Atlanta University Center
  '30315',  // South Atlanta (high investor activity)
  '30316',  // East Atlanta Village
  '30317',  // Kirkwood
  '30318',  // Midtown West / Hunter Hills
  '30032',  // East Decatur
  '30354',  // Hapeville
  '30344',  // East Point
  '30331',  // Cascade
];

interface ZillowListing {
  zpid: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  daysOnZillow: number | null;
  detailUrl: string | null;
  description: string | null;
}

async function searchZip(zipcode: string): Promise<ZillowListing[]> {
  const r = await fetch(`${FUNCTIONS_URL}/zillow-search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: zipcode,
      minPrice: 80_000,
      maxPrice: 250_000,
      homeType: 'SingleFamily',
    }),
  });
  if (!r.ok) {
    console.error(`zillow-search ${zipcode} → HTTP ${r.status}`);
    return [];
  }
  const j = await r.json();
  // Edge function returns { success, totalResultCount, properties: [...] }
  const props: any[] = j?.properties || j?.listings || j?.data?.listings || [];
  return props as ZillowListing[];
}

async function fetchAllZips(): Promise<{ zip: string; listings: ZillowListing[] }[]> {
  const out: { zip: string; listings: ZillowListing[] }[] = [];
  for (const z of TARGET_ZIPS) {
    const listings = await searchZip(z);
    console.error(`  ${z}: ${listings.length} listings`);
    out.push({ zip: z, listings });
  }
  return out;
}

async function fetchExistingDealAddresses(): Promise<Set<string>> {
  const out = new Set<string>();
  const PAGE = 250;
  for (let off = 0; ; off += PAGE) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/deals?select=address_full,api_data&offset=${off}&limit=${PAGE}`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    );
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page) || page.length === 0) break;
    for (const d of page) {
      const api = d?.api_data || {};
      const hasRaw = !!api?.rawResponse;
      // Only mark "skip" if has rawResponse (already analyzed)
      if (hasRaw && d.address_full) {
        out.add(normAddr(d.address_full));
      }
    }
    if (page.length < PAGE) break;
  }
  return out;
}

function normAddr(s: string): string {
  return (s || '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

function rankListing(l: ZillowListing): number {
  let score = 0;
  // Freshness — newer listings are more likely to still be active
  if (l.daysOnZillow != null) {
    if (l.daysOnZillow <= 14) score += 40;
    else if (l.daysOnZillow <= 60) score += 20;
    else score += 5;
  }
  // Sweet-spot price for $50K net flip math
  if (l.price >= 90_000 && l.price <= 180_000) score += 30;
  else if (l.price >= 80_000 && l.price <= 220_000) score += 15;
  // Sqft within investor sweet spot
  if (l.sqft != null && l.sqft >= 1100 && l.sqft <= 2400) score += 20;
  // Year — pre-1980 = riskier rehab, but cheaper. Mixed.
  if (l.yearBuilt != null && l.yearBuilt >= 1990) score += 10;
  // Inner zips bonus
  const ITP = new Set(['30030','30033','30307','30308','30309','30312','30317','30318','30319']);
  if (ITP.has(l.zipcode)) score += 20;
  return score;
}

async function callAnalyzeProperty(address: string): Promise<any | null> {
  const r = await fetch(`${FUNCTIONS_URL}/analyze-property`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  if (!r.ok) {
    console.error(`  ✗ ${address} → HTTP ${r.status}`);
    return null;
  }
  return await r.json();
}

async function findOrCreateDealId(address: string): Promise<string | null> {
  // Search by address (case-insensitive ilike)
  const url = `${SUPABASE_URL}/rest/v1/deals?select=id&address_full=ilike.${encodeURIComponent(address)}&limit=1`;
  const r = await fetch(url, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  if (r.ok) {
    const arr = await r.json();
    if (Array.isArray(arr) && arr[0]?.id) return arr[0].id;
  }
  return null;
}

async function patchOrInsertDeal(listing: ZillowListing, apiData: any): Promise<boolean> {
  const financials = calculateFinancials(apiData, {} as any);
  const addr = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zipcode}`.replace(/\s+/g,' ').trim();
  const existing = await findOrCreateDealId(addr);
  const body = {
    api_data: apiData,
    financials,
    analyzed_at: new Date().toISOString(),
    status: 'qualified',
  };
  if (existing) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/deals?id=eq.${existing}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    return r.ok;
  } else {
    // Insert new
    const insertBody = {
      ...body,
      address_full: addr,
      address_street: listing.address,
      address_city: listing.city,
      address_state: listing.state,
      address_zip: listing.zipcode,
      source: 'findmedeals-zillow-search',
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/deals`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(insertBody),
    });
    return r.ok;
  }
}

async function main() {
  console.error(`Pulling fresh listings from ${TARGET_ZIPS.length} zips...`);
  const all = await fetchAllZips();
  const total = all.reduce((n, x) => n + x.listings.length, 0);
  console.error(`Total listings: ${total}`);

  console.error(`Loading existing analyzed addresses...`);
  const existing = await fetchExistingDealAddresses();
  console.error(`Already analyzed: ${existing.size}`);

  // Flatten + dedupe + filter
  const flat: ZillowListing[] = [];
  const seen = new Set<string>();
  for (const { listings } of all) {
    for (const l of listings) {
      const fullAddr = `${l.address}, ${l.city}, ${l.state} ${l.zipcode}`;
      const k = normAddr(fullAddr);
      if (seen.has(k)) continue;
      seen.add(k);
      if (existing.has(k)) continue; // already in DB with rawResponse
      if (!l.address || !l.zipcode) continue;
      if (isOnMajorRoad(l.address) || isOnMajorRoad(fullAddr)) continue;
      // Must have a house number
      if (!/^\s*\d{2,6}\s+\S/.test(l.address)) continue;
      // Sqft sanity
      if (l.sqft != null && l.sqft < 800) continue;
      flat.push(l);
    }
  }

  console.error(`Fresh, deduped, filtered: ${flat.length}`);

  const ranked = flat.map(l => ({ l, score: rankListing(l) }))
                     .sort((a, b) => b.score - a.score);

  const top = ranked.slice(0, MAX_CALLS);
  console.error(`\nSelecting top ${top.length} for DealBeast (budget ${MAX_CALLS}):`);
  for (const { l, score } of top) {
    console.error(`  [${score}] ${l.zipcode} | $${l.price} | ${l.daysOnZillow}d | ${l.sqft}sf | ${l.address}`);
  }

  if (process.env.PREVIEW === '1') {
    console.log(JSON.stringify({ preview: true, candidates: top.map(t => ({ addr: `${t.l.address}, ${t.l.city}, ${t.l.state} ${t.l.zipcode}`, zip: t.l.zipcode, price: t.l.price, dom: t.l.daysOnZillow, sqft: t.l.sqft })) }, null, 2));
    return;
  }

  console.error(`\nRunning DealBeast on top ${top.length}...`);
  let succeeded = 0, failed = 0;
  const results: any[] = [];
  for (const { l } of top) {
    const fullAddr = `${l.address}, ${l.city}, ${l.state} ${l.zipcode}`;
    const j = await callAnalyzeProperty(fullAddr);
    if (!j) { failed++; continue; }
    const analysis = j?.data?.analysis;
    const property = j?.data?.property;
    if (!analysis) { failed++; console.error(`  ✗ ${fullAddr} → no analysis`); continue; }
    let apiData;
    try {
      apiData = mapToDealApiData(analysis, property);
    } catch (e: any) {
      failed++;
      console.error(`  ✗ ${fullAddr} → mapper error: ${e?.message}`);
      continue;
    }
    const ok = await patchOrInsertDeal(l, apiData);
    if (ok) {
      succeeded++;
      console.error(`  ✓ ${fullAddr}  arv=${apiData.arv} sqft=${apiData.sqft} hs=${property?.homeStatus}`);
      results.push({ addr: fullAddr, arv: apiData.arv, sqft: apiData.sqft, homeStatus: property?.homeStatus });
    } else {
      failed++;
      console.error(`  ✗ ${fullAddr} → patch/insert failed`);
    }
  }

  console.error(`\nDone. succeeded=${succeeded} failed=${failed}`);
  console.log(JSON.stringify({ succeeded, failed, results }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
