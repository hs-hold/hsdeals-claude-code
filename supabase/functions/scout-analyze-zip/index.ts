import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAPIDAPI_HOST = 'real-estate101.p.rapidapi.com';

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

function calcARVFromComps(subjectSqft: number, subjectBeds: number, soldProps: any[]): number | null {
  if (!subjectSqft || subjectSqft <= 0) return null;

  // Filter comps: similar size (±30%), same bed count ±1, must have price and area
  const comps = soldProps.filter(p => {
    const area = p.area || p.livingArea || 0;
    const beds = p.beds || 0;
    const price = p.unformattedPrice || 0;
    if (!area || !price) return false;
    const sqftMatch = area >= subjectSqft * 0.7 && area <= subjectSqft * 1.3;
    const bedMatch = Math.abs(beds - subjectBeds) <= 1;
    return sqftMatch && bedMatch;
  });

  if (comps.length < 2) {
    // Fallback: use all sold with valid price/area
    const fallback = soldProps.filter(p => (p.area || p.livingArea) && p.unformattedPrice);
    if (fallback.length < 2) return null;
    const pricePerSqft = fallback.map(p => p.unformattedPrice / (p.area || p.livingArea));
    const avg = pricePerSqft.reduce((a, b) => a + b, 0) / pricePerSqft.length;
    return Math.round(avg * subjectSqft);
  }

  // Calculate price per sqft for each comp, take median
  const pricePerSqfts = comps
    .map(p => p.unformattedPrice / (p.area || p.livingArea))
    .sort((a, b) => a - b);

  // Remove top and bottom 10% outliers if enough comps
  let filtered = pricePerSqfts;
  if (pricePerSqfts.length >= 5) {
    const trim = Math.floor(pricePerSqfts.length * 0.1);
    filtered = pricePerSqfts.slice(trim, pricePerSqfts.length - trim);
  }

  const median = filtered[Math.floor(filtered.length / 2)];
  return Math.round(median * subjectSqft);
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

    // Fetch for-sale and recently-sold in parallel
    const [forSaleRes, soldRes] = await Promise.all([
      fetch(`https://${RAPIDAPI_HOST}/api/search?location=${zip}&maxPrice=${maxPrice}&isSingleFamily=true&page=1`, { headers }),
      fetch(`https://${RAPIDAPI_HOST}/api/search?location=${zip}&isRecentlySold=true&isSingleFamily=true&page=1`, { headers }),
    ]);

    const [forSaleData, soldData] = await Promise.all([
      forSaleRes.json(),
      soldRes.json(),
    ]);

    const forSale: any[] = forSaleData.results || [];
    const sold: any[] = soldData.results || [];

    // Analyze each for-sale property
    const analyzed = forSale
      .filter(p => {
        const price = p.unformattedPrice || 0;
        const beds = p.beds || 0;
        const sqft = p.area || p.livingArea || 0;
        return price > 0 && beds >= minBeds && sqft > 0;
      })
      .map(p => {
        const price = p.unformattedPrice;
        const sqft = p.area || p.livingArea || 0;
        const beds = p.beds || 0;
        const rent = p.rentZestimate || 0;

        const arv = calcARVFromComps(sqft, beds, sold);
        const rehab = getRehabCost(sqft, p.yearBuilt || null);
        const spread = arv ? arv - price - rehab : null;

        // Cap rate: (annual rent - expenses) / (price + rehab)
        const annualRent = rent * 12;
        const expenses = annualRent * 0.4; // 40% expense ratio
        const noi = annualRent - expenses;
        const totalInvestment = price + rehab;
        const capRate = totalInvestment > 0 && rent > 0
          ? (noi / totalInvestment) * 100
          : null;

        // Score: 0-100
        let score = 0;
        if (spread !== null && spread > 0) {
          const spreadPct = (spread / price) * 100;
          if (spreadPct >= 40) score += 50;
          else if (spreadPct >= 30) score += 40;
          else if (spreadPct >= 20) score += 30;
          else if (spreadPct >= 10) score += 15;
        }
        if (capRate !== null) {
          if (capRate >= 10) score += 50;
          else if (capRate >= 8) score += 35;
          else if (capRate >= 6) score += 20;
          else if (capRate >= 4) score += 10;
        }

        const grade =
          score >= 80 ? 'A' :
          score >= 60 ? 'B' :
          score >= 40 ? 'C' : 'D';

        return {
          zpid: p.id,
          address: p.address,
          price,
          sqft,
          beds,
          baths: p.baths,
          homeType: p.homeType,
          daysOnMarket: p.daysOnZillow || 0,
          imgSrc: p.imgSrc,
          detailUrl: p.detailUrl,
          rent,
          arv,
          rehab,
          spread,
          capRate: capRate ? Math.round(capRate * 10) / 10 : null,
          score,
          grade,
          compsUsed: sold.length,
        };
      })
      .sort((a, b) => b.score - a.score);

    return new Response(
      JSON.stringify({
        success: true,
        zip,
        totalForSale: forSale.length,
        totalSoldComps: sold.length,
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
