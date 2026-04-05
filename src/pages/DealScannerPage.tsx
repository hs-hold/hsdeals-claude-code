import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ScanLine, ExternalLink, Clock, CheckCircle2, XCircle,
  Loader2, Trash2, ChevronDown, ChevronUp, Calendar,
  TrendingUp, Home, DollarSign, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  margin: number; // 1 - price/zestimate
  grossYield: number; // rentZestimate*12 / price
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

const MAX_PRICE        = 250_000;
const MAX_PRICE_RATIO  = 0.85;   // price/zestimate must be ≤ this
const MIN_DAYS         = 30;     // daysOnZillow must be > this

// ─── Filter logic ───────────────────────────────────────────────────────────

function filterListings(listings: RawListing[]): { passed: PassedListing[]; reasons: Record<string, string> } {
  const reasons: Record<string, string> = {};
  const passed: PassedListing[] = [];

  for (const l of listings) {
    if (l.price > MAX_PRICE) {
      reasons[l.zpid] = `Price $${l.price.toLocaleString()} > $${MAX_PRICE.toLocaleString()}`;
      continue;
    }
    if (l.propertyType && l.propertyType !== 'SINGLE_FAMILY') {
      reasons[l.zpid] = `homeType ${l.propertyType} ≠ SINGLE_FAMILY`;
      continue;
    }
    if (!l.rentZestimate) {
      reasons[l.zpid] = 'No rentZestimate';
      continue;
    }
    if (l.zestimate && l.price / l.zestimate > MAX_PRICE_RATIO) {
      reasons[l.zpid] = `Price/Zestimate = ${(l.price / l.zestimate).toFixed(2)} > ${MAX_PRICE_RATIO}`;
      continue;
    }
    if ((l.daysOnZillow ?? 0) <= MIN_DAYS) {
      reasons[l.zpid] = `Only ${l.daysOnZillow ?? 0} days on market (need > ${MIN_DAYS})`;
      continue;
    }
    passed.push({
      ...l,
      margin: l.zestimate ? 1 - l.price / l.zestimate : 0,
      grossYield: (l.rentZestimate * 12) / l.price,
    });
  }

  return { passed, reasons };
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function saveScanSession(
  zips: string[],
  results: PassedListing[],
  totalScanned: number
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Save one search record per session (use joined ZIPs as the "zip" field)
  const { data: search, error } = await supabase
    .from('scout_searches')
    .insert({
      zip: zips.join(','),
      max_price: MAX_PRICE,
      result_count: results.length,
      user_id: user.id,
    })
    .select('id')
    .single();

  if (error || !search) { console.error('Save search error:', error); return null; }

  if (results.length > 0) {
    const rows = results.map(r => ({
      search_id: search.id,
      zpid: r.zpid,
      address: [r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', '),
      price: r.price,
      arv: r.zestimate ?? null,        // store zestimate in arv column
      rent: r.rentZestimate ?? null,
      days_on_market: r.daysOnZillow ?? null,
      beds: r.bedrooms ?? null,
      baths: r.bathrooms ?? null,
      sqft: r.sqft ?? null,
      img_src: r.imgSrc ?? null,
      detail_url: r.detailUrl ?? null,
      score: Math.round(r.margin * 100 + r.grossYield * 100),
      grade: r.margin >= 0.2 ? 'A' : r.margin >= 0.1 ? 'B' : 'C',
      rehab: 0,
      spread: r.zestimate ? r.zestimate - r.price : null,
      cap_rate: r.grossYield ? parseFloat((r.grossYield * 100).toFixed(2)) : null,
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
      .from('scout_results')
      .select('*')
      .eq('search_id', s.id);

    const listings: PassedListing[] = (results || []).map((r: any) => ({
      zpid: r.zpid,
      address: r.address?.split(',')[0] ?? '',
      city: r.address?.split(',')[1]?.trim() ?? '',
      state: r.address?.split(',')[2]?.trim() ?? '',
      zipcode: r.address?.split(',')[3]?.trim() ?? '',
      price: r.price ?? 0,
      zestimate: r.arv ?? null,
      rentZestimate: r.rent ?? null,
      daysOnZillow: r.days_on_market ?? null,
      bedrooms: r.beds ?? null,
      bathrooms: r.baths ?? null,
      sqft: r.sqft ?? null,
      propertyType: 'SINGLE_FAMILY',
      imgSrc: r.img_src ?? null,
      detailUrl: r.detail_url ?? null,
      margin: r.arv && r.price ? 1 - r.price / r.arv : 0,
      grossYield: r.rent && r.price ? (r.rent * 12) / r.price : 0,
    }));

    sessions.push({
      id: s.id,
      zips: s.zip.split(','),
      scannedAt: s.created_at,
      totalScanned: 0, // not stored
      totalPassed: s.result_count,
      results: listings,
    });
  }
  return sessions;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmt$(n: number) { return '$' + n.toLocaleString(); }
function fmtPct(n: number) { return (n * 100).toFixed(1) + '%'; }

// ─── Component ───────────────────────────────────────────────────────────────

export default function DealScannerPage() {
  const [zipInput, setZipInput] = useState('30310, 30311, 30315, 30316, 30318, 30331, 30336, 30344, 30349, 30354');
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; zip: string } | null>(null);
  const [session, setSession] = useState<ScanSession | null>(null);
  const [history, setHistory] = useState<ScanSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  useEffect(() => {
    loadScanHistory().then(setHistory);
  }, []);

  const startScan = useCallback(async () => {
    const zips = zipInput
      .split(/[\s,;]+/)
      .map(z => z.trim())
      .filter(z => /^\d{5}$/.test(z));

    if (zips.length === 0) return;

    setIsScanning(true);
    setSession(null);

    const allRaw: RawListing[] = [];

    for (let i = 0; i < zips.length; i++) {
      const zip = zips[i];
      setProgress({ current: i + 1, total: zips.length, zip });

      try {
        const { data, error } = await supabase.functions.invoke('zillow-search', {
          body: { location: zip, homeType: 'SingleFamily', maxPrice: MAX_PRICE, page: 1 },
        });

        if (!error && data?.properties) {
          const listings: RawListing[] = data.properties.map((p: any) => ({
            zpid: p.zpid ?? '',
            address: p.address ?? '',
            city: p.city ?? '',
            state: p.state ?? '',
            zipcode: p.zipcode ?? zip,
            price: p.price ?? 0,
            zestimate: p.zestimate ?? null,
            rentZestimate: p.rentZestimate ?? null,
            daysOnZillow: p.daysOnZillow ?? null,
            bedrooms: p.bedrooms ?? null,
            bathrooms: p.bathrooms ?? null,
            sqft: p.sqft ?? null,
            propertyType: p.propertyType ?? null,
            imgSrc: p.imgSrc ?? null,
            detailUrl: p.detailUrl ?? null,
          }));
          allRaw.push(...listings);
        }
      } catch (e) {
        console.error(`Error scanning ZIP ${zip}:`, e);
      }

      // Small delay between ZIPs to avoid rate limiting
      if (i < zips.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    const { passed } = filterListings(allRaw);

    const newSession: ScanSession = {
      id: 'pending',
      zips,
      scannedAt: new Date().toISOString(),
      totalScanned: allRaw.length,
      totalPassed: passed.length,
      results: passed,
    };
    setSession(newSession);

    // Save to DB
    const savedId = await saveScanSession(zips, passed, allRaw.length);
    if (savedId) {
      newSession.id = savedId;
      setSession({ ...newSession });
    }

    // Reload history
    const updated = await loadScanHistory();
    setHistory(updated);

    setProgress(null);
    setIsScanning(false);
  }, [zipInput]);

  const loadHistorySession = useCallback((s: ScanSession) => {
    setSession(s);
    setHistoryOpen(false);
  }, []);

  const currentResults = session?.results ?? [];

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* ── Top controls ───────────────────────────────────────────────── */}
      <div className="shrink-0 p-4 border-b border-border/50 bg-card/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-emerald-400" />
            <h1 className="font-semibold text-base">Deal Scanner</h1>
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-400/30 text-[10px]">
              Auto-Filter
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setHistoryOpen(v => !v)}
            >
              <Clock className="w-3.5 h-3.5" />
              History ({history.length})
              {historyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 items-start">
          <div className="flex-1">
            <Textarea
              value={zipInput}
              onChange={e => setZipInput(e.target.value)}
              placeholder="30310, 30311, 30315 ..."
              className="h-16 text-sm font-mono resize-none"
              disabled={isScanning}
            />
          </div>
          <Button
            onClick={startScan}
            disabled={isScanning}
            className="h-16 px-6 text-sm gap-2 bg-emerald-600 hover:bg-emerald-500"
          >
            {isScanning
              ? <><Loader2 className="w-4 h-4 animate-spin" />Scanning...</>
              : <><ScanLine className="w-4 h-4" />Scan ZIPs</>
            }
          </Button>
        </div>

        {/* Filter rules summary */}
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />Price ≤ $250K</span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1"><Home className="w-3 h-3" />Single Family only</span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />Price/Zestimate ≤ 85%</span>
          <span className="text-border">·</span>
          <span>Rent estimate required</span>
          <span className="text-border">·</span>
          <span>Days on market &gt; 30</span>
        </div>
      </div>

      {/* ── History dropdown ──────────────────────────────────────────── */}
      {historyOpen && (
        <div className="shrink-0 border-b border-border/50 bg-card/60 max-h-48 overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4">No past scans yet</p>
          ) : (
            history.map(s => (
              <button
                key={s.id}
                onClick={() => loadHistorySession(s)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-mono">
                    {new Date(s.scannedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.zips.slice(0, 5).join(', ')}{s.zips.length > 5 ? ` +${s.zips.length - 5} more` : ''}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/40">
                  {s.totalPassed} passed
                </Badge>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      {isScanning && progress && (
        <div className="shrink-0 px-4 py-2 bg-card/40 border-b border-border/50 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Scanning ZIP {progress.zip}…
            </span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-1" />
        </div>
      )}

      {/* ── Stats bar ────────────────────────────────────────────────── */}
      {session && (
        <div className="shrink-0 px-4 py-2 bg-card/30 border-b border-border/50 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ScanLine className="w-3.5 h-3.5" />
            {session.totalScanned > 0 ? `${session.totalScanned} scanned` : `${session.zips.length} ZIP${session.zips.length !== 1 ? 's' : ''} scanned`}
          </span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {session.totalPassed} passed filters
          </span>
          {session.totalScanned > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1 text-red-400/70">
                <XCircle className="w-3.5 h-3.5" />
                {session.totalScanned - session.totalPassed} filtered out
              </span>
            </>
          )}
          <span className="text-border">·</span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(session.scannedAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
      )}

      {/* ── Results table ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {!session && !isScanning && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <ScanLine className="w-12 h-12 text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground text-sm">
              Enter ZIP codes above and click <strong>Scan ZIPs</strong> to find deals
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Filters: price ≤ $250K · single family · price/zestimate ≤ 85% · rent required · 30+ days on market
            </p>
          </div>
        )}

        {session && currentResults.length === 0 && !isScanning && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <XCircle className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground text-sm">No listings passed all filters</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Try adding more ZIP codes or loosening filters</p>
          </div>
        )}

        {currentResults.length > 0 && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card/90 backdrop-blur-sm border-b border-border/50 z-10">
              <tr className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
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
              {currentResults
                .sort((a, b) => b.margin - a.margin)
                .map(r => {
                  const fullAddress = [r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', ');
                  return (
                    <tr
                      key={r.zpid}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      {/* Address */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground leading-tight">{r.address || fullAddress}</div>
                        <div className="text-[11px] text-muted-foreground">{r.city}, {r.state} {r.zipcode}</div>
                      </td>

                      {/* Price */}
                      <td className="px-3 py-3 text-right font-mono text-sm font-semibold">
                        {fmt$(r.price)}
                      </td>

                      {/* Zestimate */}
                      <td className="px-3 py-3 text-right font-mono text-sm text-muted-foreground">
                        {r.zestimate ? fmt$(r.zestimate) : '—'}
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

                      {/* Rent */}
                      <td className="px-3 py-3 text-right font-mono text-sm text-cyan-400">
                        {r.rentZestimate ? fmt$(r.rentZestimate) : '—'}
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

                      {/* Days on market */}
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

                      {/* Beds/Baths */}
                      <td className="px-3 py-3 text-right text-xs text-muted-foreground">
                        {r.bedrooms ?? '?'}/{r.bathrooms ?? '?'}
                      </td>

                      {/* Zillow link */}
                      <td className="px-3 py-3 text-center">
                        {r.detailUrl ? (
                          <a
                            href={r.detailUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : '—'}
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
