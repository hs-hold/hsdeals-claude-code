import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Loader2, ChevronDown, ChevronUp, Home, DollarSign, Bed, Bath, Ruler, Calendar, Clock, Car, Building, Eye, Waves, Mountain, Trees, MapPin } from 'lucide-react';

export interface SearchFilters {
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

const HOME_TYPES = [
  { value: 'SingleFamily', label: 'Single Family' },
  { value: 'Condo', label: 'Condo' },
  { value: 'Townhouse', label: 'Townhouse' },
  { value: 'Apartment', label: 'Apartment' },
  { value: 'LotLand', label: 'Lot/Land' },
  { value: 'Manufactured', label: 'Manufactured' },
];

const LIST_TYPES = [
  { value: 'for-sale', label: 'For Sale' },
  { value: 'for-rent', label: 'For Rent' },
];

export function MarketSearch() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState<SearchFilters>({
    location: '',
    homeType: 'SingleFamily',
    listType: 'for-sale',
    minPrice: 80000,
    maxPrice: 200000,
    minBeds: 2,
    maxBeds: 4,
    minBaths: 1,
    minSqft: 1200,
    maxSqft: 2000,
  });

  const updateFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleBooleanFilter = (key: keyof SearchFilters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSearch = async () => {
    if (!filters.location.trim()) {
      toast.error('Please enter a location (ZIP code, city, or neighborhood)');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('zillow-search', {
        body: filters,
      });

      if (error) {
        console.error('Search error:', error);
        toast.error('Search service is currently unavailable. Please try again later or search by specific address.', {
          duration: 8000,
        });
        return;
      }

      if (data?.success) {
        if (data.properties?.length === 0) {
          toast.info('No properties found matching your criteria');
        } else {
          toast.success(`Found ${data.properties?.length} properties`);
          // Navigate to results page with data
          navigate('/market-search-results', {
            state: {
              results: data.properties,
              totalResults: data.totalResultCount,
              rawResponse: data,
              searchFilters: filters,
            }
          });
        }
      } else {
        toast.error(data?.error || 'Search failed');
      }
    } catch (err) {
      console.error('Error:', err);
      toast.error('Failed to connect to search service');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="w-5 h-5 text-primary" />
            Search Properties
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Location & List Type - Required */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="location" className="text-sm font-medium">
                Location <span className="text-destructive">*</span>
              </Label>
              <Input
                id="location"
                placeholder="Enter ZIP code, city, or neighborhood (e.g., 30032 or Decatur, GA)"
                value={filters.location}
                onChange={e => updateFilter('location', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="mt-1.5"
              />
            </div>
            <div className="w-32">
              <Label className="text-sm font-medium">List Type</Label>
              <Select
                value={filters.listType || 'for-sale'}
                onValueChange={v => updateFilter('listType', v)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIST_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={loading} size="lg">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Filters Toggle */}
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="pt-4 space-y-6">
              {/* Basic Filters */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Property Type */}
                <div>
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Home className="w-3.5 h-3.5" />
                    Property Type
                  </Label>
                  <Select
                    value={filters.homeType || 'SingleFamily'}
                    onValueChange={v => updateFilter('homeType', v)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOME_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Price Range */}
                <div>
                  <Label className="flex items-center gap-1.5 text-sm">
                    <DollarSign className="w-3.5 h-3.5" />
                    Price Range
                  </Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      type="number"
                      placeholder="No min"
                      value={filters.minPrice || ''}
                      onChange={e => updateFilter('minPrice', e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                    />
                    <span className="flex items-center text-muted-foreground">-</span>
                    <Input
                      type="number"
                      placeholder="No max"
                      value={filters.maxPrice || ''}
                      onChange={e => updateFilter('maxPrice', e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Beds Range */}
                <div>
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Bed className="w-3.5 h-3.5" />
                    Bedrooms
                  </Label>
                  <div className="flex gap-2 mt-1.5">
                    <Select
                      value={filters.minBeds?.toString() || 'any'}
                      onValueChange={v => updateFilter('minBeds', v === 'any' ? undefined : Number(v))}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="No min" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">No min</SelectItem>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="flex items-center text-muted-foreground">-</span>
                    <Select
                      value={filters.maxBeds?.toString() || 'any'}
                      onValueChange={v => updateFilter('maxBeds', v === 'any' ? undefined : Number(v))}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="No max" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">No max</SelectItem>
                        {[1, 2, 3, 4, 5, 6].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Baths Range */}
                <div>
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Bath className="w-3.5 h-3.5" />
                    Bathrooms
                  </Label>
                  <div className="flex gap-2 mt-1.5">
                    <Select
                      value={filters.minBaths?.toString() || 'any'}
                      onValueChange={v => updateFilter('minBaths', v === 'any' ? undefined : Number(v))}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="No min" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">No min</SelectItem>
                        {[1, 2, 3, 4].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="flex items-center text-muted-foreground">-</span>
                    <Select
                      value={filters.maxBaths?.toString() || 'any'}
                      onValueChange={v => updateFilter('maxBaths', v === 'any' ? undefined : Number(v))}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="No max" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">No max</SelectItem>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Sqft Range */}
                <div>
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Ruler className="w-3.5 h-3.5" />
                    Square Feet
                  </Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      type="number"
                      placeholder="No min"
                      value={filters.minSqft || ''}
                      onChange={e => updateFilter('minSqft', e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                    />
                    <span className="flex items-center text-muted-foreground">-</span>
                    <Input
                      type="number"
                      placeholder="No max"
                      value={filters.maxSqft || ''}
                      onChange={e => updateFilter('maxSqft', e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Lot Size Range */}
                <div>
                  <Label className="flex items-center gap-1.5 text-sm">
                    <MapPin className="w-3.5 h-3.5" />
                    Lot Size (sqft)
                  </Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      type="number"
                      placeholder="No min"
                      value={filters.minLotSize || ''}
                      onChange={e => updateFilter('minLotSize', e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                    />
                    <span className="flex items-center text-muted-foreground">-</span>
                    <Input
                      type="number"
                      placeholder="No max"
                      value={filters.maxLotSize || ''}
                      onChange={e => updateFilter('maxLotSize', e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Year Built Range */}
                <div>
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Calendar className="w-3.5 h-3.5" />
                    Year Built
                  </Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      type="number"
                      placeholder="No min"
                      value={filters.minYearBuilt || ''}
                      onChange={e => updateFilter('minYearBuilt', e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                    />
                    <span className="flex items-center text-muted-foreground">-</span>
                    <Input
                      type="number"
                      placeholder="No max"
                      value={filters.maxYearBuilt || ''}
                      onChange={e => updateFilter('maxYearBuilt', e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Days on Market */}
                <div>
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Clock className="w-3.5 h-3.5" />
                    Days on Market (max)
                  </Label>
                  <Select
                    value={filters.maxDaysOnMarket?.toString() || 'any'}
                    onValueChange={v => updateFilter('maxDaysOnMarket', v === 'any' ? undefined : Number(v))}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">6 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Max HOA */}
                <div>
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Building className="w-3.5 h-3.5" />
                    Max HOA ($/month)
                  </Label>
                  <Input
                    type="number"
                    placeholder="No max"
                    value={filters.maxHOA || ''}
                    onChange={e => updateFilter('maxHOA', e.target.value ? Number(e.target.value) : undefined)}
                    className="mt-1.5"
                  />
                </div>

                {/* Parking Spots */}
                <div>
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Car className="w-3.5 h-3.5" />
                    Parking Spots (min)
                  </Label>
                  <Select
                    value={filters.parkingSpots?.toString() || 'any'}
                    onValueChange={v => updateFilter('parkingSpots', v === 'any' ? undefined : Number(v))}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      {[1, 2, 3, 4, 5].map(n => (
                        <SelectItem key={n} value={n.toString()}>{n}+</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Boolean Filters - Listing Types */}
              <div>
                <Label className="text-sm font-medium mb-3 block">Listing Options</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isComingSoon"
                      checked={filters.isComingSoon || false}
                      onCheckedChange={() => toggleBooleanFilter('isComingSoon')}
                    />
                    <label htmlFor="isComingSoon" className="text-sm cursor-pointer">Coming Soon</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isForSaleForeclosure"
                      checked={filters.isForSaleForeclosure || false}
                      onCheckedChange={() => toggleBooleanFilter('isForSaleForeclosure')}
                    />
                    <label htmlFor="isForSaleForeclosure" className="text-sm cursor-pointer">Foreclosure</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isAuction"
                      checked={filters.isAuction || false}
                      onCheckedChange={() => toggleBooleanFilter('isAuction')}
                    />
                    <label htmlFor="isAuction" className="text-sm cursor-pointer">Auction</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isOpenHousesOnly"
                      checked={filters.isOpenHousesOnly || false}
                      onCheckedChange={() => toggleBooleanFilter('isOpenHousesOnly')}
                    />
                    <label htmlFor="isOpenHousesOnly" className="text-sm cursor-pointer">Open Houses Only</label>
                  </div>
                </div>
              </div>

              {/* Boolean Filters - Features */}
              <div>
                <Label className="text-sm font-medium mb-3 block">Property Features</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="singleStory"
                      checked={filters.singleStory || false}
                      onCheckedChange={() => toggleBooleanFilter('singleStory')}
                    />
                    <label htmlFor="singleStory" className="text-sm cursor-pointer">Single Story</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasPool"
                      checked={filters.hasPool || false}
                      onCheckedChange={() => toggleBooleanFilter('hasPool')}
                    />
                    <label htmlFor="hasPool" className="text-sm cursor-pointer">Has Pool</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasGarage"
                      checked={filters.hasGarage || false}
                      onCheckedChange={() => toggleBooleanFilter('hasGarage')}
                    />
                    <label htmlFor="hasGarage" className="text-sm cursor-pointer">Has Garage</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is3dHome"
                      checked={filters.is3dHome || false}
                      onCheckedChange={() => toggleBooleanFilter('is3dHome')}
                    />
                    <label htmlFor="is3dHome" className="text-sm cursor-pointer">3D Home Tour</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isBasementFinished"
                      checked={filters.isBasementFinished || false}
                      onCheckedChange={() => toggleBooleanFilter('isBasementFinished')}
                    />
                    <label htmlFor="isBasementFinished" className="text-sm cursor-pointer">Finished Basement</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isBasementUnfinished"
                      checked={filters.isBasementUnfinished || false}
                      onCheckedChange={() => toggleBooleanFilter('isBasementUnfinished')}
                    />
                    <label htmlFor="isBasementUnfinished" className="text-sm cursor-pointer">Unfinished Basement</label>
                  </div>
                </div>
              </div>

              {/* View Filters */}
              <div>
                <Label className="text-sm font-medium mb-3 block flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  View Options
                </Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isWaterView"
                      checked={filters.isWaterView || false}
                      onCheckedChange={() => toggleBooleanFilter('isWaterView')}
                    />
                    <label htmlFor="isWaterView" className="text-sm cursor-pointer flex items-center gap-1">
                      <Waves className="w-3 h-3" /> Water View
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isParkView"
                      checked={filters.isParkView || false}
                      onCheckedChange={() => toggleBooleanFilter('isParkView')}
                    />
                    <label htmlFor="isParkView" className="text-sm cursor-pointer flex items-center gap-1">
                      <Trees className="w-3 h-3" /> Park View
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isCityView"
                      checked={filters.isCityView || false}
                      onCheckedChange={() => toggleBooleanFilter('isCityView')}
                    />
                    <label htmlFor="isCityView" className="text-sm cursor-pointer flex items-center gap-1">
                      <Building className="w-3 h-3" /> City View
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isMountainView"
                      checked={filters.isMountainView || false}
                      onCheckedChange={() => toggleBooleanFilter('isMountainView')}
                    />
                    <label htmlFor="isMountainView" className="text-sm cursor-pointer flex items-center gap-1">
                      <Mountain className="w-3 h-3" /> Mountain View
                    </label>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
}
