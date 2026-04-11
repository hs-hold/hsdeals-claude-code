import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { analyzeAndCreateDeal } from '@/services/deals/analyzeAndCreateDeal';
import { useNavigate } from 'react-router-dom';
import {
  ScanLine, ExternalLink, Clock, CheckCircle2, XCircle,
  Loader2, ChevronDown, ChevronUp, Calendar,
  Home, DollarSign, Zap, Download,
  Pencil, X, Plus, MapPin, Brain,
  Filter, ArrowRight, AlertTriangle, Check,
} from 'lucide-react';
import atlantaZipsRaw from '@/data/atlantaZips.json';
import { cn } from '@/lib/utils';

// ─── Atlanta ZIP data ────────────────────────────────────────────────────────

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

// ─── Types ──────────────────────────────────────────────────────────────────

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
  type: string;      // house | land | fire_damaged | teardown | other
  summary: string;   // short reason
}

interface PassedListing extends RawListing {
  margin: number;      // 1 - price/zestimate
  grossYield: number;  // rentZestimate*12 / price
  dealScore: number;   // 0–100
  aiResult: AiResult | null;
}

interface ScanSession {
  id: string;
  zips: string[];
  scannedAt: string;
  totalScanned: number;
  totalPassed: number;
  results: PassedListing[];
}

// ─── Filter constants ────────────────────────────────────────────────────────

const MIN_PRICE       = 80_000;
const MAX_PRICE       = 250_000;
const MAX_PRICE_RATIO = 0.80;   // price/zestimate ≤ 80% → margin ≥ 20%
const MIN_SQFT        = 1_200;
const MAX_SQFT        = 1_800;
const MIN_BEDS        = 2;
const MIN_YEAR        = 1950;

// ─── Deal Score (no DOM — removed) ───────────────────────────────────────────
//
//  60 pts  price discount  : (1 - price/zestimate) * 60
//  40 pts  rent yield      : (rentZestimate*12/price) * 400  [capped at 40]
//
function calcDealScore(l: RawListing): number {
  const discountPts = l.zestimate
    ? Math.max(0, (1 - l.price / l.zestimate) * 60)
    : 0;

  const yieldPts = l.rentZestimate
    ? Math.min(40, (l.rentZestimate * 12 / l.price) * 400)
    : 0;

  return Math.round(discountPts + yieldPts);
}

// ─── Post-scan filter ────────────────────────────────────────────────────────
// (API-level filters handle most criteria; this catches any stragglers)

function filterListings(listings: RawListing[]): PassedListing[] {
  const passed: PassedListing[] = [];

  for (const l of listings) {
    if (l.price < MIN_PRICE || l.price > MAX_PRICE) continue;
    if (l.propertyType && l.propertyType !== 'SINGLE_FAMILY') continue;
    if (!l.rentZestimate) continue;
    if (l.zestimate && l.price / l.zestimate > MAX_PRICE_RATIO) continue;
    // Year built — only filter if we have the value
    if (l.yearBuilt && l.yearBuilt < MIN_YEAR) continue;
    // Sqft — only filter if we have the value
    if (l.sqft) {
      if (l.sqft < MIN_SQFT || l.sqft > MAX_SQFT) continue;
    }
    // Beds — only filter if we have the value
    if (l.bedrooms !== null && l.bedrooms < MIN_BEDS) continue;

    passed.push({
      ...l,
      margin:     l.zestimate ? 1 - l.price / l.zestimate : 0,
      grossYield: (l.rentZestimate! * 12) / l.price,
      dealScore:  calcDealScore(l),
      aiResult:   null,
    });
  }

  return passed.sort((a, b) => b.dealScore - a.dealScore);
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function saveScanSession(
  zips: string[],
  results: PassedListing[],
  totalScanned: number,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: search, error } = await supabase
    .from('scout_searches')
    .insert({ zip: zips.join(','), max_price: MAX_PRICE, result_count: results.length, user_id: user.id })
    .select('id').single();

  if (error || !search) { console.error('Save search error:', error); return null; }

  if (results.length > 0) {
    const rows = results.map(r => ({
      search_id:      search.id,
      zpid:           r.zpid,
      address:        [r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', '),
      price:          r.price,
      arv:            r.zestimate ?? null,
      rent:           r.rentZestimate ?? null,
      days_on_market: r.daysOnZillow ?? null,
      beds:           r.bedrooms ?? null,
      baths:          r.bathrooms ?? null,
      sqft:           r.sqft ?? null,
      img_src:        r.imgSrc ?? null,
      detail_url:     r.detailUrl ?? null,
      score:          r.dealScore,
      grade:          r.dealScore >= 70 ? 'A' : r.dealScore >= 50 ? 'B' : 'C',
      rehab:          0,
      spread:         r.zestimate ? r.zestimate - r.price : null,
      cap_rate:       parseFloat((r.grossYield * 100).toFixed(2)),
    }));
    await supabase.from('scout_results').insert(rows);
  }

  return search.id;
}

async function loadScanHistory(): Promise<ScanSession[]> {
  const { data: searches } = await supabase
    .from('scout_searches')
    .select('id, zip, result_count, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!searches?.length) return [];

  const sessions: ScanSession[] = [];
  for (const s of searches.slice(0, 20)) {
    const { data: results } = await supabase
      .from('scout_results').select('*').eq('search_id', s.id);

    const listings: PassedListing[] = (results || []).map((r: any) => {
      const price     = r.price ?? 0;
      const zestimate = r.arv ?? null;
      const rent      = r.rent ?? null;
      const margin    = zestimate && price ? 1 - price / zestimate : 0;
      const grossYield = rent && price ? (rent * 12) / price : 0;
      const raw: RawListing = {
        zpid: r.zpid, address: r.address?.split(',')[0] ?? '',
        city: r.address?.split(',')[1]?.trim() ?? '',
        state: r.address?.split(',')[2]?.trim() ?? '',
        zipcode: r.address?.split(',')[3]?.trim() ?? '',
        price, zestimate, rentZestimate: rent,
        daysOnZillow: r.days_on_market ?? null,
        bedrooms: r.beds ?? null, bathrooms: r.baths ?? null,
        sqft: r.sqft ?? null, yearBuilt: null, propertyType: 'SINGLE_FAMILY',
        imgSrc: r.img_src ?? null, detailUrl: r.detail_url ?? null,
      };
      return { ...raw, margin, grossYield, dealScore: r.score ?? calcDealScore(raw), aiResult: null };
    }).sort((a: PassedListing, b: PassedListing) => b.dealScore - a.dealScore);

    sessions.push({
      id: s.id, zips: s.zip.split(','), scannedAt: s.created_at,
      totalScanned: 0, totalPassed: s.result_count, results: listings,
    });
  }

  // Deduplicate: keep only the most recent session per ZIP set
  const seen = new Set<string>();
  return sessions.filter(s => {
    const key = [...s.zips].sort().join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(results: PassedListing[]) {
  const headers = [
    'Rank', 'Score', 'Address', 'City', 'State', 'ZIP',
    'Price', 'Zestimate', 'Margin%', 'Rent/mo', 'GrossYield%',
    'Beds', 'Baths', 'Sqft', 'YearBuilt', 'DaysOnMarket', 'AI', 'ZillowURL',
  ];
  const rows = results.map((r, i) => [
    i + 1, r.dealScore,
    `"${r.address}"`, `"${r.city}"`, r.state, r.zipcode,
    r.price, r.zestimate ?? '',
    (r.margin * 100).toFixed(1),
    r.rentZestimate ?? '',
    (r.grossYield * 100).toFixed(1),
    r.bedrooms ?? '', r.bathrooms ?? '',
    r.sqft ?? '', r.yearBuilt ?? '',
    r.daysOnZillow ?? '',
    r.aiResult ? r.aiResult.status : '',
    `"${r.detailUrl ?? ''}"`,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `scout-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  if (result.status === 'pass') return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-400 font-medium">
      <Check className="w-3 h-3" /> OK
    </span>
  );
  if (result.status === 'fail') return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-red-400 font-medium" title={result.summary}>
      <XCircle className="w-3 h-3" /> {result.type === 'land' ? 'Land' : result.type === 'fire_damaged' ? 'Fire' : result.type === 'teardown' ? 'Demo' : 'Skip'}
    </span>
  );
  if (result.status === 'pending') return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
  return <AlertTriangle className="w-3 h-3 text-amber-400" />;
}

// ─── Funnel Stage Chip ────────────────────────────────────────────────────────

function FunnelStage({
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function DealScannerPage() {
  const navigate = useNavigate();

  // ZIP management
  const [activeZips, setActiveZips]   = useState<AtlantaZip[]>(DEFAULT_ZIPS);
  const [editMode, setEditMode]       = useState(false);
  const [addZipInput, setAddZipInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress]     = useState<{ current: number; total: number; zip: string } | null>(null);
  const [session, setSession]       = useState<ScanSession | null>(null);
  const [history, setHistory]       = useState<ScanSession[]>([]);
  const [scanPage, setScanPage] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('deal_scanner_page') ?? '1') || 1; } catch { return 1; }
  });

  // AI pre-filter state
  const [aiRunning, setAiRunning] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ current: number; total: number } | null>(null);
  const aiAbortRef = useRef(false);

  // DealBeast send state
  const [dbRunning, setDbRunning] = useState(false);
  const [dbProgress, setDbProgress] = useState<{ current: number; total: number; address: string } | null>(null);
  const [dbDone, setDbDone] = useState(0);
  const dbAbortRef = useRef(false);

  // How many to send to DealBeast / AI filter
  const [topNInput, setTopNInput] = useState(10);

  useEffect(() => { loadScanHistory().then(setHistory); }, []);

  // ── ZIP helpers ──────────────────────────────────────────────────────────

  const removeZip = useCallback((zip: string) => {
    setActiveZips(prev => prev.filter(z => z.zip !== zip));
  }, []);

  const handleAddZip = useCallback(() => {
    const code = addZipInput.trim();
    if (!/^\d{5}$/.test(code)) { toast.error('Enter a valid 5-digit ZIP code'); return; }
    if (activeZips.some(z => z.zip === code)) { toast.info('ZIP already in list'); return; }
    const known = ATLANTA_ZIPS.find(z => z.zip === code);
    const newEntry: AtlantaZip = known ?? { zip: code, city: 'Custom', lat: 0, lng: 0, medianHomeValue: 0, crimeIndex: 0, distanceMiles: 0 };
    setActiveZips(prev => [...prev, newEntry]);
    setAddZipInput('');
  }, [addZipInput, activeZips]);

  const resetToDefault = useCallback(() => {
    setActiveZips(DEFAULT_ZIPS);
    toast.success('Reset to default Atlanta ZIP list');
  }, []);

  const resetPage = useCallback(() => {
    setScanPage(1);
    try { localStorage.setItem('deal_scanner_page', '1'); } catch {}
    toast.success('Reset to batch #1');
  }, []);

  // ── Scan ──────────────────────────────────────────────────────────────────

  const startScan = useCallback(async () => {
    const zips = activeZips.map(z => z.zip);
    if (!zips.length) return;

    const currentPage = scanPage;
    const nextPage = currentPage + 1;
    setScanPage(nextPage);
    try { localStorage.setItem('deal_scanner_page', String(nextPage)); } catch {}

    setIsScanning(true);
    setSession(null);
    setDbDone(0);
    const allRaw: RawListing[] = [];

    for (let i = 0; i < zips.length; i++) {
      const zip = zips[i];
      setProgress({ current: i + 1, total: zips.length, zip });

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
            page: currentPage,
          },
        });
        if (!error && data?.properties) {
          allRaw.push(...data.properties.map((p: any) => ({
            zpid:         p.zpid ?? '',
            address:      p.address ?? '',
            city:         p.city ?? '',
            state:        p.state ?? '',
            zipcode:      p.zipcode ?? zip,
            price:        p.price ?? 0,
            zestimate:    p.zestimate ?? null,
            rentZestimate: p.rentZestimate ?? null,
            daysOnZillow: p.daysOnZillow ?? null,
            bedrooms:     p.bedrooms ?? null,
            bathrooms:    p.bathrooms ?? null,
            sqft:         p.sqft ?? null,
            yearBuilt:    p.yearBuilt ?? null,
            propertyType: p.propertyType ?? null,
            imgSrc:       p.imgSrc ?? null,
            detailUrl:    p.detailUrl ?? null,
          })));
        }
      } catch (e) { console.error(`ZIP ${zip}:`, e); }

      if (i < zips.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    const passed = filterListings(allRaw);
    const newSession: ScanSession = {
      id: 'pending', zips, scannedAt: new Date().toISOString(),
      totalScanned: allRaw.length, totalPassed: passed.length, results: passed,
    };
    setSession(newSession);

    const savedId = await saveScanSession(zips, passed, allRaw.length);
    if (savedId) { newSession.id = savedId; setSession({ ...newSession }); }

    const updated = await loadScanHistory();
    setHistory(updated);
    setProgress(null);
    setIsScanning(false);
    toast.success(`Scan complete — ${passed.length} deals passed filters`);
  }, [activeZips, scanPage]);

  // ── AI Pre-filter ─────────────────────────────────────────────────────────

  const runAiFilter = useCallback(async () => {
    if (!session?.results.length) return;
    aiAbortRef.current = false;
    setAiRunning(true);

    const toCheck = session.results.slice(0, topNInput);
    setAiProgress({ current: 0, total: toCheck.length });

    const updatedResults = [...session.results];

    // Mark all topN as pending
    for (let i = 0; i < toCheck.length; i++) {
      updatedResults[i] = { ...updatedResults[i], aiResult: { status: 'pending', type: '', summary: '' } };
    }
    setSession(s => s ? { ...s, results: updatedResults } : s);

    for (let i = 0; i < toCheck.length; i++) {
      if (aiAbortRef.current) break;
      const r = toCheck[i];
      setAiProgress({ current: i + 1, total: toCheck.length });

      const dealPayload = {
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
      };

      try {
        const { data, error } = await supabase.functions.invoke('scout-ai-analyze', {
          body: { deal: dealPayload },
        });

        if (error || !data) {
          updatedResults[i] = { ...updatedResults[i], aiResult: { status: 'error', type: 'unknown', summary: 'API error' } };
        } else {
          const isGood = data.isHabitableStructure !== false &&
            !['land', 'fire_damaged', 'teardown'].includes(data.propertyTypeDetected);
          updatedResults[i] = {
            ...updatedResults[i],
            aiResult: {
              status: isGood ? 'pass' : 'fail',
              type: data.propertyTypeDetected || 'house',
              summary: data.rehabAnalysis?.scopeDetails || data.arvAnalysis?.reasoning || '',
            },
          };
        }
      } catch {
        updatedResults[i] = { ...updatedResults[i], aiResult: { status: 'error', type: 'unknown', summary: 'Error' } };
      }

      setSession(s => s ? { ...s, results: [...updatedResults] } : s);
      if (i < toCheck.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    setAiRunning(false);
    setAiProgress(null);
    const passed = updatedResults.filter(r => r.aiResult?.status === 'pass').length;
    const failed = updatedResults.filter(r => r.aiResult?.status === 'fail').length;
    toast.success(`AI filter done — ${passed} passed, ${failed} rejected`);
  }, [session, topNInput]);

  // ── Send to DealBeast ─────────────────────────────────────────────────────

  const sendToDealBeast = useCallback(async () => {
    if (!session?.results.length) return;
    dbAbortRef.current = false;
    setDbRunning(true);
    setDbDone(0);

    // Prefer AI-passed listings; fall back to top N by score
    const aiPassed = session.results.filter(r => r.aiResult?.status === 'pass');
    const toAnalyze = aiPassed.length > 0
      ? aiPassed.slice(0, topNInput)
      : session.results.slice(0, topNInput);

    setDbProgress({ current: 0, total: toAnalyze.length, address: '' });

    let newCount = 0;
    let skippedCount = 0;
    for (let i = 0; i < toAnalyze.length; i++) {
      if (dbAbortRef.current) break;
      const r = toAnalyze[i];
      const fullAddress = [r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', ');
      setDbProgress({ current: i + 1, total: toAnalyze.length, address: r.address });

      const { dealId, alreadyExists } = await analyzeAndCreateDeal(fullAddress);
      if (dealId) {
        if (alreadyExists) skippedCount++;
        else newCount++;
      }

      if (i < toAnalyze.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    setDbRunning(false);
    setDbProgress(null);
    setDbDone(newCount + skippedCount);
    const msg = skippedCount > 0
      ? `${newCount} new deals added · ${skippedCount} already existed`
      : `${newCount} deals analyzed and added to Hot Deals`;
    toast.success(msg, {
      action: { label: 'View Deals', onClick: () => navigate('/deals') },
    });
  }, [session, topNInput, navigate]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const currentResults = session?.results ?? [];
  const effectiveTopN  = Math.min(topNInput, currentResults.length);

  const aiPassedCount = currentResults.filter(r => r.aiResult?.status === 'pass').length;
  const aiCheckedCount = currentResults.filter(r => r.aiResult && r.aiResult.status !== 'pending').length;
  const hasAiResults = aiCheckedCount > 0;

  // Pipeline stage
  const stage = isScanning ? 1 : !session ? 0 : aiRunning ? 2 : dbRunning ? 3 : session ? 2 : 1;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/50 bg-card/40 space-y-3">

        {/* Title + history */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-emerald-400" />
            <h1 className="font-semibold text-base">Scout Pipeline</h1>
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-400/30 text-[10px]">
              4-Stage Funnel
            </Badge>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
            onClick={() => setHistoryOpen(v => !v)}>
            <Clock className="w-3.5 h-3.5" />
            History ({history.length})
            {historyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>

        {/* ── Pipeline funnel ───────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <FunnelStage
            num={1} icon={ScanLine} label="Zillow Scan"
            colorClass="bg-blue-500/15 text-blue-400 border-blue-400/50"
            active={stage === 1 || stage >= 1}
            done={!!session}
            count={session ? `${session.totalScanned > 0 ? session.totalScanned : session.zips.length + ' zips'}` : null}
          />
          <ArrowRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
          <FunnelStage
            num={2} icon={Filter} label="Smart Filter"
            colorClass="bg-violet-500/15 text-violet-400 border-violet-400/50"
            active={!!session}
            done={!!session}
            count={session ? `${session.totalPassed}` : null}
          />
          <ArrowRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
          <FunnelStage
            num={3} icon={Brain} label="AI Check"
            colorClass="bg-amber-500/15 text-amber-400 border-amber-400/50"
            active={aiRunning || hasAiResults}
            done={hasAiResults}
            count={hasAiResults ? `${aiPassedCount} ok` : null}
          />
          <ArrowRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
          <FunnelStage
            num={4} icon={Zap} label="DealBeast"
            colorClass="bg-emerald-500/15 text-emerald-400 border-emerald-400/50"
            active={dbRunning || dbDone > 0}
            done={dbDone > 0}
            count={dbDone > 0 ? `${dbDone} deals` : null}
          />
        </div>

        {/* ── ZIP strip + scan button ────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border border-border/50 min-h-[38px]">
            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium">
              Atlanta Metro —{' '}
              <span className="text-emerald-400">{activeZips.length} ZIPs</span>
            </span>
            {/* Batch indicator */}
            <span className="ml-auto flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-muted-foreground/70">Batch</span>
              <span className="text-[11px] font-semibold font-mono text-violet-400 bg-violet-500/10 border border-violet-500/30 px-1.5 py-0.5 rounded">
                #{scanPage}
              </span>
              {scanPage > 1 && (
                <button onClick={resetPage} disabled={isScanning}
                  className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-40"
                  title="Reset to batch #1">
                  ↺ reset
                </button>
              )}
            </span>
            <button
              onClick={() => setEditMode(v => !v)}
              disabled={isScanning}
              className={cn(
                'flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors',
                editMode
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}>
              <Pencil className="w-3 h-3" />
              {editMode ? 'Done' : 'Edit ZIPs'}
            </button>
          </div>

          <Button onClick={startScan}
            disabled={isScanning || aiRunning || dbRunning || activeZips.length === 0}
            className="h-9 px-5 text-sm gap-2 bg-emerald-600 hover:bg-emerald-500">
            {isScanning
              ? <><Loader2 className="w-4 h-4 animate-spin" />Scanning...</>
              : <><ScanLine className="w-4 h-4" />Scan ZIPs</>}
          </Button>
        </div>

        {/* Filter legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
          <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />$80K–$250K</span>
          <span>·</span>
          <span className="flex items-center gap-1"><Home className="w-3 h-3" />Single Family</span>
          <span>·</span>
          <span>≥ {MIN_BEDS} beds</span>
          <span>·</span>
          <span>{MIN_SQFT.toLocaleString()}–{MAX_SQFT.toLocaleString()} sqft</span>
          <span>·</span>
          <span>Built ≥ {MIN_YEAR}</span>
          <span>·</span>
          <span>Margin ≥ 20%</span>
          <span>·</span>
          <span>Rent required</span>
          <span className="ml-2 pl-2 border-l border-border/40 font-medium text-muted-foreground">
            Score: 60pts discount + 40pts yield
          </span>
        </div>

        {/* ZIP edit panel */}
        {editMode && (
          <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {activeZips.map(z => (
                <span key={z.zip}
                  className="inline-flex items-center gap-1 text-[11px] font-mono bg-card border border-border/60 rounded px-1.5 py-0.5">
                  <span className="text-foreground">{z.zip}</span>
                  <span className="text-muted-foreground/60">{z.city}</span>
                  <button onClick={() => removeZip(z.zip)}
                    className="ml-0.5 text-muted-foreground/40 hover:text-red-400 transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border/30">
              <input
                type="text" value={addZipInput}
                onChange={e => setAddZipInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddZip()}
                placeholder="Add ZIP..." maxLength={5}
                className="h-7 w-28 text-xs font-mono px-2 rounded bg-background border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleAddZip}>
                <Plus className="w-3 h-3" /> Add
              </Button>
              <button onClick={resetToDefault}
                className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground ml-auto transition-colors">
                Reset to default
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── History dropdown ───────────────────────────────────────────────── */}
      {historyOpen && (
        <div className="shrink-0 border-b border-border/50 bg-card/60 max-h-44 overflow-y-auto">
          {history.length === 0
            ? <p className="text-xs text-muted-foreground p-4">No past scans yet</p>
            : history.map(s => (
              <button key={s.id} onClick={() => { setSession(s); setHistoryOpen(false); setDbDone(0); }}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors text-left">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-mono">
                    {new Date(s.scannedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.zips.slice(0, 4).join(', ')}{s.zips.length > 4 ? ` +${s.zips.length - 4}` : ''}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/40">
                  {s.totalPassed} passed
                </Badge>
              </button>
            ))}
        </div>
      )}

      {/* ── Scan progress bar ──────────────────────────────────────────────── */}
      {isScanning && progress && (
        <div className="shrink-0 px-4 py-2 bg-card/40 border-b border-border/50 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
              Scanning ZIP {progress.zip}…
            </span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-1" />
        </div>
      )}

      {/* ── AI filter progress bar ────────────────────────────────────────── */}
      {aiRunning && aiProgress && (
        <div className="shrink-0 px-4 py-2 bg-amber-500/5 border-b border-amber-500/20 space-y-1">
          <div className="flex items-center justify-between text-xs text-amber-400/80">
            <span className="flex items-center gap-1.5">
              <Brain className="w-3 h-3 animate-pulse" />
              Running AI check…
            </span>
            <div className="flex items-center gap-2">
              <span>{aiProgress.current} / {aiProgress.total}</span>
              <button onClick={() => { aiAbortRef.current = true; }}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Stop
              </button>
            </div>
          </div>
          <Progress value={(aiProgress.current / aiProgress.total) * 100} className="h-1" />
        </div>
      )}

      {/* ── DealBeast progress bar ────────────────────────────────────────── */}
      {dbRunning && dbProgress && (
        <div className="shrink-0 px-4 py-2 bg-emerald-500/5 border-b border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-400/80">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3 h-3 animate-pulse" />
              DealBeast analyzing: <span className="font-medium truncate max-w-[200px]">{dbProgress.address}</span>
            </span>
            <div className="flex items-center gap-2">
              <span>{dbProgress.current} / {dbProgress.total}</span>
              <button onClick={() => { dbAbortRef.current = true; }}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Stop
              </button>
            </div>
          </div>
          <Progress value={(dbProgress.current / dbProgress.total) * 100} className="h-1" />
        </div>
      )}

      {/* ── Stats + action bar ────────────────────────────────────────────── */}
      {session && (
        <div className="shrink-0 px-4 py-2 bg-card/30 border-b border-border/50 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {/* Stats */}
          {session.totalScanned > 0 && (
            <>
              <span className="flex items-center gap-1">
                <ScanLine className="w-3.5 h-3.5" />
                {session.totalScanned} raw
              </span>
              <span>→</span>
            </>
          )}
          <span className="flex items-center gap-1 text-violet-400 font-medium">
            <Filter className="w-3.5 h-3.5" />
            {session.totalPassed} filtered
          </span>
          {hasAiResults && (
            <>
              <span>→</span>
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <Brain className="w-3.5 h-3.5" />
                {aiPassedCount} AI-passed
              </span>
            </>
          )}
          {dbDone > 0 && (
            <>
              <span>→</span>
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {dbDone} in Hot Deals
              </span>
            </>
          )}

          {/* Spacer */}
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">

            {/* Top-N picker */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]">Top</span>
              <input
                type="number" min={1} max={currentResults.length || 1}
                value={topNInput}
                onChange={e => setTopNInput(Math.max(1, Math.min(currentResults.length || 1, parseInt(e.target.value) || 1)))}
                disabled={currentResults.length === 0 || aiRunning || dbRunning}
                className="w-12 h-7 text-center text-xs font-mono rounded border border-border/60 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50 disabled:opacity-40"
              />
              <span className="text-[11px]">of {currentResults.length}</span>
            </div>

            {/* CSV */}
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
              onClick={() => { exportCSV(currentResults); toast.success(`Exported ${currentResults.length} listings`); }}
              disabled={currentResults.length === 0}>
              <Download className="w-3.5 h-3.5" />
              CSV
            </Button>

            {/* AI Filter */}
            <Button size="sm" variant="outline"
              className="h-7 text-xs gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
              onClick={runAiFilter}
              disabled={aiRunning || dbRunning || isScanning || currentResults.length === 0}>
              {aiRunning
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />AI Checking…</>
                : <><Brain className="w-3.5 h-3.5" />AI Filter ({effectiveTopN})</>}
            </Button>

            {/* Send to DealBeast */}
            <Button size="sm"
              className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500"
              onClick={sendToDealBeast}
              disabled={dbRunning || aiRunning || isScanning || currentResults.length === 0}>
              {dbRunning
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing…</>
                : <><Zap className="w-3.5 h-3.5" />
                    {hasAiResults && aiPassedCount > 0
                      ? `Send ${Math.min(topNInput, aiPassedCount)} AI-Passed`
                      : `Send ${effectiveTopN} to DealBeast`
                    }
                  </>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Results table ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">

        {!session && !isScanning && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="flex items-center gap-3 mb-4 text-muted-foreground/20">
              <ScanLine className="w-8 h-8" />
              <ArrowRight className="w-5 h-5" />
              <Filter className="w-8 h-8" />
              <ArrowRight className="w-5 h-5" />
              <Brain className="w-8 h-8" />
              <ArrowRight className="w-5 h-5" />
              <Zap className="w-8 h-8" />
            </div>
            <p className="text-muted-foreground text-sm font-medium">
              Scan {activeZips.length} Atlanta Metro ZIPs to find deals
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
              Filters: ${MIN_PRICE.toLocaleString()}–${MAX_PRICE.toLocaleString()} · ≥{MIN_BEDS} beds · {MIN_SQFT.toLocaleString()}–{MAX_SQFT.toLocaleString()} sqft · built ≥{MIN_YEAR} · margin ≥20%
            </p>
          </div>
        )}

        {session && currentResults.length === 0 && !isScanning && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <XCircle className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground text-sm">No listings passed all filters</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Try a different batch or relax the filter criteria</p>
          </div>
        )}

        {currentResults.length > 0 && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card/90 backdrop-blur-sm border-b border-border/50 z-10">
              <tr className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                <th className="text-center px-2 py-2.5 w-10">#</th>
                <th className="text-center px-2 py-2.5 w-14">Score</th>
                <th className="text-left px-3 py-2.5">Address</th>
                <th className="text-right px-2 py-2.5">Price</th>
                <th className="text-right px-2 py-2.5">ARV</th>
                <th className="text-right px-2 py-2.5">Margin</th>
                <th className="text-right px-2 py-2.5">Rent/mo</th>
                <th className="text-right px-2 py-2.5">Yield</th>
                <th className="text-right px-2 py-2.5">Beds</th>
                <th className="text-right px-2 py-2.5">Sqft</th>
                <th className="text-right px-2 py-2.5">Year</th>
                <th className="text-center px-2 py-2.5 w-14">AI</th>
                <th className="text-center px-2 py-2.5 w-10">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {currentResults.map((r, idx) => {
                const isAiFailed = r.aiResult?.status === 'fail';
                const isTopN = idx < effectiveTopN;
                return (
                  <tr key={r.zpid || idx}
                    className={cn(
                      'hover:bg-muted/20 transition-colors',
                      isAiFailed && 'opacity-40',
                      isTopN && !isAiFailed && 'border-l-2 border-l-violet-500/40',
                    )}>

                    {/* Rank */}
                    <td className="px-2 py-2 text-center text-[11px] text-muted-foreground/50 font-mono">
                      {idx + 1}
                    </td>

                    {/* Score */}
                    <td className="px-2 py-2 text-center">
                      <ScoreBadge score={r.dealScore} />
                    </td>

                    {/* Address + thumbnail */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {r.imgSrc && (
                          <img src={r.imgSrc} alt="" className="w-10 h-8 object-cover rounded flex-shrink-0 opacity-80" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-foreground leading-tight text-xs truncate max-w-[200px]">
                            {r.address}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{r.city}, {r.state} {r.zipcode}</div>
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="px-2 py-2 text-right font-mono text-xs font-semibold">
                      {fmt$(r.price)}
                    </td>

                    {/* Zestimate */}
                    <td className="px-2 py-2 text-right font-mono text-xs text-muted-foreground">
                      {r.zestimate ? fmt$(r.zestimate) : '—'}
                    </td>

                    {/* Margin */}
                    <td className="px-2 py-2 text-right">
                      <span className={cn(
                        'text-[11px] font-semibold px-1.5 py-0.5 rounded',
                        r.margin >= 0.25 ? 'bg-emerald-500/15 text-emerald-400' :
                        r.margin >= 0.20 ? 'bg-emerald-500/10 text-emerald-400/80' :
                        'bg-amber-500/10 text-amber-400'
                      )}>
                        {fmtPct(r.margin)}
                      </span>
                    </td>

                    {/* Rent */}
                    <td className="px-2 py-2 text-right font-mono text-xs text-cyan-400">
                      {r.rentZestimate ? fmt$(r.rentZestimate) : '—'}
                    </td>

                    {/* Gross yield */}
                    <td className="px-2 py-2 text-right text-xs">
                      <span className={cn(
                        'font-semibold',
                        r.grossYield >= 0.09 ? 'text-emerald-400' :
                        r.grossYield >= 0.07 ? 'text-amber-400' :
                        'text-muted-foreground'
                      )}>
                        {fmtPct(r.grossYield)}
                      </span>
                    </td>

                    {/* Beds */}
                    <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                      {r.bedrooms ?? '?'}bd
                    </td>

                    {/* Sqft */}
                    <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                      {r.sqft ? r.sqft.toLocaleString() : '—'}
                    </td>

                    {/* Year Built */}
                    <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                      {r.yearBuilt ?? '—'}
                    </td>

                    {/* AI Status */}
                    <td className="px-2 py-2 text-center">
                      <AiBadge result={r.aiResult} />
                    </td>

                    {/* Zillow link */}
                    <td className="px-2 py-2 text-center">
                      {r.detailUrl
                        ? <a href={r.detailUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
