import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { Deal } from '@/types/deal';
import {
  analyzeAcquisition,
  generateOfferEmail,
  safeNum,
  AcquisitionAnalysis,
  ArvConfidence,
  RehabConfidence,
  RehabTier,
} from '@/utils/maoCalculations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ExternalLink,
  Copy,
  Check,
  Mail,
  AlertTriangle,
  TrendingDown,
  Target,
  Clock,
  ChevronDown,
  ChevronUp,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type OfferStatus = 'not_sent' | 'sent' | 'responded' | 'counter' | 'dead' | 'accepted';

interface OfferRecord {
  offerPrice: number | null;
  offerDate: string | null;
  status: OfferStatus;
  agentResponse: string;
  counterPrice: number | null;
  nextFollowUp: string | null;
  notes: string;
  numbersReviewed: boolean;
}

const EMPTY_OFFER: OfferRecord = {
  offerPrice: null,
  offerDate: null,
  status: 'not_sent',
  agentResponse: '',
  counterPrice: null,
  nextFollowUp: null,
  notes: '',
  numbersReviewed: false,
};

// ─── localStorage helpers ──────────────────────────────────────────────────────

function loadOffer(dealId: string): OfferRecord {
  try {
    const raw = localStorage.getItem(`acq_offer_${dealId}`);
    return raw ? { ...EMPTY_OFFER, ...JSON.parse(raw) } : { ...EMPTY_OFFER };
  } catch {
    return { ...EMPTY_OFFER };
  }
}

function saveOffer(dealId: string, record: OfferRecord) {
  localStorage.setItem(`acq_offer_${dealId}`, JSON.stringify(record));
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtShort(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

// ─── Badge components ──────────────────────────────────────────────────────────

function ArvBadge({ confidence, reason }: { confidence: ArvConfidence; reason: string }) {
  const styles: Record<ArvConfidence, string> = {
    green: 'bg-green-500/15 text-green-400 border-green-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    red: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  const labels: Record<ArvConfidence, string> = {
    green: 'ARV Strong',
    yellow: 'ARV Moderate',
    red: 'ARV Weak',
  };
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[confidence]}`}>
          {labels[confidence]}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function RehabBadge({ confidence, signals }: { confidence: RehabConfidence; signals: string[] }) {
  const styles: Record<RehabConfidence, string> = {
    high: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    low: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  const labels: Record<RehabConfidence, string> = {
    high: 'Rehab Confident',
    medium: 'Rehab Uncertain',
    low: 'Rehab Unknown',
  };
  const tip = signals.length > 0 ? signals.join(', ') : 'No major risk signals';
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[confidence]}`}>
          {labels[confidence]}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px]">{tip}</TooltipContent>
    </Tooltip>
  );
}

function TierLabel({ tier }: { tier: RehabTier }) {
  const labels: Record<RehabTier, string> = {
    cosmetic: 'Cosmetic',
    light: 'Light Rehab',
    medium: 'Medium Rehab',
    heavy: 'Heavy Rehab',
    full_gut: 'Full Gut',
    unknown: 'Unknown',
  };
  return <span className="text-muted-foreground">{labels[tier]}</span>;
}

function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const cfg: Record<OfferStatus, { label: string; cls: string }> = {
    not_sent: { label: 'No Offer', cls: 'bg-muted text-muted-foreground' },
    sent: { label: 'Offer Sent', cls: 'bg-blue-500/15 text-blue-400' },
    responded: { label: 'Responded', cls: 'bg-yellow-500/15 text-yellow-400' },
    counter: { label: 'Counter', cls: 'bg-orange-500/15 text-orange-400' },
    dead: { label: 'Dead', cls: 'bg-red-500/15 text-red-400' },
    accepted: { label: 'Accepted!', cls: 'bg-green-500/15 text-green-400' },
  };
  const { label, cls } = cfg[status];
  return <Badge className={`text-xs ${cls}`}>{label}</Badge>;
}

// ─── MAO Box ──────────────────────────────────────────────────────────────────

function MaoBox({
  label,
  value,
  listPrice,
  highlight,
}: {
  label: string;
  value: number | null;
  listPrice: number;
  highlight?: boolean;
}) {
  const gap = value != null ? listPrice - value : null;
  const isNegative = value == null || value <= 0;
  return (
    <div className={`rounded-lg border p-3 text-center ${highlight ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-bold ${isNegative ? 'text-destructive' : highlight ? 'text-primary' : 'text-foreground'}`}>
        {isNegative ? 'No deal' : fmtShort(value)}
      </div>
      {gap != null && value != null && (
        <div className={`text-xs mt-0.5 ${gap > 0 ? 'text-red-400' : 'text-green-400'}`}>
          {gap > 0 ? `${fmtShort(gap)} gap` : 'Works!'}
        </div>
      )}
    </div>
  );
}

// ─── Offer Form ───────────────────────────────────────────────────────────────

function OfferForm({
  dealId,
  record,
  onChange,
}: {
  dealId: string;
  record: OfferRecord;
  onChange: (r: OfferRecord) => void;
}) {
  const update = (patch: Partial<OfferRecord>) => {
    const next = { ...record, ...patch };
    onChange(next);
    saveOffer(dealId, next);
  };

  return (
    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Offer Price</Label>
        <Input
          type="number"
          placeholder="$85,000"
          value={record.offerPrice ?? ''}
          onChange={e => update({ offerPrice: e.target.value ? Number(e.target.value) : null })}
          className="h-8 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Date Sent</Label>
        <Input
          type="date"
          value={record.offerDate ?? ''}
          onChange={e => update({ offerDate: e.target.value || null })}
          className="h-8 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
        <Select value={record.status} onValueChange={v => update({ status: v as OfferStatus })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not_sent">No Offer</SelectItem>
            <SelectItem value="sent">Offer Sent</SelectItem>
            <SelectItem value="responded">Agent Responded</SelectItem>
            <SelectItem value="counter">Counter Received</SelectItem>
            <SelectItem value="dead">Dead</SelectItem>
            <SelectItem value="accepted">Accepted!</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Follow-up Date</Label>
        <Input
          type="date"
          value={record.nextFollowUp ?? ''}
          onChange={e => update({ nextFollowUp: e.target.value || null })}
          className="h-8 text-sm"
        />
      </div>
      {(record.status === 'responded' || record.status === 'counter') && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Counter Price</Label>
          <Input
            type="number"
            placeholder="$120,000"
            value={record.counterPrice ?? ''}
            onChange={e => update({ counterPrice: e.target.value ? Number(e.target.value) : null })}
            className="h-8 text-sm"
          />
        </div>
      )}
      <div className="col-span-2">
        <Label className="text-xs text-muted-foreground mb-1 block">Agent Response / Notes</Label>
        <Textarea
          placeholder="What did the agent say?"
          value={record.agentResponse}
          onChange={e => update({ agentResponse: e.target.value })}
          className="text-sm min-h-[60px] resize-none"
        />
      </div>
    </div>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────

function EmailModal({
  open,
  onClose,
  emailText,
}: {
  open: boolean;
  onClose: () => void;
  emailText: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Offer Email Draft</DialogTitle>
        </DialogHeader>
        <Textarea
          value={emailText}
          readOnly
          className="min-h-[280px] font-mono text-sm resize-none"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={copy}>
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Copied!' : 'Copy Email'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

function AcquisitionCard({ deal }: { deal: Deal }) {
  const analysis = useMemo(() => analyzeAcquisition(deal), [deal]);
  const [offer, setOffer] = useState<OfferRecord>(() => loadOffer(deal.id));
  const [expanded, setExpanded] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailText, setEmailText] = useState('');

  const toggleReviewed = () => {
    const next = { ...offer, numbersReviewed: !offer.numbersReviewed };
    setOffer(next);
    saveOffer(deal.id, next);
  };

  const openEmail = () => {
    if (!analysis) return;
    const price = offer.offerPrice ?? analysis.safeOfferHigh ?? analysis.flipMao.worstCase ?? 0;
    setEmailText(generateOfferEmail(deal, analysis, price));
    setEmailOpen(true);
  };

  if (!analysis) {
    return (
      <Card className="opacity-50">
        <CardContent className="py-4 text-sm text-muted-foreground">
          {deal.address.full} — missing ARV or list price
        </CardContent>
      </Card>
    );
  }

  const { arvAnalysis, rehabAnalysis, flipMao, brrrrMao, requiredDiscount, safeOfferLow, safeOfferHigh } = analysis;
  const isHighRisk = arvAnalysis.confidence === 'red' || rehabAnalysis.confidence === 'low';
  const dealWorks = flipMao.worstCase != null && analysis.listPrice <= (flipMao.worstCase ?? 0);
  const isQualified = deal.status === 'qualified';

  return (
    <>
      <Card className={`border ${isQualified ? 'border-primary/50 ring-1 ring-primary/20' : isHighRisk ? 'border-yellow-500/30' : ''} ${dealWorks ? 'border-green-500/30' : ''}`}>
        <CardHeader className="pb-2 pt-4 px-4">
          {/* Top row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  to={`/deals/${deal.id}`}
                  className="font-semibold text-sm hover:text-primary transition-colors truncate"
                >
                  {deal.address.full}
                </Link>
                <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                {deal.apiData.daysOnMarket != null && (
                  <span className={deal.apiData.daysOnMarket > 45 ? 'text-yellow-400' : ''}>
                    <Clock className="inline w-3 h-3 mr-0.5" />
                    {deal.apiData.daysOnMarket}d on market
                  </span>
                )}
                {deal.apiData.yearBuilt && <span>Built {deal.apiData.yearBuilt}</span>}
                {deal.apiData.bedrooms && (
                  <span>{deal.apiData.bedrooms}bd / {deal.apiData.bathrooms ?? '?'}ba</span>
                )}
                {deal.apiData.sqft && <span>{deal.apiData.sqft.toLocaleString()} sqft</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isQualified && (
                <Badge className="text-xs bg-primary/15 text-primary border-primary/30">Qualified</Badge>
              )}
              <OfferStatusBadge status={offer.status} />
              {isHighRisk && (
                <Tooltip>
                  <TooltipTrigger>
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  </TooltipTrigger>
                  <TooltipContent>High risk: weak ARV or unknown rehab</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-4 space-y-4">
          {/* Price row */}
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <div>
              <span className="text-muted-foreground text-xs">List Price</span>
              <div className="font-bold">{fmt(analysis.listPrice)}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">ARV</span>
              <div className="font-bold">{fmt(analysis.arv)}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Rehab Est.</span>
              <div className="font-bold">
                {rehabAnalysis.base > 0
                  ? `${fmtShort(rehabAnalysis.low)} – ${fmtShort(rehabAnalysis.high)}`
                  : '—'}
              </div>
            </div>
            <div className="flex gap-2 ml-auto">
              <ArvBadge confidence={arvAnalysis.confidence} reason={arvAnalysis.reason} />
              <RehabBadge confidence={rehabAnalysis.confidence} signals={rehabAnalysis.signals} />
            </div>
          </div>

          {/* MAO Grid */}
          <div className="grid grid-cols-3 gap-2">
            <MaoBox label="Safe Offer ↓ Send This" value={flipMao.worstCase} listPrice={analysis.listPrice} highlight />
            <MaoBox label="Base Case" value={flipMao.base} listPrice={analysis.listPrice} />
            <MaoBox label="Best Case ↑ Ceiling" value={flipMao.bestCase} listPrice={analysis.listPrice} />
          </div>

          {/* Works at / Recommendation */}
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Target className="w-3.5 h-3.5" /> Works as Flip below
              </span>
              <span className="font-medium">{fmt(analysis.worksAsFlipBelow)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Works as BRRRR below
              </span>
              <span className="font-medium">{fmt(analysis.worksAsBrrrrBelow)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5">
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" /> Required discount from ask
              </span>
              <span className={`font-bold ${requiredDiscount != null && requiredDiscount > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                {requiredDiscount != null
                  ? requiredDiscount > 0
                    ? `${fmt(requiredDiscount)} needed`
                    : 'Already works!'
                  : '—'}
              </span>
            </div>
            {safeOfferLow != null && safeOfferHigh != null && (
              <div className="flex justify-between font-semibold">
                <span>Send offer at</span>
                <span className="text-primary">{fmtShort(safeOfferLow)} – {fmtShort(safeOfferHigh)}</span>
              </div>
            )}
          </div>

          {/* Numbers reviewed gate */}
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer select-none border transition-colors ${
              offer.numbersReviewed
                ? 'border-green-500/40 bg-green-500/10 text-green-400'
                : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40'
            }`}
            onClick={toggleReviewed}
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${offer.numbersReviewed ? 'bg-green-500 border-green-500' : 'border-muted-foreground'}`}>
              {offer.numbersReviewed && <Check className="w-3 h-3 text-white" />}
            </div>
            <span className="text-xs font-medium">
              {offer.numbersReviewed ? 'Numbers reviewed — ready to offer' : 'Check this after reviewing ARV, rehab, and MAO'}
            </span>
          </div>

          {/* Offer tracking row */}
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={openEmail}
              disabled={!offer.numbersReviewed}
              className="gap-1.5"
              title={!offer.numbersReviewed ? 'Review the numbers above before generating an offer' : undefined}
            >
              <Mail className="w-3.5 h-3.5" />
              Generate Offer Email
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(e => !e)}
              className="gap-1 text-xs text-muted-foreground"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? 'Hide' : 'Track Offer'}
            </Button>
          </div>

          {/* Expanded offer form */}
          {expanded && (
            <OfferForm dealId={deal.id} record={offer} onChange={setOffer} />
          )}
        </CardContent>
      </Card>

      <EmailModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        emailText={emailText}
      />
    </>
  );
}

// ─── Filters ──────────────────────────────────────────────────────────────────

// Only show deals that can still receive an offer — exclude pending/closed/dead
const ACTIVE_STATUSES = new Set(['new', 'under_analysis', 'qualified', 'offer_sent']);

// Minimum ratio: our best-case offer must be at least this fraction of list price
// Filters out deals where the math is so far off that no realistic offer exists
const MIN_OFFER_RATIO = 0.50;

type TimeRange = 'week' | 'month' | 'all';

function cutoffDate(range: TimeRange): Date | null {
  if (range === 'all') return null;
  const d = new Date();
  if (range === 'week') d.setDate(d.getDate() - 7);
  if (range === 'month') d.setMonth(d.getMonth() - 1);
  return d;
}

function passesFilters(
  deal: Deal,
  filters: { domMin: number; offerFilter: string; statusFilter: string; timeRange: TimeRange },
): boolean {
  if (!ACTIVE_STATUSES.has(deal.status)) return false;
  if (filters.statusFilter !== 'all' && deal.status !== filters.statusFilter) return false;

  // Time filter — use analyzedAt if available, else createdAt
  const cutoff = cutoffDate(filters.timeRange);
  if (cutoff) {
    const dateStr = deal.analyzedAt ?? deal.createdAt;
    if (!dateStr || new Date(dateStr) < cutoff) return false;
  }

  const dom = deal.apiData.daysOnMarket;
  if (filters.domMin > 0 && (dom == null || dom < filters.domMin)) return false;

  if (filters.offerFilter !== 'all') {
    const rec = loadOffer(deal.id);
    if (filters.offerFilter === 'no_offer' && rec.status !== 'not_sent') return false;
    if (filters.offerFilter === 'has_offer' && rec.status === 'not_sent') return false;
    if (filters.offerFilter === 'needs_followup') {
      if (!rec.nextFollowUp) return false;
      const today = new Date().toISOString().split('T')[0];
      if (rec.nextFollowUp > today) return false;
    }
  }

  return true;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AcquisitionPage() {
  const { deals } = useDeals();
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [domMin, setDomMin] = useState(0);
  const [offerFilter, setOfferFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const filters = useMemo(() => ({ domMin, offerFilter, statusFilter, timeRange }), [domMin, offerFilter, statusFilter, timeRange]);

  const filtered = useMemo(() => {
    return deals
      .filter(d => passesFilters(d, filters))
      .map(d => ({ deal: d, analysis: analyzeAcquisition(d) }))
      // Only deals where best-case MAO is positive AND offer is ≥ 50% of ask
      .filter(({ analysis }) => {
        if (!analysis || analysis.flipMao.bestCase === null) return false;
        // Exclude deals where even the best offer is unrealistically low vs asking
        if (analysis.safeOfferHigh != null && analysis.listPrice > 0) {
          if (analysis.safeOfferHigh / analysis.listPrice < MIN_OFFER_RATIO) return false;
        }
        return true;
      })
      .sort(({ deal: a, analysis: aa }, { deal: b, analysis: ab }) => {
        // Qualified deals always first
        const aQ = a.status === 'qualified' ? 0 : 1;
        const bQ = b.status === 'qualified' ? 0 : 1;
        if (aQ !== bQ) return aQ - bQ;
        // Then by required discount ascending (less discount needed = better deal)
        const discA = aa?.requiredDiscount ?? Infinity;
        const discB = ab?.requiredDiscount ?? Infinity;
        return discA - discB;
      })
      .map(({ deal }) => deal);
  }, [deals, filters]);

  // Stats — count only deals with at least one viable MAO scenario
  const stats = useMemo(() => {
    const analyzable = deals.filter(d => {
      if (!ACTIVE_STATUSES.has(d.status)) return false;
      const analysis = analyzeAcquisition(d);
      if (!analysis || analysis.flipMao.bestCase === null) return false;
      if (analysis.safeOfferHigh != null && analysis.listPrice > 0) {
        if (analysis.safeOfferHigh / analysis.listPrice < MIN_OFFER_RATIO) return false;
      }
      return true;
    });
    const withOffer = analyzable.filter(d => loadOffer(d.id).status !== 'not_sent');
    const withResponse = analyzable.filter(d => {
      const s = loadOffer(d.id).status;
      return s === 'responded' || s === 'counter' || s === 'accepted';
    });
    const dueFollowup = analyzable.filter(d => {
      const rec = loadOffer(d.id);
      if (!rec.nextFollowUp) return false;
      return rec.nextFollowUp <= new Date().toISOString().split('T')[0];
    });
    return { total: analyzable.length, withOffer: withOffer.length, withResponse: withResponse.length, dueFollowup: dueFollowup.length };
  }, [deals]);

  const resetFilters = useCallback(() => {
    setTimeRange('week');
    setDomMin(0);
    setOfferFilter('all');
    setStatusFilter('all');
  }, []);

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Acquisition Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">
            At what price does each deal work? Focus on offers, not scores.
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 shrink-0">
          {(['week', 'month', 'all'] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                timeRange === r
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r === 'week' ? 'Last 7 days' : r === 'month' ? 'Last 30 days' : 'All time'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Analyzable Deals', value: stats.total },
          { label: 'Offers Sent', value: stats.withOffer },
          { label: 'Responses', value: stats.withResponse },
          { label: 'Follow-ups Due', value: stats.dueFollowup, highlight: stats.dueFollowup > 0 },
        ].map(s => (
          <div key={s.label} className={`rounded-lg border p-3 text-center ${s.highlight ? 'border-orange-500/40 bg-orange-500/5' : 'border-border bg-card'}`}>
            <div className={`text-2xl font-bold ${s.highlight ? 'text-orange-400' : ''}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="border border-border rounded-lg">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors"
          onClick={() => setShowFilters(f => !f)}
        >
          <span className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
            {(domMin > 0 || offerFilter !== 'all' || statusFilter !== 'all') && (
              <Badge variant="secondary" className="text-xs">Active</Badge>
            )}
          </span>
          {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showFilters && (
          <div className="border-t border-border px-4 py-3 grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Min Days on Market</Label>
              <Select value={String(domMin)} onValueChange={v => setDomMin(Number(v))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Any DOM</SelectItem>
                  <SelectItem value="14">14+ days</SelectItem>
                  <SelectItem value="30">30+ days</SelectItem>
                  <SelectItem value="45">45+ days (stale)</SelectItem>
                  <SelectItem value="60">60+ days</SelectItem>
                  <SelectItem value="90">90+ days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Offer Status</Label>
              <Select value={offerFilter} onValueChange={setOfferFilter}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="no_offer">No offer sent</SelectItem>
                  <SelectItem value="has_offer">Offer sent</SelectItem>
                  <SelectItem value="needs_followup">Follow-up due</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Deal Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Active</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="under_analysis">Under Analysis</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="offer_sent">Offer Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3 flex justify-end">
              <Button size="sm" variant="ghost" onClick={resetFilters} className="text-xs">
                Reset filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="text-sm text-muted-foreground">
        Showing {filtered.length} deal{filtered.length !== 1 ? 's' : ''}
        {filtered.length < stats.total && ' (filtered)'}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No deals match your filters</p>
          <p className="text-sm mt-1">Try adjusting the filters above, or make sure deals have ARV and list price set.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(deal => (
            <AcquisitionCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}
