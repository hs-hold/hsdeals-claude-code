import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { updateResultStatus } from '@/hooks/useScoutSearches';
import { DealAgeFilter, AgeFilterType, applyScoutAgeFilter } from '@/components/deals/DealAgeFilter';
import { cn } from '@/lib/utils';
import {
  XCircle, AlertTriangle, TrendingUp, Home, Repeat2, RefreshCw, RotateCcw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AiAnalysis {
  propertyTypeDetected?: string;
  isHabitableStructure?: boolean;
  arvAnalysis?: { recommendedARV?: number };
  rehabAnalysis?: { estimatedCost?: number; condition?: string };
  rentAnalysis?: { estimatedRent?: number };
  strategyRecommendation?: { best?: string; flipProfit?: number; rentalCashflow?: number; brrrrMoneyLeft?: number };
  redFlags?: string[];
  positives?: string[];
  overallVerdict?: string;
  confidenceScore?: number;
  propertyStatus?: string;
}

interface ScoutResult {
  id?: string;
  zpid: string;
  address: string;
  price: number;
  arv: number | null;
  arv_override?: number | null;
  rehab: number;
  rehab_override?: number | null;
  rent: number;
  rent_override?: number | null;
  beds: number;
  baths: number;
  sqft: number;
  days_on_market: number;
  score: number;
  grade: string;
  cap_rate: number | null;
  detail_url: string;
  img_src: string;
  status?: string;
  notes?: string | null;
  is_starred?: boolean;
  zip?: string;
}

interface AiDeal {
  aiId: string;
  scoutResultId: string;
  zpid: string;
  analysis: AiAnalysis;
  costUsd: number | null;
  analyzedAt: string;
  deal: ScoutResult;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fc(n: number | null | undefined) {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}

function strategyColor(best?: string) {
  if (best === 'flip')   return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
  if (best === 'rental') return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
  if (best === 'brrrr')  return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
  return 'text-muted-foreground bg-muted/20 border-border/30';
}

function confidenceColor(score?: number) {
  if (!score) return 'text-muted-foreground';
  if (score >= 7) return 'text-emerald-400';
  if (score >= 5) return 'text-yellow-400';
  return 'text-red-400';
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function NotRelevantCard({ item, onRestore }: { item: AiDeal; onRestore: () => void }) {
  const a    = item.analysis;
  const deal = item.deal;
  const best = a.strategyRecommendation?.best;

  return (
    <Card className="border border-border/20 bg-card/40 opacity-70 hover:opacity-90 transition-all">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded border',
                deal.grade === 'A' ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                : deal.grade === 'B' ? 'text-blue-400 border-blue-500/40 bg-blue-500/10'
                : deal.grade === 'C' ? 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10'
                : 'text-muted-foreground border-border/40 bg-muted/20')}>
                {deal.grade}
              </span>
              {best && best !== 'none' && (
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide', strategyColor(best))}>
                  {best === 'flip' ? '🔥' : best === 'rental' ? '🏠' : '🔄'} {best}
                </span>
              )}
              {a.confidenceScore && (
                <span className={cn('text-xs font-bold', confidenceColor(a.confidenceScore))}>
                  {a.confidenceScore}/10
                </span>
              )}
            </div>
            <p className="text-sm font-semibold mt-1 truncate">{deal.address}</p>
            <p className="text-[11px] text-muted-foreground">
              {deal.zip && <span className="mr-2 text-purple-400">{deal.zip}</span>}
              {deal.beds}bd · {deal.baths}ba · {deal.sqft?.toLocaleString()} sqft
            </p>
          </div>
          <button
            onClick={onRestore}
            title="Restore deal"
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors shrink-0">
            <RotateCcw className="w-3 h-3" /> Restore
          </button>
        </div>

        {/* Verdict */}
        {a.overallVerdict && (
          <p className="text-xs text-muted-foreground italic border-l-2 border-border/30 pl-2 line-clamp-2">
            "{a.overallVerdict}"
          </p>
        )}

        {/* Key numbers */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Ask</p>
            <p className="text-xs font-semibold">{fc(deal.price)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">AI ARV</p>
            <p className={cn('text-xs font-semibold',
              (a.arvAnalysis?.recommendedARV ?? 0) > (deal.price ?? 0) ? 'text-emerald-400' : 'text-red-400')}>
              {fc(a.arvAnalysis?.recommendedARV)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Rehab</p>
            <p className="text-xs font-semibold text-orange-400">{fc(a.rehabAnalysis?.estimatedCost)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Rent</p>
            <p className="text-xs font-semibold text-cyan-400">
              {a.rentAnalysis?.estimatedRent ? `${fc(a.rentAnalysis.estimatedRent)}/mo` : '—'}
            </p>
          </div>
        </div>

        {/* Strategy returns */}
        {a.strategyRecommendation && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/20">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-orange-400 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Flip</p>
                <p className={cn('text-xs font-semibold', (a.strategyRecommendation.flipProfit ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {fc(a.strategyRecommendation.flipProfit)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Home className="w-3 h-3 text-cyan-400 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">CF/mo</p>
                <p className={cn('text-xs font-semibold', (a.strategyRecommendation.rentalCashflow ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {fc(a.strategyRecommendation.rentalCashflow)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Repeat2 className="w-3 h-3 text-purple-400 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">In Deal</p>
                <p className={cn('text-xs font-semibold', (a.strategyRecommendation.brrrrMoneyLeft ?? 999999) <= 30000 ? 'text-emerald-400' : 'text-muted-foreground')}>
                  {fc(a.strategyRecommendation.brrrrMoneyLeft)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Flags */}
        <div className="flex items-center gap-2 flex-wrap">
          {(a.redFlags?.length ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-400">
              <AlertTriangle className="w-3 h-3" /> {a.redFlags!.length} {a.redFlags!.length === 1 ? 'risk' : 'risks'}
            </span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground/50">
            {new Date(item.analyzedAt).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ScoutNotRelevantPage() {
  const [items,     setItems]     = useState<AiDeal[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<AgeFilterType>('month');

  const visibleItems = useMemo(() => applyScoutAgeFilter(items, ageFilter), [items, ageFilter]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase
        .from('scout_ai_analyses')
        .select(`
          id, scout_result_id, zpid, analysis, cost_usd, created_at,
          scout_results!inner (
            id, zpid, address, price, arv, arv_override, rehab, rehab_override,
            rent, rent_override, beds, baths, sqft, days_on_market,
            score, grade, cap_rate, detail_url, img_src, status, notes, is_starred,
            search_id,
            scout_searches!inner ( zip )
          )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const mapped: AiDeal[] = ((data || []) as any[])
        .filter((row: any) => row.scout_results?.status === 'skip')
        .map((row: any) => ({
          aiId: row.id,
          scoutResultId: row.scout_result_id,
          zpid: row.zpid,
          analysis: row.analysis as AiAnalysis,
          costUsd: row.cost_usd,
          analyzedAt: row.created_at,
          deal: { ...row.scout_results, zip: row.scout_results.scout_searches?.zip },
        }));

      setItems(mapped);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function restoreDeal(item: AiDeal) {
    if (!item.deal.id) return;
    setItems(prev => prev.filter(i => i.aiId !== item.aiId));
    await updateResultStatus(item.deal.id, 'new');
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-3 border-b border-border/40 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-zinc-400" />
            <h1 className="text-lg font-bold">Not Relevant</h1>
            {!loading && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
                {visibleItems.length}{visibleItems.length !== items.length ? `/${items.length}` : ''} deals
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DealAgeFilter value={ageFilter} onChange={setAgeFilter} />
            <button onClick={load} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/60">
          These deals won't be re-analyzed if you run AI analysis again
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64" />)}
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-red-400">
            <AlertTriangle className="w-8 h-8" />
            <p className="text-sm">{error}</p>
            <button onClick={load} className="text-xs px-3 py-1.5 rounded border border-red-500/30 hover:bg-red-500/10">Retry</button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-60 gap-4 text-center">
            <XCircle className="w-10 h-10 text-zinc-400/30" />
            <div>
              <p className="font-semibold text-muted-foreground">No deals marked as not relevant</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Deals you skip in AI Analyzed will appear here</p>
            </div>
          </div>
        )}
        {!loading && !error && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleItems.map(item => (
              <NotRelevantCard key={item.aiId} item={item} onRestore={() => restoreDeal(item)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
