import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, Bed, Bath, Ruler, Calendar, Clock, MapPin, ExternalLink, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { MarketProperty } from '@/components/deals/MarketSearchResults';
import { analyzeAndCreateDeal } from '@/services/deals/analyzeAndCreateDeal';

type MarketSearchResultsState = {
  results: MarketProperty[];
  totalResults?: number;
  rawResponse?: unknown;
  searchFilters?: { location?: string };
};

export default function MarketSearchResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const { results, totalResults, rawResponse, searchFilters } = (location.state || {}) as MarketSearchResultsState;

  const [analyzingZpid, setAnalyzingZpid] = useState<string | null>(null);

  const handleViewRawResponse = () => {
    const blob = new Blob([JSON.stringify(rawResponse, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const formatLotDisplay = (property: MarketProperty): string | null => {
    if (!property.lotSize) return null;

    const unit = (property.lotSizeUnit || '').toLowerCase().trim();
    const raw = property.lotSize;

    const isAcreUnit = unit.includes('acre') || unit === 'ac' || unit === 'acres' || unit === 'acre';
    const canApplyHundredthAcreFix = Number.isInteger(raw) && raw >= 10 && raw <= 99;

    if (isAcreUnit) {
      const acres = canApplyHundredthAcreFix ? raw / 100 : raw;
      return `${acres.toFixed(2)} acres`;
    }

    // If unit is missing/wrong but the value is a 2-digit number smaller than the building sqft,
    // treat it as "0.xx acres".
    if (!property.lotSizeUnit && property.sqft && canApplyHundredthAcreFix && raw < property.sqft) {
      return `${(raw / 100).toFixed(2)} acres`;
    }

    return `${raw.toLocaleString()} sqft`;
  };

  const handleAnalyzeProperty = async (property: MarketProperty) => {
    const fullAddress = `${property.address}, ${property.city}, ${property.state} ${property.zipcode}`;

    setAnalyzingZpid(property.zpid);
    try {
      const { dealId, error } = await analyzeAndCreateDeal(fullAddress);
      if (!dealId) {
        toast.error(error || 'Failed to analyze property');
        return;
      }

      navigate(`/deals/${dealId}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to analyze property');
    } finally {
      setAnalyzingZpid(null);
    }
  };

  if (!results) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No search results found</p>
            <Button onClick={() => navigate('/analyze')} className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Search
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/analyze')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Search
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Search Results</h1>
            <p className="text-muted-foreground">
              {searchFilters?.location && `Location: ${searchFilters.location}`}
              {totalResults && ` • ${totalResults} properties found`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleViewRawResponse} className="gap-2">
          <ExternalLink className="w-4 h-4" />
          View Raw API Response
        </Button>
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No properties found matching your criteria</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Try adjusting your filters or search location</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Found {results.length} Properties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.map((property: MarketProperty, idx: number) => (
                <div
                  key={property.zpid || idx}
                  className="flex gap-4 p-4 bg-muted/50 rounded-lg border border-border/50 hover:border-primary/30 transition-colors"
                >
                  {/* Property Image */}
                  {property.imgSrc ? (
                    <img
                      src={property.imgSrc}
                      alt={property.address}
                      className="w-32 h-24 object-cover rounded-md flex-shrink-0"
                    />
                  ) : (
                    <div className="w-32 h-24 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
                      <Home className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}

                  {/* Property Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-foreground truncate">{property.address}</h3>
                        <p className="text-sm text-muted-foreground">
                          {property.city}, {property.state} {property.zipcode}
                        </p>
                      </div>
                      {property.price && (
                        <span className="text-lg font-bold text-primary whitespace-nowrap">
                          ${property.price.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Property Stats */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                      {property.bedrooms !== undefined && (
                        <span className="flex items-center gap-1">
                          <Bed className="w-3.5 h-3.5" />
                          {property.bedrooms} beds
                        </span>
                      )}
                      {property.bathrooms !== undefined && (
                        <span className="flex items-center gap-1">
                          <Bath className="w-3.5 h-3.5" />
                          {property.bathrooms} baths
                        </span>
                      )}
                      {property.sqft && (
                        <span className="flex items-center gap-1">
                          <Ruler className="w-3.5 h-3.5" />
                          {property.sqft.toLocaleString()} sqft
                        </span>
                      )}
                      {property.lotSize && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {formatLotDisplay(property)} lot
                        </span>
                      )}
                      {property.yearBuilt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          Built {property.yearBuilt}
                        </span>
                      )}
                      {property.daysOnZillow !== undefined && property.daysOnZillow !== null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {property.daysOnZillow} days
                        </span>
                      )}
                    </div>

                    {/* Additional Info */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm">
                      {property.propertyType && (
                        <span className="text-muted-foreground">{property.propertyType}</span>
                      )}
                      {property.listingStatus && (
                        <span className="text-muted-foreground">Status: {property.listingStatus}</span>
                      )}
                      {property.zestimate && (
                        <span className="text-primary">Zestimate: ${property.zestimate.toLocaleString()}</span>
                      )}
                      {property.rentZestimate && (
                        <span className="text-accent-foreground">Rent Est: ${property.rentZestimate.toLocaleString()}/mo</span>
                      )}
                    </div>
                  </div>

                  {/* Analyze Button */}
                  <div className="flex-shrink-0 flex items-center">
                    <Button
                      onClick={() => handleAnalyzeProperty(property)}
                      size="sm"
                      className="gap-2"
                      disabled={analyzingZpid === property.zpid}
                    >
                      {analyzingZpid === property.zpid ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          Analyze
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
