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
  Square, Image,
} from 'lucide-react';
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
}

const SCAN_COUNTS = [10, 20, 40, 60, 100] as const;
type ScanCount = typeof SCAN_COUNTS[number];

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
  return { text: action, color: 'bg-muted/10 text-muted-foreground border-border/30' };
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
  const addrHasStreet = hasStreetNumber(item.address); // needs street number for DealBeast
  const canAnalyze = actionable && addrHasStreet && !!item.dealId;
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
        {actionable && !canAnalyze && !isDone && !isAnalyzingThis && !addrHasStreet && (
          <span className="text-[10px] text-muted-foreground/40">no address</span>
        )}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EmailSearchPage() {
  const { isConnected, isLoading: isAuthLoading, tokens, connect, disconnect, getValidToken } = useGmailAuth();
  const { isSyncing, isMarkingOld, syncBatch, markOldAsRead, markUnreadRecent } = useGmailSync();
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
      const saved = localStorage.getItem('email_scan_results_v2');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'deals' | 'suspects' | 'skipped'>('suspects');
  const [maxPrice, setMaxPrice] = useState<number>(220000);

  // Persist results to localStorage
  useEffect(() => {
    try { localStorage.setItem('email_scan_results_v2', JSON.stringify(results)); } catch {}
  }, [results]);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editAddr, setEditAddr] = useState('');
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  // Batch scan progress
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // ── Scan ──────────────────────────────────────────────────────────────────

  // ── Batched scan: fetch message IDs from Gmail API, then process in batches of 8 ──

  const handleBatchedScan = useCallback(async (includeRead: boolean, forceRescan = false) => {
    if (!tokens?.access_token || isSyncing) return;

    const accessToken = await getValidToken();
    if (!accessToken) return;

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
            };
          });

        setResults(prev => {
          const existingKeys = new Set(prev.map(i => i.key));
          const toAdd = newItems.filter(i => !existingKeys.has(i.key));
          const updated = [...toAdd, ...prev];
          // Persist incrementally after each batch
          try { localStorage.setItem('email_scan_results_v2', JSON.stringify(updated)); } catch {}
          return updated;
        });
      }
    }

    setBatchProgress(null);
    await refetch();
  }, [tokens, isSyncing, syncBatch, scanCount, selectedState, refetch, getValidToken]);

  const handleScan        = useCallback(() => handleBatchedScan(false), [handleBatchedScan]);
  const handleRescan      = useCallback(() => handleBatchedScan(true),  [handleBatchedScan]);

  // DEBUG: clear session results + force-rescan (bypasses already-processed check)
  const handleForceRescan = useCallback(() => {
    setResults([]);
    localStorage.removeItem('email_scan_results_v2');
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

  // Suspects = actionable deals with valid address AND price ≤ maxPrice
  // Does NOT require dealId — items without dealId show but with disabled Analyze
  const suspectsItems = useMemo(
    () => results.filter(r => {
      if (!isActionable(r.action)) return false;
      if (!hasStreetNumber(r.address)) return false; // no address = skip
      const price = r.purchasePrice != null ? Number(r.purchasePrice) : null;
      return price == null || isNaN(price) || price <= maxPrice;
    }),
    [results, maxPrice]
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

      setResults(prev => prev.map(r =>
        r.key === item.key
          ? { ...r, key: dealId, dealId, address: addr, action: 'created' as EmailAction }
          : r
      ));
      setEditingKey(null);
      setEditAddr('');
      await refetch();

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
    let list = results.filter(r => r.action !== 'skipped_portal');
    if (filter === 'deals') return list.filter(r => isActionable(r.action));
    if (filter === 'skipped') return list.filter(r => !isActionable(r.action));
    if (filter === 'suspects') return list.filter(r => {
      if (!isActionable(r.action)) return false;
      if (!hasStreetNumber(r.address)) return false; // no street number → skip, can't analyze
      const price = r.purchasePrice != null ? Number(r.purchasePrice) : null;
      return price == null || isNaN(price) || price <= maxPrice;
    });
    return list;
  }, [results, filter, maxPrice]);

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
        {results.length > 0 && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter tabs */}
              <div className="flex gap-1 items-center">
                {(['suspects', 'deals', 'all', 'skipped'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      filter === f ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}>
                    {f === 'suspects' ? `Suspects (${suspectsItems.length})` :
                     f === 'all'      ? `All (${results.filter(r => r.action !== 'skipped_portal').length})` :
                     f === 'deals'    ? `Deals (${actionableItems.length})` :
                     `Skipped (${results.filter(r => !isActionable(r.action) && r.action !== 'skipped_portal').length})`}
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
                    step={10}
                    min={50}
                    max={2000}
                  />
                  <span className="text-[10px] text-muted-foreground">k</span>
                </div>
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
                      onClick={() => {
                        // Only include items that actually have dealId + street number
                        const analyzable = unanalyzedActionable.filter(r =>
                          r.dealId && hasStreetNumber(r.address) &&
                          (filter !== 'suspects' || (() => {
                            const p = r.purchasePrice != null ? Number(r.purchasePrice) : null;
                            return p == null || isNaN(p) || p <= maxPrice;
                          })())
                        );
                        startAnalyzeList(analyzable.map(r => ({ id: r.dealId!, address: r.address })));
                      }}>
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                      Analyze All ({unanalyzedActionable.filter(r =>
                        r.dealId && hasStreetNumber(r.address) &&
                        (filter !== 'suspects' || (() => {
                          const p = r.purchasePrice != null ? Number(r.purchasePrice) : null;
                          return p == null || isNaN(p) || p <= maxPrice;
                        })())
                      ).length})
                    </Button>
                  )}
                </div>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost"
                    onClick={() => { setResults([]); setSelected(new Set()); try { localStorage.removeItem('email_scan_results_v2'); } catch {} }}
                    className="text-muted-foreground ml-auto sm:ml-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear all results</TooltipContent>
              </Tooltip>
            </div>

            {/* Results list */}
            {filtered.length > 0 ? (
              <Card className="border-border/50 bg-card/50">
                {/* Column headers */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <div className="w-4 shrink-0" />
                  <div className="w-56 shrink-0">Address</div>
                  <div className="w-24 shrink-0">Price</div>
                  <div className="w-20 shrink-0">Beds/Baths</div>
                  <div className="w-20 shrink-0">Sqft</div>
                  <div className="flex-1">Sender</div>
                  <div className="w-16 shrink-0">Status</div>
                  <div className="w-18 shrink-0">Links</div>
                  <div className="w-24 shrink-0" />
                </div>
                <div className="divide-y divide-border/20">
                  {filtered.map(item => {
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
        {results.length === 0 && !isSyncing && (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="py-12 text-center">
              <Mail className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                No results yet — choose how many emails to scan and click <strong>Scan Unread</strong>
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                AI will extract deals from wholesaler emails · Portal emails are auto-marked as read
              </p>
            </CardContent>
          </Card>
        )}

      </div>
    </TooltipProvider>
  );
}
