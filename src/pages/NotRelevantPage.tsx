import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { isDealAnalyzed } from '@/utils/dealHelpers';
import { formatCurrency, formatPercent } from '@/utils/financialCalculations';
import { toast } from 'sonner';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RotateCcw, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DealAgeFilter, AgeFilterType, applyDealAgeFilter } from '@/components/deals/DealAgeFilter';
import { formatIL as format } from '@/utils/dateFormat';

export default function NotRelevantPage() {
  const { deals, updateDealStatus } = useDeals();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<AgeFilterType>('month');

  const notRelevantDeals = useMemo(() => {
    const base = deals.filter(d => d.status === 'not_relevant');
    return applyDealAgeFilter(base, ageFilter);
  }, [deals, ageFilter]);

  const handleRestore = async (id: string) => {
    const deal = deals.find(d => d.id === id);
    if (!deal) return;
    
    setRestoringId(id);
    try {
      // Restore to 'under_analysis' if already analyzed, otherwise 'new'
      const targetStatus = isDealAnalyzed(deal) ? 'under_analysis' : 'new';
      updateDealStatus(id, targetStatus);
      toast.success(isDealAnalyzed(deal) 
        ? 'Deal restored to Analyzed' 
        : 'Deal restored to New Deals'
      );
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Not Relevant Deals</h1>
          <p className="text-muted-foreground">
            Deals that have been marked as not suitable for investment
          </p>
        </div>
        <DealAgeFilter value={ageFilter} onChange={setAgeFilter} className="mt-1" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-[280px]">Address</TableHead>
              <TableHead>Rejection Reason</TableHead>
              <TableHead className="text-right">ARV</TableHead>
              <TableHead className="text-right">Cashflow</TableHead>
              <TableHead className="text-right">CoC Return</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notRelevantDeals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No rejected deals
                </TableCell>
              </TableRow>
            ) : (
              notRelevantDeals.map(deal => (
                <TableRow key={deal.id}>
                  <TableCell>
                    <Link 
                      to={`/deals/${deal.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {deal.address.street}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {deal.address.city}, {deal.address.state} {deal.address.zip}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-muted-foreground">
                      {deal.rejectionReason || 'No reason specified'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(deal.overrides.arv ?? deal.apiData?.arv ?? 0)}
                  </TableCell>
                  <TableCell className="text-right text-destructive">
                    {formatCurrency(deal.financials?.monthlyCashflow ?? 0)}/mo
                  </TableCell>
                  <TableCell className="text-right text-destructive">
                    {formatPercent(deal.financials?.cashOnCashReturn ?? 0)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground space-y-0.5">
                    <div>Created: {format(new Date(deal.createdAt), 'MMM d, yy')}</div>
                    {deal.analyzedAt && format(new Date(deal.analyzedAt), 'MMM d') !== format(new Date(deal.createdAt), 'MMM d') && (
                      <div className="text-primary/70">Analyzed: {format(new Date(deal.analyzedAt), 'MMM d, yy')}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(deal.id)}
                          disabled={restoringId === deal.id}
                        >
                          {restoringId === deal.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Restore to pipeline</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        {notRelevantDeals.length} rejected deal{notRelevantDeals.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
