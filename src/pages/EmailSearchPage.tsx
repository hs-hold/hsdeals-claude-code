import { useState, useCallback, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useGmailAuth } from '@/hooks/useGmailAuth';
import { useGmailSync } from '@/hooks/useGmailSync';
import { useUserState } from '@/hooks/useUserState';
import { useDeals } from '@/context/DealsContext';
import { useSyncAnalyze } from '@/context/SyncAnalyzeContext';
import { isDealAnalyzed } from '@/utils/dealHelpers';
import { formatCurrency } from '@/utils/financialCalculations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Mail, Loader2, CheckCircle, CheckCircle2,
  Zap, MapPin, MailOpen, AlertCircle, Trash2,
  ExternalLink, Pencil, RotateCcw, Bed, Bath,
  Square, Image, History, ChevronDown, ArrowLeft,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Deal } from '@/types/deal';

// ── Types ───────────────────────────────────────────────────────────────────

type EmailAction =
  | 'created'
  | 'updated_existing'
  | 'skipped_duplicate'
  | 'skipped_portal'
  | 'skipped_over_budget'
  | 'skipped_wrong_state'
  | 'no_address'
  | 'error'
  | 'message'
  | 'skipped_newsletter';

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
  documentLinks?: Array<{label: string; url: string}>;
}

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
  messageId?: string;
  extractedData?: ExtractedData;
  emailSnippet?: string;
  extractionSource?: 'ai' | 'regex';
  isImportant?: boolean;
  messagePreview?: string;
}

const SCAN_COUNTS = [10, 20, 40, 60, 100] as const;
type ScanCount = typeof SCAN_COUNTS[number];

// ── Session history ──────────────────────────────────────────────────────────

interface ScanSession {
  id: string;
  startedAt: string;
  results: EmailResultItem[];
}

const SESSIONS_KEY = 'email_scan_sessions_v3';
const SESSION_MAX_DAYS = 30;

function loadSessions(): ScanSession[] {
  try {
    const saved = localStorage.getItem(SESSIONS_KEY);
    if (!saved) return [];
    const all: ScanSession[] = JSON.parse(saved);
    const cutoff = Date.now() - SESSION_MAX_DAYS * 24 * 60 * 60 * 1000;
    return all.filter(s => new Date(s.startedAt).getTime() > cutoff);
  } catch { return []; }
}

function sessionLabel(s: ScanSession): string {
  const d = new Date(s.startedAt);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const count = s.results.filter(r => isActionable(r.action)).length;
  return `${date} • ${time} — ${count} deals`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function looksLikeAddress(s?: string): boolean {
  if (!s) return false;
  return /^\d+\s+\S+.*,\s*[a-zA-Z\s]+,\s*[a-zA-Z]{2}\s+\d{5}/i.test(s.trim());
}

// Address has a real street number (needed for DealBeast analysis)
function hasStreetNumber(s?: string): boolean {
  if (!s) return false;
  return /^\d+\s/.test(s.trim());
}

interface SnippetData {
  price: number | null; arv: number | null; rehabCost: number | null; rent: number | null;
  beds: number | null; baths: number | null; sqft: number | null;
  yearBuilt: number | null; lotSize: string | null;
}

/** Extract all deal fields from Gmail snippet as fallback when AI extraction returns nulls */
function extractFromSnippet(snippet?: string): SnippetData {
  const empty: SnippetData = { price: null, arv: null, rehabCost: null, rent: null, beds: null, baths: null, sqft: null, yearBuilt: null, lotSize: null };
  if (!snippet) return empty;
  const s = snippet.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#\d+;/g, '');

  const num = (m: RegExpMatchArray | null, g = 1) => m ? parseInt(m[g].replace(/,/g, ''), 10) || null : null;
  const flt = (m: RegExpMatchArray | null, g = 1) => m ? parseFloat(m[g]) || null : null;

  // Price: "Purchase Price: $162,000", "PRICE: $320,000", "Asking: $585,000", "Offer: $150k"
  const price = num(s.match(/(?:purchase\s+price|asking\s+price|asking|price|offer)[:\s]+\$?([\d,]+)/i) ?? s.match(/\$([\d,]{5,})/));

  // ARV: "ARV: $285,000", "After Repair Value: $300k"
  const arv = num(s.match(/(?:arv|after\s+repair\s+value)[:\s]+\$?([\d,]+)/i));

  // Rehab / Budget: "Budget: $60,000", "Rehab: $45k", "Repairs: $30,000"
  const rehabCost = num(s.match(/(?:budget|rehab|repair[s]?|renovation)[:\s]+\$?([\d,]+)/i));

  // Rent: "Market Rent: $1800", "Rent: $1,500/mo"
  const rent = num(s.match(/(?:market\s+rent|rent)[:\s]+\$?([\d,]+)/i));

  // Beds: "3 Beds", "4BD", "4 Bedrooms", "Bedrooms: 3"
  const beds = num(s.match(/(\d+)\s*(?:bd|bed(?:room)?s?)\b/i) ?? s.match(/bed(?:room)?s?[:\s]+(\d+)/i));

  // Baths: "3 Baths", "2.5 BA", "Bathrooms: 2"
  const baths = flt(s.match(/([\d.]+)\s*(?:ba|bath(?:room)?s?)\b/i) ?? s.match(/bath(?:room)?s?[:\s]+([\d.]+)/i));

  // Sqft: "2,314 Sq Ft", "1500 sqft", "Total Interior Area: 2,314", "Interior: 1,500"
  const sqft = num(
    s.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|sf)\b/i) ??
    s.match(/(?:total\s+interior\s+area|interior\s+area|living\s+area)[:\s]+([\d,]+)/i)
  );

  // Year Built: "Year Built: 2004", "Built: 1985", "Built in 2001"
  const yearBuilt = num(s.match(/(?:year\s+built|built)[:\s]+(\d{4})/i) ?? s.match(/built\s+in\s+(\d{4})/i));

  // Lot Size: "Lot Size: .520 Acres", "0.37 acres", "Lot: 6,500 sqft"
  const lotMatch = s.match(/(?:lot\s+size|lot)[:\s]+([\d.,]+\s*(?:acres?|sq\.?\s*ft|sf))/i);
  const lotSize = lotMatch ? lotMatch[1].trim() : null;

  return { price, arv, rehabCost, rent, beds, baths, sqft, yearBuilt, lotSize };
}

function isActionable(action: EmailAction): boolean {
  return action === 'created' || action === 'updated_existing';
}

function gmailLink(messageId?: string): string | null {
  if (!messageId) return null;
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

function getPhotoLink(data?: ExtractedData): string | null {
  if (!data) return null;
  const links = [...(data.photoLinks ?? []), ...(data.imageLinks ?? [])];
  return links[0] ?? null;
}

function getPhotoLinks(data?: ExtractedData): string[] {
  if (!data) return [];
  return [...new Set([...(data.photoLinks ?? []), ...(data.imageLinks ?? [])])];
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

function actionBadgeConfig(action: EmailAction) {
  if (action === 'created')          return { text: 'New Deal', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
  if (action === 'updated_existing') return { text: 'Updated', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' };
  if (action === 'skipped_portal')   return { text: 'Portal', color: 'bg-muted/10 text-muted-foreground border-border/30' };
  if (action === 'skipped_duplicate')return { text: 'Duplicate', color: 'bg-muted/10 text-muted-foreground border-border/30' };
  if (action === 'skipped_over_budget') return { text: 'Over Budget', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' };
  if (action === 'skipped_wrong_state') return { text: 'Wrong State', color: 'bg-muted/10 text-muted-foreground border-border/30' };
  if (action === 'no_address') return { text: 'No Address', color: 'bg-muted/10 text-muted-foreground/60 border-border/20' };
  if (action === 'error')            return { text: 'Error', color: 'bg-red-500/10 text-red-400 border-red-500/30' };
  if (action === 'message')          return { text: 'Message', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' };
  if (action === 'skipped_newsletter') return { text: 'Newsletter', color: 'bg-muted/10 text-muted-foreground/50 border-border/20' };
  return { text: action, color: 'bg-muted/10 text-muted-foreground border-border/30' };
}

// ── Message Row ──────────────────────────────────────────────────────────────

function MessageRow({ item }: { item: EmailResultItem }) {
  const gmailUrl = gmailLink(item.messageId);
  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-border/20 last:border-0 transition-colors hover:bg-muted/10 ${item.isImportant ? 'bg-blue-500/5' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{item.senderName || item.senderEmail}</span>
          {item.senderEmail && item.senderName && (
            <span className="text-xs text-muted-foreground truncate">{item.senderEmail}</span>
          )}
          {item.isImportant && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase tracking-wide">Important</span>
          )}
        </div>
        {item.subject && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.subject}</p>
        )}
        {item.messagePreview && (
          <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{item.messagePreview}</p>
        )}
      </div>
      {gmailUrl && (
        <a href={gmailUrl} target="_blank" rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title="Open in Gmail">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

// ── Property Row ──────────────────────────────────────────────────────────────

interface PropertyRowProps {
  item: EmailResultItem;
  isAnalyzingThis: boolean;
  isDone: boolean;
  isError: boolean;
  analyzeError?: string;
  isCreating: boolean;
  grade?: string | null;
  editingKey: string | null;
  editAddr: string;
  selected: boolean;
  onToggleSelect: () => void;
  onAnalyze: () => void;
  onStartEdit: () => void;
  onEditChange: (val: string) => void;
  onEditSubmit: () => void;
  onEditCancel: () => void;
  onCreateAndAnalyze: (addr?: string) => void;
}

function PropertyRow({
  item, isAnalyzingThis, isDone, isError, analyzeError, isCreating,
  grade,
  editingKey, editAddr, selected,
  onToggleSelect, onAnalyze, onStartEdit, onEditChange, onEditSubmit, onEditCancel, onCreateAndAnalyze,
}: PropertyRowProps) {
  const actionable = isActionable(item.action);
  const addrHasStreet = hasStreetNumber(item.address);
  const hasPrice = item.purchasePrice != null && item.purchasePrice > 0;
  const canAnalyze = actionable && addrHasStreet && hasPrice;
  const { text: badgeText, color: badgeColor } = actionBadgeConfig(item.action);
  const subjectIsAddr = looksLikeAddress(item.subject);
  const suggestedAddr = item.action === 'no_address' && subjectIsAddr ? item.subject! : undefined;
  const isEditing = editingKey === item.key;
  const gmailUrl = gmailLink(item.messageId);
  const photoLinks = getPhotoLinks(item.extractedData);
  const firstPhoto = photoLinks[0] ?? null;
  const ed = item.extractedData;

  // Build the email preview content for the hover card
  const emailPreview = [
    item.subject ? `Subject: ${item.subject}` : null,
    item.emailSnippet || null,
    ed?.propertyDescription || ed?.dealNotes || null,
  ].filter(Boolean).join('\n\n');

  const rowOpacity = actionable ? '' : 'opacity-60 hover:opacity-80';
  const displayAddress = item.action === 'no_address'
    ? (suggestedAddr ?? item.subject ?? '(no subject)')
    : item.address;

  // Fallback: extract all fields from Gmail snippet when AI extraction returned nulls
  const sn = extractFromSnippet(item.emailSnippet);
  const displayPrice    = item.purchasePrice    ?? sn.price;
  const displayArv      = ed?.arv               ?? sn.arv;
  const displayRehabCost= ed?.rehabCost         ?? sn.rehabCost;
  const displayRent     = ed?.rent              ?? sn.rent;
  const displayBeds     = ed?.bedrooms          ?? sn.beds;
  const displayBaths    = ed?.bathrooms         ?? sn.baths;
  const displaySqft     = ed?.sqft              ?? sn.sqft;
  const displayYearBuilt= ed?.yearBuilt         ?? sn.yearBuilt;
  const displayLotSize  = ed?.lotSize           ?? sn.lotSize;
  const priceFromSnippet = !item.purchasePrice && !!sn.price;
  const specsFromSnippet = !ed?.bedrooms && !ed?.bathrooms && !ed?.sqft && (sn.beds || sn.baths || sn.sqft);

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-border/20 last:border-0 transition-colors hover:bg-muted/10 ${selected ? 'bg-primary/5' : ''} ${rowOpacity}`}>

      {/* Checkbox */}
      <div className="w-4 shrink-0">
        {actionable
          ? <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="w-3.5 h-3.5" />
          : <div className="w-3.5" />
        }
      </div>

      {/* Address */}
      <div className="w-56 shrink-0 min-w-0">
        {item.dealId ? (
          <Link to={`/deals/${item.dealId}`} className="font-medium text-sm hover:text-primary transition-colors block truncate">
            {displayAddress}
          </Link>
        ) : item.messageId && item.action !== 'no_address' ? (
          <Link
            to={`/email-preview/${item.messageId}`}
            state={{ emailItem: item }}
            className="font-medium text-sm hover:text-primary transition-colors block truncate"
          >
            {displayAddress}
          </Link>
        ) : (
          <span className={`font-medium text-sm block truncate ${item.action === 'no_address' ? 'text-muted-foreground/60 italic' : ''}`}>
            {displayAddress}
          </span>
        )}
        {/* Warn when address has no street number — DealBeast needs a real address */}
        {actionable && !addrHasStreet && (
          <span className="text-[10px] text-amber-500/70 block">⚠ no street number</span>
        )}
      </div>

      {/* Price */}
      <div className="w-24 shrink-0">
        {displayPrice ? (
          <span className={`text-sm font-semibold ${priceFromSnippet ? 'text-muted-foreground/70 italic' : ''}`}>
            {formatCurrency(displayPrice)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/30">—</span>
        )}
      </div>

      {/* Specs: beds / baths */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground w-20 shrink-0">
        {displayBeds  && <span className={`flex items-center gap-0.5 ${specsFromSnippet ? 'opacity-60' : ''}`}><Bed  className="w-3 h-3" />{displayBeds}</span>}
        {displayBaths && <span className={`flex items-center gap-0.5 ${specsFromSnippet ? 'opacity-60' : ''}`}><Bath className="w-3 h-3" />{displayBaths}</span>}
        {!displayBeds && !displayBaths && <span className="text-muted-foreground/30">—</span>}
      </div>

      {/* Sqft */}
      <div className="w-20 shrink-0 text-xs text-muted-foreground">
        {displaySqft ? (
          <span className={`flex items-center gap-0.5 ${specsFromSnippet ? 'opacity-60' : ''}`}>
            <Square className="w-3 h-3" />{displaySqft.toLocaleString()}
          </span>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </div>

      {/* Sender */}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground truncate block">
          {item.senderName || item.senderEmail || '—'}
        </span>
      </div>

      {/* Action badge / Grade */}
      {isDone && grade ? (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${
          Number(grade) >= 8 ? 'bg-green-500/15 border-green-500/30 text-green-400' :
          Number(grade) >= 6 ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' :
          'bg-red-500/15 border-red-500/30 text-red-400'
        }`}>{grade}/10</span>
      ) : (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${badgeColor}`}>{badgeText}</span>
      )}

      {/* Icon buttons: Photos · Gmail · Email content hover */}
      <div className="flex items-center gap-0.5 shrink-0">
        {firstPhoto ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={firstPhoto} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-blue-400 hover:text-blue-300">
                  <Image className="w-3.5 h-3.5" />
                </Button>
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">
              {photoLinks.length > 1 ? `${photoLinks.length} Photos` : 'View Photo'}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="w-6" />
        )}

        {gmailUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={gmailUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">Open in Gmail</TooltipContent>
          </Tooltip>
        ) : (
          <div className="w-6" />
        )}

        {/* Email content on hover */}
        <HoverCard openDelay={150} closeDelay={100}>
          <HoverCardTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 gap-1"
            >
              <Mail className="w-3 h-3" />
              Email
            </Button>
          </HoverCardTrigger>
          <HoverCardContent side="left" align="start" className="w-96 text-xs space-y-2 p-3">
            {item.subject && (
              <p className="font-semibold text-foreground leading-snug">{item.subject}</p>
            )}
            {item.senderName && (
              <p className="text-muted-foreground text-[11px]">
                From: {item.senderName}{item.senderEmail ? ` · ${item.senderEmail}` : ''}
                {item.extractionSource && (
                  <span className={`ml-2 font-mono text-[10px] px-1 rounded ${item.extractionSource === 'ai' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {item.extractionSource === 'ai' ? '✓ AI' : '⚠ Regex fallback'}
                  </span>
                )}
              </p>
            )}

            {/* All deal data — AI-extracted first, snippet fallback second */}
            {(displayPrice || displayArv || displayBeds || displayBaths || displaySqft || displayYearBuilt || displayLotSize || displayRehabCost || displayRent || ed?.occupancy || item.dealType) && (
              <div className="border-t border-border/30 pt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                {displayPrice     && <span><span className="text-muted-foreground">Ask: </span><span className="text-foreground font-semibold">{formatCurrency(displayPrice)}</span></span>}
                {displayArv       && <span><span className="text-muted-foreground">ARV: </span><span className="text-foreground">{formatCurrency(displayArv)}</span></span>}
                {displayRehabCost && <span><span className="text-muted-foreground">Rehab: </span><span className="text-foreground">{formatCurrency(displayRehabCost)}</span></span>}
                {displayRent      && <span><span className="text-muted-foreground">Rent: </span><span className="text-foreground">${displayRent.toLocaleString()}/mo</span></span>}
                {displayBeds      && <span><span className="text-muted-foreground">Beds: </span><span className="text-foreground">{displayBeds}</span></span>}
                {displayBaths     && <span><span className="text-muted-foreground">Baths: </span><span className="text-foreground">{displayBaths}</span></span>}
                {displaySqft      && <span><span className="text-muted-foreground">Sqft: </span><span className="text-foreground">{displaySqft.toLocaleString()}</span></span>}
                {displayYearBuilt && <span><span className="text-muted-foreground">Built: </span><span className="text-foreground">{displayYearBuilt}</span></span>}
                {displayLotSize   && <span><span className="text-muted-foreground">Lot: </span><span className="text-foreground">{displayLotSize}</span></span>}
                {ed?.occupancy    && <span><span className="text-muted-foreground">Occ: </span><span className="text-foreground">{ed.occupancy}</span></span>}
                {item.dealType    && <span><span className="text-muted-foreground">Type: </span><span className="text-foreground">{item.dealType}</span></span>}
                {ed?.county       && <span><span className="text-muted-foreground">County: </span><span className="text-foreground">{ed.county}</span></span>}
                {ed?.neighborhood && <span><span className="text-muted-foreground">Area: </span><span className="text-foreground">{ed.neighborhood}</span></span>}
                {ed?.condition    && <span><span className="text-muted-foreground">Condition: </span><span className="text-foreground">{ed.condition}</span></span>}
                {ed?.exterior     && <span><span className="text-muted-foreground">Exterior: </span><span className="text-foreground">{ed.exterior}</span></span>}
                {ed?.access       && <span><span className="text-muted-foreground">Access: </span><span className="text-foreground">{ed.access}</span></span>}
              </div>
            )}

            {/* Document / file links */}
            {ed?.documentLinks && ed.documentLinks.length > 0 && (
              <div className="border-t border-border/30 pt-2 flex flex-wrap gap-1.5">
                {ed.documentLinks.map((dl, i) => (
                  <a
                    key={i}
                    href={dl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 transition-colors"
                  >
                    {dl.label}
                  </a>
                ))}
              </div>
            )}

            {/* Debug: body preview for no_address emails */}
            {item.action === 'no_address' && item.reason && item.reason.startsWith('No address found. Body preview:') && (
              <div className="border-t border-border/30 pt-2">
                <p className="text-amber-400/80 text-[10px] font-medium mb-0.5">Body sent to AI:</p>
                <p className="text-muted-foreground/70 whitespace-pre-wrap line-clamp-6 leading-relaxed text-[10px] font-mono">
                  {item.reason.replace('No address found. Body preview: "', '').replace(/"$/, '')}
                </p>
              </div>
            )}

            {/* Email snippet / description */}
            {(item.emailSnippet || ed?.propertyDescription || ed?.dealNotes) ? (
              <p className="text-muted-foreground/80 whitespace-pre-wrap line-clamp-8 leading-relaxed border-t border-border/30 pt-2 text-[11px]">
                {item.emailSnippet || ed?.propertyDescription || ed?.dealNotes}
              </p>
            ) : (
              <p className="text-muted-foreground/40 italic text-[11px]">No preview available</p>
            )}
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Inline address editor */}
      {isEditing && (
        <div className="absolute left-4 right-4 mt-8 flex items-center gap-1.5 z-10">
          <Input autoFocus value={editAddr} onChange={e => onEditChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onEditSubmit(); if (e.key === 'Escape') onEditCancel(); }}
            placeholder="123 Main St, Atlanta, GA 30301"
            className="h-7 text-xs flex-1" />
          <Button size="sm" className="h-7 px-3 text-xs" onClick={onEditSubmit} disabled={isCreating}>
            {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Zap className="w-3 h-3" /> Analyze</>}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEditCancel}>✕</Button>
        </div>
      )}

      {/* Right-most action button */}
      <div className="shrink-0 w-24 flex justify-end">
        {suggestedAddr && !isEditing && (
          <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-amber-400 border-amber-500/30"
            onClick={() => onCreateAndAnalyze(suggestedAddr)} disabled={isCreating}>
            {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Zap className="w-3 h-3 mr-1" />Analyze</>}
          </Button>
        )}
        {item.action === 'no_address' && !suggestedAddr && !isEditing && (
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-muted-foreground"
            onClick={onStartEdit}>
            <Pencil className="w-3 h-3 mr-1" /> Add
          </Button>
        )}
        {isAnalyzingThis && (
          <span className="text-xs text-primary flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
          </span>
        )}
        {isError && (
          <span className="text-[10px] text-red-400">{analyzeError || 'Error'}</span>
        )}
        {isDone && item.dealId && (
          <Link to={`/deals/${item.dealId}`}>
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-green-500">
              <CheckCircle2 className="w-3 h-3 mr-1" /> View
            </Button>
          </Link>
        )}
        {canAnalyze && !isDone && !isAnalyzingThis && (
          <Button size="sm" variant="outline" className="h-7 text-xs px-3"
            onClick={onAnalyze}>
            <Zap className="w-3 h-3 mr-1" /> Analyze
          </Button>
        )}
        {actionable && !isDone && !isAnalyzingThis && addrHasStreet && !hasPrice && (
          <span className="text-[10px] text-amber-500/70">no price</span>
        )}
        {actionable && !isDone && !isAnalyzingThis && !addrHasStreet && (
          <span className="text-[10px] text-muted-foreground/40">no address</span>
        )}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EmailSearchPage() {
  const { isConnected, isLoading: isAuthLoading, tokens, connect, disconnect, getValidToken } = useGmailAuth();
  const { isSyncing, isMarkingOld, syncBatch, markOldAsRead, markUnreadRecent, markMessageRead } = useGmailSync();
  const { selectedState } = useUserState();
  const { deals, refetch } = useDeals();
  const {
    isRunning: isAnalyzing,
    analyzedDeals: analyzeQueue,
    totalToAnalyze,
    startAnalyzeList,
  } = useSyncAnalyze();

  const [scanCount, setScanCount] = useState<ScanCount>(100);
  // Current scan results (always starts empty — no auto-restore)
  const [results, setResults] = useState<EmailResultItem[]>([]);
  // Historical sessions (persisted in localStorage)
  const [sessions, setSessions] = useState<ScanSession[]>(loadSessions);
  // Which historical session is being viewed (null = current scan)
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'deals' | 'readyToAnalyze' | 'skipped' | 'messages'>('readyToAnalyze');
  const [maxPrice, setMaxPrice] = useState<number>(220000);
  const [minPrice, setMinPrice] = useState<number>(0);
  const [minSqft,  setMinSqft]  = useState<number>(0);
  const [minBeds,  setMinBeds]  = useState<number>(0);

  // Derived: what's actually shown (current scan or historical session)
  const isViewingHistory = viewingSessionId !== null;
  const displayResults = isViewingHistory
    ? (sessions.find(s => s.id === viewingSessionId)?.results ?? [])
    : results;

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editAddr, setEditAddr] = useState('');
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  // Batch scan progress
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // ── Scan ──────────────────────────────────────────────────────────────────

  // ── Batched scan: fetch message IDs from Gmail API, then process in batches of 8 ──

  const saveCurrentToHistory = useCallback((items: EmailResultItem[]) => {
    if (items.length === 0) return;
    const session: ScanSession = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), results: items };
    setSessions(prev => {
      const cutoff = Date.now() - SESSION_MAX_DAYS * 24 * 60 * 60 * 1000;
      const updated = [session, ...prev].filter(s => new Date(s.startedAt).getTime() > cutoff);
      try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const handleBatchedScan = useCallback(async (includeRead: boolean, forceRescan = false) => {
    if (!tokens?.access_token || isSyncing) return;

    const accessToken = await getValidToken();
    if (!accessToken) return;

    // Save current results to history before starting a new scan
    if (results.length > 0 && !forceRescan) {
      saveCurrentToHistory(results);
    }
    setResults([]);
    setViewingSessionId(null);
    setSelected(new Set());

    const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
    const headers = { 'Authorization': `Bearer ${accessToken}` };

    // Build query
    const labelParam = includeRead ? '' : '&labelIds=UNREAD';
    const listUrl = `${GMAIL}/messages?maxResults=${scanCount}${labelParam}`;

    let msgIds: string[];
    try {
      const listRes = await fetch(listUrl, { headers });
      if (!listRes.ok) {
        const err = await listRes.text();
        toast.error(`Gmail list failed: ${err}`);
        return;
      }
      const listData = await listRes.json();
      msgIds = (listData.messages || []).map((m: { id: string }) => m.id);
    } catch (e) {
      toast.error('Failed to fetch email list');
      return;
    }

    if (msgIds.length === 0) {
      toast.info('No emails found to scan');
      return;
    }

    const BATCH_SIZE = 8;
    const totalBatches = Math.ceil(msgIds.length / BATCH_SIZE);
    setBatchProgress({ current: 0, total: totalBatches });

    const options = {
      includeRead,
      forceRescan,
      markAllRead: false,
      targetState: selectedState && selectedState !== 'ALL' ? selectedState : undefined,
    };

    for (let i = 0; i < msgIds.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      setBatchProgress({ current: batchNum, total: totalBatches });

      const batchIds = msgIds.slice(i, i + BATCH_SIZE);
      const result = await syncBatch(accessToken, batchIds, options);

      if (result?.syncDetails) {
        const scannedAt = new Date().toISOString();
        const newItems: EmailResultItem[] = result.syncDetails
          .filter((d: any) => d.action !== 'skipped_portal')
          .map((d: any, idx: number) => {
            const dealId = d.dealId || d.existingDealId || null;
            return {
              key: dealId ?? `skip-${scannedAt}-${batchNum}-${idx}`,
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
              messageId: d.messageId ?? undefined,
              extractedData: d.extractedData ?? undefined,
              emailSnippet: d.emailSnippet ?? undefined,
              extractionSource: d.extractionSource ?? undefined,
              isImportant: d.isImportant ?? undefined,
              messagePreview: d.messagePreview ?? undefined,
            };
          });

        setResults(prev => {
          const existingKeys = new Set(prev.map(i => i.key));
          const toAdd = newItems.filter(i => !existingKeys.has(i.key));
          return [...toAdd, ...prev];
        });
      }
    }

    setBatchProgress(null);
    await refetch();
  }, [tokens, isSyncing, syncBatch, scanCount, selectedState, refetch, getValidToken, results, saveCurrentToHistory]);

  const handleScan        = useCallback(() => handleBatchedScan(false), [handleBatchedScan]);
  const handleRescan      = useCallback(() => handleBatchedScan(true),  [handleBatchedScan]);

  // DEBUG: clear session results + force-rescan (bypasses already-processed check)
  const handleForceRescan = useCallback(() => {
    setResults([]);
    setViewingSessionId(null);
    handleBatchedScan(true, true);
  }, [handleBatchedScan]);

  // ── Mark old as read ──────────────────────────────────────────────────────

  const handleMarkOld = useCallback(async () => {
    const accessToken = await getValidToken();
    if (!accessToken) return;
    await markOldAsRead(accessToken, 7);
  }, [getValidToken, markOldAsRead]);

  const handleMarkUnreadRecent = useCallback(async () => {
    const accessToken = await getValidToken();
    if (!accessToken) return;
    await markUnreadRecent(accessToken, 7);
  }, [getValidToken, markUnreadRecent]);

  // ── Selection ────────────────────────────────────────────────────────────

  // actionableItems — all created/updated deals, with OR without dealId
  const actionableItems = useMemo(
    () => displayResults.filter(r => isActionable(r.action)),
    [displayResults]
  );

  const unanalyzedActionable = useMemo(() => {
    return actionableItems.filter(item => {
      const deal = item.dealId ? deals.find(d => d.id === item.dealId) : null;
      return deal ? !isDealAnalyzed(deal) : true;
    });
  }, [actionableItems, deals]);

  // Apply extra filters (sqft / beds / minPrice) on top of an existing list
  const applyExtraFilters = useCallback((list: EmailResultItem[]) => {
    if (!minSqft && !minBeds && !minPrice) return list;
    return list.filter(r => {
      const sn   = extractFromSnippet(r.emailSnippet);
      const beds  = r.extractedData?.bedrooms ?? sn.beds;
      const sqft  = r.extractedData?.sqft     ?? sn.sqft;
      const price = r.purchasePrice           ?? sn.price;
      if (minBeds  > 0 && (beds  == null || beds  < minBeds))  return false;
      if (minSqft  > 0 && (sqft  == null || sqft  < minSqft))  return false;
      if (minPrice > 0 && price  != null && price  < minPrice) return false;
      return true;
    });
  }, [minSqft, minBeds, minPrice]);

  // Ready to Analyze = actionable deals with valid address AND known price ≤ maxPrice
  const readyToAnalyzeItems = useMemo(
    () => applyExtraFilters(displayResults.filter(r => {
      if (!isActionable(r.action)) return false;
      if (!hasStreetNumber(r.address)) return false;
      const price = r.purchasePrice != null ? Number(r.purchasePrice) : null;
      if (price == null || isNaN(price) || price <= 0) return false;
      return price <= maxPrice;
    })),
    [displayResults, maxPrice, applyExtraFilters]
  );

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

  // ── Create deal from address + immediately analyze ────────────────────────
  // Defined first — used by handleAnalyzeOne and handleAnalyzeSelected below

  const handleCreateAndAnalyze = useCallback(async (item: EmailResultItem, addressOverride?: string) => {
    const addr = (addressOverride ?? editAddr).trim();
    if (!addr) { toast.error('Enter a property address'); return; }
    if (!(item.purchasePrice != null && item.purchasePrice > 0)) {
      toast.error('No price found for this deal — cannot create without a price.');
      return;
    }
    if (!hasStreetNumber(addr)) {
      toast.error('Address has no street number — cannot analyze. Please edit the address first.');
      return;
    }

    setCreatingKey(item.key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const parts = addr.split(',').map(s => s.trim());
      const street   = parts[0] || addr;
      const city     = parts[1] || '';
      const stateZip = parts[2] || '';
      const [state, zip] = stateZip.split(' ').filter(Boolean);

      const emailPrice = item.purchasePrice ?? null;
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
          email_subject:       item.subject || null,
          sender_name:         item.senderName || null,
          sender_email:        item.senderEmail || null,
          gmail_message_id:    item.messageId || null,
          email_snippet:       item.emailSnippet || null,
          email_extracted_data: item.extractedData || null,
          api_data:    emailPrice ? { emailPurchasePrice: emailPrice } : {},
          overrides:   emailPrice ? { arv: null, rent: null, rehabCost: null, purchasePrice: emailPrice } : {},
          created_by: user.id,
        })
        .select('id')
        .single();

      if (error || !inserted) throw error || new Error('Insert failed');

      const dealId = inserted.id;

      setResults(prev => prev.map(r =>
        r.key === item.key
          ? { ...r, key: dealId, dealId, address: addr, action: 'created' as EmailAction }
          : r
      ));
      setEditingKey(null);
      setEditAddr('');
      await refetch();

      // Mark the source email as read in Gmail now that a deal was created from it
      if (item.messageId) {
        const accessToken = await getValidToken();
        if (accessToken) markMessageRead(accessToken, item.messageId);
      }

      toast.success('Deal created — sending to DealBeast...');
      await startAnalyzeList([{ id: dealId, address: addr }]);
      await refetch();
      window.open(`/deals/${dealId}`, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setCreatingKey(null);
    }
  }, [editAddr, refetch, startAnalyzeList, getValidToken, markMessageRead]);

  // ── Analysis ─────────────────────────────────────────────────────────────

  const handleAnalyzeOne = useCallback(async (item: EmailResultItem) => {
    if (isAnalyzing) return;
    if (!item.dealId) {
      // No deal in DB yet — create it first, then analyze
      await handleCreateAndAnalyze(item, item.address);
      return;
    }
    await startAnalyzeList([{ id: item.dealId, address: item.address }]);
    await refetch();
    window.open(`/deals/${item.dealId}`, '_blank', 'noopener,noreferrer');
  }, [isAnalyzing, startAnalyzeList, refetch, handleCreateAndAnalyze]);

  const handleAnalyzeSelected = useCallback(async () => {
    if (selectedActionable.length === 0 || isAnalyzing) return;
    setSelected(new Set());
    const withId    = selectedActionable.filter(r =>  r.dealId && hasStreetNumber(r.address));
    const withoutId = selectedActionable.filter(r => !r.dealId && hasStreetNumber(r.address));
    for (const item of withoutId) {
      await handleCreateAndAnalyze(item, item.address);
    }
    if (withId.length > 0) {
      await startAnalyzeList(withId.map(r => ({ id: r.dealId!, address: r.address })));
    }
  }, [selectedActionable, isAnalyzing, startAnalyzeList, handleCreateAndAnalyze]);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const messageItems = useMemo(
    () => displayResults.filter(r => r.action === 'message'),
    [displayResults]
  );

  const filtered = useMemo(() => {
    let list = displayResults.filter(r => r.action !== 'skipped_portal' && r.action !== 'skipped_newsletter');
    if (filter === 'deals')   list = list.filter(r => isActionable(r.action));
    else if (filter === 'messages') list = displayResults.filter(r => r.action === 'message');
    else if (filter === 'skipped') list = list.filter(r => !isActionable(r.action) && r.action !== 'message');
    else if (filter === 'readyToAnalyze') list = list.filter(r => {
      if (!isActionable(r.action)) return false;
      if (!hasStreetNumber(r.address)) return false;
      const price = r.purchasePrice != null ? Number(r.purchasePrice) : null;
      if (price == null || isNaN(price) || price <= 0) return false;
      return price <= maxPrice;
    });
    return filter === 'messages' ? list : applyExtraFilters(list);
  }, [displayResults, filter, maxPrice, applyExtraFilters]);

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

  const viewingSession = viewingSessionId ? sessions.find(s => s.id === viewingSessionId) : null;

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
                  <span className="ml-1.5">Mark Week Unread</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Marks all inbox emails from the last 7 days as unread so they appear in the next scan.
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
                Marks all unread emails older than 7 days as read.
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={sessions.length === 0}>
                  <History className="h-4 w-4" />
                  History
                  {sessions.length > 0 && (
                    <span className="ml-0.5 text-[10px] font-semibold text-muted-foreground">({sessions.length})</span>
                  )}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Last 30 days</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {sessions.map(s => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => { setViewingSessionId(s.id); setSelected(new Set()); }}
                    className={viewingSessionId === s.id ? 'bg-muted' : ''}
                  >
                    <span className="text-xs">{sessionLabel(s)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
                {/* If results are visible, show a "New Scan" button to clear and start fresh */}
                {results.length > 0 && !isViewingHistory && !isSyncing && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      saveCurrentToHistory(results);
                      setResults([]);
                      setSelected(new Set());
                    }}
                    className="gap-1.5 border-dashed"
                  >
                    <RotateCcw className="h-4 w-4" />
                    New Scan
                  </Button>
                )}
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={handleForceRescan} disabled={isSyncing || isAnalyzing}
                      className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs px-2.5">
                      {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                      Reset &amp; Rescan
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    DEBUG: Clears all cached results and re-processes the {scanCount} most recent emails, ignoring scan history.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Uses AI to extract deal info from wholesaler emails · Portal emails (Zillow, Redfin, etc.) are auto-marked as read · Each scan picks up the next batch of unread emails
            </p>
          </CardContent>
        </Card>

        {/* ── History banner ────────────────────────────────────────────── */}
        {isViewingHistory && viewingSession && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
            <div className="flex items-center gap-2 text-amber-400">
              <History className="w-4 h-4" />
              <span>Viewing past scan: <strong>{sessionLabel(viewingSession)}</strong></span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs gap-1.5 text-amber-400 hover:text-amber-300"
              onClick={() => { setViewingSessionId(null); setSelected(new Set()); }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to current scan
            </Button>
          </div>
        )}

        {/* ── Batch scan progress ───────────────────────────────────────── */}
        {batchProgress && (
          <Card className="border-blue-500/30 bg-card/50">
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  Scanning batch {batchProgress.current}/{batchProgress.total}...
                </span>
                <span className="text-muted-foreground">{batchProgress.current} / {batchProgress.total}</span>
              </div>
              <Progress value={(batchProgress.current / batchProgress.total) * 100} className="h-1.5" />
            </CardContent>
          </Card>
        )}

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
        {displayResults.length > 0 && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter tabs */}
              <div className="flex gap-1 items-center">
                {(['readyToAnalyze', 'deals', 'all', 'messages', 'skipped'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      f === 'readyToAnalyze'
                        ? filter === 'readyToAnalyze'
                          ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
                          : 'text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/10'
                        : f === 'messages'
                          ? filter === 'messages'
                            ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40'
                            : messageItems.some(m => m.isImportant)
                              ? 'text-blue-400/80 hover:text-blue-400 hover:bg-blue-500/10'
                              : 'text-muted-foreground hover:text-foreground'
                        : filter === f
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                    }`}>
                    {f === 'readyToAnalyze' ? `Ready to Analyze (${readyToAnalyzeItems.length})` :
                     f === 'all'            ? `All (${displayResults.filter(r => r.action !== 'skipped_portal' && r.action !== 'skipped_newsletter').length})` :
                     f === 'deals'          ? `Deals (${actionableItems.length})` :
                     f === 'messages'       ? `Messages (${messageItems.length})${messageItems.some(m => m.isImportant) ? ' ●' : ''}` :
                     `Skipped (${displayResults.filter(r => !isActionable(r.action) && r.action !== 'skipped_portal' && r.action !== 'skipped_newsletter' && r.action !== 'message').length})`}
                  </button>
                ))}
                {/* Max price filter */}
                <div className="ml-2 flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">≤</span>
                  <input
                    type="number"
                    value={maxPrice / 1000}
                    onChange={e => setMaxPrice(Math.max(1000, Number(e.target.value) * 1000))}
                    className="w-14 h-6 px-1.5 text-xs bg-muted/50 border border-border/50 rounded text-center"
                    step={10} min={50} max={2000}
                  />
                  <span className="text-[10px] text-muted-foreground">k</span>
                </div>
              </div>

              {/* Extra filters row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 py-1.5 border-t border-border/20 text-xs text-muted-foreground">
                {/* Min price */}
                <label className="flex items-center gap-1">
                  <span>Min $</span>
                  <input
                    type="number"
                    value={minPrice > 0 ? minPrice / 1000 : ''}
                    placeholder="—"
                    onChange={e => setMinPrice(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value) * 1000))}
                    className="w-14 h-6 px-1.5 text-xs bg-muted/50 border border-border/50 rounded text-center"
                    step={10} min={0} max={2000}
                  />
                  <span>k</span>
                </label>
                {/* Min sqft */}
                <label className="flex items-center gap-1">
                  <span>Min sqft</span>
                  <input
                    type="number"
                    value={minSqft > 0 ? minSqft : ''}
                    placeholder="—"
                    onChange={e => setMinSqft(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                    className="w-16 h-6 px-1.5 text-xs bg-muted/50 border border-border/50 rounded text-center"
                    step={100} min={0}
                  />
                </label>
                {/* Min beds */}
                <label className="flex items-center gap-1">
                  <span>Min beds</span>
                  <select
                    value={minBeds}
                    onChange={e => setMinBeds(Number(e.target.value))}
                    className="h-6 px-1.5 text-xs bg-muted/50 border border-border/50 rounded"
                  >
                    <option value={0}>Any</option>
                    <option value={2}>2+</option>
                    <option value={3}>3+</option>
                    <option value={4}>4+</option>
                    <option value={5}>5+</option>
                  </select>
                </label>
                {/* Reset */}
                {(minPrice > 0 || minSqft > 0 || minBeds > 0) && (
                  <button
                    onClick={() => { setMinPrice(0); setMinSqft(0); setMinBeds(0); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                  >
                    Reset filters
                  </button>
                )}
              </div>

              {/* Bulk actions */}
              {actionableItems.length > 0 && (
                <div className="flex items-center gap-2 sm:ml-auto">
                  <Checkbox checked={allActionableSelected} onCheckedChange={toggleSelectAll}
                    disabled={actionableItems.length === 0} className="w-3.5 h-3.5" />
                  <span className="text-xs text-muted-foreground">Select all</span>
                  {selectedActionable.length > 0 && (
                    <Button size="sm" onClick={handleAnalyzeSelected} disabled={isAnalyzing}>
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                      Analyze {selectedActionable.length} Selected
                    </Button>
                  )}
                  {unanalyzedActionable.length > 0 && !isAnalyzing && selectedActionable.length === 0 && (
                    <Button size="sm" variant="outline"
                      onClick={async () => {
                        const inScope = unanalyzedActionable.filter(r => {
                          if (!hasStreetNumber(r.address)) return false;
                          if (filter !== 'readyToAnalyze') return true;
                          const p = r.purchasePrice != null ? Number(r.purchasePrice) : null;
                          return p == null || isNaN(p) || p <= maxPrice;
                        });
                        const needCreate = inScope.filter(r => !r.dealId);
                        const hasId = inScope.filter(r => !!r.dealId);
                        for (const item of needCreate) {
                          await handleCreateAndAnalyze(item, item.address);
                        }
                        if (hasId.length > 0) {
                          startAnalyzeList(hasId.map(r => ({ id: r.dealId!, address: r.address })));
                        }
                      }}>
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                      Analyze All ({unanalyzedActionable.filter(r => {
                        if (!hasStreetNumber(r.address)) return false;
                        if (filter !== 'readyToAnalyze') return true;
                        const p = r.purchasePrice != null ? Number(r.purchasePrice) : null;
                        return p == null || isNaN(p) || p <= maxPrice;
                      }).length})
                    </Button>
                  )}
                </div>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost"
                    onClick={() => {
                      if (isViewingHistory && viewingSessionId) {
                        setSessions(prev => {
                          const updated = prev.filter(s => s.id !== viewingSessionId);
                          try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated)); } catch {}
                          return updated;
                        });
                        setViewingSessionId(null);
                      } else {
                        setResults([]);
                        setSelected(new Set());
                      }
                    }}
                    className="text-muted-foreground ml-auto sm:ml-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isViewingHistory ? 'Delete this session from history' : 'Clear current scan results'}</TooltipContent>
              </Tooltip>
            </div>

            {/* Results list */}
            {filtered.length > 0 ? (
              <Card className="border-border/50 bg-card/50">
                {/* Column headers — hidden for messages view */}
                {filter !== 'messages' && <div className="flex items-center gap-3 px-4 py-2 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <div className="w-4 shrink-0" />
                  <div className="w-56 shrink-0">Address</div>
                  <div className="w-24 shrink-0">Price</div>
                  <div className="w-20 shrink-0">Beds/Baths</div>
                  <div className="w-20 shrink-0">Sqft</div>
                  <div className="flex-1">Sender</div>
                  <div className="w-16 shrink-0">Status</div>
                  <div className="w-18 shrink-0">Links</div>
                  <div className="w-24 shrink-0" />
                </div>}
                <div className="divide-y divide-border/20">
                  {filtered.map(item => {
                    if (item.action === 'message') {
                      return <MessageRow key={item.key} item={item} />;
                    }

                    const deal = item.dealId ? deals.find(d => d.id === item.dealId) : null;
                    const analyzed = deal ? isDealAnalyzed(deal) : false;
                    const grade = deal?.apiData?.grade != null ? String(deal.apiData.grade) : null;
                    const qItem = item.dealId ? analyzeQueue.find(a => a.id === item.dealId) : null;
                    const isAnalyzingThis = qItem?.status === 'analyzing' || creatingKey === item.key;
                    const isDone = qItem?.status === 'done' || analyzed;
                    const isError = qItem?.status === 'error';

                    return (
                      <PropertyRow
                        key={item.key}
                        item={item}
                        isAnalyzingThis={isAnalyzingThis}
                        isDone={isDone}
                        isError={isError}
                        analyzeError={qItem?.error}
                        isCreating={creatingKey === item.key}
                        grade={grade}
                        editingKey={editingKey}
                        editAddr={editAddr}
                        selected={selected.has(item.key)}
                        onToggleSelect={() => toggleSelect(item.key)}
                        onAnalyze={() => handleAnalyzeOne(item)}
                        onStartEdit={() => { setEditingKey(item.key); setEditAddr(''); }}
                        onEditChange={setEditAddr}
                        onEditSubmit={() => handleCreateAndAnalyze(item)}
                        onEditCancel={() => { setEditingKey(null); setEditAddr(''); }}
                        onCreateAndAnalyze={(addr) => handleCreateAndAnalyze(item, addr)}
                      />
                    );
                  })}
                </div>
              </Card>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No results match this filter.
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {displayResults.length === 0 && !isSyncing && (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="py-16 text-center">
              <Mail className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-lg font-medium mb-1">Ready for a new scan</p>
              <p className="text-sm text-muted-foreground mb-6">
                Choose how many emails to scan and click <strong>Scan Unread</strong>
              </p>
              <p className="text-xs text-muted-foreground/50">
                AI extracts deals from wholesaler emails · Each scan starts fresh · Previous scans saved in History
              </p>
            </CardContent>
          </Card>
        )}

      </div>
    </TooltipProvider>
  );
}
