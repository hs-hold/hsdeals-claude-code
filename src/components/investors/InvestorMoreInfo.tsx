import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ChevronDown, 
  Info, 
  Home, 
  Calendar, 
  Ruler, 
  MapPin,
  DollarSign,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/financialCalculations';
import { coerceLotSizeSqft } from '@/utils/lotSize';
import { DealApiData } from '@/types/deal';
import { PropertyMap } from '@/components/deals/PropertyMap';
import { useState } from 'react';

interface InvestorMoreInfoProps {
  apiData: DealApiData;
  address: {
    street: string;
    city: string;
    state: string;
    full: string;
  };
  purchasePrice: number;
  arv: number;
  rehabCost: number;
  rent: number;
  lotSizeSqftOverride?: number | null;
}

export function InvestorMoreInfo({
  apiData,
  address,
  purchasePrice,
  arv,
  rehabCost,
  rent,
  lotSizeSqftOverride,
}: InvestorMoreInfoProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Calculate effective lot size (use override if available)
  const apiLotSqft = coerceLotSizeSqft(apiData.lotSize, apiData.sqft).sqft;
  const effectiveLotSizeSqft = lotSizeSqftOverride ?? apiLotSqft ?? null;
  const lotSizeAcres = effectiveLotSizeSqft ? effectiveLotSizeSqft / 43560 : null;
  const lotSizeDisplay = effectiveLotSizeSqft 
    ? (effectiveLotSizeSqft >= 43560 
        ? `${lotSizeAcres!.toFixed(2)} acres (${effectiveLotSizeSqft.toLocaleString()} sqft)`
        : `${effectiveLotSizeSqft.toLocaleString()} sqft`)
    : null;

  const propertyDetails = [
    { label: 'Bedrooms', value: apiData.bedrooms, icon: Home },
    { label: 'Bathrooms', value: apiData.bathrooms, icon: Home },
    { label: 'Square Feet', value: apiData.sqft?.toLocaleString(), icon: Ruler },
    { label: 'Year Built', value: apiData.yearBuilt, icon: Calendar },
    { label: 'Lot Size', value: lotSizeDisplay, icon: Ruler },
    { label: 'Property Type', value: apiData.propertyType, icon: Building2 },
  ].filter(item => item.value);

  const financialDetails = [
    { label: 'Purchase Price', value: formatCurrency(purchasePrice), highlight: true },
    { label: 'ARV (After Repair Value)', value: formatCurrency(arv) },
    { label: 'Rehab Cost', value: formatCurrency(rehabCost) },
    { label: 'Expected Rent', value: `${formatCurrency(rent)}/mo` },
    { label: 'Property Tax', value: apiData.propertyTax ? `${formatCurrency(apiData.propertyTax)}/yr` : null },
    { label: 'Insurance', value: apiData.insurance ? `${formatCurrency(apiData.insurance)}/yr` : null },
  ].filter(item => item.value);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border border-muted">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4">
            <CardTitle className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-muted-foreground" />
                <span>More Details</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Property info, financials & map
                </span>
                <ChevronDown className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform",
                  isOpen && "rotate-180"
                )} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-6 px-4 pb-5">
            {/* Property Image */}
            {apiData.imgSrc && (
              <div className="rounded-lg overflow-hidden">
                <img 
                  src={apiData.imgSrc} 
                  alt="Property" 
                  className="w-full h-48 object-cover"
                />
              </div>
            )}

            {/* Address */}
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <div className="font-medium">{address.street}</div>
                <div className="text-sm text-muted-foreground">
                  {address.city}, {address.state}
                </div>
              </div>
            </div>

            <Separator />

            {/* Property Details */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Property Details
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {propertyDetails.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <item.icon className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{item.label}:</span>
                    <span className="text-sm font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Financial Summary */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Financial Summary
              </h4>
              <div className="space-y-2">
                {financialDetails.map((item, idx) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "flex items-center justify-between py-1.5 px-2 rounded",
                      item.highlight && "bg-primary/10"
                    )}
                  >
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className={cn(
                      "text-sm font-medium",
                      item.highlight && "text-primary"
                    )}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparables Summary if available */}
            {apiData.saleComps && apiData.saleComps.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-3">Sale Comparables</h4>
                  <div className="space-y-2">
                    {apiData.saleComps.slice(0, 3).map((comp, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded">
                        <span className="text-muted-foreground truncate mr-2">{comp.address}</span>
                        <Badge variant="outline" className="shrink-0">
                          {formatCurrency(comp.salePrice)}
                        </Badge>
                      </div>
                    ))}
                    {apiData.saleComps.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{apiData.saleComps.length - 3} more comparables
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Rent Comparables if available */}
            {apiData.rentComps && apiData.rentComps.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-3">Rent Comparables</h4>
                  <div className="space-y-2">
                    {apiData.rentComps.slice(0, 3).map((comp, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded">
                        <span className="text-muted-foreground truncate mr-2">{comp.address}</span>
                        <Badge variant="outline" className="shrink-0">
                          {formatCurrency(comp.adjustedRent)}/mo
                        </Badge>
                      </div>
                    ))}
                    {apiData.rentComps.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{apiData.rentComps.length - 3} more comparables
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Map */}
            {(apiData.latitude && apiData.longitude) && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Location
                  </h4>
                  <div className="h-48 rounded-lg overflow-hidden">
                    <PropertyMap 
                      latitude={apiData.latitude} 
                      longitude={apiData.longitude}
                      address={address.full}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
