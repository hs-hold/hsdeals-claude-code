import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RAPIDAPI_HOST = 'real-estate101.p.rapidapi.com';
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

    // Build query parameters for real-estate101 API
    const params = new URLSearchParams();
    
    // Required: location
    params.append('location', filters.location.trim());
    
    // Pagination
    params.append('page', (filters.page || 1).toString());
    
    // List type (for-sale, for-rent)
    if (filters.listType) {
      params.append('listType', filters.listType);
    }
    
    // Price range
    if (filters.minPrice) params.append('minPrice', filters.minPrice.toString());
    if (filters.maxPrice) params.append('maxPrice', filters.maxPrice.toString());
    
    // Beds & Baths
    if (filters.minBeds) params.append('beds', filters.minBeds.toString());
    if (filters.minBaths) params.append('baths', filters.minBaths.toString());
    
    // Square feet
    if (filters.minSqft) params.append('minSqft', filters.minSqft.toString());
    if (filters.maxSqft) params.append('maxSqft', filters.maxSqft.toString());
    
    // Lot size
    if (filters.minLotSize) params.append('minLot', filters.minLotSize.toString());
    if (filters.maxLotSize) params.append('maxLot', filters.maxLotSize.toString());
    
    // Year built
    if (filters.minYearBuilt) params.append('minBuilt', filters.minYearBuilt.toString());
    if (filters.maxYearBuilt) params.append('maxBuilt', filters.maxYearBuilt.toString());
    
    // Days on market
    if (filters.maxDaysOnMarket) params.append('daysOnZillow', filters.maxDaysOnMarket.toString());
    
    // HOA
    if (filters.maxHOA) params.append('maxHOA', filters.maxHOA.toString());
    
    // Parking
    if (filters.parkingSpots) params.append('parkingSpots', filters.parkingSpots.toString());
    
    // Property type filters
    if (filters.homeType) {
      const typeMap: Record<string, string> = {
        'SingleFamily': 'isSingleFamily',
        'Condo': 'isCondo',
        'Townhouse': 'isTownhouse',
        'Apartment': 'isApartment',
        'LotLand': 'isLotLand',
        'Manufactured': 'isManufactured',
      };
      const paramName = typeMap[filters.homeType];
      if (paramName) {
        params.append(paramName, 'true');
      }
    }
    
    // Boolean filters
    if (filters.isComingSoon) params.append('isComingSoon', 'true');
    if (filters.isForSaleForeclosure) params.append('isForSaleForeclosure', 'true');
    if (filters.isAuction) params.append('isAuction', 'true');
    if (filters.isOpenHousesOnly) params.append('isOpenHousesOnly', 'true');
    if (filters.singleStory) params.append('singleStory', 'true');
    if (filters.hasPool) params.append('hasPool', 'true');
    if (filters.hasGarage) params.append('hasGarage', 'true');
    if (filters.is3dHome) params.append('is3dHome', 'true');
    if (filters.isBasementFinished) params.append('isBasementFinished', 'true');
    if (filters.isBasementUnfinished) params.append('isBasementUnfinished', 'true');
    
    // View filters
    if (filters.isWaterView) params.append('isWaterView', 'true');
    if (filters.isParkView) params.append('isParkView', 'true');
    if (filters.isCityView) params.append('isCityView', 'true');
    if (filters.isMountainView) params.append('isMountainView', 'true');

    const url = `${RAPIDAPI_BASE}/api/search?${params.toString()}`;
    console.log('Calling RapidAPI:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    console.log('RapidAPI response status:', response.status);

    const responseText = await response.text();
    console.log('RapidAPI raw response:', responseText.substring(0, 500));

    if (!response.ok) {
      console.error('RapidAPI error:', response.status, responseText);
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

    console.log('RapidAPI response received, properties:', data?.results?.length || 0);

    // Transform the response to our format - API returns data in "results" array
    const properties = (data?.results || []).map((prop: any) => ({
      zpid: prop.id || prop.zpid,
      address: prop.address?.street || prop.address || prop.streetAddress || '',
      city: prop.address?.city || prop.city || '',
      state: prop.address?.state || prop.state || '',
      zipcode: prop.address?.zipcode || prop.zipcode || '',
      price: prop.unformattedPrice || prop.price,
      bedrooms: prop.beds || prop.bedrooms,
      bathrooms: prop.baths || prop.bathrooms,
      sqft: prop.livingArea || prop.area,
      lotSize: prop.lotAreaValue,
      lotSizeUnit: prop.lotAreaUnit,
      yearBuilt: prop.yearBuilt,
      propertyType: prop.homeType || prop.propertyType,
      daysOnZillow: prop.daysOnZillow,
      imgSrc: prop.imgSrc,
      detailUrl: prop.detailUrl,
      latitude: prop.latLong?.latitude || prop.latitude,
      longitude: prop.latLong?.longitude || prop.longitude,
      listingStatus: prop.homeStatus || prop.statusText || prop.listingStatus,
      zestimate: prop.zestimate,
      rentZestimate: prop.rentZestimate,
      taxAssessedValue: prop.taxAssessedValue,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        totalResultCount: data?.totalCount || properties.length,
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
