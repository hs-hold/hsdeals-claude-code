import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { useSettings } from '@/context/SettingsContext';
import { formatCurrency, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DealStatusBadge } from '@/components/deals/DealStatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Flame, DollarSign, Inbox, Calendar, CalendarDays, Star } from 'lucide-react';
import { Deal } from '@/types/deal';

const MAX_PRICE = 300000;

function calculateFlipScore(deal: Deal, loanDefaults: any) {
  const financials = deal.financials;
  const apiData = deal.apiData;
  if (!financials || !apiData) return null;

  const purchasePrice = deal.overrides?.purchasePrice ?? apiData.purchasePrice ?? 0;
  if (purchasePrice > MAX_PRICE || purchasePrice <= 0) return null;

  const arv = deal.overrides?.arv ?? apiData.arv ?? 0;
  const rehabCost = deal.overrides?.rehabCost ?? apiData.rehabCost ?? 0;

  const flipClosingCosts = purchasePrice * 0.02;
  const holdingMonths = loanDefaults?.holdingMonths ?? 4;
  const propertyTaxMonthly = (apiData.propertyTax ?? 0) / 12;
  const insuranceMonthly = getEffectiveMonthlyInsurance(apiData.insurance);
  const utilitiesMonthly = 300;
  const holdingCostsMonthly = propertyTaxMonthly + insuranceMonthly + utilitiesMonthly;
  const totalHoldingCosts = holdingCostsMonthly * holdingMonths;
  const agentCommission = arv * 0.06;
  const notaryFees = 500;
  const totalInvestment = purchasePrice + rehabCost + flipClosingCosts + totalHoldingCosts;
  const netProfit = arv - totalInvestment - agentCommission - notaryFees;
  const flipRoi = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;

  let score = 0;
  if (flipRoi >= 25) score = 10;
  else if (flipRoi >= 20) score = 9;
  else if (flipRoi >= 18) score = 8;
  else if (flipRoi >= 16) score = 7;
  else if (flipRoi >= 15) score = 6;
  else if (flipRoi >= 13) score = 5;
  else if (flipRoi >= 11) score = 4;
  else if (flipRoi >= 9) score = 3;
  else if (flipRoi >= 8) score = 2;
  else score = 1;

  return { score, flipRoi, netProfit, purchasePrice, arv, rehabCost, totalInvestment };
}

type FilterType = 'all' | 'today' | 'week' | 'top';

const filterConfig: Record<FilterType, { label: string; icon: typeof Flame; description: string }> = {
  all: { label: 'All Hot Deals', icon: Flame, description: 'All deals under $300K with flip score 8/10+' },
  today: { label: 'Today', icon: Calendar, description: 'Hot deals from the last 24 hours' },
  week: { label: 'This Week', icon: CalendarDays, description: 'Hot deals from the last 7 days' },
  top: { label: 'Top Rated', icon: Star, description: 'Elite deals with flip score 9/10+' },
};

export default function HotDealsPage() {
  const { deals, isLoading } = useDeals();
  const { settings } = useSettings();
  const loanDefaults = settings.loanDefaults;
  const [searchParams, setSearchParams] = useSearchParams();
  
  const filter = (searchParams.get('filter') as FilterType) || 'all';

  const hotDeals = useMemo(() => {
    const activeDeals = deals.filter(d => d.status !== 'not_relevant');
    
    const minScore = filter === 'top' ? 9 : 8;
    
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return activeDeals
      .map(deal => {
        const result = calculateFlipScore(deal, loanDefaults);
        if (!result || result.score < minScore) return null;
        
        // Time filter
        if (filter === 'today') {
          const created = new Date(deal.createdAt);
          if (created < oneDayAgo) return null;
        } else if (filter === 'week') {
          const created = new Date(deal.createdAt);
          if (created < oneWeekAgo) return null;
        }
        
        return { deal, ...result };
      })
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score || b!.flipRoi - a!.flipRoi) as {
        deal: Deal;
        score: number;
        flipRoi: number;
        netProfit: number;
        purchasePrice: number;
        arv: number;
        rehabCost: number;
        totalInvestment: number;
      }[];
  }, [deals, loanDefaults, filter]);

  const handleFilterChange = (value: string) => {
    if (value === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ filter: value });
    }
  };

  const config = filterConfig[filter];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Flame className="w-7 h-7 text-orange-400" />
          <h1 className="text-2xl md:text-3xl font-bold">Hot Deals</h1>
        </div>
        <p className="text-muted-foreground">{config.description}</p>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={handleFilterChange}>
        <TabsList>
          <TabsTrigger value="all" className="gap-1.5">
            <Flame className="w-3.5 h-3.5" /> All
          </TabsTrigger>
          <TabsTrigger value="today" className="gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Today
          </TabsTrigger>
          <TabsTrigger value="week" className="gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> Week
          </TabsTrigger>
          <TabsTrigger value="top" className="gap-1.5">
            <Star className="w-3.5 h-3.5" /> Top (9+)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats */}
      <div className="flex gap-2">
        <Badge variant="outline" className="text-orange-400 border-orange-400/40">
          Min Score: {filter === 'top' ? '9/10' : '8/10'}
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          {hotDeals.length} deal{hotDeals.length !== 1 ? 's' : ''} found
        </Badge>
      </div>

      {/* Results */}
      {hotDeals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-1">
              No hot deals {filter !== 'all' ? `for "${config.label}"` : 'yet'}
            </h3>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              {filter === 'today' 
                ? 'No deals with score 8+ were added in the last 24 hours.'
                : filter === 'week'
                  ? 'No deals with score 8+ were added in the last 7 days.'
                  : filter === 'top'
                    ? 'No deals with score 9+ found. Try the "All" tab for 8+ deals.'
                    : 'Sync your email to import deals, then analyze them. Deals under $300K with flip ROI ≥ 18% will appear here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {hotDeals.map(({ deal, score, flipRoi, netProfit, purchasePrice, arv, rehabCost }) => (
            <Link key={deal.id} to={`/deals/${deal.id}`} className="group">
              <Card className="border-orange-500/20 hover:border-orange-500/50 transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/5">
                <CardContent className="p-4 space-y-3">
                  {/* Top row: score + status */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`
                        flex items-center justify-center w-10 h-10 rounded-lg font-bold text-lg
                        ${score === 10 
                          ? 'bg-green-500/20 text-green-400' 
                          : score === 9 
                            ? 'bg-orange-500/20 text-orange-400' 
                            : 'bg-yellow-500/20 text-yellow-400'}
                      `}>
                        {score}
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Flip Score</span>
                        <p className="text-xs font-semibold text-orange-400">{flipRoi.toFixed(1)}% ROI</p>
                      </div>
                    </div>
                    <DealStatusBadge status={deal.status} />
                  </div>

                  {/* Address */}
                  <div>
                    <p className="font-semibold text-sm group-hover:text-orange-400 transition-colors truncate">
                      {deal.address.street}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {deal.address.city}, {deal.address.state} {deal.address.zip}
                    </p>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Purchase</p>
                      <p className="text-sm font-semibold">{formatCurrency(purchasePrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ARV</p>
                      <p className="text-sm font-semibold text-green-400">{formatCurrency(arv)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Rehab</p>
                      <p className="text-sm font-semibold text-yellow-400">{formatCurrency(rehabCost)}</p>
                    </div>
                  </div>

                  {/* Net Profit */}
                  <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> Net Profit
                    </span>
                    <span className={`text-sm font-bold ${netProfit >= 50000 ? 'text-green-400' : netProfit >= 25000 ? 'text-orange-400' : 'text-yellow-400'}`}>
                      {formatCurrency(netProfit)}
                    </span>
                  </div>

                  {/* Source / Sender info */}
                  {deal.senderName && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      From: {deal.senderName}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
