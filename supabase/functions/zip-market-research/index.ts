import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

interface ZipMarketData {
  zipCode: string;
  city: string;
  state: string;
  marketTemperature: 'hot' | 'warm' | 'neutral' | 'cool' | 'cold';
  marketTemperatureScore: number; // 1-10
  medianHomePrice: number | null;
  medianHomePriceTrend: string | null; // e.g. "+5.2% YoY"
  avgDaysOnMarket: number | null;
  listingsCount: number | null;
  avgRent: number | null;
  rentTrend: string | null;
  vacancyRate: string | null;
  medianHouseholdIncome: number | null;
  unemploymentRate: string | null;
  populationTrend: string | null; // growing/stable/declining
  schoolRating: number | null; // 1-10
  crimeLevel: 'low' | 'below average' | 'average' | 'above average' | 'high' | null;
  economicStrength: 'strong' | 'moderate' | 'weak' | null;
  investorScore: number; // 1-10, overall attractiveness for RE investors
  priceToRentRatio: number | null;
  appreciation5yr: string | null; // e.g. "+28% over 5 years"
  keyInsights: string[]; // 3-5 bullet points for investors
  risks: string[]; // 1-3 risks to be aware of
  sources: string[];
  researchedAt: string;
}

async function researchZipMarket(zipCode: string): Promise<ZipMarketData | null> {
  const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) {
    console.error('PERPLEXITY_API_KEY not configured');
    return null;
  }

  const prompt = `You are a real estate investment analyst. Research the real estate market for ZIP code ${zipCode} in the United States.

Search for REAL, CURRENT data from reliable sources (Zillow, Redfin, Realtor.com, Census Bureau, FBI crime data, GreatSchools, etc.).

Return ONLY real data you can verify from web sources. Do NOT invent or estimate numbers without a source.

Provide a JSON response with this exact structure:
{
  "zipCode": "${zipCode}",
  "city": "city name",
  "state": "state abbreviation (e.g. FL)",
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
  "populationTrend": "growing|stable|declining",
  "schoolRating": 7,
  "crimeLevel": "low|below average|average|above average|high",
  "economicStrength": "strong|moderate|weak",
  "investorScore": 7.5,
  "priceToRentRatio": 15.8,
  "appreciation5yr": "+28% over 5 years",
  "keyInsights": [
    "Strong rental demand with low vacancy rates",
    "Below-median purchase prices with above-median rents",
    "Growing job market driven by healthcare and tech sectors",
    "High investor activity — multiple cash offers common"
  ],
  "risks": [
    "Rising insurance costs in flood-prone areas",
    "Property taxes increasing 8% annually"
  ],
  "sources": ["Zillow, March 2026", "Census ACS 2023"]
}

Use null for any values you cannot find real data for. The investorScore should reflect overall attractiveness: cash flow potential, appreciation, demand, affordability, and risk.`;

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'user', content: prompt }],
        search_recency_filter: 'month',
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Perplexity API error:', response.status, errText);
      return null;
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content?.trim();
    console.log('Perplexity response:', responseText?.substring(0, 500));

    let jsonStr = responseText;
    if (jsonStr?.includes('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }
    // Extract JSON object from text
    const jsonMatch = jsonStr?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      ...parsed,
      researchedAt: new Date().toISOString(),
    } as ZipMarketData;
  } catch (error) {
    console.error('Error researching ZIP market:', error);
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
        console.log(`Returning cached market data for ZIP ${cleanZip}`);
        return new Response(
          JSON.stringify({ success: true, data: cached.market_data, cached: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Research the market
    console.log(`Researching market for ZIP ${cleanZip}...`);
    const marketData = await researchZipMarket(cleanZip);

    if (!marketData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to research market data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store in DB (upsert)
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
      console.error('Error saving market data:', upsertError);
    }

    return new Response(
      JSON.stringify({ success: true, data: marketData, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in zip-market-research:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
