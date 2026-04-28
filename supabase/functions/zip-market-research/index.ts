import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface ZipMarketData {
  zipCode: string;
  city: string;
  state: string;
  marketTemperature: 'hot' | 'warm' | 'neutral' | 'cool' | 'cold';
  marketTemperatureScore: number;
  medianHomePrice: number | null;
  medianHomePriceTrend: string | null;
  avgDaysOnMarket: number | null;
  listingsCount: number | null;
  avgRent: number | null;
  rentTrend: string | null;
  vacancyRate: string | null;
  medianHouseholdIncome: number | null;
  unemploymentRate: string | null;
  populationTrend: string | null;
  schoolRating: number | null;
  crimeLevel: 'low' | 'below average' | 'average' | 'above average' | 'high' | null;
  economicStrength: 'strong' | 'moderate' | 'weak' | null;
  investorScore: number;
  priceToRentRatio: number | null;
  appreciation5yr: string | null;
  keyInsights: string[];
  risks: string[];
  sources: string[];
  researchedAt: string;
  dataSource?: 'web_search' | 'ai_knowledge';
}

const JSON_TEMPLATE = (zipCode: string) => `{
  "zipCode": "${zipCode}",
  "city": "city name",
  "state": "state abbreviation (e.g. GA)",
  "marketTemperature": "hot|warm|neutral|cool|cold",
  "marketTemperatureScore": 7.5,
  "medianHomePrice": 285000,
  "medianHomePriceTrend": "+5.2% YoY",
  "avgDaysOnMarket": 18,
  "listingsCount": 45,
  "avgRent": 1850,
  "rentTrend": "+3.1% YoY",
  "vacancyRate": "4.2%",
  "medianHouseholdIncome": 68000,
  "unemploymentRate": "3.8%",
  "populationTrend": "growing",
  "schoolRating": 7,
  "crimeLevel": "average",
  "economicStrength": "moderate",
  "investorScore": 7.5,
  "priceToRentRatio": 15.8,
  "appreciation5yr": "+28% over 5 years",
  "keyInsights": ["Strong rental demand", "Growing job market"],
  "risks": ["Rising insurance costs"],
  "sources": ["Zillow 2025", "Census ACS 2023"]
}`;

// Try with web search first; fall back to AI knowledge if web search fails
async function researchZipMarket(zipCode: string): Promise<ZipMarketData | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('[zip-research] ANTHROPIC_API_KEY not configured');
    return null;
  }

  // Attempt 1: Claude Sonnet with web search (faster + cheaper than Opus)
  const resultWithSearch = await callAnthropicWithSearch(apiKey, zipCode);
  if (resultWithSearch) {
    return { ...resultWithSearch, dataSource: 'web_search', researchedAt: new Date().toISOString() };
  }

  // Attempt 2: Claude Sonnet using training knowledge (no web search)
  console.log('[zip-research] Web search failed, falling back to AI knowledge');
  const resultNoSearch = await callAnthropicNoSearch(apiKey, zipCode);
  if (resultNoSearch) {
    return { ...resultNoSearch, dataSource: 'ai_knowledge', researchedAt: new Date().toISOString() };
  }

  return null;
}

async function callAnthropicWithSearch(apiKey: string, zipCode: string): Promise<Partial<ZipMarketData> | null> {
  const prompt = `You are a real estate investment analyst. Research the real estate market for ZIP code ${zipCode} using web search.

Search Zillow, Redfin, Census Bureau, and GreatSchools. Use at most 3 searches.

CRITICAL: Only fill fields with values you find in search results. If web search returns no data for a field, return null. Do not infer, estimate, or guess from your training knowledge — null is always preferred over a made-up number.

Return ONLY this JSON object (no commentary, no explanation, no markdown):
${JSON_TEMPLATE(zipCode)}`;

  try {
    console.log('[zip-research] Trying with web search...');
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('[zip-research] Web search API error:', resp.status, err.substring(0, 300));
      return null;
    }

    const data = await resp.json();
    console.log('[zip-research] Web search stop_reason:', data.stop_reason, 'content blocks:', data.content?.length);
    return extractJsonFromContent(data.content, zipCode);
  } catch (e) {
    console.error('[zip-research] Web search exception:', e);
    return null;
  }
}

async function callAnthropicNoSearch(apiKey: string, zipCode: string): Promise<Partial<ZipMarketData> | null> {
  const prompt = `You are a real estate investment analyst with knowledge of US real estate markets.

Provide your best analysis for ZIP code ${zipCode}. Use null for any field you are not confident about — null is strongly preferred over a made-up or guessed value. Mark "dataSource" reasoning is not needed.

Return ONLY this JSON object (no commentary, no markdown):
${JSON_TEMPLATE(zipCode)}`;

  try {
    console.log('[zip-research] Trying without web search (AI knowledge)...');
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('[zip-research] No-search API error:', resp.status, err.substring(0, 300));
      return null;
    }

    const data = await resp.json();
    return extractJsonFromContent(data.content, zipCode);
  } catch (e) {
    console.error('[zip-research] No-search exception:', e);
    return null;
  }
}

function extractJsonFromContent(content: any[], zipCode: string): Partial<ZipMarketData> | null {
  if (!Array.isArray(content)) return null;

  // Find the last text block (final response after any tool use)
  const textBlocks = content.filter((b: any) => b.type === 'text' && b.text?.trim());
  const responseText = textBlocks[textBlocks.length - 1]?.text?.trim();

  if (!responseText) {
    console.error('[zip-research] No text block found. Content types:', content.map((b: any) => b.type));
    return null;
  }

  console.log('[zip-research] Response text (first 400):', responseText.substring(0, 400));

  // Strip markdown fences
  let jsonStr = responseText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();

  // Extract JSON from anywhere in the string
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[zip-research] No JSON object found in response');
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // Ensure required fields have defaults
    return {
      zipCode: parsed.zipCode || zipCode,
      city: parsed.city || '',
      state: parsed.state || '',
      marketTemperature: parsed.marketTemperature || 'neutral',
      marketTemperatureScore: parsed.marketTemperatureScore || 5,
      investorScore: parsed.investorScore || 5,
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      ...parsed,
    };
  } catch (e) {
    console.error('[zip-research] JSON parse error:', e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { zip_code, force_refresh = false } = await req.json();

    if (!zip_code || typeof zip_code !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'zip_code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanZip = zip_code.trim().substring(0, 5);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check cache
    if (!force_refresh) {
      const { data: cached } = await supabase
        .from('zip_market_data')
        .select('*')
        .eq('zip_code', cleanZip)
        .single();

      if (cached) {
        console.log(`[zip-research] Returning cached data for ZIP ${cleanZip}`);
        return new Response(
          JSON.stringify({ success: true, data: cached.market_data, cached: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[zip-research] Researching ZIP ${cleanZip}...`);
    const marketData = await researchZipMarket(cleanZip);

    if (!marketData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to research market data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert to DB
    const { error: upsertError } = await supabase
      .from('zip_market_data')
      .upsert({
        zip_code: cleanZip,
        city: marketData.city || null,
        state: marketData.state || null,
        market_data: marketData,
        researched_at: new Date().toISOString(),
      }, { onConflict: 'zip_code' });

    if (upsertError) {
      console.error('[zip-research] Upsert error:', upsertError);
    }

    return new Response(
      JSON.stringify({ success: true, data: marketData, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[zip-research] Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
