import { useState, useCallback, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useGmailAuth } from '@/hooks/useGmailAuth';
import { useGmailSync } from '@/hooks/useGmailSync';
import { useUserState } from '@/hooks/useUserState';
import { useDeals } from '@/context/DealsContext';
import { useSyncAnalyze } from '@/context/SyncAnalyzeContext';
import { isDealAnalyzed } from '@/utils/dealHelpers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Mail, Loader2, CheckCircle, CheckCircle2, XCircle,
  Zap, MapPin, MailOpen, AlertCircle, Trash2,
  ExternalLink, Pencil, Plus, RotateCcw,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

type EmailAction =
  | 'created'
  | 'updated_existing'
  | 'skipped_duplicate'
  | 'skipped_portal'
  | 'skipped_over_budget'
  | 'skipped_wrong_state'
  | 'no_address'
  | 'error';

interface EmailResultItem {
  key: string;
  dealId: string | null;
  address: string;
  action: EmailAction;
  dealType?: string | null;
  purchasePrice?: number | null;
  senderName?: string;
  senderEmail?: string;
  subject?: string;
  reason?: string;
  scannedAt: string;
}

const SCAN_COUNTS = [10, 20, 40, 60, 100] as const;
type ScanCount = typeof SCAN_COUNTS[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Detects if a string looks like a full US street address */
function looksLikeAddress(s?: string): boolean {
  if (!s) return false;
  return /^\d+\s+\S+.*,\s*[a-zA-Z\s]+,\s*[a-zA-Z]{2}\s+\d{5}/i.test(s.trim());
}

function isActionable(action: EmailAction): boolean {
  return action === 'created' || action === 'updated_existing';
}

function actionBadge(action: EmailAction, subjectIsAddr: boolean) {
  if (action === 'created')          return { text: 'New Deal', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
  if (action === 'updated_existing') return { text: 'Updated', color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' };
  if (action === 'skipped_portal')   return { text: 'Portal', color: 'text-muted-foreground border-border/30 bg-muted/20' };
  if (action === 'skipped_duplicate')return { text: 'Duplicate', color: 'text-muted-foreground border-border/30 bg-muted/20' };
  if (action === 'skipped_over_budget') return { text: 'Over Budget', color: 'text-muted-foreground border-border/30 bg-muted/20' };
  if (action === 'skipped_wrong_state') return { text: 'Wrong State', color: 'text-muted-foreground border-border/30 bg-muted/20' };
  if (action === 'no_address') {
    if (subjectIsAddr) return { text: 'Address in Subject', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    return { text: 'No Address', color: 'text-muted-foreground/60 border-border/20 bg-muted/10' };
  }
  if (action === 'error')            return { text: 'Error', color: 'text-red-400 border-red-500/30 bg-red-500/10' };
  return { text: action, color: 'text-muted-foreground border-border/30' };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EmailSearchPage() {
  const { isConnected, isLoading: isAuthLoading, tokens, connect, disconnect } = useGmailAuth();
  const { isSyncing, isMarkingOld, sync, markOldAsRead, markUnreadRecent } = useGmailSync();
  const { selectedState } = useUserState();
  const { deals, refetch } = useDeals();
  const {
    isRunning: isAnalyzing,
    analyzedDeals: analyzeQueue,
    totalToAnalyze,
    startAnalyzeList,
  } = useSyncAnalyze();

  const [scanCount, setScanCount] = useState<ScanCount>(20);
  const [results, setResults] = useState<EmailResultItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('email_scan_results');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'new' | 'skipped'>('all');

  // Persist results to sessionStorage whenever they change
  useEffect(() => {
    try { sessionStorage.setItem('email_scan_results', JSON.stringify(results)); } catch {}
  }, [results]);
  // Per-row inline address editor state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editAddr, setEditAddr] = useState('');
  const [creatingKey, setCreatingKey] = useState<string | null>(null); // which row is being created+analyzed

  // ── Scan ──────────────────────────────────────────────────────────────────

  const runScan = useCallback(async (includeRead: boolean) => {
    if (!tokens?.access_token || isSyncing) return;

    const result = await sync(tokens.access_token, {
      maxResults: scanCount,
      includeRead,
      markAllRead: false,
      targetState: selectedState && selectedState !== 'ALL' ? selectedState : undefined,
    });

    if (!result?.success) return;

    const scannedAt = new Date().toISOString();
    const newItems: EmailResultItem[] = (result.syncDetails ?? []).map((d: any, idx: number) => {
      const dealId = d.dealId || d.existingDealId || null;
      return {
        key: dealId ?? `skip-${scannedAt}-${idx}`,
        dealId,
        address: d.address || '(no address)',
        action: d.action as EmailAction,
        dealType: d.dealType ?? null,
        purchasePrice: d.purchasePrice ?? null,
        senderName: d.senderName ?? '',
        senderEmail: d.senderEmail ?? '',
        subject: d.subject ?? '',
        reason: d.reason ?? '',
        scannedAt,
      };
    });

    setResults(prev => {
      const existingKeys = new Set(prev.map(i => i.key));
      const toAdd = newItems.filter(i => !existingKeys.has(i.key));
      return [...toAdd, ...prev];
    });

    await refetch();
  }, [tokens, isSyncing, sync, scanCount, selectedState, refetch]);

  const handleScan   = useCallback(() => runScan(false), [runScan]);
  const handleRescan = useCallback(() => runScan(true),  [runScan]);

  // ── Mark old as read ──────────────────────────────────────────────────────

  const handleMarkOld = useCallback(async () => {
    if (!tokens?.access_token) return;
    await markOldAsRead(tokens.access_token, 7);
  }, [tokens, markOldAsRead]);

  const handleMarkUnreadRecent = useCallback(async () => {
    if (!tokens?.access_token) return;
    await markUnreadRecent(tokens.access_token, 7);
  }, [tokens, markUnreadRecent]);

  // ── Selection ────────────────────────────────────────────────────────────

  const actionableItems = useMemo(
    () => results.filter(r => isActionable(r.action) && r.dealId),
    [results]
  );

  const unanalyzedActionable = useMemo(() => {
    return actionableItems.filter(item => {
      const deal = item.dealId ? deals.find(d => d.id === item.dealId) : null;
      return deal ? !isDealAnalyzed(deal) : true;
    });
  }, [actionableItems, deals]);

  const selectedActionable = useMemo(
    () => actionableItems.filter(r => selected.has(r.key) && r.dealId),
    [actionableItems, selected]
  );

  const toggleSelect = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const keys = actionableItems.map(r => r.key);
    const allSelected = keys.every(k => selected.has(k));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  };

  // ── Analysis ─────────────────────────────────────────────────────────────

  const handleAnalyzeSelected = useCallback(async () => {
    if (selectedActionable.length === 0 || isAnalyzing) return;
    const list = selectedActionable.map(r => ({ id: r.dealId!, address: r.address }));
    setSelected(new Set());
    await startAnalyzeList(list);
  }, [selectedActionable, isAnalyzing, startAnalyzeList]);

  const handleAnalyzeOne = useCallback(async (item: EmailResultItem) => {
    if (!item.dealId || isAnalyzing) return;
    await startAnalyzeList([{ id: item.dealId, address: item.address }]);
    await refetch();
    // Open deal in new tab — stay on email scanner so user can continue analyzing
    window.open(`/deals/${item.dealId}`, '_blank', 'noopener,noreferrer');
  }, [isAnalyzing, startAnalyzeList, refetch]);

  // ── Create deal from address + immediately analyze ────────────────────────

  const handleCreateAndAnalyze = useCallback(async (item: EmailResultItem, addressOverride?: string) => {
    const addr = (addressOverride ?? editAddr).trim();
    if (!addr) { toast.error('Enter a property address'); return; }

    setCreatingKey(item.key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const parts = addr.split(',').map(s => s.trim());
      const street   = parts[0] || addr;
      const city     = parts[1] || '';
      const stateZip = parts[2] || '';
      const [state, zip] = stateZip.split(' ').filter(Boolean);

      const { data: inserted, error } = await supabase
        .from('deals')
        .insert({
          address_full:   addr,
          address_street: street,
          address_city:   city,
          address_state:  state || '',
          address_zip:    zip || null,
          source: 'email',
          status: 'new',
          email_subject:  item.subject || null,
          sender_name:    item.senderName || null,
          sender_email:   item.senderEmail || null,
          api_data:   {},
          overrides:  {},
          created_by: user.id,
        })
        .select('id')
        .single();

      if (error || !inserted) throw error || new Error('Insert failed');

      const dealId = inserted.id;

      // Mark row as created
      setResults(prev => prev.map(r =>
        r.key === item.key
          ? { ...r, key: dealId, dealId, address: addr, action: 'created' as EmailAction }
          : r
      ));
      setEditingKey(null);
      setEditAddr('');
      await refetch();

      // Immediately send to DealBeast analysis → open deal in new tab; stay on this page
      toast.success('Deal created — sending to DealBeast...');
      await startAnalyzeList([{ id: dealId, address: addr }]);
      await refetch();
      window.open(`/deals/${dealId}`, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setCreatingKey(null);
    }
  }, [editAddr, refetch, startAnalyzeList]);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (filter === 'new')     return results.filter(r => isActionable(r.action));
    if (filter === 'skipped') return results.filter(r => !isActionable(r.action));
    return results;
  }, [results, filter]);

  // ── Analysis progress ─────────────────────────────────────────────────────

  const doneCount  = analyzeQueue.filter(d => d.status === 'done').length;
  const errorCount = analyzeQueue.filter(d => d.status === 'error').length;
  const progress   = totalToAnalyze > 0 ? ((doneCount + errorCount) / totalToAnalyze) * 100 : 0;

  // ── Not connected ─────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Email Search</h1>
          <p className="text-muted-foreground">Scan your Gmail inbox for real estate deals</p>
        </div>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Mail className="w-16 h-16 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium mb-2">Connect Gmail to get started</p>
            <Button onClick={connect} disabled={isAuthLoading} size="lg">
              {isAuthLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Connect Gmail
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allActionableSelected = actionableItems.length > 0 &&
    actionableItems.every(r => selected.has(r.key));

  return (
    <TooltipProvider>
      <div className="p-6 space-y-4 animate-fade-in">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Email Search</h1>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-500 font-medium">Gmail Connected</span>
              </div>
              {selectedState && selectedState !== 'ALL' ? (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{selectedState}</span>
                </div>
              ) : (
                <span className="text-sm text-amber-400 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> No state filter
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleMarkUnreadRecent} disabled={isMarkingOld || isSyncing}>
                  {isMarkingOld ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  <span className="ml-1.5 hidden sm:inline">Re-scan Last 7 Days</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Marks emails from the last 7 days as unread so they appear in the next scan. Use when emails were scanned but deals weren't extracted.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleMarkOld} disabled={isMarkingOld || isSyncing}>
                  {isMarkingOld ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailOpen className="h-4 w-4" />}
                  <span className="ml-1.5 hidden sm:inline">Mark Old as Read</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Marks all unread emails older than 7 days as read. Clears inbox clutter before scanning.
              </TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="sm" onClick={disconnect} className="text-muted-foreground">Disconnect</Button>
          </div>
        </div>

        {/* ── Scan controls ─────────────────────────────────────────────── */}
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">Emails to scan:</span>
                <div className="flex gap-1">
                  {SCAN_COUNTS.map(n => (
                    <button key={n} onClick={() => setScanCount(n)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                        scanCount === n
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 sm:ml-auto">
                <Button onClick={handleScan} disabled={isSyncing || isAnalyzing}>
                  {isSyncing
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning...</>
                    : <><Mail className="h-4 w-4 mr-2" />Scan {scanCount} Unread</>
                  }
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={handleRescan} disabled={isSyncing || isAnalyzing}>
                      {isSyncing
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <><Mail className="h-4 w-4 mr-2" />Re-scan Recent</>
                      }
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Scans the {scanCount} most recent emails including already-read ones.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Fetches the {scanCount} most recent unread emails · Extracts property addresses with AI · Marks each scanned email as read · Each scan picks up the next batch
            </p>
          </CardContent>
        </Card>

        {/* ── Analysis progress ─────────────────────────────────────────── */}
        {isAnalyzing && (
          <Card className="border-primary/30 bg-card/50">
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Zap className="w-4 h-4 text-primary animate-pulse" />
                  Analyzing {totalToAnalyze} properties...
                </span>
                <span className="text-muted-foreground">{doneCount + errorCount} / {totalToAnalyze}</span>
              </div>
              <Progress value={progress} className="h-1.5" />
              {analyzeQueue.find(d => d.status === 'analyzing') && (
                <p className="text-xs text-muted-foreground truncate">
                  → {analyzeQueue.find(d => d.status === 'analyzing')?.address}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Results ───────────────────────────────────────────────────── */}
        {results.length > 0 && (
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-2 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  Email Results
                  <span className="text-xs font-normal text-muted-foreground">
                    {results.length} total · {actionableItems.length} new
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  {selectedActionable.length > 0 && (
                    <Button size="sm" onClick={handleAnalyzeSelected} disabled={isAnalyzing}>
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                      Analyze {selectedActionable.length} Selected
                    </Button>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" onClick={() => { setResults([]); setSelected(new Set()); try { sessionStorage.removeItem('email_scan_results'); } catch {} }} className="text-muted-foreground">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Clear all results</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              {/* Filter tabs */}
              <div className="flex gap-1 pt-1">
                {(['all', 'new', 'skipped'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      filter === f ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}>
                    {f === 'all'     ? `All (${results.length})` :
                     f === 'new'     ? `New (${actionableItems.length})` :
                     `Skipped (${results.length - actionableItems.length})`}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="pt-0 px-0">
              {/* Column headers */}
              <div className="grid grid-cols-[28px_1fr_auto] gap-2 px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
                <div className="flex items-center">
                  <Checkbox checked={allActionableSelected} onCheckedChange={toggleSelectAll}
                    disabled={actionableItems.length === 0} className="w-3.5 h-3.5" />
                </div>
                <span>Address</span>
                <span className="text-right pr-2">Action</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border/20">
                {filtered.map(item => {
                  const actionable   = isActionable(item.action);
                  const deal         = item.dealId ? deals.find(d => d.id === item.dealId) : null;
                  const analyzed     = deal ? isDealAnalyzed(deal) : false;
                  const qItem        = item.dealId ? analyzeQueue.find(a => a.id === item.dealId) : null;
                  const isAnalyzingThis = qItem?.status === 'analyzing' || creatingKey === item.key;
                  const isDone       = qItem?.status === 'done' || analyzed;
                  const isError      = qItem?.status === 'error';
                  const subjectIsAddr = looksLikeAddress(item.subject);
                  const { text: badgeText, color: badgeColor } = actionBadge(item.action, subjectIsAddr);
                  const isEditing    = editingKey === item.key;

                  // For no_address with address in subject: use subject as suggested address
                  const suggestedAddr = (item.action === 'no_address' && subjectIsAddr)
                    ? item.subject!
                    : undefined;

                  // Determine what address to display
                  const displayAddress = actionable
                    ? item.address
                    : suggestedAddr ?? item.subject ?? item.address;

                  return (
                    <div key={item.key}
                      className={`grid grid-cols-[28px_1fr_auto] gap-2 px-4 py-3 items-start transition-colors ${
                        actionable ? 'hover:bg-muted/20' : 'opacity-60 hover:opacity-80'
                      } ${selected.has(item.key) ? 'bg-primary/5' : ''}`}
                    >
                      {/* Checkbox */}
                      <div className="flex items-center pt-0.5">
                        {actionable
                          ? <Checkbox checked={selected.has(item.key)} onCheckedChange={() => toggleSelect(item.key)} className="w-3.5 h-3.5" />
                          : <div className="w-3.5" />
                        }
                      </div>

                      {/* Main content: address + badges */}
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Address */}
                          {item.dealId ? (
                            <Link to={`/deals/${item.dealId}`}
                              className="text-sm font-semibold hover:text-primary transition-colors">
                              {displayAddress}
                            </Link>
                          ) : (
                            <span className={`text-sm font-semibold ${suggestedAddr ? 'text-amber-300' : 'text-foreground/70'}`}>
                              {displayAddress}
                            </span>
                          )}
                          {item.dealId && (
                            <Link to={`/deals/${item.dealId}`} className="shrink-0">
                              <ExternalLink className="w-3 h-3 text-muted-foreground/40 hover:text-primary" />
                            </Link>
                          )}
                        </div>

                        {/* Badges row */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${badgeColor}`}>
                            {badgeText}
                          </span>
                          {item.dealType && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-border/40 bg-muted/20 text-muted-foreground">
                              {item.dealType}
                            </span>
                          )}
                          {item.purchasePrice && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              ${item.purchasePrice.toLocaleString()}
                            </span>
                          )}
                          {item.senderName && (
                            <span className="text-[10px] text-muted-foreground/50">
                              {item.senderName}
                            </span>
                          )}
                          {item.reason && (item.action === 'no_address' || item.action === 'error') && (
                            <span className="text-[10px] text-muted-foreground/60 italic">{item.reason}</span>
                          )}
                          {isError && qItem?.error && (
                            <span className="text-[10px] text-red-400">{qItem.error}</span>
                          )}
                        </div>

                        {/* Inline address editor */}
                        {isEditing && (
                          <div className="flex items-center gap-1.5 mt-1.5 max-w-lg">
                            <Input autoFocus
                              value={editAddr}
                              onChange={e => setEditAddr(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleCreateAndAnalyze(item);
                                if (e.key === 'Escape') { setEditingKey(null); setEditAddr(''); }
                              }}
                              placeholder="123 Main St, Atlanta, GA 30301"
                              className="h-7 text-xs flex-1"
                            />
                            <Button size="sm" className="h-7 px-3 text-xs gap-1" onClick={() => handleCreateAndAnalyze(item)} disabled={!!creatingKey}>
                              {creatingKey === item.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Zap className="w-3 h-3" /> Analyze</>}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                              onClick={() => { setEditingKey(null); setEditAddr(''); }}>✕</Button>
                          </div>
                        )}
                      </div>

                      {/* Action button column */}
                      <div className="flex items-center justify-end gap-1 pt-0.5">
                        {/* Subject IS address → one-click Analyze */}
                        {suggestedAddr && !isEditing && (
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs px-3 gap-1 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                            onClick={() => handleCreateAndAnalyze(item, suggestedAddr)}
                            disabled={!!creatingKey}>
                            {creatingKey === item.key
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <><Zap className="w-3 h-3" /> Analyze</>
                            }
                          </Button>
                        )}

                        {/* No address, no subject address → Enter Address */}
                        {item.action === 'no_address' && !suggestedAddr && !isEditing && (
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs px-2 text-muted-foreground"
                            onClick={() => { setEditingKey(item.key); setEditAddr(''); }}>
                            <Pencil className="w-3 h-3 mr-1" /> Enter Address
                          </Button>
                        )}

                        {/* Actionable, not yet analyzed */}
                        {actionable && !isDone && !isAnalyzingThis && (
                          <Button size="sm" variant="outline" className="h-7 text-xs px-3"
                            onClick={() => handleAnalyzeOne(item)} disabled={isAnalyzing}>
                            <Zap className="w-3 h-3 mr-1" /> Analyze
                          </Button>
                        )}

                        {/* Analyzing */}
                        {isAnalyzingThis && (
                          <span className="text-xs text-primary flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
                          </span>
                        )}

                        {/* Done */}
                        {isDone && item.dealId && (
                          <Link to={`/deals/${item.dealId}`}>
                            <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-green-500">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> View
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bulk analyze bar */}
              {unanalyzedActionable.length > 0 && !isAnalyzing && (
                <div className="mx-4 mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {unanalyzedActionable.length} new deal{unanalyzedActionable.length !== 1 ? 's' : ''} waiting for analysis
                  </span>
                  <Button size="sm" variant="outline"
                    onClick={() => startAnalyzeList(unanalyzedActionable.map(r => ({ id: r.dealId!, address: r.address })))}>
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                    Analyze All New ({unanalyzedActionable.length})
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {results.length === 0 && !isSyncing && (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="py-12 text-center">
              <Mail className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                No results yet — choose how many emails to scan and click <strong>Scan Unread</strong>
              </p>
            </CardContent>
          </Card>
        )}

      </div>
    </TooltipProvider>
  );
}
