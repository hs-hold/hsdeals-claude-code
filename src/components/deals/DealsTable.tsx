import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Deal, DealStatus } from '@/types/deal';
import { formatCurrency, formatPercent } from '@/utils/financialCalculations';
import { detectSuspiciousData } from '@/utils/suspiciousData';
import { DealStatusBadge } from './DealStatusBadge';
import { formatIL as format } from '@/utils/dateFormat';
import { useDeals } from '@/context/DealsContext';
import { toast } from 'sonner';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Filter, Zap, Loader2, Lock, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type SortField = 'address' | 'status' | 'arv' | 'acquisition' | 'equity' | 'cashflow' | 'yield' | 'capRate' | 'created';
type SortDirection = 'asc' | 'desc';

interface DealsTableProps {
  deals: Deal[];
  excludeStatuses?: DealStatus[];
  showCloseAction?: boolean;
  showAnalyzeButton?: boolean;
}

export function DealsTable({ deals, excludeStatuses = [], showCloseAction = true, showAnalyzeButton = true }: DealsTableProps) {
  const { analyzeDeal, updateDealStatus } = useDeals();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [markingNotRelevantId, setMarkingNotRelevantId] = useState<string | null>(null);
  const [closingDealId, setClosingDealId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DealStatus | 'all'>('all');
  const [lockedFilter, setLockedFilter] = useState<'all' | 'locked' | 'unlocked'>('all');
  const [minCashflow, setMinCashflow] = useState<string>('');
  const [minYield, setMinYield] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleAnalyze = async (dealId: string) => {
    setAnalyzingId(dealId);
    try {
      await analyzeDeal(dealId);
      toast.success('Deal analyzed successfully!');
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to analyze deal');
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleMarkNotRelevant = async (dealId: string) => {
    setMarkingNotRelevantId(dealId);
    try {
      updateDealStatus(dealId, 'not_relevant');
      toast.success('Deal marked as not relevant');
    } catch (error) {
      console.error('Error marking deal as not relevant:', error);
      toast.error('Failed to update deal');
    } finally {
      setMarkingNotRelevantId(null);
    }
  };

  const handleCloseDeal = async (dealId: string) => {
    setClosingDealId(dealId);
    try {
      updateDealStatus(dealId, 'closed');
      toast.success('Deal marked as closed!');
    } catch (error) {
      console.error('Error closing deal:', error);
      toast.error('Failed to close deal');
    } finally {
      setClosingDealId(null);
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = deals.filter(d => !excludeStatuses.includes(d.status));

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(d => 
        d.address.full.toLowerCase().includes(searchLower) ||
        d.address.zip.includes(search)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(d => d.status === statusFilter);
    }

    // Locked filter
    if (lockedFilter === 'locked') {
      result = result.filter(d => d.isLocked);
    } else if (lockedFilter === 'unlocked') {
      result = result.filter(d => !d.isLocked);
    }

    // Min cashflow filter
    if (minCashflow) {
      const min = parseFloat(minCashflow);
      if (!isNaN(min)) {
        result = result.filter(d => (d.financials?.monthlyCashflow ?? 0) >= min);
      }
    }

    // Min yield filter
    if (minYield) {
      const min = parseFloat(minYield) / 100;
      if (!isNaN(min)) {
        result = result.filter(d => (d.financials?.cashOnCashReturn ?? 0) >= min);
      }
    }

    // Sort
    result.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'address':
          aVal = a.address.street;
          bVal = b.address.street;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'arv':
          aVal = a.overrides.arv ?? a.apiData.arv ?? 0;
          bVal = b.overrides.arv ?? b.apiData.arv ?? 0;
          break;
        case 'acquisition':
          aVal = a.financials?.totalAcquisitionCost ?? 0;
          bVal = b.financials?.totalAcquisitionCost ?? 0;
          break;
        case 'equity':
          aVal = a.financials?.equityAtPurchase ?? 0;
          bVal = b.financials?.equityAtPurchase ?? 0;
          break;
        case 'cashflow':
          aVal = a.financials?.monthlyCashflow ?? 0;
          bVal = b.financials?.monthlyCashflow ?? 0;
          break;
        case 'yield':
          aVal = a.financials?.cashOnCashReturn ?? 0;
          bVal = b.financials?.cashOnCashReturn ?? 0;
          break;
        case 'capRate':
          aVal = a.financials?.capRate ?? 0;
          bVal = b.financials?.capRate ?? 0;
          break;
        case 'created':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }

      return sortDirection === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    });

    return result;
  }, [deals, search, statusFilter, lockedFilter, minCashflow, minYield, sortField, sortDirection, excludeStatuses]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 -ml-2 font-medium text-muted-foreground hover:text-foreground"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field ? (
        sortDirection === 'asc' ? (
          <ArrowUp className="ml-1 h-3 w-3" />
        ) : (
          <ArrowDown className="ml-1 h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
      )}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by address or zip..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={lockedFilter} onValueChange={(v) => setLockedFilter(v as 'all' | 'locked' | 'unlocked')}>
          <SelectTrigger className="w-[140px]">
            <Lock className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Lock Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Deals</SelectItem>
            <SelectItem value="locked">Locked Only</SelectItem>
            <SelectItem value="unlocked">Unlocked Only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DealStatus | 'all')}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="under_analysis">Under Analysis</SelectItem>
            <SelectItem value="qualified">Qualified</SelectItem>
            <SelectItem value="offer_sent">Offer Sent</SelectItem>
            <SelectItem value="under_contract">Under Contract</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="Min Cashflow $"
          value={minCashflow}
          onChange={e => setMinCashflow(e.target.value)}
          className="w-[140px]"
        />

        <Input
          type="number"
          placeholder="Min Yield %"
          value={minYield}
          onChange={e => setMinYield(e.target.value)}
          className="w-[120px]"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-[280px]">
                <SortHeader field="address">Address</SortHeader>
              </TableHead>
              <TableHead className="w-[120px]">
                <SortHeader field="status">Status</SortHeader>
              </TableHead>
              <TableHead className="text-right">
                <SortHeader field="arv">ARV</SortHeader>
              </TableHead>
              <TableHead className="text-right">
                <SortHeader field="acquisition">Acquisition</SortHeader>
              </TableHead>
              <TableHead className="text-right">
                <SortHeader field="equity">Equity</SortHeader>
              </TableHead>
              <TableHead className="text-right">
                <SortHeader field="cashflow">Cashflow/mo</SortHeader>
              </TableHead>
              <TableHead className="text-right">
                <SortHeader field="yield">CoC Return</SortHeader>
              </TableHead>
              <TableHead className="text-right">
                <SortHeader field="capRate">Cap Rate</SortHeader>
              </TableHead>
              <TableHead className="text-right">
                <SortHeader field="created">Created</SortHeader>
              </TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                  No deals found
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSorted.map(deal => {
                const cashflow = deal.financials?.monthlyCashflow ?? 0;
                const cocReturn = deal.financials?.cashOnCashReturn ?? 0;
                const equity = deal.financials?.equityAtPurchase ?? 0;
                
                // Check for suspicious data
                const suspiciousCheck = detectSuspiciousData(deal.apiData, deal.overrides);
                const hasSuspiciousArv = suspiciousCheck.fields.some(f => f.field === 'arv' || f.field === 'arvRatio');
                
                return (
                  <TableRow key={deal.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {deal.isLocked && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="w-3.5 h-3.5 text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>Deal is locked</TooltipContent>
                          </Tooltip>
                        )}
                        {suspiciousCheck.hasSuspiciousData && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertTriangle className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <div className="space-y-1">
                                <p className="font-semibold text-orange-400">Suspicious Data Detected</p>
                                {suspiciousCheck.fields.map((f, i) => (
                                  <p key={i} className="text-xs">{f.reason}</p>
                                ))}
                                <p className="text-xs text-muted-foreground mt-1">Click into deal to review and confirm</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Link 
                          to={`/deals/${deal.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {deal.address.street}
                        </Link>
                        {deal.apiData.grade && (
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-xs font-bold",
                            deal.apiData.grade === 'A' && "bg-emerald-500/20 text-emerald-400",
                            deal.apiData.grade === 'B' && "bg-cyan-500/20 text-cyan-400",
                            deal.apiData.grade === 'C' && "bg-yellow-500/20 text-yellow-400",
                            deal.apiData.grade === 'D' && "bg-orange-500/20 text-orange-400",
                            deal.apiData.grade === 'F' && "bg-red-500/20 text-red-400",
                          )}>
                            {deal.apiData.grade}
                          </span>
                        )}
                        {deal.financials.capRate > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                            {(deal.financials.capRate * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {deal.address.city}, {deal.address.state} {deal.address.zip}
                        {(deal.apiData.bedrooms || deal.apiData.bathrooms || deal.apiData.sqft) && (
                          <span className="ml-2 text-foreground/60">
                            {deal.apiData.bedrooms ?? '?'}/{deal.apiData.bathrooms ?? '?'}
                            {deal.apiData.sqft ? ` · ${deal.apiData.sqft.toLocaleString()} sqft` : ''}
                          </span>
                        )}
                      </p>
                    </TableCell>
                    <TableCell>
                      <DealStatusBadge status={deal.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={cn(hasSuspiciousArv && "text-orange-500 font-bold")}>
                        {formatCurrency(deal.overrides.arv ?? deal.apiData.arv ?? 0)}
                        {hasSuspiciousArv && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(deal.financials?.totalAcquisitionCost ?? 0)}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-medium",
                      equity > 0 ? "text-success" : "text-destructive"
                    )}>
                      {formatCurrency(equity)}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-medium",
                      cashflow > 0 ? "text-success" : "text-destructive"
                    )}>
                      {formatCurrency(cashflow)}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-semibold",
                      cocReturn >= 0.08 ? "text-success" : cocReturn > 0 ? "text-warning" : "text-destructive"
                    )}>
                      {formatPercent(cocReturn)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(deal.financials?.capRate ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {format(new Date(deal.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {showAnalyzeButton && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.preventDefault();
                              handleAnalyze(deal.id);
                            }}
                            disabled={analyzingId === deal.id}
                            className="h-8 px-3"
                          >
                            {analyzingId === deal.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Zap className="w-4 h-4 mr-1" />
                                Analyze
                              </>
                            )}
                          </Button>
                        )}
                        
                        {showCloseAction && deal.status !== 'closed' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 px-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-400 border border-emerald-500/20"
                                      disabled={closingDealId === deal.id}
                                    >
                                      {closingDealId === deal.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Close this Deal?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will mark "{deal.address.street}" as closed and move it to the Closed Deals page.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleCloseDeal(deal.id)}>
                                        Close Deal
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Mark as Closed ✓</TooltipContent>
                          </Tooltip>
                        )}
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 border border-red-500/20"
                                    disabled={markingNotRelevantId === deal.id}
                                  >
                                    {markingNotRelevantId === deal.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <X className="w-4 h-4" />
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Mark as Not Relevant?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will move "{deal.address.street}" to the Not Relevant page. You can restore it later if needed.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleMarkNotRelevant(deal.id)}>
                                      Confirm
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Mark as Not Relevant ✗</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filteredAndSorted.length} of {deals.filter(d => !excludeStatuses.includes(d.status)).length} deals
      </p>
    </div>
  );
}
