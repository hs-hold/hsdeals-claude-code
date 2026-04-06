import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { analyzeAndCreateDeal } from '@/services/deals/analyzeAndCreateDeal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  ScanLine, Zap, CheckCircle2, XCircle, Loader2,
  ExternalLink, Clock, AlertTriangle, SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PassedListing {
  zpid: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  price: number;
  zestimate: number | null;
  rentZestimate: number | null;
  daysOnZillow: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  propertyType: string | null;
  imgSrc: string | null;
  detailUrl: string | null;
  margin: number;
  grossYield: number;
  dealScore: number;
}

// 'skipped' = already exists in deals table, won't re-analyze
type QueueStatus = 'pending' | 'analyzing' | 'done' | 'skipped' | 'error';

interface QueueItem {
  listing: PassedListing;
  status: QueueStatus;
  dealId: string | null;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number) { return '$' + n.toLocaleString(); }
function fmtPct(n: number) { return (n * 100).toFixed(1) + '%'; }

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
    score >= 50 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                  'bg-muted/40 text-muted-foreground border-border/30';
  return (
    <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded border', color)}>
      {score}
    </span>
  );
}

// Check if a deal with this address already exists in the DB.
// Returns the existing deal id, or null if not found.
async function findExistingDeal(streetAddress: string): Promise<string | null> {
  // Strip any unit info and use just the main street address for matching
  const normalized = streetAddress.trim().replace(/\s+/g, ' ');
  const { data, error } = await supabase
    .from('deals')
    .select('id')
    .ilike('address_full', `%${normalized}%`)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DealScannerQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [noData, setNoData] = useState(false);
  const startedRef = useRef(false);

  // Load listings from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('deal_scanner_queue');
      if (!raw) { setNoData(true); return; }
      const listings: PassedListing[] = JSON.parse(raw);
      if (!listings.length) { setNoData(true); return; }
      setItems(listings.map(l => ({ listing: l, status: 'pending', dealId: null })));
    } catch {
      setNoData(true);
    }
  }, []);

  // Auto-start when items are ready (only once)
  useEffect(() => {
    if (items.length > 0 && !startedRef.current) {
      startedRef.current = true;
      setStarted(true);
      runQueue(items);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const updateItem = useCallback((index: number, update: Partial<QueueItem>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...update } : item));
  }, []);

  const runQueue = async (initialItems: QueueItem[]) => {
    setIsRunning(true);

    for (let i = 0; i < initialItems.length; i++) {
      const listing = initialItems[i].listing;
      const fullAddress = [listing.address, listing.city, listing.state, listing.zipcode]
        .filter(Boolean).join(', ');

      updateItem(i, { status: 'analyzing' });

      try {
        // ── Step 1: check for existing deal (skip duplicates) ──────────────
        const existingId = await findExistingDeal(listing.address);
        if (existingId) {
          updateItem(i, { status: 'skipped', dealId: existingId });
          continue;
        }

        // ── Step 2: send to DealBeast (analyze-property) ───────────────────
        const { dealId, error } = await analyzeAndCreateDeal(fullAddress);

        if (dealId) {
          // Tag as deal-scanner so it's distinguishable in the main deals list
          await supabase
            .from('deals')
            .update({ source: 'deal-scanner' })
            .eq('id', dealId);

          updateItem(i, { status: 'done', dealId });
        } else {
          updateItem(i, { status: 'error', error: error || 'DealBeast analysis failed' });
        }
      } catch (e: any) {
        updateItem(i, { status: 'error', error: e?.message || 'Unknown error' });
      }
    }

    setIsRunning(false);
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const total    = items.length;
  const done     = items.filter(i => i.status === 'done').length;
  const skipped  = items.filter(i => i.status === 'skipped').length;
  const errors   = items.filter(i => i.status === 'error').length;
  const pending  = items.filter(i => i.status === 'pending').length;
  const processed = done + skipped + errors;
  const progress = total > 0 ? (processed / total) * 100 : 0;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (noData || (!started && items.length === 0)) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 text-center bg-background p-8">
        <AlertTriangle className="w-12 h-12 text-amber-400/50" />
        <h2 className="text-lg font-semibold">No Queue Data Found</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Go to Deal Scanner, run a scan, then click <strong>Send to DealBeast</strong> to open this page with data.
        </p>
        <Button variant="outline" size="sm" onClick={() => window.close()}>
          Close Tab
        </Button>
      </div>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-5 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-sm">DealBeast Analysis Queue</span>
          <Badge className="bg-violet-500/15 text-violet-400 border-violet-400/30 text-[10px]">
            {total} deals
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {isRunning && (
            <span className="flex items-center gap-1.5 text-violet-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              Sending to DealBeast…
            </span>
          )}
          {!isRunning && started && (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Complete
            </span>
          )}
          <span className="text-emerald-400 font-medium">{done} new</span>
          {skipped > 0 && (
            <span className="text-muted-foreground flex items-center gap-1">
              <SkipForward className="w-3 h-3" />{skipped} skipped
            </span>
          )}
          {errors > 0 && <span className="text-red-400">{errors} errors</span>}
          {pending > 0 && <span className="text-muted-foreground">{pending} pending</span>}
        </div>
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-5 py-2 bg-card/30 border-b border-border/30">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>{processed} / {total} processed</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-1.5 [&>div]:bg-violet-500" />
      </div>

      {/* ── Queue table ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card/90 backdrop-blur-sm border-b border-border/50 z-10">
            <tr className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              <th className="text-center px-3 py-2.5 w-10">#</th>
              <th className="text-center px-3 py-2.5 w-14">Score</th>
              <th className="text-left px-4 py-2.5">Address</th>
              <th className="text-right px-3 py-2.5">Price</th>
              <th className="text-right px-3 py-2.5">Margin</th>
              <th className="text-right px-3 py-2.5">Yield</th>
              <th className="text-right px-3 py-2.5">Days</th>
              <th className="text-center px-4 py-2.5 w-40">Status</th>
              <th className="text-center px-3 py-2.5 w-28">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {items.map((item, idx) => {
              const { listing: r, status, dealId, error } = item;
              return (
                <tr key={r.zpid || idx}
                  className={cn(
                    'hover:bg-muted/20 transition-colors',
                    status === 'analyzing' && 'bg-violet-950/20',
                    status === 'done'      && 'bg-emerald-950/10',
                    status === 'skipped'   && 'bg-muted/10 opacity-60',
                    status === 'error'     && 'bg-red-950/10',
                  )}>

                  {/* Rank */}
                  <td className="px-3 py-3 text-center text-xs text-muted-foreground/60 font-mono">
                    {idx + 1}
                  </td>

                  {/* Score */}
                  <td className="px-3 py-3 text-center">
                    <ScoreBadge score={r.dealScore} />
                  </td>

                  {/* Address */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground leading-tight">{r.address}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.city}, {r.state} {r.zipcode}
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-3 py-3 text-right font-mono text-sm font-semibold">
                    {fmt$(r.price)}
                  </td>

                  {/* Margin */}
                  <td className="px-3 py-3 text-right">
                    <span className={cn(
                      'text-xs font-semibold px-1.5 py-0.5 rounded',
                      r.margin >= 0.20 ? 'bg-emerald-500/15 text-emerald-400' :
                      r.margin >= 0.10 ? 'bg-amber-500/15 text-amber-400' :
                      'bg-muted/40 text-muted-foreground'
                    )}>
                      {fmtPct(r.margin)}
                    </span>
                  </td>

                  {/* Gross yield */}
                  <td className="px-3 py-3 text-right">
                    <span className={cn(
                      'text-xs font-semibold',
                      r.grossYield >= 0.09 ? 'text-emerald-400' :
                      r.grossYield >= 0.07 ? 'text-amber-400' :
                      'text-muted-foreground'
                    )}>
                      {fmtPct(r.grossYield)}
                    </span>
                  </td>

                  {/* Days */}
                  <td className="px-3 py-3 text-right">
                    <span className={cn(
                      'text-xs',
                      (r.daysOnZillow ?? 0) > 90 ? 'text-emerald-400 font-semibold' :
                      (r.daysOnZillow ?? 0) > 60 ? 'text-amber-400' :
                      'text-muted-foreground'
                    )}>
                      {r.daysOnZillow ?? '?'}d
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    {status === 'pending' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    )}
                    {status === 'analyzing' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-violet-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <Zap className="w-3 h-3 animate-pulse" />
                        Analyzing…
                      </span>
                    )}
                    {status === 'done' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> Saved to Deals
                      </span>
                    )}
                    {status === 'skipped' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
                        <SkipForward className="w-3 h-3" /> Already Analyzed
                      </span>
                    )}
                    {status === 'error' && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-red-400"
                        title={error}
                      >
                        <XCircle className="w-3 h-3" /> Failed
                      </span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-3 py-3 text-center">
                    {(status === 'done' || status === 'skipped') && dealId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          'h-6 px-2 text-[11px] gap-1',
                          status === 'done'
                            ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
                            : 'border-border/50 text-muted-foreground hover:bg-muted/20'
                        )}
                        onClick={() => window.open(`/deals/${dealId}`, '_blank')}
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Deal
                      </Button>
                    ) : r.detailUrl ? (
                      <a
                        href={r.detailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Zillow
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      {!isRunning && started && (
        <div className="shrink-0 px-5 py-3 border-t border-border/50 bg-card/40 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {done > 0 && (
              <span className="text-emerald-400 font-medium mr-2">
                {done} new deal{done !== 1 ? 's' : ''} added to Analyzed Deals
              </span>
            )}
            {skipped > 0 && <span>{skipped} already existed · </span>}
            {errors > 0 && <span className="text-red-400">{errors} failed</span>}
          </span>
          <div className="flex items-center gap-2">
            {done > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => window.open('/deals', '_blank')}
              >
                <ExternalLink className="w-3 h-3" />
                Open Analyzed Deals
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => window.close()}>
              Close Tab
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
