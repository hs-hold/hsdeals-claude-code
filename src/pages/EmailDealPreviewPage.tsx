import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, ExternalLink, Zap, ChevronDown, ChevronUp, Mail } from 'lucide-react';
import { formatCurrency } from '@/utils/financialCalculations';

// ── Types (mirrored from EmailSearchPage) ───────────────────────────────────

type EmailAction =
  | 'created'
  | 'updated_existing'
  | 'skipped_duplicate'
  | 'skipped_portal'
  | 'skipped_over_budget'
  | 'skipped_wrong_state'
  | 'no_address'
  | 'error';

interface ExtractedData {
  arv?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  rehabCost?: number | null;
  rent?: number | null;
  capRate?: number | null;
  cashFlow?: number | null;
  propertyType?: string | null;
  condition?: string | null;
  occupancy?: string | null;
  dealNotes?: string | null;
  financingNotes?: string | null;
  propertyDescription?: string | null;
  photoLinks?: string[];
  imageLinks?: string[];
  lotSize?: string | null;
  units?: number | null;
  county?: string | null;
  neighborhood?: string | null;
  exterior?: string | null;
  access?: string | null;
  documentLinks?: Array<{ label: string; url: string }>;
}

export interface EmailResultItem {
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
  messageId?: string;
  extractedData?: ExtractedData;
  emailSnippet?: string;
  extractionSource?: 'ai' | 'regex';
  existingDealId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function gmailLink(messageId?: string): string | null {
  if (!messageId) return null;
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

function dealTypeBadgeColor(dealType?: string | null): string {
  if (!dealType) return 'bg-muted/30 text-muted-foreground border-border/40';
  const dt = dealType.toLowerCase();
  if (dt.includes('flip')) return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  if (dt.includes('hold') || dt.includes('brrrr')) return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  if (dt.includes('wholesale')) return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
  if (dt.includes('multi') || dt.includes('duplex') || dt.includes('triplex') || dt.includes('fourplex')) return 'bg-teal-500/10 text-teal-400 border-teal-500/30';
  return 'bg-muted/30 text-muted-foreground border-border/40';
}

interface MetricRowProps {
  label: string;
  value: string | number | null | undefined;
}

function MetricRow({ label, value }: MetricRowProps) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/20 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">
        {value !== null && value !== undefined && value !== '' ? String(value) : '—'}
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EmailDealPreviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [emailOpen, setEmailOpen] = useState(false);

  const item = (location.state as { emailItem?: EmailResultItem } | null)?.emailItem;

  if (!item) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Email Scanner
        </Button>
        <p className="text-muted-foreground">No email data found. Please navigate here from the Email Scanner.</p>
      </div>
    );
  }

  const ed = item.extractedData;
  const gmailUrl = gmailLink(item.messageId);

  const allPhotoLinks = [
    ...(ed?.photoLinks ?? []),
    ...(ed?.imageLinks ?? []),
  ].filter(Boolean);
  const uniquePhotoLinks = [...new Set(allPhotoLinks)];
  const documentLinks = ed?.documentLinks ?? [];

  // Determine navigation target for the analyze button
  function handleAnalyze() {
    if (item.dealId) {
      navigate(`/deals/${item.dealId}`, { state: { triggerAnalysis: true } });
      return;
    }
    if (item.action === 'skipped_duplicate' && (item as any).existingDealId) {
      navigate(`/deals/${(item as any).existingDealId}`);
      return;
    }
    if (item.action === 'no_address' || !item.dealId) {
      alert('Cannot analyze: no address was found for this email.');
      return;
    }
    // Fallback
    navigate('/analyze/email');
  }

  const targetDealId = item.dealId || (item.action === 'skipped_duplicate' ? (item as any).existingDealId : null);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 animate-fade-in">

      {/* Back link */}
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Email Scanner
      </Button>

      {/* Header card */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
              <Mail className="w-3.5 h-3.5" />
              <span>Email Deal</span>
            </div>
            <h1 className="text-xl font-bold truncate">{item.subject || item.address}</h1>
          </div>
          {gmailUrl && (
            <a href={gmailUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="shrink-0 gap-1">
                Open in Gmail <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          )}
        </div>

        {/* Sender row */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {item.senderName && <span className="font-medium text-foreground">{item.senderName}</span>}
          {item.senderEmail && <span className="font-mono text-xs">{item.senderEmail}</span>}
          {item.extractionSource && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
              item.extractionSource === 'ai'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            }`}>
              {item.extractionSource === 'ai' ? 'AI extracted' : 'Regex fallback'}
            </span>
          )}
          {item.dealType && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${dealTypeBadgeColor(item.dealType)}`}>
              {item.dealType}
            </span>
          )}
        </div>
      </div>

      <Separator />

      {/* Metrics grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <MetricRow label="Ask Price" value={item.purchasePrice ? formatCurrency(item.purchasePrice) : null} />
        <MetricRow label="ARV" value={ed?.arv ? formatCurrency(ed.arv) : null} />
        <MetricRow label="Rehab Est." value={ed?.rehabCost ? formatCurrency(ed.rehabCost) : null} />
        <MetricRow label="Rent (mo)" value={ed?.rent ? `$${ed.rent.toLocaleString()}/mo` : null} />
        <MetricRow label="Beds" value={ed?.bedrooms} />
        <MetricRow label="Baths" value={ed?.bathrooms} />
        <MetricRow label="Sqft" value={ed?.sqft ? ed.sqft.toLocaleString() : null} />
        <MetricRow label="Built" value={ed?.yearBuilt} />
        <MetricRow label="Lot" value={ed?.lotSize} />
        <MetricRow label="County" value={ed?.county} />
        <MetricRow label="Type" value={ed?.propertyType} />
        <MetricRow label="Condition" value={ed?.condition} />
        <MetricRow label="Exterior" value={ed?.exterior} />
        <MetricRow label="Access" value={ed?.access} />
        <MetricRow label="Occupancy" value={ed?.occupancy} />
        <MetricRow label="Area" value={ed?.neighborhood} />
      </div>

      {/* Photo / document links */}
      {(uniquePhotoLinks.length > 0 || documentLinks.length > 0) && (
        <>
          <Separator />
          <div className="flex flex-wrap gap-2">
            {uniquePhotoLinks.slice(0, 6).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="text-xs gap-1 text-blue-400 border-blue-500/30">
                  📷 {i === 0 ? 'Photos' : `Photos ${i + 1}`}
                </Button>
              </a>
            ))}
            {documentLinks.slice(0, 6).map((dl, i) => (
              <a key={i} href={dl.url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="text-xs gap-1 text-indigo-400 border-indigo-500/30">
                  📄 {dl.label}
                </Button>
              </a>
            ))}
          </div>
        </>
      )}

      <Separator />

      {/* Collapsible email content */}
      <Collapsible open={emailOpen} onOpenChange={setEmailOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground text-xs w-full justify-start -ml-1">
            {emailOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Email Content
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="rounded-lg border border-border/40 bg-muted/20 p-4 space-y-3 text-sm">
            {item.subject && (
              <p className="font-semibold text-foreground">{item.subject}</p>
            )}
            {(item.emailSnippet || ed?.propertyDescription) && (
              <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed text-xs">
                {item.emailSnippet || ed?.propertyDescription}
              </p>
            )}
            {ed?.dealNotes && (
              <p className="text-muted-foreground/70 text-xs italic">{ed.dealNotes}</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      {/* Actions */}
      <div className="space-y-3">
        <Button
          size="lg"
          className="w-full gap-2"
          onClick={handleAnalyze}
        >
          <Zap className="w-4 h-4" />
          {targetDealId ? 'Analyze with DealBeast' : 'Cannot Analyze (No Address)'}
        </Button>

        {targetDealId && (
          <Link to={`/deals/${targetDealId}`} className="block">
            <Button variant="outline" size="sm" className="w-full text-xs text-muted-foreground">
              Already analyzed? View Deal →
            </Button>
          </Link>
        )}
      </div>

    </div>
  );
}
