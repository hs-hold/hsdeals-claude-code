import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DealAgeFilter, AgeFilterType, applyDealAgeFilter } from './DealAgeFilter';
import { Deal, DealStatus, DEAL_STATUS_CONFIG } from '@/types/deal';
import { formatCurrency, formatPercent } from '@/utils/financialCalculations';
import { useDeals } from '@/context/DealsContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Building2, TrendingUp, DollarSign } from 'lucide-react';

const PIPELINE_STATUSES: DealStatus[] = [
  'new',
  'under_analysis',
  'qualified',
  'offer_sent',
  'under_contract',
  'closed',
];

interface KanbanCardProps {
  deal: Deal;
}

function KanbanCard({ deal }: KanbanCardProps) {
  const cashflow = deal.financials?.monthlyCashflow ?? 0;
  const cocReturn = deal.financials?.cashOnCashReturn ?? 0;
  
  return (
    <Link to={`/deals/${deal.id}`}>
      <Card className="p-3 hover:border-primary/50 transition-all cursor-pointer group">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                  {deal.address.street}
                </p>
                {deal.apiData?.grade && (
                  <span className={cn(
                    "px-1 py-0.5 rounded text-[10px] font-bold shrink-0",
                    deal.apiData.grade === 'A' && "bg-emerald-500/20 text-emerald-400",
                    deal.apiData.grade === 'B' && "bg-cyan-500/20 text-cyan-400",
                    deal.apiData.grade === 'C' && "bg-yellow-500/20 text-yellow-400",
                    deal.apiData.grade === 'D' && "bg-orange-500/20 text-orange-400",
                    deal.apiData.grade === 'F' && "bg-red-500/20 text-red-400",
                  )}>
                    {deal.apiData.grade}
                  </span>
                )}
                {deal.financials?.capRate > 0 && (
                  <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground shrink-0">
                    {((deal.financials?.capRate ?? 0) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{deal.address.zip}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              <span className={cn(
                "font-medium",
                cashflow > 0 ? "text-success" : "text-destructive"
              )}>
                {formatCurrency(cashflow)}/mo
              </span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
              <span className={cn(
                "font-medium",
                cocReturn >= 0.08 ? "text-success" : "text-muted-foreground"
              )}>
                {formatPercent(cocReturn)}
              </span>
            </div>
          </div>
          
          {deal.apiData?.bedrooms && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="w-3 h-3" />
              <span>{deal.apiData.bedrooms}bd / {deal.apiData.bathrooms}ba</span>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}

interface KanbanColumnProps {
  status: DealStatus;
  deals: Deal[];
}

function KanbanColumn({ status, deals }: KanbanColumnProps) {
  const config = DEAL_STATUS_CONFIG[status];
  
  return (
    <div className="flex-1 min-w-[280px] max-w-[320px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Badge variant="outline" className={cn("font-medium", config.color)}>
          {config.label}
        </Badge>
        <span className="text-sm text-muted-foreground">({deals.length})</span>
      </div>
      
      <div className="space-y-2 p-2 rounded-xl bg-muted/30 min-h-[400px]">
        {deals.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No deals
          </p>
        ) : (
          deals.map(deal => (
            <KanbanCard key={deal.id} deal={deal} />
          ))
        )}
      </div>
    </div>
  );
}

export function KanbanBoard() {
  const { deals } = useDeals();
  const [ageFilter, setAgeFilter] = useState<AgeFilterType>('month');

  const dealsByStatus = useMemo(() => {
    const grouped: Record<DealStatus, Deal[]> = {
      new: [],
      under_analysis: [],
      qualified: [],
      offer_sent: [],
      under_contract: [],
      closed: [],
      not_relevant: [],
      filtered_out: [],
    };

    const filtered = applyDealAgeFilter(deals, ageFilter);

    filtered.forEach(deal => {
      grouped[deal.status].push(deal);
    });

    // Sort each column by profitability
    Object.keys(grouped).forEach(status => {
      grouped[status as DealStatus].sort((a, b) =>
        (b.financials?.cashOnCashReturn ?? 0) - (a.financials?.cashOnCashReturn ?? 0)
      );
    });

    return grouped;
  }, [deals, ageFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <DealAgeFilter value={ageFilter} onChange={setAgeFilter} />
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STATUSES.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            deals={dealsByStatus[status]}
          />
        ))}
      </div>
    </div>
  );
}
