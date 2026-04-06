import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  ScanLine, ExternalLink, Clock, CheckCircle2, XCircle,
  Loader2, ChevronDown, ChevronUp, Calendar,
  TrendingUp, Home, DollarSign, Zap, Download,
  Pencil, X, Plus, MapPin,
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

// Sort by distance so closest ZIPs are first
const DEFAULT_ZIPS = [...ATLANTA_ZIPS].sort((a, b) => a.distanceMiles - b.distanceMiles);

// ─── Types ─────────────────────────────────────────────────────────────────

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
  propertyType: string | null;
  imgSrc: string | null;
  detailUrl: string | null;
}

interface PassedListing extends RawListing {
  margin: number;      // 1 - price/zestimate
  grossYield: number;  // rentZestimate*12 / price
  dealScore: number;   // 0–100 composite score
}

interface ScanSession {
  id: string;
  zips: string[];
  scannedAt: string;
  totalScanned: number;
  totalPassed: number;
  results: PassedListing[];
}

// ─── Filter constants ───────────────────────────────────────────────────────

const MAX_PRICE       = 250_000;
const MAX_PRICE_RATIO = 0.85;
const MIN_DAYS        = 30;
const MIN_SQFT        = 1_200;
const TOP_N           = 25;

// ─── Deal Score ─────────────────────────────────────────────────────────────
//
//  40 pts  price discount  : (1 - price/zestimate) * 40
//  40 pts  rent yield      : (rentZestimate*12/price) * 400  [capped at 40]
//  20 pts  days on market  : >60d → 20, >30d → 10, else 0
//
function calcDealScore(l: RawListing): number {
  const discountPts = l.zestimate
    ? Math.max(0, (1 - l.price / l.zestimate) * 40)
    : 0;

  const yieldPts = l.rentZestimate
    ? Math.min(40, (l.rentZestimate * 12 / l.price) * 400)
    : 0;

  const daysPts =
    (l.daysOnZillow ?? 0) > 60 ? 20 :
    (l.daysOnZillow ?? 0) > 30 ? 10 : 0;

  return Math.round(discountPts + yieldPts + daysPts);
}

// ─── Filter logic ───────────────────────────────────────────────────────────

function filterListings(listings: RawListing[]): PassedListing[] {
  const passed: PassedListing[] = [];

  for (const l of listings) {
    if (l.price > MAX_PRICE) continue;
    if (l.propertyType && l.propertyType !== 'SINGLE_FAMILY') continue;
    if (!l.rentZestimate) continue;
    if (l.zestimate && l.price / l.zestimate > MAX_PRICE_RATIO) continue;
    if ((l.daysOnZillow ?? 0) <= MIN_DAYS) continue;

    passed.push({
      ...l,
      margin:     l.zestimate ? 1 - l.price / l.zestimate : 0,
      grossYield: (l.rentZestimate! * 12) / l.price,
      dealScore:  calcDealScore(l),
    });
  }

  // Sort by dealScore descending immediately
  return passed.sort((a, b) => b.dealScore - a.dealScore);
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function saveScanSession(
  zips: string[],
  results: PassedListing[],
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
    .limit(30);

  if (!searches?.length) return [];

  const sessions: ScanSession[] = [];
  for (const s of searches) {
    const { data: results } = await supabase
      .from('scout_results').select('*').eq('search_id', s.id);

    const listings: PassedListing[] = (results || []).map((r: any) => {
      const price       = r.price ?? 0;
      const zestimate   = r.arv ?? null;
      const rent        = r.rent ?? null;
      const margin      = zestimate && price ? 1 - price / zestimate : 0;
      const grossYield  = rent && price ? (rent * 12) / price : 0;
      const raw: RawListing = {
        zpid: r.zpid, address: r.address?.split(',')[0] ?? '',
        city: r.address?.split(',')[1]?.trim() ?? '',
        state: r.address?.split(',')[2]?.trim() ?? '',
        zipcode: r.address?.split(',')[3]?.trim() ?? '',
        price, zestimate, rentZestimate: rent,
        daysOnZillow: r.days_on_market ?? null,
        bedrooms: r.beds ?? null, bathrooms: r.baths ?? null,
        sqft: r.sqft ?? null, propertyType: 'SINGLE_FAMILY',
        imgSrc: r.img_src ?? null, detailUrl: r.detail_url ?? null,
      };
      return { ...raw, margin, grossYield, dealScore: r.score ?? calcDealScore(raw) };
    }).sort((a: PassedListing, b: PassedListing) => b.dealScore - a.dealScore);

    sessions.push({
      id: s.id, zips: s.zip.split(','), scannedAt: s.created_at,
      totalScanned: 0, totalPassed: s.result_count, results: listings,
    });
  }
  return sessions;
}

// ─── CSV export ─────────────────────────────────────────────────────────────

function exportCSV(results: PassedListing[]) {
  const headers = [
    'Rank','Score','Address','City','State','ZIP','Price','Zestimate',
    'Margin%','Rent/mo','GrossYield%','DaysOnMarket','Beds','Baths','Sqft','ZillowURL',
  ];
  const rows = results.map((r, i) => [
    i + 1,
    r.dealScore,
    `"${r.address}"`,
    `"${r.city}"`,
    r.state,
    r.zipcode,
    r.price,
    r.zestimate ?? '',
    (r.margin * 100).toFixed(1),
    r.rentZestimate ?? '',
    (r.grossYield * 100).toFixed(1),
    r.daysOnZillow ?? '',
    r.bedrooms ?? '',
    r.bathrooms ?? '',
    r.sqft ?? '',
    `"${r.detailUrl ?? ''}"`,
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `deal-scanner-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmt$(n: number) { return '$' + n.toLocaleString(); }
function fmtPct(n: number) { return (n * 100).toFixed(1) + '%'; }

// ─── Score badge ─────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function DealScannerPage() {
  // Active ZIP list — starts from the curated Atlanta dataset
  const [activeZips, setActiveZips]   = useState<AtlantaZip[]>(DEFAULT_ZIPS);
  const [editMode, setEditMode]       = useState(false);
  const [addZipInput, setAddZipInput] = useState('');

  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress]     = useState<{ current: number; total: number; zip: string } | null>(null);
  const [session, setSession]       = useState<ScanSession | null>(null);
  const [history, setHistory]       = useState<ScanSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // How many top deals to send to DealBeast (user-controlled)
  const [topNInput, setTopNInput] = useState(10);

  // Page tracking — each scan advances to the next Zillow results page
  // so consecutive scans surface different properties.
  const [scanPage, setScanPage] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('deal_scanner_page') ?? '1') || 1; } catch { return 1; }
  });

  useEffect(() => { loadScanHistory().then(setHistory); }, []);

  // ── Add/remove ZIP helpers (edit mode) ──────────────────────────────────

  const removeZip = useCallback((zip: string) => {
    setActiveZips(prev => prev.filter(z => z.zip !== zip));
  }, []);

  const handleAddZip = useCallback(() => {
    const code = addZipInput.trim();
    if (!/^\d{5}$/.test(code)) { toast.error('Enter a valid 5-digit ZIP code'); return; }
    if (activeZips.some(z => z.zip === code)) { toast.info('ZIP already in list'); return; }
    // Try to find it in the full Atlanta dataset first
    const known = ATLANTA_ZIPS.find(z => z.zip === code);
    const newEntry: AtlantaZip = known ?? {
      zip: code, city: 'Custom', lat: 0, lng: 0,
      medianHomeValue: 0, crimeIndex: 0, distanceMiles: 0,
    };
    setActiveZips(prev => [...prev, newEntry]);
    setAddZipInput('');
  }, [addZipInput, activeZips]);

  const resetToDefault = useCallback(() => {
    setActiveZips(DEFAULT_ZIPS);
    toast.success('Reset to default Atlanta ZIP list');
  }, []);

  // ── Scan ────────────────────────────────────────────────────────────────

  const resetPage = useCallback(() => {
    const next = 1;
    setScanPage(next);
    try { localStorage.setItem('deal_scanner_page', String(next)); } catch {}
    toast.success('Reset to page 1 — next scan will start from the beginning');
  }, []);

  const startScan = useCallback(async () => {
    const zips = activeZips.map(z => z.zip);
    if (zips.length === 0) return;

    // Use current page, then advance for next scan
    const currentPage = scanPage;
    const nextPage = currentPage + 1;
    setScanPage(nextPage);
    try { localStorage.setItem('deal_scanner_page', String(nextPage)); } catch {}

    setIsScanning(true);
    setSession(null);
    const allRaw: RawListing[] = [];

    for (let i = 0; i < zips.length; i++) {
      const zip = zips[i];
      setProgress({ current: i + 1, total: zips.length, zip });

      try {
        const { data, error } = await supabase.functions.invoke('zillow-search', {
          body: { location: zip, homeType: 'SingleFamily', maxPrice: MAX_PRICE, minSqft: MIN_SQFT, page: currentPage },
        });
        if (!error && data?.properties) {
          allRaw.push(...data.properties.map((p: any) => ({
            zpid: p.zpid ?? '', address: p.address ?? '',
            city: p.city ?? '', state: p.state ?? '', zipcode: p.zipcode ?? zip,
            price: p.price ?? 0, zestimate: p.zestimate ?? null,
            rentZestimate: p.rentZestimate ?? null, daysOnZillow: p.daysOnZillow ?? null,
            bedrooms: p.bedrooms ?? null, bathrooms: p.bathrooms ?? null,
            sqft: p.sqft ?? null, propertyType: p.propertyType ?? null,
            imgSrc: p.imgSrc ?? null, detailUrl: p.detailUrl ?? null,
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

    const savedId = await saveScanSession(zips, passed);
    if (savedId) { newSession.id = savedId; setSession({ ...newSession }); }

    const updated = await loadScanHistory();
    setHistory(updated);
    setProgress(null);
    setIsScanning(false);
  }, [activeZips, scanPage]);

  // ── Send top N to DealBeast — open queue in new tab ──────────────────────

  const sendToDealBeast = useCallback(() => {
    if (!session) return;
    const n = Math.max(1, Math.min(topNInput, session.results.length));
    const top = session.results.slice(0, n);
    try {
      localStorage.setItem('deal_scanner_queue', JSON.stringify(top));
      window.open('/scout/deal-scanner/queue', '_blank');
    } catch {
      toast.error('Failed to open analysis queue');
    }
  }, [session, topNInput]);

  // ── CSV export ────────────────────────────────────────────────────────────

  const handleExportCSV = useCallback(() => {
    if (!session?.results.length) return;
    exportCSV(session.results);
    toast.success(`Exported ${session.results.length} listings to CSV`);
  }, [session]);

  const currentResults = session?.results ?? [];
  const effectiveTopN  = Math.min(topNInput, currentResults.length);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* ── Top controls ───────────────────────────────────────────────── */}
      <div className="shrink-0 p-4 border-b border-border/50 bg-card/40 space-y-3">

        {/* Title row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-emerald-400" />
            <h1 className="font-semibold text-base">Deal Scanner</h1>
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-400/30 text-[10px]">
              Auto-Filter + Scoring
            </Badge>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
            onClick={() => setHistoryOpen(v => !v)}>
            <Clock className="w-3.5 h-3.5" />
            History ({history.length})
            {historyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>

        {/* ZIP info + scan row */}
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border border-border/50 min-h-[40px]">
            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium text-foreground">
              Atlanta Metro —{' '}
              <span className="text-emerald-400">{activeZips.length} ZIP codes</span>
              <span className="text-muted-foreground text-xs ml-1.5">
                (≤40 mi · median &lt;$300K · crime index &lt;60)
              </span>
            </span>
            {/* Page indicator */}
            <span className="ml-auto flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-muted-foreground/70">
                Batch
              </span>
              <span className="text-[11px] font-semibold font-mono text-violet-400 bg-violet-500/10 border border-violet-500/30 px-1.5 py-0.5 rounded">
                #{scanPage}
              </span>
              {scanPage > 1 && (
                <button
                  onClick={resetPage}
                  disabled={isScanning}
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
                'ml-auto flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors',
                editMode
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}>
              <Pencil className="w-3 h-3" />
              {editMode ? 'Done Editing' : 'Edit ZIPs'}
            </button>
          </div>

          <Button onClick={startScan} disabled={isScanning || activeZips.length === 0}
            className="h-10 px-5 text-sm gap-2 bg-emerald-600 hover:bg-emerald-500">
            {isScanning
              ? <><Loader2 className="w-4 h-4 animate-spin" />Scanning...</>
              : <><ScanLine className="w-4 h-4" />Scan ZIPs</>}
          </Button>
        </div>

        {/* Edit mode — ZIP chip list */}
        {editMode && (
          <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
              {activeZips.map(z => (
                <span key={z.zip}
                  className="inline-flex items-center gap-1 text-[11px] font-mono bg-card border border-border/60 rounded px-1.5 py-0.5 group">
                  <span className="text-foreground">{z.zip}</span>
                  <span className="text-muted-foreground/60">{z.city}</span>
                  <button
                    onClick={() => removeZip(z.zip)}
                    className="ml-0.5 text-muted-foreground/40 hover:text-red-400 transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border/30">
              <input
                type="text"
                value={addZipInput}
                onChange={e => setAddZipInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddZip()}
                placeholder="Add ZIP code..."
                maxLength={5}
                className="h-7 w-32 text-xs font-mono px-2 rounded bg-background border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
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

        {/* Filter + score legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />≤ $250K</span>
          <span>·</span>
          <span className="flex items-center gap-1"><Home className="w-3 h-3" />Single Family</span>
          <span>·</span>
          <span>≥ 1,200 sqft</span>
          <span>·</span>
          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />Price/Zestimate ≤ 85%</span>
          <span>·</span>
          <span>Rent required · 30+ days</span>
          <span className="ml-2 pl-2 border-l border-border/50 text-[10px] font-medium">
            Score: 40pts discount + 40pts yield + 20pts days
          </span>
        </div>
      </div>

      {/* ── History dropdown ──────────────────────────────────────────── */}
      {historyOpen && (
        <div className="shrink-0 border-b border-border/50 bg-card/60 max-h-48 overflow-y-auto">
          {history.length === 0
            ? <p className="text-xs text-muted-foreground p-4">No past scans yet</p>
            : history.map(s => (
              <button key={s.id} onClick={() => { setSession(s); setHistoryOpen(false); }}
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
                    {s.zips.slice(0, 5).join(', ')}{s.zips.length > 5 ? ` +${s.zips.length - 5}` : ''}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/40">
                  {s.totalPassed} passed
                </Badge>
              </button>
            ))}
        </div>
      )}

      {/* ── Scan progress ─────────────────────────────────────────────── */}
      {isScanning && progress && (
        <div className="shrink-0 px-4 py-2 bg-card/40 border-b border-border/50 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Scanning ZIP {progress.zip}…
            </span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-1" />
        </div>
      )}


{/* ── Stats + action bar ────────────────────────────────────────── */}
      {session && (
        <div className="shrink-0 px-4 py-2 bg-card/30 border-b border-border/50 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <ScanLine className="w-3.5 h-3.5" />
            {session.totalScanned > 0 ? `${session.totalScanned} scanned` : `${session.zips.length} ZIPs`}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {session.totalPassed} passed
          </span>
          {session.totalScanned > 0 && (
            <>
              <span>·</span>
              <span className="text-red-400/70 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                {session.totalScanned - session.totalPassed} filtered out
              </span>
            </>
          )}
          <span>·</span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(session.scannedAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>

          {/* Action buttons */}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
              onClick={handleExportCSV} disabled={currentResults.length === 0}>
              <Download className="w-3.5 h-3.5" />
              CSV ({currentResults.length})
            </Button>

            {/* DealBeast send control */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-border/40">
              <span className="text-[11px] text-muted-foreground">Top</span>
              <input
                type="number"
                min={1}
                max={currentResults.length || 1}
                value={topNInput}
                onChange={e => {
                  const v = parseInt(e.target.value) || 1;
                  setTopNInput(Math.max(1, Math.min(currentResults.length || 1, v)));
                }}
                disabled={currentResults.length === 0}
                className="w-12 h-7 text-center text-xs font-mono rounded border border-border/60 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50 disabled:opacity-40"
              />
              <span className="text-[11px] text-muted-foreground">of {currentResults.length}</span>
              <Button size="sm"
                className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500"
                onClick={sendToDealBeast}
                disabled={currentResults.length === 0}>
                <Zap className="w-3.5 h-3.5" />Send to DealBeast ({effectiveTopN})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Results table ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {!session && !isScanning && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <ScanLine className="w-12 h-12 text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground text-sm">
              Click <strong>Scan ZIPs</strong> to scan {activeZips.length} Atlanta Metro ZIP codes
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Listings are scored 0–100 and ranked automatically
            </p>
          </div>
        )}

        {session && currentResults.length === 0 && !isScanning && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <XCircle className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground text-sm">No listings passed all filters</p>
          </div>
        )}

        {currentResults.length > 0 && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card/90 backdrop-blur-sm border-b border-border/50 z-10">
              <tr className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                <th className="text-center px-3 py-2.5 w-12">#</th>
                <th className="text-center px-3 py-2.5 w-14">Score</th>
                <th className="text-left px-4 py-2.5">Address</th>
                <th className="text-right px-3 py-2.5">Price</th>
                <th className="text-right px-3 py-2.5">Zestimate</th>
                <th className="text-right px-3 py-2.5">Margin</th>
                <th className="text-right px-3 py-2.5">Rent/mo</th>
                <th className="text-right px-3 py-2.5">Yield</th>
                <th className="text-right px-3 py-2.5">Days</th>
                <th className="text-right px-3 py-2.5">Beds/Ba</th>
                <th className="text-center px-3 py-2.5">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {currentResults.map((r, idx) => (
                <tr key={r.zpid}
                  className={cn(
                    'hover:bg-muted/20 transition-colors',
                    idx < TOP_N && 'border-l-2 border-l-violet-500/40',
                  )}>
                  {/* Rank */}
                  <td className="px-3 py-2.5 text-center text-xs text-muted-foreground/60 font-mono">
                    {idx === TOP_N - 1
                      ? <span className="text-[10px] text-violet-400/60">─ top {TOP_N} ─</span>
                      : idx + 1}
                  </td>

                  {/* Score */}
                  <td className="px-3 py-2.5 text-center">
                    <ScoreBadge score={r.dealScore} />
                  </td>

                  {/* Address */}
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-foreground leading-tight">
                      {r.address || [r.address, r.city, r.state].filter(Boolean).join(', ')}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{r.city}, {r.state} {r.zipcode}</div>
                  </td>

                  {/* Price */}
                  <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold">
                    {fmt$(r.price)}
                  </td>

                  {/* Zestimate */}
                  <td className="px-3 py-2.5 text-right font-mono text-sm text-muted-foreground">
                    {r.zestimate ? fmt$(r.zestimate) : '—'}
                  </td>

                  {/* Margin */}
                  <td className="px-3 py-2.5 text-right">
                    <span className={cn(
                      'text-xs font-semibold px-1.5 py-0.5 rounded',
                      r.margin >= 0.20 ? 'bg-emerald-500/15 text-emerald-400' :
                      r.margin >= 0.10 ? 'bg-amber-500/15 text-amber-400' :
                      'bg-muted/40 text-muted-foreground'
                    )}>
                      {fmtPct(r.margin)}
                    </span>
                  </td>

                  {/* Rent */}
                  <td className="px-3 py-2.5 text-right font-mono text-sm text-cyan-400">
                    {r.rentZestimate ? fmt$(r.rentZestimate) : '—'}
                  </td>

                  {/* Gross yield */}
                  <td className="px-3 py-2.5 text-right">
                    <span className={cn(
                      'text-xs font-semibold',
                      r.grossYield >= 0.09 ? 'text-emerald-400' :
                      r.grossYield >= 0.07 ? 'text-amber-400' :
                      'text-muted-foreground'
                    )}>
                      {fmtPct(r.grossYield)}
                    </span>
                  </td>

                  {/* Days on market */}
                  <td className="px-3 py-2.5 text-right">
                    <span className={cn(
                      'text-xs',
                      (r.daysOnZillow ?? 0) > 90 ? 'text-emerald-400 font-semibold' :
                      (r.daysOnZillow ?? 0) > 60 ? 'text-amber-400' :
                      'text-muted-foreground'
                    )}>
                      {r.daysOnZillow ?? '?'}d
                    </span>
                  </td>

                  {/* Beds/Baths */}
                  <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                    {r.bedrooms ?? '?'}/{r.bathrooms ?? '?'}
                  </td>

                  {/* Zillow link */}
                  <td className="px-3 py-2.5 text-center">
                    {r.detailUrl
                      ? <a href={r.detailUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
