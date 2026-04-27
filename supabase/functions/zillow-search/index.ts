import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RAPIDAPI_HOST = 'us-real-estate-listings.p.rapidapi.com';

// Filters the API supports server-side (verified by testing):
//   price_min, price_max, beds_min, beds_max, baths_min, property_type
// Everything else is applied client-side after fetching.

interface SearchFilters {
  location: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  maxBeds?: number;
  minBaths?: number;
  maxBaths?: number;
  minSqft?: number;
  maxSqft?: number;
  minLotSize?: number;
  maxLotSize?: number;
  minYearBuilt?: number;
  maxYearBuilt?: number;
  minDaysOnMarket?: number;
  maxDaysOnMarket?: number;
  maxHOA?: number;
  parkingSpots?: number;
  homeType?: string;
  listType?: string;
  page?: number;
  isComingSoon?: boolean;
  isForSaleForeclosure?: boolean;
  isAuction?: boolean;
  isOpenHousesOnly?: boolean;
  singleStory?: boolean;
  hasPool?: boolean;
  hasGarage?: boolean;
  is3dHome?: boolean;
  isBasementFinished?: boolean;
  isBasementUnfinished?: boolean;
  isWaterView?: boolean;
  isParkView?: boolean;
  isCityView?: boolean;
  isMountainView?: boolean;
}

/** Days since an ISO date string */
function daysSince(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  try {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    return Math.max(0, Math.floor(diffMs / 86_400_000));
  } catch {
    return null;
  }
}

/** Extract first advertiser's contact info */
function extractAgentInfo(listing: any) {
  const agent = (listing.advertisers || [])[0] || {};
  return {
    agentName:  agent.name || null,
    agentEmail: agent.email || null,
    agentPhone: agent.phones?.[0]?.number || null,
    brokerName: agent.office?.name || null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const filters: SearchFilters = await req.json();

    if (!filters.location) {
      return new Response(
        JSON.stringify({ success: false, error: 'location is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const params = new URLSearchParams({ location: filters.location.trim() });

    // Server-side filters (verified working)
    if (filters.minPrice) params.append('price_min', String(filters.minPrice));
    if (filters.maxPrice) params.append('price_max', String(filters.maxPrice));
    if (filters.minBeds)  params.append('beds_min',  String(filters.minBeds));
    if (filters.maxBeds)  params.append('beds_max',  String(filters.maxBeds));
    if (filters.minBaths) params.append('baths_min', String(filters.minBaths));

    if (filters.homeType) {
      const typeMap: Record<string, string> = {
        'SingleFamily': 'single_family',
        'Condo':        'condos',
        'Townhouse':    'townhomes',
        'MultiFamily':  'multi_family',
      };
      const t = typeMap[filters.homeType];
      if (t) params.append('property_type', t);
    }

    // Fetch enough to absorb client-side filtering.
    // If days-on-market filter is active, we need more raw results because most
    // listings will be older than the threshold.
    const needsExtraForDom = filters.maxDaysOnMarket && filters.maxDaysOnMarket <= 30;
    params.append('limit', needsExtraForDom ? '200' : '100');

    const url = `https://${RAPIDAPI_HOST}/for-sale?${params}`;
    console.log('Calling:', url);

    const resp = await fetch(url, {
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': RAPIDAPI_HOST },
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error('API error', resp.status, text.slice(0, 300));
      return new Response(
        JSON.stringify({ success: false, error: `API error: ${resp.status}`, details: text }),
        { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let data: any;
    try { data = JSON.parse(text); } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON from API' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawList: any[] = (data?.listings || []).filter((l: any) => l.status === 'for_sale');

    // Map to the shape all callers expect
    const mapped = rawList.map((l: any) => {
      const addr  = l.location?.address || {};
      const desc  = l.description || {};
      const agent = extractAgentInfo(l);
      const price = l.list_price || 0;
      const dom   = daysSince(l.list_date);

      return {
        zpid:             l.property_id || l.listing_id,
        address:          addr.line || '',
        city:             addr.city || '',
        state:            addr.state_code || '',
        zipcode:          addr.postal_code || '',
        price,
        bedrooms:         desc.beds   || null,
        bathrooms:        desc.baths  || null,
        sqft:             desc.sqft   || null,
        lotSize:          desc.lot_sqft || null,
        lotSizeUnit:      'sqft',
        yearBuilt:        desc.year_built || null,
        propertyType:     desc.type   || null,
        daysOnZillow:     dom,                       // computed from list_date
        imgSrc:           l.primary_photo?.href || null,
        detailUrl:        l.href || null,
        latitude:         addr.coordinate?.lat || null,
        longitude:        addr.coordinate?.lon || null,
        listingStatus:    l.status || 'for_sale',
        zestimate:        null,
        rentZestimate:    price > 0 ? Math.round(price * 0.007) : null,
        taxAssessedValue: null,
        // Agent info
        agentName:        agent.agentName,
        agentEmail:       agent.agentEmail,
        agentPhone:       agent.agentPhone,
        brokerName:       agent.brokerName,
        description:      desc.text || null,
      };
    });

    // Client-side filters for fields the API doesn't support server-side
    const properties = mapped.filter(p => {
      if (filters.minSqft        && p.sqft      != null && p.sqft      < filters.minSqft)        return false;
      if (filters.maxSqft        && p.sqft      != null && p.sqft      > filters.maxSqft)        return false;
      if (filters.minLotSize     && p.lotSize   != null && p.lotSize   < filters.minLotSize)     return false;
      if (filters.maxLotSize     && p.lotSize   != null && p.lotSize   > filters.maxLotSize)     return false;
      if (filters.minYearBuilt   && p.yearBuilt != null && p.yearBuilt < filters.minYearBuilt)   return false;
      if (filters.maxYearBuilt   && p.yearBuilt != null && p.yearBuilt > filters.maxYearBuilt)   return false;
      // Days on market: only filter when we know the value; unknown DOM always passes
      if (filters.maxDaysOnMarket && p.daysOnZillow != null && p.daysOnZillow > filters.maxDaysOnMarket) return false;
      if (filters.minDaysOnMarket && p.daysOnZillow != null && p.daysOnZillow < filters.minDaysOnMarket) return false;
      return true;
    });

    console.log(`raw=${rawList.length} mapped=${mapped.length} after_filter=${properties.length} (dom_filter=${filters.maxDaysOnMarket ?? 'none'})`);

    return new Response(
      JSON.stringify({
        success: true,
        totalResultCount: properties.length,
        properties,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
