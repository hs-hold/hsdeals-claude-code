import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Bed, Bath, Ruler, Calendar, Clock, ExternalLink, MapPin } from 'lucide-react';

export interface MarketProperty {
  zpid: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lotSize?: number;
  lotSizeUnit?: string;
  yearBuilt?: number;
  propertyType?: string;
  daysOnZillow?: number;
  imgSrc?: string;
  detailUrl?: string;
  latitude?: number;
  longitude?: number;
  listingStatus?: string;
  zestimate?: number;
  rentZestimate?: number;
}

interface Props {
  properties: MarketProperty[];
  totalCount: number;
  onAnalyze: (property: MarketProperty) => void;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
};

const formatSqft = (sqft: number) => {
  return new Intl.NumberFormat('en-US').format(sqft);
};

export function MarketSearchResults({ properties, totalCount, onAnalyze }: Props) {
  if (properties.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No properties found matching your criteria</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Try adjusting your filters or search location</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {properties.length} of {totalCount.toLocaleString()} properties
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {properties.map(property => (
          <Card key={property.zpid} className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors group">
            {/* Image */}
            <div className="relative h-40 bg-muted">
              {property.imgSrc ? (
                <img
                  src={property.imgSrc}
                  alt={property.address}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No Image
                </div>
              )}
              {/* Price Badge */}
              <Badge className="absolute top-2 left-2 bg-background/90 text-foreground backdrop-blur-sm font-bold">
                {formatPrice(property.price)}
              </Badge>
              {/* Days on Market */}
              {property.daysOnZillow !== undefined && (
                <Badge variant="secondary" className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm">
                  <Clock className="w-3 h-3 mr-1" />
                  {property.daysOnZillow}d
                </Badge>
              )}
            </div>

            <CardContent className="p-4 space-y-3">
              {/* Address */}
              <div>
                <h3 className="font-semibold text-foreground truncate">{property.address}</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {property.city}, {property.state} {property.zipcode}
                </p>
              </div>

              {/* Property Details */}
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
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
                    {formatSqft(property.sqft)} sqft
                  </span>
                )}
                {property.yearBuilt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {property.yearBuilt}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => onAnalyze(property)}
                  className="flex-1"
                  size="sm"
                >
                  <Zap className="w-4 h-4 mr-1" />
                  Analyze
                </Button>
                {property.detailUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a href={property.detailUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
