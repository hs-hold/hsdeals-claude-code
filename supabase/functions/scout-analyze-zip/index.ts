import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAPIDAPI_HOST = 'us-real-estate-listings.p.rapidapi.com';

function getRehabCost(sqft: number, yearBuilt: number | null): number {
  const year = yearBuilt ?? 1990;
  let costPerSqft: number;
  if (year < 1970) costPerSqft = 65;
  else if (year < 1985) costPerSqft = 50;
  else if (year < 2000) costPerSqft = 38;
  else if (year < 2010) costPerSqft = 28;
  else costPerSqft = 20;
  return Math.round(sqft * costPerSqft);
}

/** Map a raw listing from the new API to internal format */
function mapListing(l: any): any {
  const addr = l.location?.address || {};
  const desc = l.description || {};
  return {
    id: l.property_id || l.listing_id,
    price: l.list_price || 0,
    sqft: desc.sqft || 0,
    beds: desc.beds || 0,
    baths: desc.baths || 0,
    yearBuilt: desc.year_built || null,
    homeType: desc.type || '',
    address: `${addr.line || ''}, ${addr.city || ''}, ${addr.state_code || ''} ${addr.postal_code || ''}`.trim(),
    addressParts: {
      street: addr.line || '',
      city: addr.city || '',
      state: addr.state_code || '',
      zipcode: addr.postal_code || '',
    },
    imgSrc: l.primary_photo?.href || null,
    detailUrl: l.href || null,
    description: desc.text || '',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { zip, maxPrice = 300000, minBeds = 2 } = await req.json();

    if (!zip) {
      return new Response(
        JSON.stringify({ success: false, error: 'zip is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'RAPIDAPI_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    };

    // Fetch for-sale listings
    const params = new URLSearchParams({
      location: zip,
      price_max: String(maxPrice),
      beds_min: String(minBeds),
      limit: '42',
    });

    const forSaleRes = await fetch(`https://${RAPIDAPI_HOST}/for-sale?${params}`, { headers });
    if (!forSaleRes.ok) {
      const errText = await forSaleRes.text();
      return new Response(
        JSON.stringify({ success: false, error: `Market search failed (HTTP ${forSaleRes.status})`, details: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const forSaleData = await forSaleRes.json();

    // Filter for-sale only (API may return other statuses)
    const forSale: any[] = (forSaleData.listings || [])
      .filter((l: any) => l.status === 'for_sale')
      .map(mapListing);

    // Analyze each for-sale property (no sold comps available from this API)
    const analyzed = forSale
      .filter(p => p.price > 0 && p.beds >= minBeds && p.sqft > 0)
      .map(p => {
        const rehab = getRehabCost(p.sqft, p.yearBuilt);

        // Cap rate estimate based on 1% rule: monthly rent ≈ 0.7% of purchase price
        const estimatedRent = Math.round(p.price * 0.007);
        const annualRent = estimatedRent * 12;
        const expenses = annualRent * 0.4;
        const noi = annualRent - expenses;
        const totalInvestment = p.price + rehab;
        const capRate = totalInvestment > 0 ? (noi / totalInvestment) * 100 : null;

        // Score: 0-100 (based on cap rate only since no comps for spread)
        let score = 0;
        if (capRate !== null) {
          if (capRate >= 10) score += 100;
          else if (capRate >= 8) score += 70;
          else if (capRate >= 6) score += 40;
          else if (capRate >= 4) score += 20;
        }
        score = Math.min(score, 100);

        const grade =
          score >= 80 ? 'A' :
          score >= 60 ? 'B' :
          score >= 40 ? 'C' : 'D';

        return {
          zpid: p.id,
          address: p.address,
          price: p.price,
          sqft: p.sqft,
          beds: p.beds,
          baths: p.baths,
          homeType: p.homeType,
          daysOnMarket: 0,
          imgSrc: p.imgSrc,
          detailUrl: p.detailUrl,
          rent: estimatedRent,
          arv: null, // No sold comps available from this API
          rehab,
          spread: null,
          capRate: capRate ? Math.round(capRate * 10) / 10 : null,
          score,
          grade,
          compsUsed: 0,
          description: p.description,
        };
      })
      .sort((a, b) => b.score - a.score);

    return new Response(
      JSON.stringify({
        success: true,
        zip,
        totalForSale: forSale.length,
        totalSoldComps: 0,
        analyzed: analyzed.length,
        results: analyzed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
