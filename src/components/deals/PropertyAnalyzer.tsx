import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { ApiResponse, PropertyAnalysis, PropertyData } from '@/types/apiResponse';
import { toast } from 'sonner';
import { Loader2, Search, MapPin, Calendar, ExternalLink, RefreshCw } from 'lucide-react';
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
  const [address, setAddress] = useState(initialAddress);
  const [loading, setLoading] = useState(false);
  const [existingDealDialog, setExistingDealDialog] = useState<{
    open: boolean;
    dealId: string;
    addressFull: string;
    updatedAt: string;
  } | null>(null);
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

  // Normalize address for comparison - remove punctuation, extra spaces, lowercase
  const normalizeForComparison = (addr: string): string => {
    return addr
      .toLowerCase()
      .replace(/[,\.]/g, ' ')  // Replace commas and dots with spaces
      .replace(/\s+/g, ' ')     // Collapse multiple spaces
      .trim();
  };

  // Extract street number and name for matching
  const extractStreetParts = (addr: string): { number: string; name: string } | null => {
    const match = addr.match(/^(\d+)\s+(.+?)(?:,|$)/i);
    if (match) {
      return { number: match[1], name: match[2].toLowerCase().trim() };
    }
    return null;
  };

  // Check if property already exists in database
  const checkExistingDeal = async (addressToCheck: string): Promise<{ exists: boolean; dealId?: string; addressFull?: string; updatedAt?: string }> => {
    try {
      const streetParts = extractStreetParts(addressToCheck);
      
      if (!streetParts) {
        return { exists: false };
      }

      // Search for deals with matching street number using wildcard
      const searchPattern = `${streetParts.number}%`;
      
      const { data: matches, error } = await supabase
        .from('deals')
        .select('id, address_full, address_street, updated_at')
        .ilike('address_street', searchPattern)
        .limit(10);
      
      if (error || !matches || matches.length === 0) {
        return { exists: false };
      }

      // Compare normalized addresses
      const normalizedInput = normalizeForComparison(addressToCheck);
      
      for (const deal of matches) {
        const normalizedDeal = normalizeForComparison(deal.address_full);
        
        // Check if normalized addresses match (ignoring minor differences)
        if (normalizedDeal.includes(normalizedInput) || normalizedInput.includes(normalizedDeal)) {
          return { exists: true, dealId: deal.id, addressFull: deal.address_full, updatedAt: deal.updated_at };
        }

        // Also check street-level match
        const dealStreetParts = extractStreetParts(deal.address_street);
        if (dealStreetParts && 
            dealStreetParts.number === streetParts.number &&
            normalizeForComparison(dealStreetParts.name).includes(normalizeForComparison(streetParts.name).split(' ')[0])) {
          return { exists: true, dealId: deal.id, addressFull: deal.address_full, updatedAt: deal.updated_at };
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

    // Check if property already exists
    const existingCheck = await checkExistingDeal(address);
    if (existingCheck.exists && existingCheck.dealId) {
      setExistingDealDialog({
        open: true,
        dealId: existingCheck.dealId,
        addressFull: existingCheck.addressFull || address,
        updatedAt: existingCheck.updatedAt || '',
      });
      setLoading(false);
      return;
    }

    let dealId: string | null = null;

    try {
      const { data, error } = await supabase.functions.invoke('analyze-property', {
        body: {
          address: address.trim(),
        },
      });

      if (error) {
        console.error('Function error:', error);
        toast.error('Failed to analyze property');
        setLoading(false);
        return;
      }

      const apiResponse = data as ApiResponse;
      
      if (apiResponse?.success && apiResponse.data?.analysis) {
        // CRITICAL: Save immediately after receiving API response
        // This ensures data is persisted even if browser crashes afterward
        try {
          dealId = await saveDealToDb(apiResponse.data.analysis, apiResponse.data.property);
        } catch (saveError) {
          console.error('Error saving deal:', saveError);
          toast.error('Failed to save deal');
          setLoading(false);
          return;
        }

        if (dealId) {
          toast.success('Property analyzed and saved');
          // Navigate after save is confirmed
          navigate(`/deals/${dealId}`);
        } else {
          toast.error('Property analyzed but failed to save');
          setLoading(false);
        }
      } else {
        toast.error(apiResponse?.error || 'Analysis failed');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error:', err);
      // If we have a dealId, the deal was saved successfully - navigate to it
      if (dealId) {
        toast.success('Deal saved');
        navigate(`/deals/${dealId}`);
      } else {
        toast.error('Failed to connect to analysis service');
        setLoading(false);
      }
    }
  };

  // Map API response to DealApiData format
  const mapToDealApiData = (analysis: PropertyAnalysis, property?: PropertyData): DealApiData => {
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

    return {
      // Property basics
      arv: analysis.metrics?.arv ?? null,
      purchasePrice: analysis.asking_price ?? null,
      rent: analysis.metrics?.monthly_rent ?? null,
      rehabCost: analysis.metrics?.rehab_cost ?? null,
      propertyTax: analysis.metrics?.monthly_property_taxes ?? null,
      insurance: analysis.metrics?.monthly_insurance ?? null,
      bedrooms: analysis.bedrooms ?? null,
      bathrooms: analysis.bathrooms ?? null,
      sqft: analysis.living_area ?? null,
      yearBuilt: property?.year_built ?? null,
      propertyType: mapPropertyType(property?.property_type),
      lotSize: coerceLotSizeSqft(
        property?.lot_area ?? null,
        analysis.living_area ?? property?.living_area ?? property?.sqft ?? null
      ).sqft,
      
      // Location & Listing
      latitude: analysis.latitude ?? property?.latitude ?? null,
      longitude: analysis.longitude ?? property?.longitude ?? null,
      daysOnMarket: property?.days_on_zillow ?? null,
      daysOnMarketFetchedAt: new Date().toISOString(),
      county: property?.county ?? null,
      detailUrl: analysis.detail_url ?? property?.detail_url ?? null,
      imgSrc: analysis.img_src ?? property?.img_src ?? null,
      
      // Location scores
      crimeScore: null,
      schoolScore: null,
      medianIncome: null,
      neighborhoodRating: null,
      
      // AI Analysis values
      grade: analysis.grade ?? null,
      aiSummary: analysis.ai_summary ?? null,
      monthlyCashFlow: analysis.metrics?.monthly_cash_flow ?? null,
      cashOnCashRoi: analysis.metrics?.cash_on_cash_roi ?? null,
      capRate: analysis.metrics?.cap_rate ?? null,
      monthlyExpenses: analysis.metrics?.monthly_expenses ?? null,
      monthlyPiti: analysis.metrics?.monthly_piti ?? null,
      monthlyMortgage: analysis.metrics?.monthly_mortgage_payment ?? null,
      downPayment: analysis.metrics?.down_payment ?? null,
      loanAmount: analysis.metrics?.loan_amount ?? null,
      wholesalePrice: analysis.metrics?.wholesale_price ?? null,
      arvMargin: analysis.metrics?.arv_margin ?? null,
      
      // Agent / Broker info
      agentName: property?.attributionInfo?.agentName ?? null,
      agentEmail: property?.attributionInfo?.agentEmail ?? null,
      agentPhone: property?.attributionInfo?.agentPhoneNumber ?? null,
      agentLicense: property?.attributionInfo?.agentLicenseNumber ?? null,
      brokerName: property?.attributionInfo?.brokerName ?? null,
      brokerPhone: property?.attributionInfo?.brokerPhoneNumber ?? null,
      mlsId: property?.attributionInfo?.mlsId ?? null,
      mlsName: property?.attributionInfo?.mlsName ?? null,
      
      // Additional data
      priceHistory: property?.priceHistory?.map(p => ({
        date: p.date || '',
        price: p.price || 0,
        event: p.event || '',
      })) || [],
      taxHistory: property?.tax_history?.map(t => ({
        time: t.time || 0,
        taxPaid: t.taxPaid ?? null,
        value: t.value ?? null,
        taxIncreaseRate: t.taxIncreaseRate,
        valueIncreaseRate: t.valueIncreaseRate,
      })) || [],
      section8: analysis.metrics?.section8 ? {
        areaName: analysis.metrics.section8.areaName || '',
        minRent: analysis.metrics.section8.minRent || 0,
        maxRent: analysis.metrics.section8.maxRent || 0,
        bedrooms: analysis.metrics.section8.bedrooms || 0,
      } : null,
      saleComps: analysis.metrics?.comps?.map(c => ({
        address: c.address || '',
        salePrice: c.sale_price || 0,
        saleDate: c.sale_date || '',
        bedrooms: c.bedrooms || 0,
        bathrooms: c.bathrooms || 0,
        sqft: c.sqft || 0,
        distance: c.distance || 0,
        similarityScore: c.similarity?.overall_score || 0,
      })) || [],
      rentComps: analysis.metrics?.rent_comps?.map(c => ({
        address: c.address || '',
        originalRent: c.originalRent || c.adjustedRent || 0,
        adjustedRent: c.adjustedRent || 0,
        bedrooms: c.bedrooms || 0,
        bathrooms: c.bathrooms || 0,
        sqft: c.sqft || 0,
        adjustment: c.adjustment || 0,
        adjustmentReason: c.adjustmentReason || '',
      })) || [],
      
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
  const saveDealToDb = async (analysisData: PropertyAnalysis, propertyData?: PropertyData): Promise<string | null> => {
    try {
      // Parse address components
      const addressParts = analysisData.address?.split(',').map(s => s.trim()) || [];
      const street = addressParts[0] || address;
      const city = analysisData.city || addressParts[1] || '';
      const stateZip = addressParts[2] || '';
      const [state, zip] = stateZip.split(' ').filter(Boolean);
      
      const apiData = mapToDealApiData(analysisData, propertyData);
      const financials = calculateFinancials(apiData, defaultOverrides);
      
      // Get current user for created_by
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      const dealInsert: any = {
        address_full: analysisData.address || address,
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
      {/* Existing Deal Dialog */}
      <Dialog 
        open={existingDealDialog?.open || false} 
        onOpenChange={(open) => !open && setExistingDealDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <MapPin className="h-5 w-5 text-primary" />
              Property Already Analyzed
            </DialogTitle>
            <DialogDescription className="pt-2">
              This property was previously analyzed and saved in your deals.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Address</p>
                <p className="font-medium text-foreground">{existingDealDialog?.addressFull}</p>
              </div>
              
              {existingDealDialog?.updatedAt && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last updated:</span>
                  <span className="font-medium">
                    {format(new Date(existingDealDialog.updatedAt), 'MMM d, yyyy \'at\' h:mm a')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setExistingDealDialog(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (existingDealDialog?.dealId) {
                  navigate(`/deals/${existingDealDialog.dealId}`);
                }
              }}
              className="w-full sm:w-auto"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
