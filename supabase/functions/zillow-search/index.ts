import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RAPIDAPI_HOST = 'us-real-estate-listings.p.rapidapi.com';

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

/** Extract first advertiser's contact info from listing */
function extractAgentInfo(listing: any): { agentName: string | null; agentEmail: string | null; agentPhone: string | null; brokerName: string | null } {
  const advertisers: any[] = listing.advertisers || [];
  const agent = advertisers[0] || {};
  return {
    agentName: agent.name || null,
    agentEmail: agent.email || null,
    agentPhone: agent.phones?.[0]?.number || null,
    brokerName: agent.office?.name || null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
      console.error('RAPIDAPI_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query parameters for new API
    const params = new URLSearchParams();
    params.append('location', filters.location.trim());

    // Price range
    if (filters.minPrice) params.append('price_min', filters.minPrice.toString());
    if (filters.maxPrice) params.append('price_max', filters.maxPrice.toString());

    // Beds & Baths
    if (filters.minBeds) params.append('beds_min', filters.minBeds.toString());
    if (filters.maxBeds) params.append('beds_max', filters.maxBeds.toString());
    if (filters.minBaths) params.append('baths_min', filters.minBaths.toString());

    // Square feet
    if (filters.minSqft) params.append('sqft_min', filters.minSqft.toString());
    if (filters.maxSqft) params.append('sqft_max', filters.maxSqft.toString());

    // Limit — new API uses limit, not page
    // Each "page" is 42 results; offset via page number
    const limit = 42;
    params.append('limit', limit.toString());

    // Endpoint is /for-sale for for-sale listings (default), for-rent not supported
    const endpoint = (filters.listType === 'for-rent') ? '/for-sale' : '/for-sale';

    const url = `https://${RAPIDAPI_HOST}${endpoint}?${params.toString()}`;
    console.log('Calling API:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    console.log('API response status:', response.status);

    const responseText = await response.text();
    console.log('API raw response (first 500):', responseText.substring(0, 500));

    if (!response.ok) {
      console.error('API error:', response.status, responseText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `API error: ${response.status}`,
          details: responseText,
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON response', rawResponse: responseText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map listings to the same shape callers expect from the old zillow-search
    const rawList: any[] = (data?.listings || []).filter((l: any) => l.status === 'for_sale');

    const properties = rawList.map((listing: any) => {
      const addr = listing.location?.address || {};
      const desc = listing.description || {};
      const agent = extractAgentInfo(listing);

      // Rent estimate: 0.7% of list price per month (rough 1% rule proxy)
      const price = listing.list_price || 0;
      const rentZestimate = price > 0 ? Math.round(price * 0.007) : null;

      return {
        // Core fields (same as old zillow-com1 output)
        zpid:          listing.property_id || listing.listing_id,
        address:       addr.line || '',
        city:          addr.city || '',
        state:         addr.state_code || '',
        zipcode:       addr.postal_code || '',
        price,
        bedrooms:      desc.beds || null,
        bathrooms:     desc.baths || null,
        sqft:          desc.sqft || null,
        lotSize:       desc.lot_sqft || null,
        lotSizeUnit:   'sqft',
        yearBuilt:     desc.year_built || null,
        propertyType:  desc.type || null,
        daysOnZillow:  null, // not available in new API
        imgSrc:        listing.primary_photo?.href || null,
        detailUrl:     listing.href || null,
        latitude:      addr.coordinate?.lat || null,
        longitude:     addr.coordinate?.lon || null,
        listingStatus: listing.status || 'for_sale',
        zestimate:     null,    // not available in new API
        rentZestimate, // estimated
        taxAssessedValue: null, // not available in new API
        // Agent/broker info — new addition
        agentName:     agent.agentName,
        agentEmail:    agent.agentEmail,
        agentPhone:    agent.agentPhone,
        brokerName:    agent.brokerName,
        // Description text (useful for AI analysis)
        description:   desc.text || null,
      };
    });

    console.log(`Mapped ${properties.length} properties`);

    return new Response(
      JSON.stringify({
        success: true,
        totalResultCount: data?.totalResultCount || properties.length,
        properties,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in zillow-search function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
