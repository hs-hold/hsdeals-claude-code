import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { useSettings } from '@/context/SettingsContext';
import { DealAgeFilter, AgeFilterType, applyDealAgeFilter } from '@/components/deals/DealAgeFilter';
import { formatCurrency, getEffectiveMonthlyInsurance, calculateFinancials } from '@/utils/financialCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DealStatusBadge } from '@/components/deals/DealStatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Flame, DollarSign, Inbox, Calendar, CalendarDays, Star, CheckSquare, Square, ChevronDown, X, Filter, Check } from 'lucide-react';
import { Deal, DealStatus, DEAL_STATUS_CONFIG } from '@/types/deal';

const MAX_PRICE = 300000;

function calculateFlipScore(deal: Deal, loanDefaults: any) {
  const financials = deal.financials;
  const apiData = deal.apiData;
  if (!financials || !apiData) return null;

  const purchasePrice = deal.overrides?.purchasePrice ?? apiData.purchasePrice ?? 0;
  if (purchasePrice > MAX_PRICE || purchasePrice <= 0) return null;

  // Recalculate live so ARV is comps-validated (same as DealDetailPage)
  const liveFinancials = calculateFinancials(apiData, deal.overrides ?? {}, loanDefaults);
  const arv = liveFinancials.arv;

  const baseRehabCost = deal.overrides?.rehabCost ?? apiData.rehabCost ?? 0;
  const bedroomsAdded = deal.overrides?.targetBedrooms != null
    ? Math.max(0, deal.overrides.targetBedrooms - (apiData.bedrooms ?? 0))
    : 0;
  const bathroomsAdded = deal.overrides?.targetBathrooms != null
    ? Math.max(0, deal.overrides.targetBathrooms - (apiData.bathrooms ?? 0))
    : 0;
  const layoutRehabCost = (bedroomsAdded * 20_000) + (bathroomsAdded * 15_000);
  const rehabFloor = deal.source === 'email' ? 80_000 : 60_000;
  // Only apply floor when value is from API; respect manual overrides as-is
  const rehabCost = deal.overrides?.rehabCost != null
    ? baseRehabCost + layoutRehabCost
    : Math.max(baseRehabCost + layoutRehabCost, rehabFloor);

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

// Statuses that can appear in Hot Deals (non-buyable are already filtered)
const FILTERABLE_STATUSES: DealStatus[] = ['new', 'under_analysis', 'qualified', 'offer_sent', 'under_contract'];

export default function HotDealsPage() {
  const { deals, isLoading, updateDealStatus } = useDeals();
  const { settings } = useSettings();
  const loanDefaults = settings.loanDefaults;
  const [searchParams, setSearchParams] = useSearchParams();
  const [ageFilter, setAgeFilter] = useState<AgeFilterType>('month');
  const [statusFilter, setStatusFilter] = useState<DealStatus | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filter = (searchParams.get('filter') as FilterType) || 'all';

  const hotDeals = useMemo(() => {
    const NON_BUYABLE = ['not_relevant', 'filtered_out', 'closed', 'under_contract', 'pending_other'];
    const activeDeals = deals.filter(d => !NON_BUYABLE.includes(d.status));

    const minScore = filter === 'top' ? 9 : 8;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return activeDeals
      .map(deal => {
        const result = calculateFlipScore(deal, loanDefaults);
        if (!result || result.score < minScore) return null;

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
      .sort((a, b) => b!.score - a!.score || b!.flipRoi - a!.flipRoi)
      .filter(item => {
        const filtered = applyDealAgeFilter([item!.deal], ageFilter);
        return filtered.length > 0;
      }) as {
        deal: Deal;
        score: number;
        flipRoi: number;
        netProfit: number;
        purchasePrice: number;
        arv: number;
        rehabCost: number;
        totalInvestment: number;
      }[];
  }, [deals, loanDefaults, filter, ageFilter]);

  // Statuses actually present in results
  const presentStatuses = useMemo(() => {
    const s = new Set(hotDeals.map(d => d.deal.status));
    return FILTERABLE_STATUSES.filter(st => s.has(st));
  }, [hotDeals]);

  // Apply status filter
  const filteredDeals = useMemo(() => {
    if (statusFilter === 'all') return hotDeals;
    return hotDeals.filter(d => d.deal.status === statusFilter);
  }, [hotDeals, statusFilter]);

  const handleFilterChange = (value: string) => {
    if (value === 'all') setSearchParams({});
    else setSearchParams({ filter: value });
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredDeals.map(d => d.deal.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkUpdateStatus = async (status: DealStatus) => {
    await Promise.all([...selectedIds].map(id => updateDealStatus(id, status)));
    clearSelection();
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
    <div className="p-4 md:p-6 space-y-6 animate-fade-in pb-24">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Flame className="w-7 h-7 text-orange-400" />
          <h1 className="text-2xl md:text-3xl font-bold">Hot Deals</h1>
        </div>
        <p className="text-muted-foreground">{config.description}</p>
      </div>

      {/* Filter Tabs + Age Filter */}
      <div className="flex flex-wrap items-center gap-3">
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
        <DealAgeFilter value={ageFilter} onChange={setAgeFilter} />
      </div>

      {/* Status Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Quick pills for New, Under Analysis & Offer Sent */}
        {(['new', 'under_analysis', 'offer_sent'] as DealStatus[]).map(st => {
          const count = hotDeals.filter(d => d.deal.status === st).length;
          if (count === 0) return null;
          const isActive = statusFilter === st;
          const activeColor =
            st === 'new' ? 'bg-primary/20 text-primary border-primary/50' :
            st === 'under_analysis' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
            'bg-purple-500/20 text-purple-400 border-purple-500/50';
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(isActive ? 'all' : st)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                isActive ? activeColor : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {DEAL_STATUS_CONFIG[st].label} {count}
            </button>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 h-8 text-sm">
              <Filter className="w-3.5 h-3.5" />
              {statusFilter === 'all' ? 'All Statuses' : DEAL_STATUS_CONFIG[statusFilter].label}
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => setStatusFilter('all')} className="gap-2">
              {statusFilter === 'all'
                ? <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                : <span className="w-3.5 shrink-0" />}
              All Statuses
            </DropdownMenuItem>
            {FILTERABLE_STATUSES.map(st => {
              const count = hotDeals.filter(d => d.deal.status === st).length;
              return (
                <DropdownMenuItem
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className="gap-2 justify-between"
                  disabled={count === 0}
                >
                  <div className="flex items-center gap-2">
                    {statusFilter === st
                      ? <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      : <span className="w-3.5 shrink-0" />}
                    {DEAL_STATUS_CONFIG[st].label}
                  </div>
                  {count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats + Select All */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-orange-400 border-orange-400/40">
          Min Score: {filter === 'top' ? '9/10' : '8/10'}
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          {filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''} found
        </Badge>
        {filteredDeals.length > 0 && (
          <button
            onClick={selectedIds.size === filteredDeals.length ? clearSelection : selectAll}
            className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {selectedIds.size === filteredDeals.length
              ? <CheckSquare className="w-3.5 h-3.5" />
              : <Square className="w-3.5 h-3.5" />}
            {selectedIds.size === filteredDeals.length ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      {/* Results */}
      {filteredDeals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-1">
              No hot deals {filter !== 'all' ? `for "${config.label}"` : statusFilter !== 'all' ? `with status "${DEAL_STATUS_CONFIG[statusFilter].label}"` : 'yet'}
            </h3>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              {filter === 'today'
                ? 'No deals with score 8+ were added in the last 24 hours.'
                : filter === 'week'
                  ? 'No deals with score 8+ were added in the last 7 days.'
                  : filter === 'top'
                    ? 'No deals with score 9+ found. Try the "All" tab for 8+ deals.'
                    : statusFilter !== 'all'
                      ? 'Try removing the status filter to see all hot deals.'
                      : 'Sync your email to import deals, then analyze them. Deals under $300K with flip ROI ≥ 18% will appear here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDeals.map(({ deal, score, flipRoi, netProfit, purchasePrice, arv, rehabCost }) => {
            const isSelected = selectedIds.has(deal.id);
            return (
              <div key={deal.id} className="relative group">
                {/* Checkbox overlay */}
                <button
                  onClick={(e) => toggleSelect(deal.id, e)}
                  className={`absolute top-3 left-3 z-10 transition-opacity ${
                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title={isSelected ? 'Deselect' : 'Select'}
                >
                  {isSelected
                    ? <CheckSquare className="w-4 h-4 text-primary drop-shadow" />
                    : <Square className="w-4 h-4 text-muted-foreground drop-shadow" />}
                </button>

                <Link to={`/deals/${deal.id}`}>
                  <Card className={`transition-all duration-200 hover:shadow-lg ${
                    isSelected
                      ? 'border-primary/60 bg-primary/5 shadow-primary/10'
                      : 'border-orange-500/20 hover:border-orange-500/50 hover:shadow-orange-500/5'
                  }`}>
                    <CardContent className="p-4 space-y-3">
                      {/* Top row: score + status */}
                      <div className="flex items-start justify-between pl-5">
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

                      {/* Source */}
                      {deal.senderName && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          From: {deal.senderName}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border rounded-2xl shadow-2xl px-4 py-3 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            {selectedIds.size} selected
          </span>
          <div className="w-px h-5 bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 h-8">
                Change Status <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top">
              {(Object.entries(DEAL_STATUS_CONFIG) as [DealStatus, { label: string; color: string }][]).map(([st, cfg]) => (
                <DropdownMenuItem key={st} onClick={() => bulkUpdateStatus(st)}>
                  <span className={`w-2 h-2 rounded-full mr-2 ${cfg.color.split(' ')[0]}`} />
                  {cfg.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={clearSelection}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
