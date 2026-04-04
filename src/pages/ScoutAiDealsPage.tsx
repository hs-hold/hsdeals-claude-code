import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import ScoutDealDetail from './ScoutDealDetail';
import { ScoutResult, DealStatus, updateResultStatus, updateResultOverrides, toggleStarred } from '@/hooks/useScoutSearches';
import { DealAgeFilter, AgeFilterType, applyScoutAgeFilter } from '@/components/deals/DealAgeFilter';
import { cn } from '@/lib/utils';
import {
  Sparkles, TrendingUp, Repeat2, Home, DollarSign,
  AlertTriangle, ThumbsUp, ChevronRight, RefreshCw,
  Zap, ExternalLink, SkipForward, Check, Loader2, X, Star,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AiAnalysis {
  propertyTypeDetected?:   string;
  isHabitableStructure?:   boolean;
  arvAnalysis?:            { recommendedARV?: number; confidence?: string; reasoning?: string; arvVsAlgorithm?: string; pricePerSqft?: number; compsSummary?: string };
  rehabAnalysis?:          { estimatedCost?: number; condition?: string; reasoning?: string; rehabVsAlgorithm?: string; scopeDetails?: string };
  rentAnalysis?:           { estimatedRent?: number; confidence?: string; reasoning?: string; section8Potential?: boolean; section8Rate?: number };
  strategyRecommendation?: { best?: string; reasoning?: string; flipProfit?: number; flipROI?: number; rentalCashflow?: number; rentalCapRate?: number; brrrrMoneyLeft?: number; brrrrCashflow?: number };
  marketContext?:          string;
  neighborhoodNotes?:      string;
  exitRisks?:              string;
  redFlags?:               string[];
  positives?:              string[];
  overallVerdict?:         string;
  confidenceScore?:        number;
  propertyStatus?:         string;
  propertyStatusDetail?:   string;
  listingDescription?:     string;
  soldCompsData?:          any[];
  activeCompsData?:        any[];
}

interface AiDeal {
  aiId:          string;
  scoutResultId: string;
  zpid:          string;
  analysis:      AiAnalysis;
  compsUsed:     number;
  tokensUsed:    number;
  costUsd:       number | null;
  model:         string | null;
  analyzedAt:    string;
  deal:          ScoutResult;
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

function conditionBadge(cond?: string) {
  const map: Record<string, string> = {
    light:     'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    medium:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    heavy:     'bg-orange-500/10 text-orange-400 border-orange-500/30',
    gut:       'bg-red-500/10 text-red-400 border-red-500/30',
    land_only: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  };
  return map[cond || ''] || 'bg-muted/20 text-muted-foreground border-border/30';
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function AiDealCard({
  item, onOpen, onSkip, onReanalyze, reanalyzing, onStar,
}: {
  item: AiDeal;
  onOpen: () => void;
  onSkip: () => void;
  onReanalyze: () => void;
  reanalyzing: boolean;
  onStar: () => void;
}) {
  const a    = item.analysis;
  const deal = item.deal;
  const best = a.strategyRecommendation?.best;
  const isSkipped = deal.status === 'skip';

  const isLandOrBad = a.propertyTypeDetected === 'land' ||
    a.propertyTypeDetected === 'teardown' ||
    a.propertyTypeDetected === 'fire_damaged' ||
    a.isHabitableStructure === false;

  return (
    <Card className={cn(
      'border cursor-pointer transition-all group relative',
      isSkipped ? 'opacity-50 border-border/20' : 'hover:border-violet-500/40 hover:bg-violet-500/5 border-border/40 bg-card/60',
      isLandOrBad && !isSkipped && 'border-red-500/30 bg-red-500/5',
    )}>
      <CardContent className="p-4 space-y-3">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1" onClick={onOpen}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded border',
                deal.grade === 'A' ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                : deal.grade === 'B' ? 'text-blue-400 border-blue-500/40 bg-blue-500/10'
                : deal.grade === 'C' ? 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10'
                : 'text-muted-foreground border-border/40 bg-muted/20')}>
                {deal.grade}
              </span>

              {/* Property type badge — show prominently if unusual */}
              {isLandOrBad && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/30 uppercase tracking-wide">
                  ⚠ {a.propertyTypeDetected === 'land' ? 'Land Only' : a.propertyTypeDetected === 'fire_damaged' ? 'Fire Damaged' : a.propertyTypeDetected === 'teardown' ? 'Teardown' : 'Not Habitable'}
                </span>
              )}

              {best && best !== 'none' && !isLandOrBad && (
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide', strategyColor(best))}>
                  {best === 'flip' ? '🔥' : best === 'rental' ? '🏠' : '🔄'} {best}
                </span>
              )}

              {a.confidenceScore && (
                <span className={cn('text-xs font-bold', confidenceColor(a.confidenceScore))}>
                  {a.confidenceScore}/10
                </span>
              )}

              {(a.propertyStatus === 'sold' || a.propertyStatus === 'pending') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/30 cursor-help">
                      {a.propertyStatus === 'sold' ? '🚫 Sold' : '⏳ Pending'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Status detected by AI from listing data. Verify on Zillow — may not be accurate.</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="text-sm font-semibold mt-1 truncate">{deal.address}</p>
            <p className="text-[11px] text-muted-foreground">
              {deal.zip && <span className="mr-2 text-purple-400">{deal.zip}</span>}
              {deal.beds}bd · {deal.baths}ba · {deal.sqft?.toLocaleString()} sqft
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {deal.detail_url && (
              <a href={deal.detail_url?.startsWith('http') ? deal.detail_url : `https://www.zillow.com${deal.detail_url}`}
                target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="text-muted-foreground hover:text-blue-400 transition-colors p-1">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button onClick={e => { e.stopPropagation(); onStar(); }}
              title={deal.is_starred ? 'Remove from favorites' : 'Add to favorites'}
              className={cn('p-1 transition-colors', deal.is_starred ? 'text-amber-400 hover:text-amber-300' : 'text-muted-foreground hover:text-amber-400')}>
              <Star className="w-3.5 h-3.5" fill={deal.is_starred ? 'currentColor' : 'none'} />
            </button>
            <button onClick={e => { e.stopPropagation(); onReanalyze(); }}
              disabled={reanalyzing}
              title="Re-analyze"
              className="p-1 text-muted-foreground hover:text-violet-400 transition-colors">
              {reanalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            <button onClick={e => { e.stopPropagation(); onSkip(); }}
              title={isSkipped ? 'Restore' : 'Mark not relevant'}
              className={cn('p-1 transition-colors', isSkipped ? 'text-yellow-400 hover:text-muted-foreground' : 'text-muted-foreground hover:text-red-400')}>
              {isSkipped ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onOpen} className="p-1 text-muted-foreground/40 group-hover:text-violet-400 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Verdict ── */}
        {a.overallVerdict && (
          <p onClick={onOpen} className="text-xs text-muted-foreground italic border-l-2 border-violet-500/40 pl-2 line-clamp-2">
            "{a.overallVerdict}"
          </p>
        )}

        {/* ── Key numbers ── */}
        <div className="grid grid-cols-4 gap-2" onClick={onOpen}>
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
            <p className="text-xs font-semibold text-cyan-400">{a.rentAnalysis?.estimatedRent ? `${fc(a.rentAnalysis.estimatedRent)}/mo` : '—'}</p>
          </div>
        </div>

        {/* ── Strategy returns ── */}
        {a.strategyRecommendation && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/20" onClick={onOpen}>
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

        {/* ── Badges + cost ── */}
        <div className="flex items-center justify-between" onClick={onOpen}>
          <div className="flex items-center gap-2 flex-wrap">
            {a.rehabAnalysis?.condition && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', conditionBadge(a.rehabAnalysis.condition))}>
                {a.rehabAnalysis.condition.replace('_', ' ')} rehab
              </span>
            )}
            {(a.redFlags?.length ?? 0) > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-0.5 text-[10px] text-red-400 cursor-help">
                    <AlertTriangle className="w-3 h-3" /> {a.redFlags!.length} {a.redFlags!.length === 1 ? 'risk' : 'risks'}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs space-y-1">
                  <p className="font-semibold text-xs text-red-400 mb-1">Risk Factors</p>
                  {a.redFlags!.map((f, i) => <p key={i} className="text-xs">• {f}</p>)}
                </TooltipContent>
              </Tooltip>
            )}
            {(a.positives?.length ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                <ThumbsUp className="w-3 h-3" /> {a.positives!.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
            {item.costUsd != null && <span className="font-mono">${item.costUsd.toFixed(4)}</span>}
            <span>{new Date(item.analyzedAt).toLocaleDateString()}</span>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ScoutAiDealsPage() {
  const [items,          setItems]          = useState<AiDeal[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [selected,       setSelected]       = useState<ScoutResult | null>(null);
  const [sortBy,         setSortBy]         = useState<'date' | 'score' | 'arv'>('date');
  const [showSkipped,    setShowSkipped]    = useState(false);
  const [reanalyzingId,  setReanalyzingId]  = useState<string | null>(null);
  const [bulkRunning,    setBulkRunning]    = useState(false);
  const [bulkDone,       setBulkDone]       = useState(0);
  const [bulkErrors,     setBulkErrors]     = useState(0);
  const [stratFilter,    setStratFilter]    = useState<'all' | 'flip' | 'rental' | 'brrrr'>('all');
  const [minProfit,      setMinProfit]      = useState('');
  const [starringId,     setStarringId]     = useState<string | null>(null);
  const [ageFilter,      setAgeFilter]      = useState<AgeFilterType>('month');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase
        .from('scout_ai_analyses')
        .select(`
          id, scout_result_id, zpid, analysis, comps_used,
          tokens_used, cost_usd, model, created_at,
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
      setItems((data || []).map((row: any) => ({
        aiId: row.id, scoutResultId: row.scout_result_id, zpid: row.zpid,
        analysis: row.analysis as AiAnalysis,
        compsUsed: row.comps_used, tokensUsed: row.tokens_used,
        costUsd: row.cost_usd, model: row.model, analyzedAt: row.created_at,
        deal: { ...row.scout_results, zip: row.scout_results.scout_searches?.zip },
      })));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function reanalyze(item: AiDeal) {
    setReanalyzingId(item.aiId);
    try {
      const deal = item.deal;
      const { data, error } = await supabase.functions.invoke('scout-ai-analyze', {
        body: { deal: { address: deal.address, zip: deal.zip, price: deal.price, zpid: deal.zpid,
          arv: deal.arv_override ?? deal.arv, rehab: deal.rehab_override ?? deal.rehab,
          rent: deal.rent_override ?? deal.rent, beds: deal.beds, baths: deal.baths,
          sqft: deal.sqft, days_on_market: deal.days_on_market, score: deal.score, grade: deal.grade } }
      });
      if (data?.success && deal.id) {
        await supabase.from('scout_ai_analyses').upsert({
          scout_result_id: deal.id, zpid: deal.zpid, analysis: data.analysis,
          comps_used: data.compsUsed||0, tokens_used: data.tokensUsed||0,
          cost_usd: data.costUsd||0, model: data.model||null,
          input_tokens: data.inputTokens||0, output_tokens: data.outputTokens||0,
        }, { onConflict: 'scout_result_id' });
        setItems(prev => prev.map(i =>
          i.aiId === item.aiId
            ? { ...i, analysis: data.analysis, costUsd: data.costUsd, analyzedAt: new Date().toISOString() }
            : i
        ));
      }
    } catch { /* silent */ }
    finally { setReanalyzingId(null); }
  }

  async function reanalyzeAll() {
    const toRun = sorted.filter(i => i.deal.status !== 'skip');
    setBulkRunning(true); setBulkDone(0); setBulkErrors(0);
    for (const item of toRun) {
      try { await reanalyze(item); }
      catch { setBulkErrors(e => e + 1); }
      setBulkDone(d => d + 1);
      await new Promise(r => setTimeout(r, 1500));
    }
    setBulkRunning(false);
  }

  function skipDeal(item: AiDeal) {
    const newStatus: DealStatus = item.deal.status === 'skip' ? 'new' : 'skip';
    setItems(prev => prev.map(i =>
      i.aiId === item.aiId ? { ...i, deal: { ...i.deal, status: newStatus } } : i
    ));
    if (item.deal.id) updateResultStatus(item.deal.id, newStatus);
  }

  async function starDeal(item: AiDeal) {
    if (!item.deal.id) return;
    const newVal = !item.deal.is_starred;
    setItems(prev => prev.map(i => i.aiId === item.aiId ? { ...i, deal: { ...i.deal, is_starred: newVal } } : i));
    setStarringId(item.aiId);
    await toggleStarred(item.deal.id, newVal);
    setStarringId(null);
  }

  const handleStatusChange = (id: string, status: DealStatus) => {
    setItems(prev => prev.map(i => i.deal.id === id ? { ...i, deal: { ...i.deal, status } } : i));
    updateResultStatus(id, status);
  };
  const handleOverrideChange = (id: string, overrides: Partial<ScoutResult>) => {
    setItems(prev => prev.map(i => i.deal.id === id ? { ...i, deal: { ...i.deal, ...overrides } } : i));
  };

  if (selected) {
    return <ScoutDealDetail deal={selected} onBack={() => setSelected(null)}
      onStatusChange={handleStatusChange} onOverrideChange={handleOverrideChange} />;
  }

  const sorted = [...items].sort((a, b) => {
    if (sortBy === 'score') return (b.deal.score ?? 0) - (a.deal.score ?? 0);
    if (sortBy === 'arv')   return (b.analysis.arvAnalysis?.recommendedARV ?? 0) - (a.analysis.arvAnalysis?.recommendedARV ?? 0);
    return new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime();
  });

  const visible = applyScoutAgeFilter(sorted, ageFilter).filter(i => {
    if (!showSkipped && i.deal.status === 'skip') return false;
    if (stratFilter !== 'all') {
      const best = i.analysis.strategyRecommendation?.best;
      if (best !== stratFilter) return false;
    }
    if (minProfit) {
      const min = parseFloat(minProfit);
      if (!isNaN(min)) {
        const best = i.analysis.strategyRecommendation?.best;
        if (best === 'flip' && (i.analysis.strategyRecommendation?.flipProfit ?? 0) < min) return false;
        if (best === 'rental' && (i.analysis.strategyRecommendation?.rentalCashflow ?? 0) < min) return false;
        if (best === 'brrrr' && (i.analysis.strategyRecommendation?.brrrrMoneyLeft ?? 999999) > min) return false;
      }
    }
    return true;
  });

  const skippedCount = items.filter(i => i.deal.status === 'skip').length;
  const totalCost    = items.reduce((s, i) => s + (i.costUsd ?? 0), 0);
  const stratCounts  = { flip: 0, rental: 0, brrrr: 0, none: 0, land: 0 };
  items.forEach(i => {
    if (i.deal.status === 'skip') return;
    const pt = (i.analysis as any).propertyTypeDetected;
    if (pt === 'land' || pt === 'teardown' || pt === 'fire_damaged') { stratCounts.land++; return; }
    const b = i.analysis.strategyRecommendation?.best || 'none';
    if (b in stratCounts) stratCounts[b as keyof typeof stratCounts]++;
  });

  // Top picks: top 20% by confidence score
  const nonSkippedVisible = visible.filter(i => i.deal.status !== 'skip');
  const topPicks = [...nonSkippedVisible]
    .sort((a, b) => (b.analysis.confidenceScore ?? 0) - (a.analysis.confidenceScore ?? 0))
    .slice(0, Math.max(1, Math.ceil(nonSkippedVisible.length * 0.2)));
  const topPickIds = new Set(topPicks.map(i => i.aiId));
  const remainingVisible = visible.filter(i => !topPickIds.has(i.aiId));

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 px-6 pt-5 pb-3 border-b border-border/40 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            <h1 className="text-lg font-bold">AI Analyzed Deals</h1>
            {!loading && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30">{items.length} deals</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {['date', 'score', 'arv'].map(s => (
              <button key={s} onClick={() => setSortBy(s as typeof sortBy)}
                className={cn('text-xs px-2.5 py-1 rounded border transition-all',
                  sortBy === s ? 'bg-violet-500/15 text-violet-400 border-violet-500/30' : 'border-border/40 text-muted-foreground hover:text-foreground')}>
                {s === 'date' ? '🕐 Date' : s === 'score' ? '⭐ Score' : '📈 ARV'}
              </button>
            ))}
            {skippedCount > 0 && (
              <button onClick={() => setShowSkipped(v => !v)}
                className={cn('text-xs px-2.5 py-1 rounded border transition-all',
                  showSkipped ? 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' : 'border-border/40 text-muted-foreground hover:text-foreground')}>
                {showSkipped ? `Hide skipped (${skippedCount})` : `Show skipped (${skippedCount})`}
              </button>
            )}
            {/* Re-analyze all button */}
            {!loading && items.length > 0 && (
              bulkRunning ? (
                <div className="flex items-center gap-2 text-xs text-violet-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{bulkDone}/{sorted.filter(i => i.deal.status !== 'skip').length}</span>
                  {bulkErrors > 0 && <span className="text-red-400">{bulkErrors} err</span>}
                </div>
              ) : (
                <button onClick={reanalyzeAll}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-all font-medium">
                  <Sparkles className="w-3.5 h-3.5" /> Re-analyze All ({sorted.filter(i => i.deal.status !== 'skip').length})
                </button>
              )
            )}
            <button onClick={load} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Strategy + profit filters + age filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'flip', 'rental', 'brrrr'] as const).map(s => (
            <button key={s} onClick={() => setStratFilter(s)}
              className={cn('text-xs px-2.5 py-1 rounded border transition-all',
                stratFilter === s ? 'bg-violet-500/15 text-violet-400 border-violet-500/30' : 'border-border/40 text-muted-foreground hover:text-foreground')}>
              {s === 'all' ? 'All Strategies' : s === 'flip' ? '🔥 Flip' : s === 'rental' ? '🏠 Rental' : '🔄 BRRRR'}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Min profit</span>
            <input type="number" value={minProfit} onChange={e => setMinProfit(e.target.value)}
              placeholder="$0" className="w-24 h-7 text-xs rounded border border-border/40 bg-background px-2 text-foreground" />
          </div>
          <div className="ml-auto">
            <DealAgeFilter value={ageFilter} onChange={setAgeFilter} />
          </div>
        </div>

        {/* Stats */}
        {!loading && items.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-orange-400" /><span className="text-orange-400 font-medium">{stratCounts.flip}</span> flip</span>
            <span className="flex items-center gap-1.5"><Home className="w-3.5 h-3.5 text-cyan-400" /><span className="text-cyan-400 font-medium">{stratCounts.rental}</span> rental</span>
            <span className="flex items-center gap-1.5"><Repeat2 className="w-3.5 h-3.5 text-purple-400" /><span className="text-purple-400 font-medium">{stratCounts.brrrr}</span> BRRRR</span>
            {stratCounts.land > 0 && <span className="flex items-center gap-1.5 text-red-400"><AlertTriangle className="w-3.5 h-3.5" /><span className="font-medium">{stratCounts.land}</span> land/damaged</span>}
            {skippedCount > 0 && <span className="text-muted-foreground/50">{skippedCount} skipped</span>}
            <span className="ml-auto flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span className="font-mono text-violet-400">${totalCost.toFixed(3)}</span> total spent
            </span>
          </div>
        )}
      </div>

      {/* ── Content ── */}
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
            <Sparkles className="w-10 h-10 text-violet-400/40" />
            <div>
              <p className="font-semibold text-muted-foreground">No AI analyses yet</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Open a deal in Scout and click "🤖 AI Deep Analysis"</p>
            </div>
          </div>
        )}
        {!loading && !error && visible.length > 0 && (
          <div>
            {/* Top Picks section */}
            {topPicks.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-amber-400">🏆 Top Picks</span>
                  <span className="text-xs text-muted-foreground">Best {topPicks.length} of {nonSkippedVisible.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {topPicks.map(item => (
                    <div key={item.aiId} className="ring-1 ring-amber-500/40 rounded-xl bg-amber-500/5">
                      <AiDealCard
                        item={item}
                        onOpen={() => setSelected(item.deal)}
                        onSkip={() => skipDeal(item)}
                        onReanalyze={() => reanalyze(item)}
                        reanalyzing={reanalyzingId === item.aiId}
                        onStar={() => starDeal(item)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Remaining deals */}
            {remainingVisible.length > 0 && (
              <div>
                {topPicks.length > 0 && (
                  <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">All Deals</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {remainingVisible.map(item => (
                    <AiDealCard
                      key={item.aiId}
                      item={item}
                      onOpen={() => setSelected(item.deal)}
                      onSkip={() => skipDeal(item)}
                      onReanalyze={() => reanalyze(item)}
                      reanalyzing={reanalyzingId === item.aiId}
                      onStar={() => starDeal(item)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
