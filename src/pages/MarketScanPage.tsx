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
  Loader2, Home, Zap, Filter,
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

// ─── Scan areas ───────────────────────────────────────────────────────────────

const SCAN_AREAS = [
  'Atlanta, GA',
  'Decatur, GA',
  'College Park, GA',
  'East Point, GA',
  'Mableton, GA',
  'Lithonia, GA',
  'Jonesboro, GA',
  'Riverdale, GA',
  'Conyers, GA',
  'Union City, GA',
  'Forest Park, GA',
  'Austell, GA',
  'Douglasville, GA',
  'Stockbridge, GA',
  'McDonough, GA',
  'Lawrenceville, GA',
  'Tucker, GA',
  'Ellenwood, GA',
  'Hampton, GA',
  'Fairburn, GA',
  'Hapeville, GA',
  'Powder Springs, GA',
  'Acworth, GA',
  'Covington, GA',
  'Newnan, GA',
  'Stone Mountain, GA',
  'Clarkston, GA',
  'Smyrna, GA',
];

const AREA_HISTORY_KEY = 'market_scan_area_history';
const MAX_AREAS_PER_SCAN = 5;

function loadAreaHistory(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(AREA_HISTORY_KEY) || '{}'); }
  catch { return {}; }
}

function saveAreaHistory(h: Record<string, number>) {
  try { localStorage.setItem(AREA_HISTORY_KEY, JSON.stringify(h)); } catch {}
}

function getAreasToScan(cooldownDays: number): string[] {
  const history = loadAreaHistory();
  const now = Date.now();
  const cooldownMs = cooldownDays * 86_400_000;
  return SCAN_AREAS
    .filter(a => now - (history[a] || 0) >= cooldownMs)
    .sort((a, b) => (history[a] || 0) - (history[b] || 0))
    .slice(0, MAX_AREAS_PER_SCAN);
}

function getNextScanMs(cooldownDays: number): number | null {
  const history = loadAreaHistory();
  const cooldownMs = cooldownDays * 86_400_000;
  const nextTimes = SCAN_AREAS
    .map(a => (history[a] || 0) + cooldownMs)
    .filter(t => t > Date.now());
  return nextTimes.length ? Math.min(...nextTimes) : null;
}

// ─── ZIP median lookup (used as ARV proxy when API returns no zestimate) ─────

const ZIP_MEDIAN: Record<string, number> = Object.fromEntries(
  ATLANTA_ZIPS.map(z => [z.zip, z.medianHomeValue])
);

// ─── Filter constants ────────────────────────────────────────────────────────

const MIN_PRICE       = 80_000;
const MAX_PRICE       = 250_000;
const MAX_PRICE_RATIO = 0.80;
const MIN_SQFT        = 1_200;
const MAX_SQFT        = 1_800;
const MIN_BEDS        = 2;
const MIN_YEAR        = 1950;
const MIN_DEAL_SCORE  = 40;   // minimum score to qualify for DealBeast
const MAX_TO_SEND     = 30;   // hard cap sent to DealBeast

// ─── Deal score ───────────────────────────────────────────────────────────────
// 60 pts: price discount vs ARV  (1 - price/arv) * 60
// 40 pts: rent yield             (rent*12/price) * 400, capped at 40

function calcDealScore(price: number, arv: number | null, rentZestimate: number | null): number {
  const discountPts = arv
    ? Math.max(0, (1 - price / arv) * 60)
    : Math.max(0, (1 - (price - MIN_PRICE) / (MAX_PRICE - MIN_PRICE)) * 40);
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
  agentName: string | null;
  agentEmail: string | null;
  agentPhone: string | null;
  brokerName: string | null;
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

// Stage: 0=idle 1=scanning 2=results 4=dealbeast-ready 5=dealbeast-running 6=done
type Stage = 0 | 1 | 2 | 4 | 5 | 6;

// ─── Filter listings ─────────────────────────────────────────────────────────

function filterListings(raw: RawListing[]): ScoredListing[] {
  const passed: ScoredListing[] = [];
  for (const l of raw) {
    if (l.price < MIN_PRICE || l.price > MAX_PRICE) continue;
    const pType = (l.propertyType || '').toUpperCase().replace(/[^A-Z]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (pType && pType !== 'SINGLE_FAMILY') continue;
    if (l.yearBuilt && l.yearBuilt < MIN_YEAR) continue;
    if (l.sqft && (l.sqft < MIN_SQFT || l.sqft > MAX_SQFT)) continue;
    if (l.bedrooms !== null && l.bedrooms < MIN_BEDS) continue;

    // ARV: real zestimate > ZIP median > null
    const arv = l.zestimate ?? ZIP_MEDIAN[l.zipcode] ?? null;

    // Filter out properties with no upside (price > 90% of ARV)
    if (arv && l.price / arv > 0.90) continue;

    passed.push({
      ...l,
      zestimate: arv,   // store resolved ARV back so DealBeast & display use it
      margin: arv ? 1 - l.price / arv : 0,
      grossYield: l.rentZestimate ? (l.rentZestimate * 12) / l.price : 0,
      dealScore: calcDealScore(l.price, arv, l.rentZestimate),
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

function loadSavedSession(): { results: ScoredListing[]; stage: Stage; totalScanned: number; dbDone: number; sentZpids: string[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Expire at midnight — discard if saved on a different calendar day
    if (!parsed.savedDate || parsed.savedDate !== new Date().toDateString()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // Stage 5 = DealBeast running — can't survive a page reload, reset to 4
    if (parsed.stage === 5) parsed.stage = 4;
    return parsed;
  } catch { return null; }
}

function saveSession(results: ScoredListing[], stage: Stage, totalScanned: number, dbDone: number, sentZpids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      results, stage, totalScanned, dbDone, sentZpids,
      savedDate: new Date().toDateString(),
    }));
  } catch { /* storage full — ignore */ }
}

export default function MarketScanPage() {
  const navigate = useNavigate();

  const saved = loadSavedSession();

  const [stage, setStage] = useState<Stage>(saved?.stage ?? 0);
  const [results, setResults] = useState<ScoredListing[]>(saved?.results ?? []);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; zip: string } | null>(null);
  const [dbProgress, setDbProgress] = useState<{ current: number; total: number; address: string } | null>(null);
  const [dbDone, setDbDone] = useState(saved?.dbDone ?? 0);
  const [totalScanned, setTotalScanned] = useState(saved?.totalScanned ?? 0);
  const [maxToSend, setMaxToSend] = useState(MAX_TO_SEND);
  const [sentZpids, setSentZpids] = useState<Set<string>>(new Set(saved?.sentZpids ?? []));
  const [scanCooldownDays, setScanCooldownDays] = useState(3);

  const dbAbortRef = useRef(false);

  // Persist to localStorage whenever results/stage/sentZpids change
  useEffect(() => {
    if (results.length > 0 || stage > 0) {
      saveSession(results, stage, totalScanned, dbDone, [...sentZpids]);
    }
  }, [results, stage, totalScanned, dbDone, sentZpids]);

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
    setDbDone(0);
    setTotalScanned(0);
    setSentZpids(new Set());
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    dbAbortRef.current = false;

    const areas = getAreasToScan(scanCooldownDays);
    const toScan = areas.length > 0 ? areas : ['Atlanta, GA']; // fallback if all on cooldown
    const areaHistory = loadAreaHistory();

    const allRaw: RawListing[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < toScan.length; i++) {
      const area = toScan[i];
      setScanProgress({ current: i + 1, total: toScan.length, zip: area });

      try {
        const { data, error } = await supabase.functions.invoke('zillow-search', {
          body: {
            location: area,
            homeType: 'SingleFamily',
            minPrice: MIN_PRICE,
            maxPrice: MAX_PRICE,
            minBeds: MIN_BEDS,
            minSqft: MIN_SQFT,
            maxSqft: MAX_SQFT,
            minYearBuilt: MIN_YEAR,
          },
        });
        if (!error && data?.properties?.length > 0) {
          areaHistory[area] = Date.now();
          saveAreaHistory(areaHistory);
          for (const p of data.properties) {
            const key = p.zpid || (p.address + p.zipcode);
            if (key && seen.has(key)) continue;
            if (key) seen.add(key);
            allRaw.push({
              zpid:          p.zpid ?? '',
              address:       p.address ?? '',
              city:          p.city ?? '',
              state:         p.state ?? '',
              zipcode:       p.zipcode ?? '',
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
              agentName:     p.agentName ?? null,
              agentEmail:    p.agentEmail ?? null,
              agentPhone:    p.agentPhone ?? null,
              brokerName:    p.brokerName ?? null,
            });
          }
        } else if (error) {
          console.warn(`Scan error for ${area}:`, error.message);
        }
      } catch (e) { console.error(`Scan error for ${area}:`, e); }
    }

    const filtered = filterListings(allRaw);
    setTotalScanned(allRaw.length);
    setScanProgress(null);

    // Batch dedup check against existing deals
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
    setStage(4);
    const areaLabel = toScan.length === 1 ? toScan[0] : `${toScan.length} areas`;
    toast.success(`Scan complete — ${filtered.length} properties from ${areaLabel}`);
  }, [scanCooldownDays]);

  // ── Send to DealBeast ─────────────────────────────────────────────────────

  const sendToDealBeast = useCallback(async () => {
    const candidates = nonDupeResults;
    const eligible = candidates.filter(r => r.price > 0 && r.address && !sentZpids.has(r.zpid));

    // Primary pool: score >= MIN_DEAL_SCORE
    const primary = eligible.filter(r => r.dealScore >= MIN_DEAL_SCORE).slice(0, maxToSend);
    // If primary pool is thin, fill remaining slots from next-best unanalyzed
    const toAnalyze = primary.length >= maxToSend
      ? primary
      : [
          ...primary,
          ...eligible
            .filter(r => r.dealScore < MIN_DEAL_SCORE && !primary.includes(r))
            .slice(0, maxToSend - primary.length),
        ];

    setSentZpids(prev => {
      const next = new Set(prev);
      toAnalyze.forEach(r => next.add(r.zpid));
      return next;
    });

    if (!toAnalyze.length) {
      toast.error('No properties with a valid address to analyze');
      return;
    }

    dbAbortRef.current = false;
    setStage(5);
    setDbProgress({ current: 0, total: toAnalyze.length, address: '' });
    setDbDone(0);

    let newCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < toAnalyze.length; i++) {
        if (dbAbortRef.current) break;
        const r = toAnalyze[i];
        const fullAddress = [r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', ');
        setDbProgress({ current: i + 1, total: toAnalyze.length, address: r.address });

        try {
          const scoutAiData = r.aiResult?.raw || null;
          const agentInfo = {
            agentName:  r.agentName  ?? null,
            agentEmail: r.agentEmail ?? null,
            agentPhone: r.agentPhone ?? null,
            brokerName: r.brokerName ?? null,
          };
          // 90-second timeout per property so a hung AI call never blocks the loop
          const timeoutPromise = new Promise<{ dealId: null; error: string }>(res =>
            setTimeout(() => res({ dealId: null, error: 'timeout' }), 90_000)
          );
          const { dealId, alreadyExists } = await Promise.race([
            analyzeAndCreateDeal(fullAddress, scoutAiData ?? undefined, agentInfo),
            timeoutPromise,
          ]);
          if (dealId) {
            if (alreadyExists) skippedCount++;
            else newCount++;
          } else {
            errorCount++;
          }
        } catch {
          errorCount++;
        }

        if (i < toAnalyze.length - 1) await new Promise(r => setTimeout(r, 800));
      }
    } finally {
      setDbProgress(null);
      setDbDone(newCount + skippedCount);
      setStage(6);
      const msg = skippedCount > 0
        ? `${newCount} new deals added · ${skippedCount} already existed${errorCount ? ` · ${errorCount} failed` : ''}`
        : `${newCount} deals analyzed and added${errorCount ? ` · ${errorCount} failed` : ''}`;
      toast.success(msg, {
        action: { label: 'View Deals', onClick: () => navigate('/deals') },
      });
    }
  }, [nonDupeResults, navigate, sentZpids, maxToSend]);

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
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>${MIN_PRICE.toLocaleString()}–${MAX_PRICE.toLocaleString()} · {MIN_SQFT}–{MAX_SQFT} sqft</span>
            <span className="flex items-center gap-1">
              Cooldown:
              <input
                type="number" min={1} max={30}
                value={scanCooldownDays}
                onChange={e => setScanCooldownDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-8 h-5 text-center text-xs rounded border border-border/50 bg-background"
              />
              days ·{' '}
              <span className="text-blue-400">{getAreasToScan(scanCooldownDays).length} areas due</span>
            </span>
          </div>
        </div>

        {/* Pipeline indicator */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <PipelineStep
            num={1} icon={ScanLine} label="Scan Areas"
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
            done={stage >= 4}
            count={stage >= 4 ? `${visibleResults.length} results` : null}
          />
          <ArrowRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
          <PipelineStep
            num={3} icon={Zap} label="DealBeast"
            colorClass="bg-emerald-500/15 text-emerald-400 border-emerald-400/50"
            active={stage === 5}
            done={stage === 6}
            count={dbDone > 0 ? `${dbDone} deals` : null}
          />
        </div>

        {/* Action bar — one button per stage */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scan button — shown at all stages except DealBeast running */}
          {stage !== 5 && (() => {
            const dueCnt = getAreasToScan(scanCooldownDays).length;
            const allOnCooldown = dueCnt === 0;
            const nextMs = allOnCooldown ? getNextScanMs(scanCooldownDays) : null;
            const nextDays = nextMs ? Math.ceil((nextMs - Date.now()) / 86_400_000) : null;
            return (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={stage === 0 ? 'default' : 'outline'}
                  className={cn('h-8 text-xs gap-1.5', allOnCooldown && 'border-amber-500/60 text-amber-400 hover:bg-amber-500/10')}
                  onClick={startScan}
                  disabled={scanInProgress || dbRunning}
                >
                  {scanInProgress ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning…</>
                  ) : (
                    <><ScanLine className="w-3.5 h-3.5" /> Scan</>
                  )}
                </Button>
                {allOnCooldown && !scanInProgress && (
                  <span className="text-[10px] text-amber-400/80">
                    All areas scanned · next in {nextDays ?? '?'}d
                  </span>
                )}
              </div>
            );
          })()}

          {/* Stage 4–5: DealBeast */}
          {(stage === 4 || stage === 5) && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Top</span>
                <input
                  type="number" min={1} max={100}
                  value={maxToSend}
                  onChange={e => setMaxToSend(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={dbRunning}
                  className="w-12 h-7 text-center text-xs font-mono rounded border border-border/60 bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-40"
                />
              </div>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={sendToDealBeast}
                disabled={dbRunning || scanInProgress}
              >
                {dbRunning ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
                ) : (
                  <><Zap className="w-3.5 h-3.5" /> Analyze in DealBeast <span className="opacity-70">({Math.min(maxToSend, nonDupeResults.filter(r => r.dealScore >= MIN_DEAL_SCORE).length)} deals)</span></>
                )}
              </Button>
            </div>
          )}

          {/* Stage 6: Done — View Deals + Re-scan + more deals */}
          {stage === 6 && (() => {
            const candidates = nonDupeResults;
            const remaining = candidates.filter(r => r.price > 0 && r.address && r.dealScore >= MIN_DEAL_SCORE && !sentZpids.has(r.zpid));
            return (
              <>
                {remaining.length > 0 && (
                  <div className="flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-[11px] text-amber-300">{remaining.length} more interesting deal{remaining.length !== 1 ? 's' : ''}</span>
                    <Button
                      size="sm"
                      className="h-6 text-[11px] gap-1 bg-amber-500 hover:bg-amber-600 text-white px-2"
                      onClick={sendToDealBeast}
                      disabled={dbRunning}
                    >
                      <Zap className="w-3 h-3" /> Send them
                    </Button>
                  </div>
                )}
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => navigate('/deals')}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> View Deals
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={startScan}
                  disabled={scanInProgress}
                >
                  <ScanLine className="w-3.5 h-3.5" /> Scan
                </Button>
              </>
            );
          })()}
        </div>

        {/* Scan progress */}
        {scanInProgress && scanProgress && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Scanning {scanProgress.zip}…</span>
              <span>{scanProgress.current} / {scanProgress.total}</span>
            </div>
            <Progress value={(scanProgress.current / scanProgress.total) * 100} className="h-1" />
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
            <p className="text-sm">Click <strong>Scan</strong> to search Atlanta, GA metro for deals.</p>
            <p className="text-xs opacity-60">Filters: ${MIN_PRICE.toLocaleString()}–${MAX_PRICE.toLocaleString()} · {MIN_SQFT}–{MAX_SQFT} sqft · {MIN_BEDS}+ beds · Built {MIN_YEAR}+ · ARV margin ≥ {((1 - MAX_PRICE_RATIO) * 100).toFixed(0)}%</p>
          </div>
        )}

        {stage === 1 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground gap-3">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            <p className="text-sm">Scanning Atlanta metro (~800 listings)…</p>
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
