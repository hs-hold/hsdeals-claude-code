import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { getUnanalyzedDeals } from '@/utils/dealHelpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { GmailConnect } from '@/components/gmail/GmailConnect';
import { Badge } from '@/components/ui/badge';
import { Plus, Zap, Loader2, Search, Inbox, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatIL as format } from '@/utils/dateFormat';
import { toast } from 'sonner';
import { DealStatusBadge } from '@/components/deals/DealStatusBadge';

type QueueStatus = 'queued' | 'analyzing' | 'done' | 'error';

interface QueueItem {
  dealId: string;
  status: QueueStatus;
  error?: string;
}

export default function NewDealsPage() {
  const { deals, analyzeDeal, refetch } = useDeals();
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const isProcessingRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);

  // Keep ref in sync
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const unanalyzedDeals = useMemo(() => {
    let result = getUnanalyzedDeals(deals);
    
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(d =>
        d.address.full.toLowerCase().includes(searchLower) ||
        d.address.zip.includes(search)
      );
    }
    
    return result.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [deals, search]);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    while (true) {
      const currentQueue = queueRef.current;
      const nextItem = currentQueue.find(item => item.status === 'queued');
      if (!nextItem) break;

      // Set to analyzing
      setQueue(prev => prev.map(item =>
        item.dealId === nextItem.dealId ? { ...item, status: 'analyzing' } : item
      ));

      try {
        await analyzeDeal(nextItem.dealId);
        setQueue(prev => prev.map(item =>
          item.dealId === nextItem.dealId ? { ...item, status: 'done' } : item
        ));
      } catch (err) {
        setQueue(prev => prev.map(item =>
          item.dealId === nextItem.dealId
            ? { ...item, status: 'error', error: err instanceof Error ? err.message : 'Failed' }
            : item
        ));
      }
    }

    isProcessingRef.current = false;
    
    // Check if any were completed
    const finalQueue = queueRef.current;
    const doneCount = finalQueue.filter(i => i.status === 'done').length;
    if (doneCount > 0) {
      toast.success(`Analyzed ${doneCount} deal${doneCount > 1 ? 's' : ''} successfully!`);
    }
  }, [analyzeDeal]);

  const handleAnalyze = useCallback((dealId: string) => {
    // Don't add if already in queue
    if (queueRef.current.some(item => item.dealId === dealId)) return;

    setQueue(prev => [...prev, { dealId, status: 'queued' }]);

    // Start processing if not already running
    // Use setTimeout to ensure state is updated before processing
    setTimeout(() => processQueue(), 0);
  }, [processQueue]);

  const getQueueStatus = (dealId: string): QueueItem | undefined => {
    return queue.find(item => item.dealId === dealId);
  };

  const queuedCount = queue.filter(i => i.status === 'queued').length;
  const analyzingCount = queue.filter(i => i.status === 'analyzing').length;
  const doneCount = queue.filter(i => i.status === 'done').length;
  const errorCount = queue.filter(i => i.status === 'error').length;
  const hasActiveQueue = queuedCount > 0 || analyzingCount > 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">New Deals</h1>
          <p className="text-muted-foreground">
            Deals awaiting analysis • Click Analyze to queue for processing
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Deal
        </Button>
      </div>

      {/* Queue Status Bar */}
      {queue.length > 0 && (
        <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-border">
          <span className="text-sm font-medium">Analysis Queue:</span>
          {analyzingCount > 0 && (
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              {analyzingCount} analyzing
            </Badge>
          )}
          {queuedCount > 0 && (
            <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">
              <Clock className="w-3 h-3 mr-1" />
              {queuedCount} queued
            </Badge>
          )}
          {doneCount > 0 && (
            <Badge variant="secondary" className="bg-green-500/20 text-green-400">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {doneCount} done
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge variant="secondary" className="bg-red-500/20 text-red-400">
              <XCircle className="w-3 h-3 mr-1" />
              {errorCount} failed
            </Badge>
          )}
          {!hasActiveQueue && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-xs h-7"
              onClick={() => setQueue([])}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Gmail Connect Card */}
      <GmailConnect onSyncComplete={refetch} />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by address or zip..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
         <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-[350px]">Address</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[120px]">Deal Type</TableHead>
              <TableHead className="w-[150px]">Source</TableHead>
              <TableHead className="w-[150px]">Created</TableHead>
              <TableHead className="w-[150px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {unanalyzedDeals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48">
                  <div className="flex flex-col items-center justify-center text-center">
                    <Inbox className="w-12 h-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground font-medium">No new deals awaiting analysis</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Import deals from email or add manually
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              unanalyzedDeals.map(deal => {
                const queueItem = getQueueStatus(deal.id);
                return (
                  <TableRow key={deal.id} className="group">
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
                      <DealStatusBadge status={deal.status} />
                    </TableCell>
                    <TableCell>
                      {deal.dealType ? (
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {deal.dealType}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {deal.source}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(deal.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {queueItem?.status === 'analyzing' ? (
                        <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Analyzing...
                        </Badge>
                      ) : queueItem?.status === 'queued' ? (
                        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">
                          <Clock className="w-3 h-3 mr-1" />
                          Queued
                        </Badge>
                      ) : queueItem?.status === 'done' ? (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Done
                        </Badge>
                      ) : queueItem?.status === 'error' ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="secondary" className="bg-red-500/20 text-red-400 w-fit">
                            <XCircle className="w-3 h-3 mr-1" />
                            Error
                          </Badge>
                          {queueItem.error && (
                            <span className="text-[10px] text-red-400/70 max-w-[140px] truncate block">
                              {queueItem.error}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleAnalyze(deal.id)}
                          className="h-8"
                        >
                          <Zap className="w-4 h-4 mr-1" />
                          Analyze
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
