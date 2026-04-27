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

    params.append('limit', '42'); // API hard-caps at ~42 per page regardless of higher values

    // Broad city searches need multiple pages; zip-code searches are small enough with 1 page.
    const isBroadSearch = !filters.location.trim().match(/^\d{5}/); // no leading zip code
    const needsExtraForDom = filters.maxDaysOnMarket && filters.maxDaysOnMarket <= 30;
    const pageCount = needsExtraForDom ? 20 : (isBroadSearch ? 20 : 3);

    let firstPageError: string | null = null;
    let firstPageRaw: any = null;

    const fetchPage = async (page: number) => {
      const p = new URLSearchParams(params);
      if (page > 1) p.set('page', String(page));
      const url = `https://${RAPIDAPI_HOST}/for-sale?${p}`;
      console.log(`Calling page ${page}:`, url);
      const r = await fetch(url, {
        headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': RAPIDAPI_HOST },
      });
      if (!r.ok) {
        const body = await r.text();
        console.error(`API error page ${page}:`, r.status, body);
        if (page === 1) firstPageError = `HTTP ${r.status}: ${body.slice(0, 200)}`;
        return [];
      }
      try {
        const d = await r.json();
        if (page === 1) firstPageRaw = { keys: Object.keys(d), listingsCount: (d?.listings || []).length, statusSample: (d?.listings || []).slice(0,2).map((l: any) => l.status) };
        return (d?.listings || []).filter((l: any) => l.status === 'for_sale');
      } catch (e) {
        if (page === 1) firstPageError = String(e);
        return [];
      }
    };

    // Fetch all pages in parallel
    const pages = await Promise.all(Array.from({ length: pageCount }, (_, i) => fetchPage(i + 1)));

    // Deduplicate by property_id / listing_id
    const seen = new Set<string>();
    const rawList: any[] = [];
    for (const page of pages) {
      for (const l of page) {
        const key = l.property_id || l.listing_id;
        if (key && !seen.has(key)) { seen.add(key); rawList.push(l); }
      }
    }

    console.log(`pages=${pageCount} raw=${rawList.length}`);

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
        _debug: { firstPageError, firstPageRaw },
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
