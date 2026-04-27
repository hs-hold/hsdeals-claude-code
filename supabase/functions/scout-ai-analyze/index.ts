import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Fetch a service API key from the DB, falling back to env var */
async function getServiceKey(serviceName: string, envFallback: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceKey);
    const { data } = await db
      .from('service_api_keys')
      .select('api_key')
      .eq('service_name', serviceName)
      .single();
    if (data?.api_key) return data.api_key;
  } catch { /* fallthrough */ }
  return Deno.env.get(envFallback) || null;
}

const RAPIDAPI_HOST = 'us-real-estate-listings.p.rapidapi.com';
const MODEL      = 'claude-sonnet-4-5';
const INPUT_CPM  = 0.003;
const OUTPUT_CPM = 0.015;

function zillowUrl(zpid: string | number | undefined) {
  if (!zpid) return null;
  return `https://www.zillow.com/homedetails/${zpid}_zpid/`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { deal } = body;

    if (!deal?.address || !deal?.price) {
      return new Response(
        JSON.stringify({ success: false, error: 'deal data required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [rapidApiKey, anthropicKey] = await Promise.all([
      getServiceKey('rapidapi',  'RAPIDAPI_KEY'),
      getServiceKey('anthropic', 'ANTHROPIC_API_KEY'),
    ]);
    if (!rapidApiKey || !anthropicKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API keys not configured — set them in Settings → External API Keys' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const zip  = deal.zip || deal.address?.match(/\d{5}/)?.[0] || '';
    const zpid = deal.zpid || '';
    const h    = { 'X-RapidAPI-Key': rapidApiKey, 'X-RapidAPI-Host': RAPIDAPI_HOST };

    // ── Step 1: Parallel — sold comps + active + property details ─────────────
    let soldComps:      any[] = [];
    let activeListings: any[] = [];
    let propertyStatus        = 'unknown';
    let propertyStatusDetail  = '';
    let propertyDescription   = '';
    let propertyType          = '';
    let yearBuilt             = '';
    let lotSize               = '';
    let photoCount            = 0;

    const fetches: Promise<any>[] = [
      // Active for-sale listings in ZIP (used as market context / comps)
      zip ? fetch(`https://${RAPIDAPI_HOST}/for-sale?location=${zip}&limit=20`, { headers: h }).then(r => r.json()).catch(() => ({})) : Promise.resolve({}),
    ];

    const [activeData] = await Promise.all(fetches);

    // New API has for-sale only (no sold comps endpoint)
    soldComps      = [];
    activeListings = (activeData?.listings || [])
      .filter((l: any) => l.status === 'for_sale')
      .slice(0, 10)
      .map((l: any) => {
        const addr = l.location?.address || {};
        const desc = l.description || {};
        return {
          zpid: l.property_id || l.listing_id,
          id: l.property_id || l.listing_id,
          unformattedPrice: l.list_price || 0,
          price: l.list_price || 0,
          area: desc.sqft || 0,
          livingArea: desc.sqft || 0,
          beds: desc.beds || 0,
          baths: desc.baths || 0,
          homeType: desc.type || '',
          yearBuilt: desc.year_built || null,
          address: { street: addr.line || '', city: addr.city || '' },
          streetAddress: addr.line || '',
          description: desc.text || '',
        };
      });

    const propData = null; // Property detail lookup not available in new API

    // ── Extract property details from active listings (no property detail endpoint in new API) ──
    // Try to find the subject property by address match in active listings
    const dealAddressNorm = (deal.address || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const matchedListing = activeListings.find((p: any) => {
      const pAddr = ((p.address?.street || p.streetAddress || '') + ' ' + (p.address?.city || '')).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      return pAddr && dealAddressNorm && dealAddressNorm.includes(pAddr.split(' ')[0]);
    });

    if (matchedListing) {
      propertyDescription = matchedListing.description || '';
      propertyType   = matchedListing.homeType || '';
      yearBuilt      = matchedListing.yearBuilt ? String(matchedListing.yearBuilt) : '';
      propertyStatus = 'for_sale';
      propertyStatusDetail = 'Active for sale';
    }

    // ── Step 2: Format comps ──────────────────────────────────────────────────
    interface CompFmt { label:string; zpid:string|null; address:string; price:number; beds:any; baths:any; sqft:number; pricePerSqft:number; soldDate:string|null; zillowUrl:string|null }
    const fmtComp = (p: any): CompFmt => {
      const price = p.unformattedPrice || p.price || 0;
      const sqft  = p.area || p.livingArea || 0;
      const id    = p.zpid || p.id || null;
      return {
        label: `${p.address?.street || p.streetAddress || 'Unknown'}, ${p.address?.city||''}`.trim().replace(/,\s*$/,''),
        zpid: id ? String(id) : null,
        address: p.address?.street || p.streetAddress || 'Unknown',
        price, beds: p.beds||'?', baths: p.baths||'?', sqft,
        pricePerSqft: sqft > 0 ? Math.round(price/sqft) : 0,
        soldDate: p.soldDate || null,
        zillowUrl: id ? zillowUrl(id) : null,
      };
    };

    const soldFmt   = soldComps.map(fmtComp);
    const activeFmt = activeListings.filter(p => String(p.zpid||p.id) !== String(zpid)).slice(0, 5).map(fmtComp);

    const compsText = soldFmt.length
      ? soldFmt.map(c => `  ${c.address} | $${(c.price/1000).toFixed(0)}k | ${c.beds}bd/${c.baths}ba | ${c.sqft}sf | $${c.pricePerSqft}/sf${c.soldDate ? ` | sold:${c.soldDate}` : ''}`).join('\n')
      : `No recently-sold data available — estimate ARV using active listing comparables below and your market knowledge for ZIP ${zip}`;

    const activeText = activeFmt.length
      ? activeFmt.map(c => `  ${c.address} | $${(c.price/1000).toFixed(0)}k | ${c.beds}bd/${c.baths}ba | ${c.sqft}sf | $${c.pricePerSqft}/sf`).join('\n')
      : 'No data';

    // ── Step 3: Build prompt ──────────────────────────────────────────────────
    const statusNote = propertyStatus === 'sold'    ? `⚠️ SOLD: ${propertyStatusDetail}` :
                       propertyStatus === 'pending' ? `⚠️ PENDING: ${propertyStatusDetail}` : '';

    const pricePerSqft = (deal.sqft && deal.sqft > 0) ? Math.round(deal.price / deal.sqft) : 0;

    // Detect obvious anomalies to guide Claude
    const anomalyHints: string[] = [];
    if (pricePerSqft > 0 && pricePerSqft < 25) anomalyHints.push(`Price/sqft is only $${pricePerSqft} — extremely low, may indicate land-only value or severe distress`);
    if (propertyType && propertyType.toLowerCase().includes('land')) anomalyHints.push(`Property type listed as: ${propertyType} — likely land only, not a structure`);
    const descLower = propertyDescription.toLowerCase();
    if (descLower.includes('fire') || descLower.includes('burned') || descLower.includes('smoke')) anomalyHints.push('Description mentions fire/smoke damage — may require gut rehab or demolition');
    if (descLower.includes('tear down') || descLower.includes('teardown') || descLower.includes('land value')) anomalyHints.push('Description indicates tear-down / land-value only');
    if (descLower.includes('flood') || descLower.includes('water damage')) anomalyHints.push('Description mentions flood/water damage');
    if (descLower.includes('lot') && !descLower.includes('parking lot') && deal.sqft < 500) anomalyHints.push('Very small sqft — may be a vacant lot or land parcel');
    if (descLower.includes('as is') || descLower.includes('as-is')) anomalyHints.push('Listed as-is — seller discloses known issues');

    const prompt = `You are an expert real estate investment analyst specializing in Atlanta Metro, GA. Analyze this deal thoroughly and return ONLY valid JSON.

${statusNote ? '🚨 LISTING STATUS: ' + statusNote + '\n' : ''}${anomalyHints.length > 0 ? '⚠️ AUTOMATIC FLAGS DETECTED:\n' + anomalyHints.map(h => '  - ' + h).join('\n') + '\n' : ''}
PROPERTY: ${deal.address}
ZIP: ${zip} | Ask: $${deal.price?.toLocaleString()} | ${deal.beds||'?'}bd/${deal.baths||'?'}ba | ${deal.sqft||0} sqft | DOM: ${deal.days_on_market||0}
${pricePerSqft > 0 ? `Price/sqft: $${pricePerSqft}` : ''}
${propertyType ? `Property Type: ${propertyType}` : ''}
${yearBuilt ? `Year Built: ${yearBuilt}` : ''}
${lotSize ? `Lot Size: ${lotSize}` : ''}
${photoCount > 0 ? `Photos available: ${photoCount}` : ''}
Algorithm estimates → ARV: ${deal.arv ? '$'+deal.arv.toLocaleString() : 'n/a'} | Rehab: ${deal.rehab ? '$'+deal.rehab.toLocaleString() : 'n/a'} | Rent: ${deal.rent ? '$'+deal.rent+'/mo' : 'n/a'} | Score: ${deal.score||0}/100

${propertyDescription ? `LISTING DESCRIPTION:\n"${propertyDescription.slice(0, 800)}"\n` : ''}
RECENTLY SOLD COMPS (same ZIP):
${compsText}

ACTIVE LISTINGS (competition):
${activeText}

CRITICAL INSTRUCTIONS:
1. Read the description carefully. If it mentions fire damage, lot only, teardown, flood — dramatically increase rehab or mark strategy as "none".
2. If price/sqft < $25, verify whether this is land or a severely distressed property.
3. For fire-damaged or gut-rehab properties, rehab cost should be 60-80% of ARV minimum.
4. Be specific — cite actual comp addresses when justifying ARV.
5. If the property is land-only or uninhabitable, set strategy "none" and explain clearly.

Return this exact JSON:
{
  "propertyTypeDetected": "<house|land|fire_damaged|teardown|other>",
  "isHabitableStructure": <true|false>,
  "arvAnalysis": {
    "recommendedARV": <int>,
    "confidence": "low"|"medium"|"high",
    "pricePerSqft": <int>,
    "reasoning": "<3 sentences citing specific comp addresses and sale prices>",
    "compsSummary": "<which comps drove your ARV>",
    "arvVsAlgorithm": "<1 sentence>"
  },
  "rehabAnalysis": {
    "estimatedCost": <int>,
    "condition": "light"|"medium"|"heavy"|"gut"|"land_only",
    "breakdown": { "kitchen":<int>, "bathrooms":<int>, "flooring":<int>, "roofHvac":<int>, "exterior":<int>, "paint":<int>, "fireOrWater":<int>, "other":<int> },
    "scopeDetails": "<2-3 sentences: what specific work is needed, any damage from description>",
    "reasoning": "<2 sentences>",
    "rehabVsAlgorithm": "<1 sentence — if algo is way off, explain why>"
  },
  "rentAnalysis": {
    "estimatedRent": <int>,
    "confidence": "low"|"medium"|"high",
    "section8Potential": <bool>,
    "section8Rate": <int or null>,
    "reasoning": "<2-3 sentences>",
    "rentVsAlgorithm": "<1 sentence>"
  },
  "strategyRecommendation": {
    "best": "flip"|"rental"|"brrrr"|"none",
    "ranking": ["flip"|"rental"|"brrrr"],
    "reasoning": "<3-4 sentences>",
    "flipProfit": <int>,
    "flipROI": <float>,
    "rentalCashflow": <int monthly, 20% down 7% rate>,
    "rentalCapRate": <float>,
    "brrrrMoneyLeft": <int after 75% ARV refi>,
    "brrrrCashflow": <int monthly after refi>
  },
  "marketContext": "<2-3 sentences about this ZIP>",
  "neighborhoodNotes": "<1-2 sentences on quality, schools, employment>",
  "exitRisks": "<key risks for recommended strategy>",
  "redFlags": ["<specific>"],
  "positives": ["<specific>"],
  "overallVerdict": "<1-2 sentences>",
  "confidenceScore": <1-10>,
  "propertyStatus": "${propertyStatus}",
  "propertyStatusDetail": "${propertyStatusDetail}"
}`;

    // ── Step 4: Call Claude ───────────────────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1800, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return new Response(JSON.stringify({ success: false, error: 'Claude API error: ' + err }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const claudeData = await claudeRes.json();
    const rawText    = claudeData.content?.[0]?.text || '';

    let analysis: any;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      analysis = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Failed to parse Claude response', raw: rawText }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Attach comps & extra metadata
    analysis.propertyStatus       = analysis.propertyStatus       || propertyStatus;
    analysis.propertyStatusDetail = analysis.propertyStatusDetail || propertyStatusDetail;
    analysis.listingDescription   = propertyDescription || null;
    analysis.soldCompsData        = soldFmt;
    analysis.activeCompsData      = activeFmt;

    const inputTokens  = claudeData.usage?.input_tokens  || 0;
    const outputTokens = claudeData.usage?.output_tokens || 0;
    const costUsd      = parseFloat((inputTokens * INPUT_CPM / 1000 + outputTokens * OUTPUT_CPM / 1000).toFixed(5));

    console.log(`scout-ai | ${deal.address} | type:${analysis.propertyTypeDetected} | status:${propertyStatus} | rehab:${analysis.rehabAnalysis?.estimatedCost} | cost:$${costUsd}`);

    return new Response(JSON.stringify({
      success: true, analysis,
      propertyStatus, propertyStatusDetail, propertyDescription,
      compsUsed: soldComps.length,
      tokensUsed: inputTokens + outputTokens, inputTokens, outputTokens, costUsd, model: MODEL,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
