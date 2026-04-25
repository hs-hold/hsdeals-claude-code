import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// zillow-com1 is a reliable Zillow scraper on RapidAPI that includes Zestimate + RentZestimate
const RAPIDAPI_HOST = 'zillow-com1.p.rapidapi.com';
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

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
  // Boolean filters
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
  // View filters
  isWaterView?: boolean;
  isParkView?: boolean;
  isCityView?: boolean;
  isMountainView?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const filters: SearchFilters = await req.json();

    console.log('Searching properties with filters:', filters);

    const apiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!apiKey) {
      console.error('RAPIDAPI_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query parameters for zillow-com1 API
    const params = new URLSearchParams();

    // Required: location (ZIP code, city name, or "City, State")
    params.append('location', filters.location.trim());

    // Pagination (1-indexed)
    params.append('page', (filters.page || 1).toString());

    // Status: for-sale is default, only add if explicitly for-rent
    // zillow-com1 uses 'status_type' parameter
    if (filters.listType === 'for-rent') {
      params.append('status_type', 'ForRent');
    } else {
      params.append('status_type', 'ForSale');
    }

    // Price range
    if (filters.minPrice) params.append('minPrice', filters.minPrice.toString());
    if (filters.maxPrice) params.append('maxPrice', filters.maxPrice.toString());

    // Beds & Baths
    if (filters.minBeds) params.append('bedsMin', filters.minBeds.toString());
    if (filters.maxBeds) params.append('bedsMax', filters.maxBeds.toString());
    if (filters.minBaths) params.append('bathsMin', filters.minBaths.toString());

    // Square feet
    if (filters.minSqft) params.append('sqftMin', filters.minSqft.toString());
    if (filters.maxSqft) params.append('sqftMax', filters.maxSqft.toString());

    // Year built
    if (filters.minYearBuilt) params.append('built_min', filters.minYearBuilt.toString());
    if (filters.maxYearBuilt) params.append('built_max', filters.maxYearBuilt.toString());

    // Days on market
    if (filters.maxDaysOnMarket) params.append('daysOn', filters.maxDaysOnMarket.toString());

    // Property type — zillow-com1 uses home_type
    if (filters.homeType) {
      const typeMap: Record<string, string> = {
        'SingleFamily': 'SINGLE_FAMILY',
        'Condo': 'CONDO',
        'Townhouse': 'TOWNHOUSE',
        'Apartment': 'APARTMENT',
        'LotLand': 'LOT_LAND',
        'Manufactured': 'MANUFACTURED',
        'MultiFamily': 'MULTI_FAMILY',
      };
      const apiType = typeMap[filters.homeType] || filters.homeType;
      params.append('home_type', apiType);
    }

    const url = `${RAPIDAPI_BASE}/propertyExtendedSearch?${params.toString()}`;
    console.log('Calling Zillow API:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    console.log('Zillow API response status:', response.status);

    const responseText = await response.text();
    console.log('Zillow API raw response:', responseText.substring(0, 500));

    if (!response.ok) {
      console.error('Zillow API error:', response.status, responseText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `API error: ${response.status}`,
          details: responseText,
          rawResponse: responseText
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON response',
          rawResponse: responseText
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // zillow-com1 returns results in listResults array
    const rawList: any[] = data?.listResults || data?.searchResults?.listResults || data?.results || [];
    console.log('Zillow API response received, properties:', rawList.length, '| totalResultCount:', data?.totalResultCount || 0);

    const properties = rawList.map((prop: any) => {
      const homeInfo = prop.hdpData?.homeInfo || {};
      return {
        zpid:          prop.zpid || prop.id,
        address:       homeInfo.streetAddress || prop.address || prop.streetAddress || '',
        city:          homeInfo.city || prop.city || '',
        state:         homeInfo.state || prop.state || '',
        zipcode:       homeInfo.zipcode || prop.zipcode || '',
        price:         prop.unformattedPrice || (typeof prop.price === 'number' ? prop.price : null),
        bedrooms:      prop.beds || homeInfo.bedrooms,
        bathrooms:     prop.baths || homeInfo.bathrooms,
        sqft:          prop.area || homeInfo.livingArea,
        lotSize:       prop.lotAreaValue || homeInfo.lotAreaValue,
        lotSizeUnit:   prop.lotAreaUnit || homeInfo.lotAreaUnit,
        yearBuilt:     prop.yearBuilt || homeInfo.yearBuilt,
        propertyType:  homeInfo.homeType || prop.homeType || prop.propertyType,
        daysOnZillow:  prop.daysOnZillow || homeInfo.daysOnZillow,
        imgSrc:        prop.imgSrc,
        detailUrl:     prop.detailUrl,
        latitude:      prop.latLong?.latitude || homeInfo.latitude,
        longitude:     prop.latLong?.longitude || homeInfo.longitude,
        listingStatus: prop.statusType || prop.statusText || homeInfo.homeStatus,
        zestimate:     prop.zestimate || homeInfo.zestimate,
        rentZestimate: prop.rentZestimate || homeInfo.rentZestimate,
        taxAssessedValue: prop.taxAssessedValue || homeInfo.taxAssessedValue,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        totalResultCount: data?.totalResultCount || properties.length,
        properties,
        rawResponse: data,
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
