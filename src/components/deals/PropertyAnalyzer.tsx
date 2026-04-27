import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useDeals } from '@/context/DealsContext';
import { ApiResponse, PropertyAnalysis, PropertyData } from '@/types/apiResponse';
import { toast } from 'sonner';
import { Loader2, Search, MapPin } from 'lucide-react';
import { calculateFinancials } from '@/utils/financialCalculations';
import { coerceLotSizeSqft } from '@/utils/lotSize';
import { DealApiData, DealOverrides } from '@/types/deal';
import { formatIL as format } from '@/utils/dateFormat';

interface AddressSuggestion {
  place_name: string;
  center: [number, number];
  text: string; // Street name only (e.g., "Peachcrest Road")
  address?: string; // House number (e.g., "1514")
  context?: Array<{ id: string; text: string }>; // City, State, etc.
}

interface PropertyAnalyzerProps {
  initialAddress?: string;
}

export function PropertyAnalyzer({ initialAddress = '' }: PropertyAnalyzerProps) {
  const navigate = useNavigate();
  const { refetch } = useDeals();
  const [address, setAddress] = useState(initialAddress);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch mapbox token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (!error && data?.token) {
          setMapboxToken(data.token);
        }
      } catch (err) {
        console.error('Failed to fetch mapbox token:', err);
      }
    };
    fetchToken();
  }, []);

  // Auto-analyze if initialAddress is provided
  const hasAutoAnalyzed = useRef(false);
  useEffect(() => {
    if (initialAddress && !hasAutoAnalyzed.current) {
      hasAutoAnalyzed.current = true;
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        analyzeProperty();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [initialAddress]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch address suggestions from Mapbox
  const fetchSuggestions = async (query: string) => {
    if (!mapboxToken || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&country=us&types=address&limit=5`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setSuggestions(data.features.map((f: any) => ({
          place_name: f.place_name,
          center: f.center,
          text: f.text || '',
          address: f.address || '', // House number from Mapbox
          context: f.context,
        })));
        setShowSuggestions(true);
        setHighlightedIndex(-1);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    }
  };

  // Helper to format location context (city, state, zip)
  const formatContext = (suggestion: AddressSuggestion): string => {
    if (!suggestion.context) return '';
    const place = suggestion.context.find(c => c.id.startsWith('place'));
    const region = suggestion.context.find(c => c.id.startsWith('region'));
    const postcode = suggestion.context.find(c => c.id.startsWith('postcode'));
    
    const parts = [];
    if (place) parts.push(place.text);
    if (region) parts.push(region.text);
    if (postcode) parts.push(postcode.text);
    
    return parts.join(', ');
  };

  // State name to abbreviation map
  const stateAbbreviations: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
    'District of Columbia': 'DC'
  };

  // Abbreviate street suffixes like Zillow
  const abbreviateStreet = (street: string): string => {
    const suffixes: Record<string, string> = {
      'Road': 'Rd', 'Street': 'St', 'Avenue': 'Ave', 'Boulevard': 'Blvd', 'Drive': 'Dr',
      'Lane': 'Ln', 'Court': 'Ct', 'Circle': 'Cir', 'Place': 'Pl', 'Way': 'Way',
      'Terrace': 'Ter', 'Trail': 'Trl', 'Parkway': 'Pkwy', 'Highway': 'Hwy'
    };
    
    let result = street;
    for (const [full, abbr] of Object.entries(suffixes)) {
      const regex = new RegExp(`\\b${full}\\b`, 'gi');
      result = result.replace(regex, abbr);
    }
    return result;
  };

  // Format address like Zillow: "1514 Peachcrest Rd, Decatur, GA 30032"
  const formatZillowAddress = (suggestion: AddressSuggestion): string => {
    // Combine house number + street name
    const houseNumber = suggestion.address || '';
    const streetName = abbreviateStreet(suggestion.text);
    const fullStreet = houseNumber ? `${houseNumber} ${streetName}` : streetName;
    
    const place = suggestion.context?.find(c => c.id.startsWith('place'))?.text || '';
    const regionFull = suggestion.context?.find(c => c.id.startsWith('region'))?.text || '';
    const postcode = suggestion.context?.find(c => c.id.startsWith('postcode'))?.text || '';
    
    // Convert state name to abbreviation
    const state = stateAbbreviations[regionFull] || regionFull;
    
    const parts = [fullStreet];
    if (place) parts.push(place);
    if (state && postcode) {
      parts.push(`${state} ${postcode}`);
    } else if (state) {
      parts.push(state);
    }
    
    return parts.join(', ');
  };

  // Debounced input handler
  const handleAddressChange = (value: string) => {
    setAddress(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
  };

  // Select suggestion - format like Zillow
  const selectSuggestion = (suggestion: AddressSuggestion) => {
    setAddress(formatZillowAddress(suggestion));
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        analyzeProperty();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          selectSuggestion(suggestions[highlightedIndex]);
        } else {
          analyzeProperty();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  // Extract street number from an address string
  const extractStreetNumber = (addr: string): string | null => {
    const match = addr.match(/^\s*(\d+)\s+/);
    return match ? match[1] : null;
  };

  // Extract ZIP code from an address string
  const extractZip = (addr: string): string | null => {
    const match = addr.match(/\b(\d{5})(?:-\d{4})?\b/);
    return match ? match[1] : null;
  };

  // Normalize a street name: lowercase, expand common abbreviations, strip punctuation
  const normalizeStreetName = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/\brd\b/g, 'road').replace(/\bst\b/g, 'street')
      .replace(/\bave?\b/g, 'avenue').replace(/\bblvd\b/g, 'boulevard')
      .replace(/\bdr\b/g, 'drive').replace(/\bln\b/g, 'lane')
      .replace(/\bct\b/g, 'court').replace(/\bcir\b/g, 'circle')
      .replace(/\bpl\b/g, 'place').replace(/\bpkwy\b/g, 'parkway')
      .replace(/\bhwy\b/g, 'highway').replace(/\bter?\b/g, 'terrace')
      .replace(/\btrl\b/g, 'trail').replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ').trim();
  };

  // Check if property already exists in database.
  // Strategy: street number + ZIP is a reliable unique key across address formats.
  // Fallback: street number + normalized street name start.
  const checkExistingDeal = async (addressToCheck: string): Promise<{ exists: boolean; dealId?: string; addressFull?: string; updatedAt?: string; status?: string }> => {
    try {
      const inputNumber = extractStreetNumber(addressToCheck);
      if (!inputNumber) return { exists: false };

      const inputZip   = extractZip(addressToCheck);
      const inputNorm  = normalizeStreetName(addressToCheck);

      // Fetch all deals with the same street number (fast indexed query)
      const { data: matches, error } = await supabase
        .from('deals')
        .select('id, address_full, address_street, address_zip, updated_at, status')
        .ilike('address_street', `${inputNumber} %`)
        .limit(20);

      if (error || !matches || matches.length === 0) return { exists: false };

      for (const deal of matches) {
        const dealNumber = extractStreetNumber(deal.address_street || deal.address_full);
        if (dealNumber !== inputNumber) continue;

        // 1. ZIP match (most reliable — same street number + ZIP = same property)
        const dealZip = deal.address_zip || extractZip(deal.address_full);
        if (inputZip && dealZip && inputZip === dealZip) {
          return { exists: true, dealId: deal.id, addressFull: deal.address_full, updatedAt: deal.updated_at, status: deal.status };
        }

        // 2. Normalized street name starts with the same word (fallback when ZIP missing)
        const dealNorm = normalizeStreetName(deal.address_street || deal.address_full);
        const inputFirstWord = inputNorm.split(' ')[1] || ''; // word after house number
        const dealFirstWord  = dealNorm.split(' ')[1]  || '';
        if (inputFirstWord.length >= 4 && dealFirstWord.length >= 4 && inputFirstWord === dealFirstWord) {
          return { exists: true, dealId: deal.id, addressFull: deal.address_full, updatedAt: deal.updated_at, status: deal.status };
        }
      }

      return { exists: false };
    } catch (err) {
      console.error('Error checking existing deal:', err);
      return { exists: false };
    }
  };

  const analyzeProperty = async () => {
    if (!address.trim()) {
      toast.error('Please enter a property address');
      return;
    }

    setLoading(true);
    setShowSuggestions(false);

    // ── Duplicate check — no API call if already exists ──────────────────
    const existingCheck = await checkExistingDeal(address);
    if (existingCheck.exists && existingCheck.dealId) {
      await refetch();
      navigate(`/deals/${existingCheck.dealId}`, {
        state: {
          analysisResult: 'duplicate',
          originalAddress: address,
          analyzedAt: existingCheck.updatedAt,
        },
      });
      return;
    }

    // ── New analysis — call API ───────────────────────────────────────────
    let dealId: string | null = null;

    try {
      const { data, error } = await supabase.functions.invoke('analyze-property', {
        body: { address: address.trim() },
      });

      if (error) {
        console.error('Function error:', error);
        toast.error('Failed to analyze property');
        setLoading(false);
        return;
      }

      // Log full response for debugging
      console.log('[analyze-property] raw response:', JSON.stringify(data).slice(0, 800));

      const raw = data as any;
      console.log('[analyze-property] raw response:', JSON.stringify(raw).slice(0, 800));

      const isSuccess = raw?.success === true;
      if (!isSuccess) {
        const errMsg = raw?.error || raw?.message || raw?.detail || 'Analysis failed';
        console.error('[analyze-property] API returned success=false:', raw);
        toast.error(errMsg);
        setLoading(false);
        return;
      }

      // Resolve the inner payload — try multiple shapes:
      //   Shape A (standard):  { success, data: { analysis, property } }
      //   Shape B (no nested): { success, data: { property } }  → use property as analysis
      //   Shape C (flat):      { success, analysis, property }
      const inner   = raw?.data || raw?.result || raw;
      const analysis: PropertyAnalysis = inner?.analysis ?? inner?.property ?? inner;
      const property: PropertyData | undefined = inner?.property;

      if (!analysis || typeof analysis !== 'object') {
        const errMsg = `Analysis returned no data — keys: ${Object.keys(inner || {}).join(', ')}`;
        console.error('[analyze-property] no analysis object:', raw);
        toast.error(errMsg);
        setLoading(false);
        return;
      }

      try {
        const agentFallback = await fetchListingAgentInfo(address.trim());
        dealId = await saveDealToDb(analysis, property, agentFallback);
      } catch (saveError) {
        console.error('Error saving deal:', saveError);
        toast.error('Failed to save deal');
        setLoading(false);
        return;
      }

      if (dealId) {
        await refetch();
        navigate(`/deals/${dealId}`, {
          state: {
            analysisResult: 'new',
            apiCharged: true,
            analyzedAt: new Date().toISOString(),
          },
        });
      } else {
        toast.error('Property analyzed but failed to save to database');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error:', err);
      if (dealId) {
        await refetch();
        navigate(`/deals/${dealId}`, {
          state: { analysisResult: 'new', apiCharged: true, analyzedAt: new Date().toISOString() },
        });
      } else {
        toast.error('Failed to connect to analysis service');
        setLoading(false);
      }
    }
  };

  // Map API response to DealApiData format.
  // NOTE: When the API returns { data: { property } } with no separate `analysis` key,
  // Fetch agent info from the listing API for a specific address (fire-and-forget fallback)
  const fetchListingAgentInfo = async (fullAddress: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('zillow-search', {
        body: { location: fullAddress },
      });
      if (error || !data?.properties?.length) return null;
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const inputStreet = norm(fullAddress.split(',')[0]);
      const match = data.properties.find((p: any) =>
        norm(p.address || '').includes(inputStreet) || inputStreet.includes(norm(p.address || ''))
      ) ?? data.properties[0];
      return {
        agentName:  match?.agentName  ?? null,
        agentEmail: match?.agentEmail ?? null,
        agentPhone: match?.agentPhone ?? null,
        brokerName: match?.brokerName ?? null,
      };
    } catch { return null; }
  };

  // `analysis` here is actually the PropertyData/property object from the API.
  // We therefore try multiple field paths so both response shapes work.
  const mapToDealApiData = (analysis: PropertyAnalysis, property?: PropertyData, agentFallback?: { agentName: string|null; agentEmail: string|null; agentPhone: string|null; brokerName: string|null } | null): DealApiData => {
    const mapPropertyType = (type?: string): DealApiData['propertyType'] => {
      const typeMap: Record<string, DealApiData['propertyType']> = {
        'SINGLE_FAMILY': 'single_family',
        'MULTI_FAMILY': 'multi_family',
        'CONDO': 'condo',
        'TOWNHOUSE': 'townhouse',
        'DUPLEX': 'duplex',
        'TRIPLEX': 'triplex',
        'FOURPLEX': 'fourplex',
      };
      return typeMap[type?.toUpperCase() || ''] || 'other';
    };

    // `p` gives us direct (any-typed) access to the raw object —
    // needed when `analysis` is actually the property object with flat/alternative field names.
    const p = analysis as any;

    // Resolve the metrics sub-object — could live at analysis.metrics, p.metrics, p.analysis.metrics, etc.
    const m: any = analysis.metrics || p.metrics || p.analysis?.metrics || p.analysis || {};

    // Resolved property — prefer the explicit `property` arg; fall back to `p` itself (same object)
    const prop: any = property || p;

    // Log what we're working with so we can diagnose any remaining field-name mismatches
    console.log('[mapToDealApiData] analysis keys:', Object.keys(p));
    console.log('[mapToDealApiData] metrics keys:', Object.keys(m));
    console.log('[mapToDealApiData] arv candidates:', { 'm.arv': m.arv, 'p.arv': p.arv, 'p.validated_arv': p.validated_arv });
    console.log('[mapToDealApiData] rent candidates:', { 'm.monthly_rent': m.monthly_rent, 'p.monthly_rent': p.monthly_rent, 'p.rent_zestimate': p.rent_zestimate });
    console.log('[mapToDealApiData] grade candidates:', { 'p.grade': p.grade, 'p.analysis?.grade': p.analysis?.grade });

    return {
      // Property basics
      arv: m.arv ?? p.arv ?? p.validated_arv ?? null,
      purchasePrice: analysis.asking_price ?? p.asking_price ?? p.price ?? prop?.asking_price ?? prop?.price ?? null,
      rent: m.monthly_rent ?? p.monthly_rent ?? p.rent_zestimate ?? prop?.rent_zestimate ?? null,
      rehabCost: m.rehab_cost ?? p.rehab_cost ?? null,
      propertyTax: m.monthly_property_taxes ?? p.monthly_property_taxes ?? p.propertyTaxRate ?? null,
      insurance: m.monthly_insurance ?? p.monthly_insurance ?? p.annual_homeowners_insurance ? Math.round((p.annual_homeowners_insurance || 0) / 12) : null,
      bedrooms: analysis.bedrooms ?? p.bedrooms ?? prop?.bedrooms ?? null,
      bathrooms: analysis.bathrooms ?? p.bathrooms ?? prop?.bathrooms ?? null,
      sqft: analysis.living_area ?? p.living_area ?? p.sqft ?? prop?.living_area ?? prop?.sqft ?? null,
      yearBuilt: prop?.year_built ?? p.year_built ?? null,
      propertyType: mapPropertyType(prop?.property_type ?? p.property_type),
      lotSize: coerceLotSizeSqft(
        prop?.lot_area ?? p.lot_area ?? null,
        analysis.living_area ?? p.living_area ?? prop?.living_area ?? prop?.sqft ?? null
      ).sqft,

      // Location & Listing
      latitude: analysis.latitude ?? p.latitude ?? prop?.latitude ?? null,
      longitude: analysis.longitude ?? p.longitude ?? prop?.longitude ?? null,
      daysOnMarket: prop?.days_on_zillow ?? p.days_on_zillow ?? null,
      daysOnMarketFetchedAt: new Date().toISOString(),
      county: prop?.county ?? p.county ?? null,
      detailUrl: analysis.detail_url ?? p.detail_url ?? prop?.detail_url ?? null,
      imgSrc: analysis.img_src ?? p.img_src ?? prop?.img_src ?? null,

      // Location scores
      crimeScore: null,
      schoolScore: null,
      medianIncome: null,
      neighborhoodRating: null,

      // AI Analysis values
      grade: analysis.grade ?? p.grade ?? p.analysis?.grade ?? null,
      aiSummary: analysis.ai_summary ?? p.ai_summary ?? p.aiSummary ?? p.analysis?.ai_summary ?? null,
      monthlyCashFlow: m.monthly_cash_flow ?? p.monthly_cash_flow ?? null,
      cashOnCashRoi: m.cash_on_cash_roi ?? p.cash_on_cash_roi ?? null,
      capRate: m.cap_rate ?? p.cap_rate ?? null,
      monthlyExpenses: m.monthly_expenses ?? p.monthly_expenses ?? null,
      monthlyPiti: m.monthly_piti ?? p.monthly_piti ?? null,
      monthlyMortgage: m.monthly_mortgage_payment ?? p.monthly_mortgage_payment ?? null,
      downPayment: m.down_payment ?? p.down_payment ?? null,
      loanAmount: m.loan_amount ?? p.loan_amount ?? null,
      wholesalePrice: m.wholesale_price ?? p.wholesale_price ?? null,
      arvMargin: m.arv_margin ?? p.arv_margin ?? null,

      // Agent / Broker info — prefer DealBeast API data, fall back to listing API data
      agentName: prop?.attributionInfo?.agentName ?? p.attributionInfo?.agentName ?? agentFallback?.agentName ?? null,
      agentEmail: prop?.attributionInfo?.agentEmail ?? p.attributionInfo?.agentEmail ?? agentFallback?.agentEmail ?? null,
      agentPhone: prop?.attributionInfo?.agentPhoneNumber ?? p.attributionInfo?.agentPhoneNumber ?? agentFallback?.agentPhone ?? null,
      agentLicense: prop?.attributionInfo?.agentLicenseNumber ?? p.attributionInfo?.agentLicenseNumber ?? null,
      brokerName: prop?.attributionInfo?.brokerName ?? p.attributionInfo?.brokerName ?? agentFallback?.brokerName ?? null,
      brokerPhone: prop?.attributionInfo?.brokerPhoneNumber ?? p.attributionInfo?.brokerPhoneNumber ?? null,
      mlsId: prop?.attributionInfo?.mlsId ?? p.attributionInfo?.mlsId ?? null,
      mlsName: prop?.attributionInfo?.mlsName ?? p.attributionInfo?.mlsName ?? null,

      // Additional data
      priceHistory: (prop?.priceHistory ?? p.priceHistory ?? []).map((ph: any) => ({
        date: ph.date || '',
        price: ph.price || 0,
        event: ph.event || '',
      })),
      taxHistory: (prop?.tax_history ?? p.tax_history ?? []).map((t: any) => ({
        time: t.time || 0,
        taxPaid: t.taxPaid ?? null,
        value: t.value ?? null,
        taxIncreaseRate: t.taxIncreaseRate,
        valueIncreaseRate: t.valueIncreaseRate,
      })),
      section8: (() => {
        const s8 = m.section8 ?? p.section8 ?? null;
        return s8 ? {
          areaName: s8.areaName || '',
          minRent: s8.minRent || 0,
          maxRent: s8.maxRent || 0,
          bedrooms: s8.bedrooms || 0,
        } : null;
      })(),
      saleComps: (m.comps ?? p.comps ?? p.saleComps ?? []).map((c: any) => ({
        address: c.address || '',
        salePrice: c.sale_price || c.salePrice || 0,
        saleDate: c.sale_date || c.saleDate || '',
        bedrooms: c.bedrooms || 0,
        bathrooms: c.bathrooms || 0,
        sqft: c.sqft || 0,
        distance: c.distance || 0,
        similarityScore: c.similarity?.overall_score ?? c.similarityScore ?? 0,
        daysOnMarket: c.days_on_market ?? c.daysOnMarket ?? null,
      })),
      rentComps: (m.rent_comps ?? p.rent_comps ?? p.rentComps ?? []).map((c: any) => ({
        address: c.address || '',
        originalRent: c.originalRent || c.adjustedRent || 0,
        adjustedRent: c.adjustedRent || 0,
        bedrooms: c.bedrooms || 0,
        bathrooms: c.bathrooms || 0,
        sqft: c.sqft || 0,
        adjustment: c.adjustment || 0,
        adjustmentReason: c.adjustmentReason || '',
      })),

      // Store raw response for debugging
      rawResponse: { analysis, property },
    };
  };

  // Default overrides
  const defaultOverrides: DealOverrides = {
    arv: null,
    rent: null,
    rehabCost: null,
    purchasePrice: null,
    downPaymentPercent: null,
    interestRate: null,
    loanTermYears: null,
    targetBedrooms: null,
    targetBathrooms: null,
    holdingMonths: null,
    propertyTaxMonthly: null,
    insuranceMonthly: null,
    rentalInsuranceMonthly: null,
    stateTaxMonthly: null,
    hoaMonthly: null,
    utilitiesMonthly: null,
    propertyManagementPercent: null,
    maintenanceVacancyPercent: null,
    closingCostsPercent: null,
    closingCostsDollar: null,
    contingencyPercent: null,
    agentCommissionPercent: null,
    notaryFees: null,
    titleFees: null,
    hmlLoanType: null,
    hmlLtvPurchasePercent: null,
    hmlLtvRehabPercent: null,
    hmlPointsPercent: null,
    hmlInterestRate: null,
    hmlProcessingFee: null,
    hmlAppraisalCost: null,
    hmlUnderwritingFee: null,
    hmlOtherFees: null,
    hmlAnnualInsurance: null,
    refiLenderName: null,
    refiLtvPercent: null,
    refiInterestRate: null,
    refiAppraisalCost: null,
    refiUnderwritingFee: null,
    refiPointsPercent: null,
    refiOtherFees: null,
    refiClosingPercent: null,
    capexPercent: null,
    lotSizeSqft: null,
    holdingOtherMonthly: null,
    rentalAppraisalCost: null,
    rentalUnderwritingFee: null,
    rentalPointsPercent: null,
    rentalOtherFees: null,
  };

  // Save deal to database - returns the deal id
  const saveDealToDb = async (analysisData: PropertyAnalysis, propertyData?: PropertyData, agentFallback?: { agentName: string|null; agentEmail: string|null; agentPhone: string|null; brokerName: string|null } | null): Promise<string | null> => {
    try {
      const anyData = analysisData as any;
      // User-typed address is the ground truth — never let the API override it with
      // a generic "Unknown Address" when it can't geocode the property.
      // Only fall back to the API response address if the user didn't type one.
      const apiAddress = (analysisData.address && !String(analysisData.address).toLowerCase().includes('unknown'))
        ? analysisData.address
        : anyData.streetAddress || null;
      const resolvedAddress = address  // user input is primary
        || apiAddress
        || (anyData.address_street ? `${anyData.address_street}, ${anyData.address_city || ''}, ${anyData.address_state || ''} ${anyData.address_zip || ''}`.trim() : null);
      const addressParts = resolvedAddress?.split(',').map((s: string) => s.trim()) || [];
      const street = addressParts[0] || address;
      console.log('[saveDealToDb] resolved address:', resolvedAddress, '| parts:', addressParts);
      const city = anyData.address_city || analysisData.city || (analysisData as any).city || addressParts[1] || '';
      const stateZip = addressParts[2] || '';
      const [state, zip] = stateZip.split(' ').filter(Boolean);
      
      const apiData = mapToDealApiData(analysisData, propertyData, agentFallback);
      const financials = calculateFinancials(apiData, defaultOverrides);
      
      // Get current user for created_by
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      const dealInsert: any = {
        address_full: resolvedAddress || address,
        address_street: street,
        address_city: city,
        address_state: state || '',
        address_zip: zip || null,
        source: 'manual',
        status: 'new',
        api_data: apiData,
        financials: financials,
        created_by: currentUser?.id || null,
      };
      
      const { data: insertedDeal, error } = await supabase
        .from('deals')
        .insert([dealInsert])
        .select('id')
        .single();

      if (error) {
        console.error('Error saving deal:', error);
        return null;
      }

      return insertedDeal.id;
    } catch (err) {
      console.error('Error:', err);
      return null;
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Input Form */}
      <Card className="w-full mx-0 border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="pt-6">
          <div className="space-y-2" ref={containerRef}>
            <Label htmlFor="address">Property Address</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Input
                ref={inputRef}
                id="address"
                placeholder="Start typing a US address..."
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                className="bg-background/50 pl-10"
                autoComplete="off"
              />
              
              {/* Suggestions dropdown - Zillow-style */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                  <div className="py-1">
                    {suggestions.map((suggestion, index) => {
                      const contextText = formatContext(suggestion);
                      return (
                        <div
                          key={index}
                          className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                            index === highlightedIndex 
                              ? 'bg-primary/10' 
                              : 'hover:bg-muted/50'
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSuggestion(suggestion);
                          }}
                          onMouseEnter={() => setHighlightedIndex(index)}
                        >
                          <div className={`mt-0.5 p-1.5 rounded-full ${
                            index === highlightedIndex ? 'bg-primary/20' : 'bg-muted'
                          }`}>
                            <MapPin className={`h-4 w-4 ${
                              index === highlightedIndex ? 'text-primary' : 'text-muted-foreground'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${
                              index === highlightedIndex ? 'text-primary' : 'text-foreground'
                            }`}>
                              {suggestion.address ? `${suggestion.address} ${suggestion.text}` : suggestion.text}
                            </p>
                            {contextText && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {contextText}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={analyzeProperty}
            disabled={loading || !address.trim()}
            className="w-full mt-4"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Analyze Deal
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
