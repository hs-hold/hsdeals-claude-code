import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { useSettings } from '@/context/SettingsContext';
import { formatCurrency, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DealStatusBadge } from '@/components/deals/DealStatusBadge';
import { DealAgeFilter, AgeFilterType, applyDealAgeFilter } from '@/components/deals/DealAgeFilter';
import { DollarSign, BarChart2, Inbox } from 'lucide-react';
import { Deal } from '@/types/deal';

const MIN_REHAB = 60_000;

function getMinProfit(purchasePrice: number): number {
  if (purchasePrice > 300_000) return 50_000;
  if (purchasePrice > 250_000) return 45_000;
  return 40_000;
}

function calcFlipNumbers(deal: Deal, loanDefaults: any) {
  const financials = deal.financials;
  const apiData = deal.apiData;
  if (!financials || !apiData) return null;

  const purchasePrice = deal.overrides?.purchasePrice ?? apiData.purchasePrice ?? 0;
  if (purchasePrice <= 0) return null;

  const arv = deal.overrides?.arv ?? financials.arv ?? apiData.arv ?? 0;
  if (arv <= 0) return null;

  const baseRehabCost = deal.overrides?.rehabCost ?? apiData.rehabCost ?? 0;
  const bedroomsAdded = deal.overrides?.targetBedrooms != null
    ? Math.max(0, deal.overrides.targetBedrooms - (apiData.bedrooms ?? 0))
    : 0;
  const bathroomsAdded = deal.overrides?.targetBathrooms != null
    ? Math.max(0, deal.overrides.targetBathrooms - (apiData.bathrooms ?? 0))
    : 0;
  // Floor rehab at MIN_REHAB when coming from API (no manual override)
  const rehabFromApi = baseRehabCost + (bedroomsAdded * 20_000) + (bathroomsAdded * 15_000);
  const rehabCost = deal.overrides?.rehabCost != null ? rehabFromApi : Math.max(rehabFromApi, MIN_REHAB);

  const holdingMonths = loanDefaults?.holdingMonths ?? 4;
  const propertyTaxMonthly = (apiData.propertyTax ?? 0) / 12;
  const insuranceMonthly = getEffectiveMonthlyInsurance(apiData.insurance);
  const holdingCosts = (propertyTaxMonthly + insuranceMonthly + 300) * holdingMonths;
  const agentCommission = arv * 0.06;
  const notaryFees = 500;
  const flipClosingCosts = purchasePrice * 0.02;
  const totalInvestment = purchasePrice + rehabCost + flipClosingCosts + holdingCosts;
  const netProfit = arv - totalInvestment - agentCommission - notaryFees;
  const minProfit = getMinProfit(purchasePrice);

  return { netProfit, purchasePrice, arv, rehabCost, totalInvestment, minProfit, rehabWasFloored: rehabCost > rehabFromApi };
}

export default function PotentialMarketDealsPage() {
  const { deals, isLoading } = useDeals();
  const { settings } = useSettings();
  const loanDefaults = settings.loanDefaults;
  const [ageFilter, setAgeFilter] = useState<AgeFilterType>('month');

  const potentialDeals = useMemo(() => {
    return deals
      .filter(d => d.source === 'api' && d.status !== 'not_relevant' && d.status !== 'filtered_out')
      .map(deal => {
        const nums = calcFlipNumbers(deal, loanDefaults);
        if (!nums || nums.netProfit < nums.minProfit) return null;
        return { deal, ...nums };
      })
      .filter(Boolean)
      .filter(item => applyDealAgeFilter([item!.deal], ageFilter).length > 0)
      .sort((a, b) => b!.netProfit - a!.netProfit) as {
        deal: Deal;
        netProfit: number;
        purchasePrice: number;
        arv: number;
        rehabCost: number;
        totalInvestment: number;
        minProfit: number;
        rehabWasFloored: boolean;
      }[];
  }, [deals, loanDefaults, ageFilter]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in pb-24">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <BarChart2 className="w-7 h-7 text-violet-400" />
          <h1 className="text-2xl md:text-3xl font-bold">Potential Market Deals</h1>
        </div>
        <p className="text-muted-foreground">
          Market deals with cash flip profit above threshold · Rehab floored at $60K · ≤$250K→$40K · ≤$300K→$45K · $300K+→$50K
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <DealAgeFilter value={ageFilter} onChange={setAgeFilter} />
        <Badge variant="outline" className="text-violet-400 border-violet-400/40">
          Min Rehab: $60K
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          {potentialDeals.length} deal{potentialDeals.length !== 1 ? 's' : ''} found
        </Badge>
      </div>

      {potentialDeals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-1">No potential market deals yet</h3>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              Analyzed market deals meeting the tiered profit thresholds will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {potentialDeals.map(({ deal, netProfit, purchasePrice, arv, rehabCost, minProfit, rehabWasFloored }) => (
            <Link key={deal.id} to={`/deals/${deal.id}`}>
              <Card className="border-violet-500/20 hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-200">
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-500/20 text-violet-400">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Cash Flip Profit
                          <span className="ml-1 text-violet-400/60">(min {formatCurrency(minProfit)})</span>
                        </p>
                        <p className="text-base font-bold text-violet-400">
                          {formatCurrency(netProfit)}
                        </p>
                      </div>
                    </div>
                    <DealStatusBadge status={deal.status} />
                  </div>

                  {/* Address */}
                  <div>
                    <p className="font-semibold text-sm hover:text-violet-400 transition-colors truncate">
                      {deal.address.street}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {deal.address.city}, {deal.address.state} {deal.address.zip}
                    </p>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Price</p>
                      <p className="text-sm font-semibold">{formatCurrency(purchasePrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ARV</p>
                      <p className="text-sm font-semibold text-green-400">{formatCurrency(arv)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Rehab{rehabWasFloored && <span className="text-violet-400/70"> *</span>}
                      </p>
                      <p className="text-sm font-semibold text-yellow-400">{formatCurrency(rehabCost)}</p>
                    </div>
                  </div>

                  {/* Profit vs threshold */}
                  <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                    <span className="text-xs text-muted-foreground">Above threshold</span>
                    <span className="text-sm font-bold text-green-400">
                      +{formatCurrency(netProfit - minProfit)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
