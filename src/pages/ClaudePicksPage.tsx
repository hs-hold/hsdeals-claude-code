import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { useSettings } from '@/context/SettingsContext';
import { useClaudePicks } from '@/hooks/useClaudePicks';
import { formatCurrency } from '@/utils/financialCalculations';
import { analyzeAcquisition } from '@/utils/maoCalculations';
import { calculateInvestmentScore, type InvestmentScoreResult } from '@/utils/investmentScore';
import { isOnMajorRoad } from '@/utils/highwayFilter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Bot,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  TrendingUp,
  Home,
  Wrench,
  Sparkles,
  X,
  Loader2,
  Flame,
  Zap,
  Repeat,
  Target,
  Filter,
} from 'lucide-react';
import type { Deal } from '@/types/deal';
import type { ClaudePick, ClaudePickPriority, ClaudePickMarketStatus } from '@/types/claudePick';

const statusConfig: Record<ClaudePickMarketStatus, {
  label: string;
  icon: typeof CheckCircle2;
  color: string;
  bg: string;
}> = {
  active: { label: 'Active', icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  'off-market': { label: 'Off Market', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
};

const priorityConfig: Record<ClaudePickPriority, { label: string; className: string; rank: number }> = {
  high: { label: 'Submit Offer', className: 'bg-green-500/20 text-green-400 border-green-400/30', rank: 0 },
  medium: { label: 'Monitor', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-400/30', rank: 1 },
  low: { label: 'Check Manually', className: 'bg-red-500/20 text-red-400 border-red-400/30', rank: 2 },
};

// Score a deal for auto-discovery. Higher is better. Heuristic blends grade,
// cap rate, and spread — the same signals a human reviewer scans first.
function scoreDeal(deal: Deal): number {
  const a = deal.apiData;
  if (!a) return -Infinity;
  const grade = a.grade ?? '?';
  const gradeBonus = grade === 'A' ? 30 : grade === 'B' ? 18 : grade === 'C' ? 8 : 0;
  const cap = a.capRate ?? 0;
  const price = deal.overrides?.purchasePrice ?? a.purchasePrice ?? 0;
  const arv = deal.overrides?.arv ?? a.arv ?? 0;
  const spread = arv - price;
  // Weight cap rate 2× and add spread/$10K. Cap at sane ranges to avoid
  // outliers dominating the score.
  return gradeBonus + Math.min(cap, 25) * 2 + Math.min(spread, 200_000) / 10_000;
}

function priorityFromScore(score: number): ClaudePickPriority {
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// Tiering blends BRRRR all-in ratio + cap rate + grade so the standout deals
// (top BRRRR, fat cap rates) bubble to the top with a visible glow.
type DealTier = 'gold' | 'silver' | 'standard';

interface TierResult {
  tier: DealTier;
  allInRatio: number | null; // (price + rehab) / arv — null when arv is 0
  isBrrrr: boolean;
}

function evaluateTier(deal: Deal, pick: ClaudePick): TierResult {
  const a = deal.apiData;
  const price = deal.overrides?.purchasePrice ?? a?.purchasePrice ?? 0;
  const arv = deal.overrides?.arv ?? a?.arv ?? 0;
  const rehab = deal.overrides?.rehabCost ?? a?.rehabCost ?? 0;
  const cap = a?.capRate ?? 0;
  const grade = a?.grade ?? '?';
  const allIn = arv > 0 ? (price + rehab) / arv : null;

  const isBrrrr =
    pick.addedBy === 'auto-discover-brrrr' ||
    (allIn !== null && allIn < 0.75 && arv >= 100_000);

  // GOLD: standout BRRRR (all-in <65%) OR exceptional cap (>=18%) on A/B grade
  if (
    (allIn !== null && allIn < 0.65 && arv >= 100_000 && (grade === 'A' || grade === 'B')) ||
    (cap >= 18 && (grade === 'A' || grade === 'B'))
  ) {
    return { tier: 'gold', allInRatio: allIn, isBrrrr };
  }
  // SILVER: solid BRRRR (<75%) OR strong cap (>=12%) on A/B
  if (
    (allIn !== null && allIn < 0.75 && (grade === 'A' || grade === 'B')) ||
    (cap >= 12 && (grade === 'A' || grade === 'B'))
  ) {
    return { tier: 'silver', allInRatio: allIn, isBrrrr };
  }
  return { tier: 'standard', allInRatio: allIn, isBrrrr };
}

const tierRank: Record<DealTier, number> = { gold: 0, silver: 1, standard: 2 };

const tierCardClass: Record<DealTier, string> = {
  gold: 'border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/5 to-orange-500/5 shadow-[0_0_24px_rgba(251,191,36,0.18)] hover:shadow-[0_0_32px_rgba(251,191,36,0.28)]',
  silver: 'border-2 border-cyan-400/40 bg-cyan-500/5 hover:border-cyan-400/60',
  standard: 'border border-border/50 hover:border-blue-500/40',
};

// Sqft filter range — investor sweet spot for BRRRR/flip in this market.
const SQFT_MIN = 1200;
const SQFT_MAX = 2500;

type PickSortMode = 'acquisition' | 'tier';

// Statuses that disqualify a pick from appearing on the page.
// not_relevant / filtered_out are user-rejected; closed is past the funnel;
// pending_other means another investor took it.
const HIDDEN_PICK_STATUSES = new Set(['not_relevant', 'filtered_out', 'closed', 'pending_other']);

export default function ClaudePicksPage() {
  const { deals, isLoading: dealsLoading } = useDeals();
  const { settings } = useSettings();
  const { picks, isLoading: picksLoading, error, upsertPick, removePick, refresh } = useClaudePicks();
  const { toast } = useToast();
  const [discovering, setDiscovering] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [sqftFilter, setSqftFilter] = useState(true);
  const [sortMode, setSortMode] = useState<PickSortMode>('acquisition');

  // Join picks with deal data; drop picks whose deal is hidden/not-relevant.
  // Compute Acquisition Engine score (analyzeAcquisition + calculateInvestmentScore)
  // for each pick so we can sort by it and surface it on the card.
  const visiblePicks = useMemo(() => {
    return picks
      .map(pick => {
        const deal = deals.find(d => d.id === pick.dealId);
        if (!deal || HIDDEN_PICK_STATUSES.has(deal.status)) return null;
        // Skip picks that sit on a major road — bad for rent + resale.
        if (isOnMajorRoad(deal.address?.street) || isOnMajorRoad(deal.address?.full)) return null;
        const tierInfo = evaluateTier(deal, pick);
        const score = scoreDeal(deal);

        // Replicates AcquisitionPage logic so the Picks page shows the same
        // Buy/Pass call you'd see on the Acquisition Engine.
        const analysis = analyzeAcquisition(deal);
        let invScore: InvestmentScoreResult | null = null;
        if (analysis) {
          invScore = calculateInvestmentScore({
            monthlyCashflow: analysis.brrrrVerdict.monthlyCashflow,
            cashLeftInDeal: analysis.brrrrVerdict.cashLeftInDeal,
            arv: analysis.arv,
            purchasePrice: deal.overrides?.purchasePrice ?? deal.apiData.purchasePrice ?? 0,
            rehabCost: deal.overrides?.rehabCost ?? deal.apiData.rehabCost ?? 0,
            schoolTotal: deal.apiData.schoolScore,
            inventoryMonths: deal.overrides?.inventoryMonths ?? null,
          }, settings.investmentScoreSettings);
        }
        const askProfit = analysis?.atAsk.profit ?? null;
        // analysisArv is the same ARV that drives the Acquisition Engine score
        // (override → min(comp, api) fallback). Display this so the ARV shown
        // on the card matches the ARV used for the Buy/Pass decision.
        const analysisArv = analysis?.arv ?? null;

        return { pick, deal, tierInfo, score, invScore, askProfit, analysisArv };
      })
      .filter(
        (p): p is {
          pick: ClaudePick;
          deal: Deal;
          tierInfo: TierResult;
          score: number;
          invScore: InvestmentScoreResult | null;
          askProfit: number | null;
          analysisArv: number | null;
        } => p !== null,
      )
      .filter(({ deal }) => {
        if (!sqftFilter) return true;
        const sqft = deal.apiData?.sqft ?? null;
        if (sqft == null) return false;
        return sqft >= SQFT_MIN && sqft <= SQFT_MAX;
      })
      .sort((a, b) => {
        if (sortMode === 'acquisition') {
          const aFinal = a.invScore?.finalScore ?? -Infinity;
          const bFinal = b.invScore?.finalScore ?? -Infinity;
          if (aFinal !== bFinal) return bFinal - aFinal;
          const aProfit = a.askProfit ?? -Infinity;
          const bProfit = b.askProfit ?? -Infinity;
          if (aProfit !== bProfit) return bProfit - aProfit;
          return b.score - a.score;
        }
        const t = tierRank[a.tierInfo.tier] - tierRank[b.tierInfo.tier];
        if (t !== 0) return t;
        const p = priorityConfig[a.pick.priority].rank - priorityConfig[b.pick.priority].rank;
        if (p !== 0) return p;
        return b.score - a.score;
      });
  }, [picks, deals, settings.investmentScoreSettings, sqftFilter, sortMode]);

  const hiddenBySqft = useMemo(() => {
    if (!sqftFilter) return 0;
    return picks.reduce((n, pick) => {
      const deal = deals.find(d => d.id === pick.dealId);
      if (!deal || HIDDEN_PICK_STATUSES.has(deal.status)) return n;
      const sqft = deal.apiData?.sqft ?? null;
      if (sqft == null || sqft < SQFT_MIN || sqft > SQFT_MAX) return n + 1;
      return n;
    }, 0);
  }, [picks, deals, sqftFilter]);

  const lastChecked = picks.length > 0
    ? picks.reduce((latest, p) => (p.checkedAt > latest ? p.checkedAt : latest), picks[0].checkedAt)
    : null;

  // Auto-discovery: scan deals not already picked, score them, and add the
  // top N as new picks with priority derived from score. Idempotent — uses
  // upsert so re-running just refreshes existing entries.
  const handleAutoDiscover = async () => {
    setDiscovering(true);
    try {
      const pickedIds = new Set(picks.map(p => p.dealId));
      const candidates = deals
        .filter(d => !pickedIds.has(d.id))
        .filter(d => d.status !== 'not_relevant' && d.status !== 'closed' && d.status !== 'filtered_out')
        .filter(d => !isOnMajorRoad(d.address?.street) && !isOnMajorRoad(d.address?.full))
        .map(d => ({ deal: d, score: scoreDeal(d) }))
        .filter(x => Number.isFinite(x.score) && x.score > 35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      if (candidates.length === 0) {
        toast({
          title: 'No new picks found',
          description: 'No qualifying deals above the discovery threshold.',
        });
        return;
      }

      for (const { deal, score } of candidates) {
        const a = deal.apiData;
        const cap = a?.capRate ?? 0;
        const grade = a?.grade ?? '?';
        const price = deal.overrides?.purchasePrice ?? a?.purchasePrice ?? 0;
        const arv = deal.overrides?.arv ?? a?.arv ?? 0;
        await upsertPick({
          dealId: deal.id,
          marketStatus: 'active',
          priority: priorityFromScore(score),
          marketNote: `Auto-discovered from Hot Deals — listed at ${formatCurrency(price)}`,
          analysisNote: `Grade ${grade}, Cap ${cap.toFixed(1)}%, ARV ${formatCurrency(arv)}, score ${score.toFixed(1)}.`,
          addedBy: 'auto-discover',
        });
      }
      toast({
        title: 'Picks updated',
        description: `Added ${candidates.length} new pick${candidates.length === 1 ? '' : 's'}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      toast({ title: 'Auto-discovery failed', description: msg, variant: 'destructive' });
    } finally {
      setDiscovering(false);
    }
  };

  const handleRemove = async (dealId: string) => {
    setRemovingId(dealId);
    try {
      await removePick(dealId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      toast({ title: 'Failed to remove pick', description: msg, variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  const isLoading = dealsLoading || picksLoading;

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Bot className="w-7 h-7 text-blue-400" />
            <h1 className="text-2xl md:text-3xl font-bold">Claude's Picks</h1>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-400/30">AI Research</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {lastChecked
              ? `Latest check ${lastChecked} — including real-time market status.`
              : 'No picks yet. Star a deal or run auto-discovery to populate this list.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={sortMode === 'acquisition' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortMode(m => (m === 'acquisition' ? 'tier' : 'acquisition'))}
            title="Toggle sort: Acquisition Engine score vs tier/priority"
          >
            <Target className="w-4 h-4 mr-2" />
            {sortMode === 'acquisition' ? 'Sort: Acquisition Score' : 'Sort: Tier'}
          </Button>
          <Button
            variant={sqftFilter ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSqftFilter(v => !v)}
            title={`Filter to ${SQFT_MIN}–${SQFT_MAX} sqft`}
          >
            <Filter className="w-4 h-4 mr-2" />
            {sqftFilter ? `Sqft ${SQFT_MIN}–${SQFT_MAX}` : 'Sqft: all'}
            {sqftFilter && hiddenBySqft > 0 && (
              <span className="ml-1.5 text-[10px] opacity-80">(−{hiddenBySqft})</span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoDiscover}
            disabled={discovering || isLoading}
          >
            {discovering ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Auto-discover
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          Failed to load picks: {error}
        </div>
      )}

      {isLoading && picks.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading picks…
        </div>
      ) : visiblePicks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground space-y-2">
            <Bot className="w-8 h-8 mx-auto opacity-50" />
            <p>No active picks.</p>
            <p className="text-xs">Star a deal from its detail page or click Auto-discover above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visiblePicks.map(({ pick, deal, tierInfo, invScore, askProfit, analysisArv }) => {
            const a = deal.apiData;
            const sCfg = statusConfig[pick.marketStatus];
            const pCfg = priorityConfig[pick.priority];
            const StatusIcon = sCfg.icon;
            const price = deal.overrides?.purchasePrice ?? a?.purchasePrice ?? 0;
            // ARV display matches what the Acquisition Engine score uses:
            // analysisArv is override → min(comp, api). Fall back to api only
            // when comps haven't been computed yet (analysis returned null).
            const arv = analysisArv ?? deal.overrides?.arv ?? a?.arv ?? 0;
            const rehab = deal.overrides?.rehabCost ?? a?.rehabCost ?? 0;
            const cap = a?.capRate ?? 0;
            const rent = a?.rent ?? 0;
            const grade = a?.grade ?? '?';
            const spread = arv - price;
            const sqft = a?.sqft ?? null;

            return (
              <Card
                key={pick.id}
                className={`relative transition-all duration-200 hover:shadow-lg ${
                  tierCardClass[tierInfo.tier]
                } ${pick.marketStatus !== 'active' ? 'opacity-80' : ''}`}
              >
                {tierInfo.tier === 'gold' && (
                  <div className="absolute -top-2.5 -right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-[10px] font-bold text-white shadow-lg shadow-amber-500/40 z-10">
                    <Flame className="w-3 h-3" /> TOP PICK
                  </div>
                )}
                {tierInfo.tier === 'silver' && (
                  <div className="absolute -top-2.5 -right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500 text-[10px] font-bold text-white shadow-lg shadow-cyan-500/30 z-10">
                    <Zap className="w-3 h-3" /> HIGH YIELD
                  </div>
                )}
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm font-bold px-2 py-0.5 rounded ${
                            grade === 'A'
                              ? 'bg-green-500/20 text-green-400'
                              : grade === 'B'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          Grade {grade}
                        </span>
                        <Badge variant="outline" className={pCfg.className}>
                          {pCfg.label}
                        </Badge>
                        {(pick.addedBy === 'auto-discover' || pick.addedBy === 'auto-discover-brrrr') && (
                          <Badge variant="outline" className="bg-purple-500/10 text-purple-300 border-purple-400/30">
                            Auto
                          </Badge>
                        )}
                        {tierInfo.isBrrrr && (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-400/30 flex items-center gap-1">
                            <Repeat className="w-3 h-3" />
                            BRRRR
                            {tierInfo.allInRatio !== null && ` ${Math.round(tierInfo.allInRatio * 100)}%`}
                          </Badge>
                        )}
                      </div>
                      <p className="font-semibold">{deal.address.street}</p>
                      <p className="text-sm text-muted-foreground">
                        {deal.address.city}, {deal.address.state} {deal.address.zip}
                      </p>
                    </div>
                    <div className="flex items-start gap-2 shrink-0">
                      <div
                        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${sCfg.bg} ${sCfg.color}`}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        {sCfg.label}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-400"
                        title="Remove from picks"
                        disabled={removingId === deal.id}
                        onClick={() => handleRemove(deal.id)}
                      >
                        {removingId === deal.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {invScore && (
                    <div className="flex items-center justify-between rounded-md px-3 py-2 bg-muted/30 border border-border">
                      <div className="flex items-center gap-2">
                        <Target className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-xs text-muted-foreground">Acquisition Engine</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {sqft != null && (
                          <span className="text-[10px] text-muted-foreground">{sqft.toLocaleString()} sqft</span>
                        )}
                        {askProfit != null && (
                          <span className={`text-[10px] font-medium ${askProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {askProfit >= 0 ? '+' : ''}{formatCurrency(askProfit)}
                          </span>
                        )}
                        <span className="font-bold text-sm">{invScore.finalScore.toFixed(1)}/10</span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            invScore.decision === 'Buy'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {invScore.decision}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-3 py-3 border-y border-border/50">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">Cap Rate</p>
                      <p className="text-base font-bold text-blue-400">{cap.toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">Spread</p>
                      <p className="text-base font-bold text-green-400">{formatCurrency(spread)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center justify-center gap-0.5">
                        <Home className="w-2.5 h-2.5" />
                        Rent
                      </p>
                      <p className="text-base font-bold">{formatCurrency(rent)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center justify-center gap-0.5">
                        <Wrench className="w-2.5 h-2.5" />
                        Rehab
                      </p>
                      <p className="text-base font-bold text-yellow-400">{formatCurrency(rehab)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-muted/30 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Price</p>
                      <p className="font-semibold">{formatCurrency(price)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">ARV</p>
                      <p className="font-semibold text-green-400">{formatCurrency(arv)}</p>
                    </div>
                  </div>

                  {(pick.marketNote || pick.analysisNote) && (
                    <div className="space-y-2">
                      {pick.marketNote && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 rounded-lg p-2.5">
                          <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                          <span>{pick.marketNote}</span>
                        </div>
                      )}
                      {pick.analysisNote && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 rounded-lg p-2.5">
                          <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                          <span>{pick.analysisNote}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <Link
                    to={`/deals/${deal.id}`}
                    className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
                  >
                    <ExternalLink className="w-4 h-4" /> Open Full Analysis
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
