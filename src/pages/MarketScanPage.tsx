import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { analyzeAndCreateDeal } from '@/services/deals/analyzeAndCreateDeal';
import { useNavigate } from 'react-router-dom';
import {
  ScanLine, ExternalLink, CheckCircle2, XCircle,
  Loader2, Home, Zap, Brain, Filter,
  ArrowRight, AlertTriangle, Check, X, MapPin,
} from 'lucide-react';
import atlantaZipsRaw from '@/data/atlantaZips.json';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AtlantaZip {
  zip: string;
  city: string;
  lat: number;
  lng: number;
  medianHomeValue: number;
  crimeIndex: number;
  distanceMiles: number;
}

const ATLANTA_ZIPS: AtlantaZip[] = atlantaZipsRaw as AtlantaZip[];
const DEFAULT_ZIPS = [...ATLANTA_ZIPS].sort((a, b) => a.distanceMiles - b.distanceMiles);

// ─── Filter constants ────────────────────────────────────────────────────────

const MIN_PRICE       = 80_000;
const MAX_PRICE       = 250_000;
const MAX_PRICE_RATIO = 0.80;
const MIN_SQFT        = 1_200;
const MAX_SQFT        = 1_800;
const MIN_BEDS        = 2;
const MIN_YEAR        = 1950;

// ─── Deal score ───────────────────────────────────────────────────────────────
// 60 pts: price discount  (1 - price/zestimate) * 60
// 40 pts: rent yield      (rentZestimate*12/price) * 400 capped at 40

function calcDealScore(price: number, zestimate: number | null, rentZestimate: number | null): number {
  const discountPts = zestimate ? Math.max(0, (1 - price / zestimate) * 60) : 0;
  const yieldPts = rentZestimate ? Math.min(40, (rentZestimate * 12 / price) * 400) : 0;
  return Math.round(discountPts + yieldPts);
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface RawListing {
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
  yearBuilt: number | null;
  propertyType: string | null;
  imgSrc: string | null;
  detailUrl: string | null;
}

type AiStatus = 'pending' | 'pass' | 'fail' | 'error';

interface AiResult {
  status: AiStatus;
  type: string;
  summary: string;
  raw?: Record<string, any>;
}

interface ScoredListing extends RawListing {
  margin: number;
  grossYield: number;
  dealScore: number;
  aiResult: AiResult | null;
  excluded: boolean;
  alreadyAnalyzed: boolean;
  includeAnyway: boolean;
}

// Stage: 0=idle 1=scanning 2=results 3=ai-running 4=ai-done 5=dealbeast-running 6=done
type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ─── Filter listings ─────────────────────────────────────────────────────────

function filterListings(raw: RawListing[]): ScoredListing[] {
  const passed: ScoredListing[] = [];
  for (const l of raw) {
    if (l.price < MIN_PRICE || l.price > MAX_PRICE) continue;
    if (l.propertyType && l.propertyType !== 'SINGLE_FAMILY') continue;
    if (!l.rentZestimate) continue;
    if (!l.zestimate) continue;                               // must have ARV to evaluate margin
    if (l.price / l.zestimate > MAX_PRICE_RATIO) continue;   // margin must be ≥ 20%
    if (l.yearBuilt && l.yearBuilt < MIN_YEAR) continue;
    if (l.sqft && (l.sqft < MIN_SQFT || l.sqft > MAX_SQFT)) continue;
    if (l.bedrooms !== null && l.bedrooms < MIN_BEDS) continue;

    passed.push({
      ...l,
      margin: l.zestimate ? 1 - l.price / l.zestimate : 0,
      grossYield: (l.rentZestimate! * 12) / l.price,
      dealScore: calcDealScore(l.price, l.zestimate, l.rentZestimate),
      aiResult: null,
      excluded: false,
      alreadyAnalyzed: false,
      includeAnyway: false,
    });
  }
  return passed.sort((a, b) => b.dealScore - a.dealScore);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) { return '$' + n.toLocaleString(); }
function fmtPct(n: number) { return (n * 100).toFixed(1) + '%'; }

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
    score >= 50 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                  'bg-muted/40 text-muted-foreground border-border/30';
  return (
    <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded border font-mono', color)}>
      {score}
    </span>
  );
}

function AiBadge({ result }: { result: AiResult | null }) {
  if (!result) return <span className="text-[11px] text-muted-foreground/40">—</span>;
  if (result.status === 'pending') return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
  if (result.status === 'pass') return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-400 font-medium">
      <Check className="w-3 h-3" /> OK
    </span>
  );
  if (result.status === 'fail') return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-red-400 font-medium" title={result.summary}>
      <XCircle className="w-3 h-3" />
      {result.type === 'land' ? 'Land' : result.type === 'fire_damaged' ? 'Fire' : result.type === 'teardown' ? 'Demo' : 'Skip'}
    </span>
  );
  return <AlertTriangle className="w-3 h-3 text-amber-400" />;
}

function PipelineStep({
  num, label, count, active, done, icon: Icon, colorClass,
}: {
  num: number; label: string; count?: string | null; active?: boolean; done?: boolean;
  icon: React.ElementType; colorClass: string;
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all',
      active ? `${colorClass} border-current` : done ? 'bg-muted/30 border-border/50 text-foreground/70' : 'bg-muted/10 border-border/30 text-muted-foreground/50',
    )}>
      <span className={cn(
        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
        active ? 'bg-current/20' : done ? 'bg-muted/40' : 'bg-muted/20',
      )}>{num}</span>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="font-medium whitespace-nowrap">{label}</span>
      {count != null && (
        <span className={cn('ml-1 font-bold', active ? '' : 'text-foreground/60')}>{count}</span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const STORAGE_KEY = 'market_scan_session';

function loadSavedSession(): { results: ScoredListing[]; stage: Stage; totalScanned: number; dbDone: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSession(results: ScoredListing[], stage: Stage, totalScanned: number, dbDone: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ results, stage, totalScanned, dbDone }));
  } catch { /* storage full — ignore */ }
}

export default function MarketScanPage() {
  const navigate = useNavigate();

  const saved = loadSavedSession();

  const [stage, setStage] = useState<Stage>(saved?.stage ?? 0);
  const [results, setResults] = useState<ScoredListing[]>(saved?.results ?? []);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; zip: string } | null>(null);
  const [aiProgress, setAiProgress] = useState<{ current: number; total: number } | null>(null);
  const [dbProgress, setDbProgress] = useState<{ current: number; total: number; address: string } | null>(null);
  const [dbDone, setDbDone] = useState(saved?.dbDone ?? 0);
  const [totalScanned, setTotalScanned] = useState(saved?.totalScanned ?? 0);

  const aiAbortRef = useRef(false);
  const dbAbortRef = useRef(false);

  // Persist to localStorage whenever results/stage change
  useEffect(() => {
    if (results.length > 0 || stage > 0) {
      saveSession(results, stage, totalScanned, dbDone);
    }
  }, [results, stage, totalScanned, dbDone]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const visibleResults = results.filter(r => !r.excluded);
  const nonDupeResults = visibleResults.filter(r => !r.alreadyAnalyzed || r.includeAnyway);
  const aiChecked = nonDupeResults.filter(r => r.aiResult && r.aiResult.status !== 'pending');
  const aiPassed = nonDupeResults.filter(r => r.aiResult?.status === 'pass');
  const hasAiResults = aiChecked.length > 0;

  // ── Scan ──────────────────────────────────────────────────────────────────

  const startScan = useCallback(async () => {
    setStage(1);
    setResults([]);
    setScanProgress(null);
    setDbDone(0);
    setTotalScanned(0);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    aiAbortRef.current = false;
    dbAbortRef.current = false;

    const zips = DEFAULT_ZIPS.map(z => z.zip);
    const allRaw: RawListing[] = [];

    for (let i = 0; i < zips.length; i++) {
      const zip = zips[i];
      setScanProgress({ current: i + 1, total: zips.length, zip });

      try {
        const { data, error } = await supabase.functions.invoke('zillow-search', {
          body: {
            location: zip,
            homeType: 'SingleFamily',
            minPrice: MIN_PRICE,
            maxPrice: MAX_PRICE,
            minBeds: MIN_BEDS,
            minSqft: MIN_SQFT,
            maxSqft: MAX_SQFT,
            minYearBuilt: MIN_YEAR,
            page: 1,
          },
        });
        if (!error && data?.properties) {
          allRaw.push(...data.properties.map((p: any) => ({
            zpid:          p.zpid ?? '',
            address:       p.address ?? '',
            city:          p.city ?? '',
            state:         p.state ?? '',
            zipcode:       p.zipcode ?? zip,
            price:         p.price ?? 0,
            zestimate:     p.zestimate ?? null,
            rentZestimate: p.rentZestimate ?? null,
            daysOnZillow:  p.daysOnZillow ?? null,
            bedrooms:      p.bedrooms ?? null,
            bathrooms:     p.bathrooms ?? null,
            sqft:          p.sqft ?? null,
            yearBuilt:     p.yearBuilt ?? null,
            propertyType:  p.propertyType ?? null,
            imgSrc:        p.imgSrc ?? null,
            detailUrl:     p.detailUrl ?? null,
          })));
        }
      } catch (e) { console.error(`ZIP ${zip}:`, e); }

      if (i < zips.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    const filtered = filterListings(allRaw);
    setTotalScanned(allRaw.length);
    setScanProgress(null);

    // Batch dedup check
    const addresses = filtered.map(r => [r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', '));
    const { data: existing } = await supabase
      .from('deals')
      .select('address_full')
      .in('address_full', addresses);
    const existingSet = new Set((existing || []).map((d: any) => d.address_full.toLowerCase()));

    const withDedup = filtered.map(r => ({
      ...r,
      alreadyAnalyzed: existingSet.has(
        [r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', ').toLowerCase()
      ),
    }));

    setResults(withDedup);
    setStage(2);
    toast.success(`Scan complete — ${filtered.length} properties passed filters`);
  }, []);

  // ── AI Screen ─────────────────────────────────────────────────────────────

  const runAiScreen = useCallback(async () => {
    // Only send to AI if we have the minimum required data
    const toCheck = results.filter(r =>
      !r.excluded &&
      (!r.alreadyAnalyzed || r.includeAnyway) &&
      r.price > 0 &&
      r.zestimate && r.zestimate > 0 &&
      r.rentZestimate && r.rentZestimate > 0 &&
      r.margin >= 0.20
    );
    if (!toCheck.length) {
      toast.error('No properties with complete data (ARV + rent + margin ≥ 20%) to screen');
      return;
    }

    aiAbortRef.current = false;
    setStage(3);
    setAiProgress({ current: 0, total: toCheck.length });

    // Mark all as pending
    setResults(prev => prev.map(r => {
      if (!r.excluded && (!r.alreadyAnalyzed || r.includeAnyway)) {
        return { ...r, aiResult: { status: 'pending', type: '', summary: '' } };
      }
      return r;
    }));

    const updatedMap = new Map<string, AiResult>();

    for (let i = 0; i < toCheck.length; i++) {
      if (aiAbortRef.current) break;
      const r = toCheck[i];
      setAiProgress({ current: i + 1, total: toCheck.length });

      try {
        const { data, error } = await supabase.functions.invoke('scout-ai-analyze', {
          body: {
            deal: {
              address: [r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', '),
              price: r.price,
              zpid: r.zpid,
              beds: r.bedrooms,
              baths: r.bathrooms,
              sqft: r.sqft,
              arv: r.zestimate,
              rent: r.rentZestimate,
              score: r.dealScore,
              zip: r.zipcode,
              days_on_market: r.daysOnZillow,
            },
          },
        });

        if (error || !data) {
          updatedMap.set(r.zpid, { status: 'error', type: 'unknown', summary: 'API error', raw: undefined });
        } else {
          const isGood = data.isHabitableStructure !== false &&
            !['land', 'fire_damaged', 'teardown'].includes(data.propertyTypeDetected);
          updatedMap.set(r.zpid, {
            status: isGood ? 'pass' : 'fail',
            type: data.propertyTypeDetected || 'house',
            summary: data.rehabAnalysis?.scopeDetails || data.arvAnalysis?.reasoning || '',
            raw: data,
          });
        }
      } catch {
        updatedMap.set(r.zpid, { status: 'error', type: 'unknown', summary: 'Error', raw: undefined });
      }

      setResults(prev => prev.map(item => {
        const upd = updatedMap.get(item.zpid);
        return upd ? { ...item, aiResult: upd } : item;
      }));

      if (i < toCheck.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    setAiProgress(null);
    setStage(4);
    const passed = [...updatedMap.values()].filter(v => v.status === 'pass').length;
    const failed = [...updatedMap.values()].filter(v => v.status === 'fail').length;
    toast.success(`AI screen done — ${passed} passed, ${failed} rejected`);
  }, [results]);

  // ── Send to DealBeast ─────────────────────────────────────────────────────

  const sendToDealBeast = useCallback(async () => {
    const candidates = aiPassed.length > 0 ? aiPassed : nonDupeResults;

    // Only send properties that have complete data — no point paying for an analysis with no numbers
    const toAnalyze = candidates.filter(r =>
      r.price > 0 &&
      r.zestimate && r.zestimate > 0 &&
      r.rentZestimate && r.rentZestimate > 0 &&
      r.margin >= 0.20
    );

    if (!toAnalyze.length) {
      toast.error('No properties with complete data to analyze (need ARV + rent + margin ≥ 20%)');
      return;
    }

    const skippedIncomplete = candidates.length - toAnalyze.length;
    if (skippedIncomplete > 0) {
      toast.info(`Skipping ${skippedIncomplete} properties with missing ARV or rent data`);
    }

    dbAbortRef.current = false;
    setStage(5);
    setDbProgress({ current: 0, total: toAnalyze.length, address: '' });
    setDbDone(0);

    let newCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < toAnalyze.length; i++) {
      if (dbAbortRef.current) break;
      const r = toAnalyze[i];
      const fullAddress = [r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', ');
      setDbProgress({ current: i + 1, total: toAnalyze.length, address: r.address });

      const scoutAiData = r.aiResult?.raw || null;
      const { dealId, alreadyExists } = await analyzeAndCreateDeal(fullAddress, scoutAiData ?? undefined);
      if (dealId) {
        if (alreadyExists) skippedCount++;
        else newCount++;
      }

      if (i < toAnalyze.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    setDbProgress(null);
    setDbDone(newCount + skippedCount);
    setStage(6);
    const msg = skippedCount > 0
      ? `${newCount} new deals added · ${skippedCount} already existed`
      : `${newCount} deals analyzed and added`;
    toast.success(msg, {
      action: { label: 'View Deals', onClick: () => navigate('/deals') },
    });
  }, [aiPassed, nonDupeResults, navigate]);

  // ── Toggle helpers ────────────────────────────────────────────────────────

  // Re-apply strict filter to current results without rescanning
  const reFilter = useCallback(() => {
    const before = results.length;
    const strict = results.filter(r => r.zestimate && r.margin >= 0.20);
    setResults(strict);
    const removed = before - strict.length;
    toast.success(`Re-filtered: kept ${strict.length} (removed ${removed} with no ARV or margin < 20%)`);
  }, [results]);

  const toggleExclude = useCallback((zpid: string) => {
    setResults(prev => prev.map(r => r.zpid === zpid ? { ...r, excluded: !r.excluded } : r));
  }, []);

  const toggleIncludeAnyway = useCallback((zpid: string) => {
    setResults(prev => prev.map(r => r.zpid === zpid ? { ...r, includeAnyway: !r.includeAnyway } : r));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const scanInProgress = scanProgress !== null;
  const aiRunning = stage === 3;
  const dbRunning = stage === 5;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/50 bg-card/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-400" />
            <h1 className="font-semibold text-base">Market Scan</h1>
            <Badge className="bg-blue-500/15 text-blue-400 border-blue-400/30 text-[10px]">
              Atlanta Metro
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {DEFAULT_ZIPS.length} ZIPs · ${MIN_PRICE.toLocaleString()}–${MAX_PRICE.toLocaleString()} · {MIN_SQFT}–{MAX_SQFT} sqft
          </div>
        </div>

        {/* Pipeline indicator */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <PipelineStep
            num={1} icon={ScanLine} label="Scan ZIPs"
            colorClass="bg-blue-500/15 text-blue-400 border-blue-400/50"
            active={stage === 1}
            done={stage >= 2}
            count={stage >= 2 ? `${totalScanned} raw` : null}
          />
          <ArrowRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
          <PipelineStep
            num={2} icon={Filter} label="Filter + Dedup"
            colorClass="bg-violet-500/15 text-violet-400 border-violet-400/50"
            active={stage === 2}
            done={stage >= 3}
            count={stage >= 2 ? `${visibleResults.length} results` : null}
          />
          <ArrowRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
          <PipelineStep
            num={3} icon={Brain} label="AI Screen"
            colorClass="bg-amber-500/15 text-amber-400 border-amber-400/50"
            active={stage === 3}
            done={stage >= 4}
            count={stage >= 4 ? `${aiPassed.length} passed` : null}
          />
          <ArrowRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
          <PipelineStep
            num={4} icon={Zap} label="DealBeast"
            colorClass="bg-emerald-500/15 text-emerald-400 border-emerald-400/50"
            active={stage === 5}
            done={stage === 6}
            count={dbDone > 0 ? `${dbDone} deals` : null}
          />
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scan button */}
          <Button
            size="sm"
            variant={stage === 0 ? 'default' : 'outline'}
            className="h-8 text-xs gap-1.5"
            onClick={startScan}
            disabled={scanInProgress || aiRunning || dbRunning}
          >
            {scanInProgress ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning…</>
            ) : (
              <><ScanLine className="w-3.5 h-3.5" /> {stage === 0 ? 'Configure & Scan' : 'Re-scan'}</>
            )}
          </Button>

          {/* Re-filter button — applies stricter filter to existing results without rescanning */}
          {stage >= 2 && results.some(r => !r.zestimate || r.margin < 0.20) && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
              onClick={reFilter}
              disabled={aiRunning || dbRunning || scanInProgress}
            >
              <Filter className="w-3.5 h-3.5" /> Re-filter (no rescan)
            </Button>
          )}

          {/* AI screen button */}
          {stage >= 2 && stage !== 5 && (
            <Button
              size="sm"
              variant={stage === 2 || stage === 6 ? 'default' : 'outline'}
              className={cn('h-8 text-xs gap-1.5', stage >= 4 && 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30')}
              onClick={runAiScreen}
              disabled={aiRunning || dbRunning || scanInProgress}
            >
              {aiRunning ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> AI Running…</>
              ) : (
                <><Brain className="w-3.5 h-3.5" /> Run AI Screen <span className="opacity-60">({nonDupeResults.length} to check)</span></>
              )}
            </Button>
          )}

          {/* DealBeast button */}
          {stage >= 4 && (
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={sendToDealBeast}
              disabled={dbRunning || scanInProgress || aiRunning}
            >
              {dbRunning ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
              ) : (
                <><Zap className="w-3.5 h-3.5" /> Analyze in DealBeast <span className="opacity-70">({(aiPassed.length > 0 ? aiPassed : nonDupeResults).length} AI-passed)</span></>
              )}
            </Button>
          )}

          {stage === 6 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 text-emerald-400 border-emerald-500/40"
              onClick={() => navigate('/deals')}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> View Deals
            </Button>
          )}
        </div>

        {/* Scan progress */}
        {scanInProgress && scanProgress && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Scanning ZIP {scanProgress.zip}…</span>
              <span>{scanProgress.current} / {scanProgress.total}</span>
            </div>
            <Progress value={(scanProgress.current / scanProgress.total) * 100} className="h-1" />
          </div>
        )}

        {/* AI progress */}
        {aiRunning && aiProgress && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>AI screening properties…</span>
              <span>{aiProgress.current} / {aiProgress.total}</span>
            </div>
            <Progress value={(aiProgress.current / aiProgress.total) * 100} className="h-1 bg-amber-500/20 [&>[data-slot=progress-indicator]]:bg-amber-400" />
          </div>
        )}

        {/* DealBeast progress */}
        {dbRunning && dbProgress && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span className="truncate max-w-[300px]">Analyzing: {dbProgress.address}</span>
              <span>{dbProgress.current} / {dbProgress.total}</span>
            </div>
            <Progress value={(dbProgress.current / dbProgress.total) * 100} className="h-1 bg-emerald-500/20 [&>[data-slot=progress-indicator]]:bg-emerald-400" />
          </div>
        )}
      </div>

      {/* Results table */}
      <div className="flex-1 overflow-auto">
        {stage === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground gap-3">
            <MapPin className="w-10 h-10 text-blue-400/40" />
            <p className="text-sm">Click <strong>Configure &amp; Scan</strong> to scan {DEFAULT_ZIPS.length} Atlanta ZIPs for deals.</p>
            <p className="text-xs opacity-60">Filters: ${MIN_PRICE.toLocaleString()}–${MAX_PRICE.toLocaleString()} · {MIN_SQFT}–{MAX_SQFT} sqft · {MIN_BEDS}+ beds · Built {MIN_YEAR}+ · ARV margin ≥ {((1 - MAX_PRICE_RATIO) * 100).toFixed(0)}%</p>
          </div>
        )}

        {stage === 1 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground gap-3">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            <p className="text-sm">Scanning ZIPs…</p>
          </div>
        )}

        {stage >= 2 && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground gap-2">
            <Home className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm">No properties passed the filters.</p>
          </div>
        )}

        {stage >= 2 && results.length > 0 && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card/90 backdrop-blur-sm border-b border-border/50 z-10">
              <tr className="text-muted-foreground">
                <th className="px-2 py-2 text-left w-8">#</th>
                <th className="px-2 py-2 text-left w-14">Score</th>
                <th className="px-2 py-2 text-left w-12">Photo</th>
                <th className="px-2 py-2 text-left">Address</th>
                <th className="px-2 py-2 text-right">Price</th>
                <th className="px-2 py-2 text-right">ARV</th>
                <th className="px-2 py-2 text-right">Margin</th>
                <th className="px-2 py-2 text-right">Rent</th>
                <th className="px-2 py-2 text-right">Yield</th>
                <th className="px-2 py-2 text-center">Beds</th>
                <th className="px-2 py-2 text-center">Year</th>
                <th className="px-2 py-2 text-center">AI</th>
                <th className="px-2 py-2 text-center">Dup?</th>
                <th className="px-2 py-2 text-center">Link</th>
                <th className="px-2 py-2 text-center w-8"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => {
                const isExcluded = r.excluded;
                const isDupe = r.alreadyAnalyzed && !r.includeAnyway;
                const dimmed = isExcluded || isDupe;

                return (
                  <tr
                    key={r.zpid}
                    className={cn(
                      'border-b border-border/30 transition-colors hover:bg-muted/10',
                      isExcluded && 'opacity-30',
                      isDupe && !isExcluded && 'opacity-50',
                    )}
                  >
                    <td className="px-2 py-1.5 text-muted-foreground/50">{idx + 1}</td>
                    <td className="px-2 py-1.5"><ScoreBadge score={r.dealScore} /></td>
                    <td className="px-2 py-1.5">
                      {r.imgSrc ? (
                        <img src={r.imgSrc} alt="" className="w-10 h-8 object-cover rounded" loading="lazy" />
                      ) : (
                        <div className="w-10 h-8 rounded bg-muted/30 flex items-center justify-center">
                          <Home className="w-3 h-3 text-muted-foreground/30" />
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 max-w-[180px]">
                      <div className="truncate font-medium">{r.address}</div>
                      <div className="text-muted-foreground/60 truncate">{r.city}, {r.state} {r.zipcode}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt$(r.price)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {r.zestimate ? fmt$(r.zestimate) : '—'}
                    </td>
                    <td className={cn('px-2 py-1.5 text-right font-mono', r.margin > 0.25 ? 'text-emerald-400' : 'text-foreground')}>
                      {fmtPct(r.margin)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {r.rentZestimate ? fmt$(r.rentZestimate) : '—'}
                    </td>
                    <td className={cn('px-2 py-1.5 text-right font-mono', r.grossYield > 0.1 ? 'text-emerald-400' : 'text-foreground')}>
                      {fmtPct(r.grossYield)}
                    </td>
                    <td className="px-2 py-1.5 text-center">{r.bedrooms ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">{r.yearBuilt ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center"><AiBadge result={r.aiResult} /></td>
                    <td className="px-2 py-1.5 text-center">
                      {r.alreadyAnalyzed ? (
                        <button
                          className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors underline underline-offset-2"
                          onClick={() => toggleIncludeAnyway(r.zpid)}
                          title={r.includeAnyway ? 'Click to skip' : 'Click to re-analyze'}
                        >
                          {r.includeAnyway ? 'Re-add' : '⟳ Re-analyze?'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {r.detailUrl ? (
                        <a
                          href={r.detailUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground/50 hover:text-blue-400 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground/20">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => toggleExclude(r.zpid)}
                        className={cn(
                          'w-5 h-5 rounded flex items-center justify-center transition-colors',
                          isExcluded
                            ? 'bg-muted/40 text-muted-foreground/40 hover:bg-muted/60'
                            : 'text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10',
                        )}
                        title={isExcluded ? 'Include' : 'Exclude'}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer summary */}
      {stage >= 2 && results.length > 0 && (
        <div className="shrink-0 px-4 py-2 border-t border-border/30 bg-card/20 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>{results.length} total</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{results.filter(r => r.excluded).length} excluded</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{results.filter(r => r.alreadyAnalyzed).length} already analyzed</span>
          {hasAiResults && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-emerald-400">{aiPassed.length} AI passed</span>
            </>
          )}
          {dbDone > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-emerald-400">{dbDone} sent to DealBeast</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
