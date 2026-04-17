import React, { useState, useMemo, useCallback } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BarChart2, Plus, Star, Check, X, Edit2, Trash2, ExternalLink,
  Download, ChevronDown, ChevronRight, AlertCircle, ArrowLeftRight,
  TrendingUp, Eye, EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/financialCalculations';
import type {
  Deal, DealApiData, CompPrecisionComp,
  CompVerificationStatus, CompCategory, ComparisonToSubject, CompPropertyStatus,
} from '@/types/deal';
import {
  autoImportComps, calculateWeightedArv, computeAdjustedPrice,
  isCompIncludedInArv, makeBlanKComp,
} from '@/utils/compPrecisionUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = 'all' | CompVerificationStatus | 'included_in_arv' | 'auto' | 'manual';

interface AdvancedCompsAnalysisProps {
  deal: Deal;
  apiData: DealApiData;
  onSaveComps: (comps: CompPrecisionComp[]) => void;
}

// ─── Badge helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CompVerificationStatus }) {
  const map: Record<CompVerificationStatus, { label: string; className: string }> = {
    needs_review: { label: 'Needs Review', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    verified:     { label: 'Verified',     className: 'bg-green-500/20 text-green-400 border-green-500/30' },
    not_relevant: { label: 'Not Relevant', className: 'bg-muted text-muted-foreground border-muted-foreground/30' },
    excluded:     { label: 'Excluded',     className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  };
  const { label, className } = map[status];
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', className)}>
      {label}
    </Badge>
  );
}

function SourceBadge({ source, updatedManually }: { source: string; updatedManually?: boolean }) {
  return (
    <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30 bg-blue-500/10">
      {source === 'manual' ? 'Manual' : updatedManually ? 'Edited' : 'Auto'}
    </Badge>
  );
}

function CompPropertyStatusBadge({ status }: { status: CompPropertyStatus }) {
  const map: Record<CompPropertyStatus, string> = {
    sold: 'text-green-400',
    active: 'text-blue-400',
    pending: 'text-amber-400',
    for_sale: 'text-purple-400',
    off_market: 'text-muted-foreground',
  };
  return (
    <span className={cn('text-[10px] font-medium uppercase tracking-wide', map[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ─── Comp Edit / Add Dialog ────────────────────────────────────────────────────

interface CompFormDialogProps {
  comp: CompPrecisionComp | null;
  open: boolean;
  onClose: () => void;
  onSave: (comp: CompPrecisionComp) => void;
  dealId: string;
}

function CompFormDialog({ comp, open, onClose, onSave, dealId }: CompFormDialogProps) {
  const isNew = !comp?.id || comp.source === 'manual' && !comp.address;
  const [form, setForm] = useState<CompPrecisionComp>(
    comp ?? makeBlanKComp(dealId)
  );

  // Reset when comp changes
  React.useEffect(() => {
    setForm(comp ?? makeBlanKComp(dealId));
  }, [comp, dealId]);

  const set = useCallback(<K extends keyof CompPrecisionComp>(key: K, val: CompPrecisionComp[K]) => {
    setForm(f => ({ ...f, [key]: val, updatedManually: true, updatedAt: new Date().toISOString() }));
  }, []);

  function handleSave() {
    if (!form.address.trim()) return;
    const saved: CompPrecisionComp = {
      ...form,
      adjustedPrice: computeAdjustedPrice(form),
      adjustedPpsf: form.livingAreaSqft
        ? Math.round(computeAdjustedPrice(form) / form.livingAreaSqft)
        : undefined,
    };
    onSave(saved);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Comp' : 'Edit Comp'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          {/* Address */}
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-muted-foreground">Address *</label>
            <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, Atlanta, GA" />
          </div>

          {/* Price */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Price ($)</label>
            <Input
              type="number"
              value={form.price || ''}
              onChange={e => set('price', parseFloat(e.target.value) || 0)}
              placeholder="350000"
            />
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={form.status} onValueChange={v => set('status', v as CompPropertyStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="for_sale">For Sale</SelectItem>
                <SelectItem value="off_market">Off Market</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sold Date */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Sold Date</label>
            <Input
              type="date"
              value={form.soldDate?.split('T')[0] ?? ''}
              onChange={e => set('soldDate', e.target.value)}
            />
          </div>

          {/* Living Area */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Living Area (sqft)</label>
            <Input
              type="number"
              value={form.livingAreaSqft ?? ''}
              onChange={e => set('livingAreaSqft', parseFloat(e.target.value) || undefined)}
            />
          </div>

          {/* Beds */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Beds</label>
            <Input
              type="number"
              value={form.bedrooms ?? ''}
              onChange={e => set('bedrooms', parseFloat(e.target.value) || undefined)}
            />
          </div>

          {/* Baths */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Baths</label>
            <Input
              type="number"
              value={form.bathrooms ?? ''}
              onChange={e => set('bathrooms', parseFloat(e.target.value) || undefined)}
            />
          </div>

          {/* Lot Size */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Lot Size (sqft)</label>
            <Input
              type="number"
              value={form.lotSizeSqft ?? ''}
              onChange={e => set('lotSizeSqft', parseFloat(e.target.value) || undefined)}
            />
          </div>

          {/* Year Built */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Year Built</label>
            <Input
              type="number"
              value={form.yearBuilt ?? ''}
              onChange={e => set('yearBuilt', parseFloat(e.target.value) || undefined)}
            />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Category</label>
            <Select value={form.category} onValueChange={v => set('category', v as CompCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high_market">High Comps in the Market</SelectItem>
                <SelectItem value="low_market_for_sale">Low Comps / For Sale</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Comparison to Subject */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">vs. Subject Property</label>
            <Select
              value={form.comparisonToSubject ?? 'similar'}
              onValueChange={v => set('comparisonToSubject', v as ComparisonToSubject)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="much_inferior">Much Inferior (+10%)</SelectItem>
                <SelectItem value="slightly_inferior">Slightly Inferior (+5%)</SelectItem>
                <SelectItem value="similar">Similar (0%)</SelectItem>
                <SelectItem value="slightly_superior">Slightly Superior (-5%)</SelectItem>
                <SelectItem value="much_superior">Much Superior (-10%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* External URL */}
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-muted-foreground">External URL (Zillow / MLS)</label>
            <Input
              value={form.externalUrl ?? ''}
              onChange={e => set('externalUrl', e.target.value)}
              placeholder="https://zillow.com/..."
            />
          </div>

          {/* Comp Title */}
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-muted-foreground">Short Title</label>
            <Input
              value={form.compTitle ?? ''}
              onChange={e => set('compTitle', e.target.value)}
              placeholder="Best comp on same street"
            />
          </div>

          {/* Relevance Note */}
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-muted-foreground">Relevance Note</label>
            <Textarea
              value={form.relevanceNote ?? ''}
              onChange={e => set('relevanceNote', e.target.value)}
              placeholder="Why is this comp relevant or not relevant?"
              rows={2}
            />
          </div>

          {/* Notes */}
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-muted-foreground">Internal Notes</label>
            <Textarea
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="Free-form notes..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.address.trim() || !form.price}>
            {isNew ? 'Add Comp' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Single Comp Row ───────────────────────────────────────────────────────────

interface CompRowProps {
  comp: CompPrecisionComp;
  onEdit: (comp: CompPrecisionComp) => void;
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleNotRelevant: (id: string) => void;
  onToggleExclude: (id: string) => void;
  onToggleBestComp: (id: string) => void;
  onToggleArv: (id: string) => void;
  onCategoryChange: (id: string, cat: CompCategory) => void;
}

function CompRow({
  comp, onEdit, onApprove, onDelete,
  onToggleNotRelevant, onToggleExclude,
  onToggleBestComp, onToggleArv, onCategoryChange,
}: CompRowProps) {
  const [expanded, setExpanded] = useState(false);
  const adjusted = computeAdjustedPrice(comp);
  const ppsf = comp.livingAreaSqft ? Math.round(adjusted / comp.livingAreaSqft) : null;
  const includedInArv = isCompIncludedInArv(comp);

  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      comp.verificationStatus === 'needs_review' && 'border-amber-500/30 bg-amber-500/5',
      comp.verificationStatus === 'verified' && 'border-green-500/20 bg-green-500/5',
      comp.verificationStatus === 'not_relevant' && 'border-muted-foreground/20 bg-muted/30 opacity-60',
      comp.verificationStatus === 'excluded' && 'border-red-500/20 bg-red-500/5 opacity-70',
    )}>
      {/* Main Row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Expand toggle */}
        <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Best Comp Star */}
        <button onClick={() => onToggleBestComp(comp.id)} className="shrink-0">
          <Star className={cn('w-3.5 h-3.5', comp.isBestComp ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
        </button>

        {/* Address + title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{comp.address}</span>
            {comp.compTitle && (
              <span className="text-xs text-muted-foreground italic">"{comp.compTitle}"</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <CompPropertyStatusBadge status={comp.status} />
            {comp.soldDate && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(comp.soldDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            )}
            {comp.bedrooms && (
              <span className="text-[10px] text-muted-foreground">
                {comp.bedrooms}bd / {comp.bathrooms}ba
                {comp.livingAreaSqft && ` / ${comp.livingAreaSqft.toLocaleString()} sqft`}
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="text-right shrink-0 mr-1">
          <div className="text-sm font-semibold">{formatCurrency(comp.price)}</div>
          {comp.comparisonToSubject && comp.comparisonToSubject !== 'similar' && (
            <div className="text-[10px] text-blue-400">
              adj: {formatCurrency(adjusted)}
            </div>
          )}
          {ppsf && <div className="text-[10px] text-muted-foreground">${ppsf}/sqft</div>}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1 shrink-0">
          <StatusBadge status={comp.verificationStatus} />
          <SourceBadge source={comp.source} updatedManually={comp.updatedManually} />
          {includedInArv && (
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">
              ARV
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {comp.externalUrl && (
            <a href={comp.externalUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="w-6 h-6">
                <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          )}

          {/* Approve (only for needs_review) */}
          {comp.verificationStatus === 'needs_review' && (
            <Button
              variant="ghost" size="icon"
              className="w-6 h-6 text-green-400 hover:text-green-300 hover:bg-green-500/10"
              onClick={() => onApprove(comp.id)}
              title="Approve"
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* Toggle ARV */}
          <Button
            variant="ghost" size="icon"
            className={cn('w-6 h-6', includedInArv ? 'text-blue-400 hover:text-blue-300' : 'text-muted-foreground/50')}
            onClick={() => onToggleArv(comp.id)}
            title={includedInArv ? 'Remove from ARV' : 'Include in ARV'}
            disabled={comp.verificationStatus !== 'verified'}
          >
            {includedInArv ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </Button>

          {/* Edit */}
          <Button
            variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(comp)}
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>

          {/* Not Relevant toggle */}
          <Button
            variant="ghost" size="icon"
            className={cn('w-6 h-6', comp.verificationStatus === 'not_relevant' ? 'text-muted-foreground' : 'text-muted-foreground/50')}
            onClick={() => onToggleNotRelevant(comp.id)}
            title="Toggle Not Relevant"
          >
            <AlertCircle className="w-3.5 h-3.5" />
          </Button>

          {/* Exclude */}
          <Button
            variant="ghost" size="icon"
            className={cn('w-6 h-6', comp.verificationStatus === 'excluded' ? 'text-red-400' : 'text-muted-foreground/50')}
            onClick={() => onToggleExclude(comp.id)}
            title="Exclude from ARV"
          >
            <X className="w-3.5 h-3.5" />
          </Button>

          {/* Delete */}
          <Button
            variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground/50 hover:text-red-400"
            onClick={() => onDelete(comp.id)}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border/50 mt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 text-xs">
            {comp.yearBuilt && (
              <div><span className="text-muted-foreground">Year Built: </span>{comp.yearBuilt}</div>
            )}
            {comp.lotSizeSqft && (
              <div><span className="text-muted-foreground">Lot: </span>{comp.lotSizeSqft.toLocaleString()} sqft</div>
            )}
            {comp.distanceMiles && (
              <div><span className="text-muted-foreground">Distance: </span>{comp.distanceMiles.toFixed(2)} mi</div>
            )}
            {comp.comparisonToSubject && (
              <div>
                <span className="text-muted-foreground">vs Subject: </span>
                <span className="capitalize">{comp.comparisonToSubject.replace('_', ' ')}</span>
              </div>
            )}
            {comp.similarityScore && (
              <div><span className="text-muted-foreground">Similarity: </span>{comp.similarityScore}%</div>
            )}
          </div>

          {/* Move category */}
          <div className="flex items-center gap-2 mt-2">
            <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Move to:</span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() => onCategoryChange(comp.id, comp.category === 'high_market' ? 'low_market_for_sale' : 'high_market')}
            >
              {comp.category === 'high_market' ? 'Low Comps / For Sale' : 'High Comps in the Market'}
            </Button>
          </div>

          {/* Notes */}
          {(comp.relevanceNote || comp.notes || comp.compTitle) && (
            <div className="mt-2 space-y-1 text-xs">
              {comp.relevanceNote && (
                <div><span className="text-muted-foreground">Relevance: </span>{comp.relevanceNote}</div>
              )}
              {comp.notes && (
                <div><span className="text-muted-foreground">Notes: </span>{comp.notes}</div>
              )}
            </div>
          )}

          {/* Audit trail */}
          <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground/60">
            {comp.approvedByUser && comp.approvedAt && (
              <span>Approved {new Date(comp.approvedAt).toLocaleDateString()}</span>
            )}
            {comp.updatedManually && <span>Manually edited</span>}
            <span>Imported from {comp.importedFrom.replace(/_/g, ' ')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ARV Summary Panel ─────────────────────────────────────────────────────────

function ArvPanel({ comps, subjectSqft, subjectBeds }: {
  comps: CompPrecisionComp[];
  subjectSqft?: number | null;
  subjectBeds?: number | null;
}) {
  const included = comps.filter(isCompIncludedInArv);
  const needsReview = comps.filter(c => c.verificationStatus === 'needs_review').length;
  const weightedArv = calculateWeightedArv(comps, subjectSqft, subjectBeds);

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-blue-400">Comp Precision ARV</span>
        </div>
        <div className="text-xl font-bold text-blue-300">
          {weightedArv ? formatCurrency(weightedArv) : '—'}
        </div>
      </div>
      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
        <span>{included.length} included in ARV</span>
        <span>{comps.filter(c => c.verificationStatus === 'verified').length} verified</span>
        {needsReview > 0 && (
          <span className="text-amber-400">{needsReview} pending review</span>
        )}
        {weightedArv && <span className="text-muted-foreground/60">weighted average</span>}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function AdvancedCompsAnalysis({ deal, apiData, onSaveComps }: AdvancedCompsAnalysisProps) {
  const existingComps: CompPrecisionComp[] = deal.overrides.compPrecisionComps ?? [];
  const [comps, setComps] = useState<CompPrecisionComp[]>(existingComps);
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingComp, setEditingComp] = useState<CompPrecisionComp | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const subjectSqft = apiData.sqft;
  const subjectBeds = apiData.bedrooms;

  // Sync external changes
  React.useEffect(() => {
    setComps(deal.overrides.compPrecisionComps ?? []);
  }, [deal.overrides.compPrecisionComps]);

  const save = useCallback((updated: CompPrecisionComp[]) => {
    setComps(updated);
    onSaveComps(updated);
  }, [onSaveComps]);

  // Auto-import
  function handleAutoImport() {
    const existingAddresses = new Set(comps.map(c => c.address));
    const imported = autoImportComps(apiData.saleComps, deal.id, subjectSqft, existingAddresses);
    if (imported.length === 0) return;
    const updated = [...comps, ...imported];
    save(updated);
  }

  // Comp actions
  function handleApprove(id: string) {
    save(comps.map(c => c.id === id
      ? { ...c, verificationStatus: 'verified', isIncludedInArv: true, approvedByUser: true, approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      : c
    ));
  }

  function handleDelete(id: string) {
    save(comps.filter(c => c.id !== id));
  }

  function handleToggleNotRelevant(id: string) {
    save(comps.map(c => c.id === id
      ? {
          ...c,
          verificationStatus: c.verificationStatus === 'not_relevant' ? 'needs_review' : 'not_relevant',
          isIncludedInArv: false,
          updatedAt: new Date().toISOString(),
        }
      : c
    ));
  }

  function handleToggleExclude(id: string) {
    save(comps.map(c => c.id === id
      ? {
          ...c,
          verificationStatus: c.verificationStatus === 'excluded' ? 'verified' : 'excluded',
          isIncludedInArv: c.verificationStatus === 'excluded',
          updatedAt: new Date().toISOString(),
        }
      : c
    ));
  }

  function handleToggleBestComp(id: string) {
    save(comps.map(c => c.id === id ? { ...c, isBestComp: !c.isBestComp } : c));
  }

  function handleToggleArv(id: string) {
    save(comps.map(c => c.id === id && c.verificationStatus === 'verified'
      ? { ...c, isIncludedInArv: !c.isIncludedInArv, updatedAt: new Date().toISOString() }
      : c
    ));
  }

  function handleCategoryChange(id: string, cat: CompCategory) {
    save(comps.map(c => c.id === id ? { ...c, category: cat, updatedAt: new Date().toISOString() } : c));
  }

  function handleSaveComp(updated: CompPrecisionComp) {
    const exists = comps.find(c => c.id === updated.id);
    if (exists) {
      save(comps.map(c => c.id === updated.id ? updated : c));
    } else {
      save([...comps, updated]);
    }
  }

  // Filtered comps
  const filteredComps = useMemo(() => {
    switch (filter) {
      case 'verified': return comps.filter(c => c.verificationStatus === 'verified');
      case 'needs_review': return comps.filter(c => c.verificationStatus === 'needs_review');
      case 'not_relevant': return comps.filter(c => c.verificationStatus === 'not_relevant');
      case 'excluded': return comps.filter(c => c.verificationStatus === 'excluded');
      case 'included_in_arv': return comps.filter(isCompIncludedInArv);
      case 'auto': return comps.filter(c => c.source === 'auto');
      case 'manual': return comps.filter(c => c.source === 'manual');
      default: return comps;
    }
  }, [comps, filter]);

  const highComps = filteredComps.filter(c => c.category === 'high_market');
  const lowComps = filteredComps.filter(c => c.category === 'low_market_for_sale');

  const pendingCount = comps.filter(c => c.verificationStatus === 'needs_review').length;
  const verifiedCount = comps.filter(c => c.verificationStatus === 'verified').length;
  const weightedArv = calculateWeightedArv(comps, subjectSqft, subjectBeds);

  const sharedRowProps = {
    onEdit: setEditingComp,
    onApprove: handleApprove,
    onDelete: handleDelete,
    onToggleNotRelevant: handleToggleNotRelevant,
    onToggleExclude: handleToggleExclude,
    onToggleBestComp: handleToggleBestComp,
    onToggleArv: handleToggleArv,
    onCategoryChange: handleCategoryChange,
  };

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'verified', label: 'Verified' },
    { key: 'needs_review', label: 'Needs Review' },
    { key: 'not_relevant', label: 'Not Relevant' },
    { key: 'excluded', label: 'Excluded' },
    { key: 'included_in_arv', label: 'In ARV' },
    { key: 'auto', label: 'Auto' },
    { key: 'manual', label: 'Manual' },
  ];

  return (
    <>
      {/* Trigger / Summary Card */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{comps.length} comps</span>
              {pendingCount > 0 && (
                <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                  {pendingCount} pending review
                </Badge>
              )}
              {verifiedCount > 0 && (
                <Badge variant="outline" className="text-[10px] text-green-400 border-green-500/30">
                  {verifiedCount} verified
                </Badge>
              )}
              {weightedArv && (
                <span className="text-blue-400 font-medium">
                  ARV: {formatCurrency(weightedArv)}
                </span>
              )}
              {comps.length === 0 && (
                <span className="text-muted-foreground/50 italic">No comps yet — click to get started</span>
              )}
            </div>
            <Button variant="outline" size="sm" className="text-xs">
              Open
            </Button>
          </div>
        </SheetTrigger>

        <SheetContent side="right" className="w-full sm:max-w-4xl flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <BarChart2 className="w-4 h-4 text-blue-400" />
              Advanced Comps Analysis
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleAutoImport}>
                <Download className="w-3.5 h-3.5" />
                Import from Recently Sold
                {subjectSqft && (
                  <span className="text-muted-foreground ml-1">±20% sqft</span>
                )}
              </Button>
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-3.5 h-3.5" />
                Add Manual Comp
              </Button>
            </div>

            {/* ARV Panel */}
            {comps.length > 0 && (
              <ArvPanel comps={comps} subjectSqft={subjectSqft} subjectBeds={subjectBeds} />
            )}

            {/* Filters */}
            {comps.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border transition-colors',
                      filter === f.key
                        ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                        : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                    )}
                  >
                    {f.label}
                    {f.key === 'needs_review' && pendingCount > 0 && (
                      <span className="ml-1 text-amber-400">{pendingCount}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {comps.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-3">
                <BarChart2 className="w-10 h-10 opacity-30" />
                <div>
                  <p className="font-medium">No comps yet</p>
                  <p className="text-sm mt-1">Import from Recently Sold or add manually.</p>
                </div>
              </div>
            )}

            {/* High Comps Group */}
            {(highComps.length > 0 || filter === 'all') && (
              <CompGroup
                title="High Comps in the Market"
                comps={highComps}
                rowProps={sharedRowProps}
                accentClass="text-green-400 border-green-500/20"
              />
            )}

            {/* Low Comps Group */}
            {(lowComps.length > 0 || filter === 'all') && (
              <CompGroup
                title="Low Comps / For Sale"
                comps={lowComps}
                rowProps={sharedRowProps}
                accentClass="text-amber-400 border-amber-500/20"
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Dialog */}
      <CompFormDialog
        comp={editingComp}
        open={!!editingComp}
        onClose={() => setEditingComp(null)}
        onSave={handleSaveComp}
        dealId={deal.id}
      />

      {/* Add Dialog */}
      <CompFormDialog
        comp={null}
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSave={comp => { handleSaveComp(comp); setShowAddDialog(false); }}
        dealId={deal.id}
      />
    </>
  );
}

// ─── Comp Group ────────────────────────────────────────────────────────────────

interface CompGroupProps {
  title: string;
  comps: CompPrecisionComp[];
  accentClass: string;
  rowProps: Omit<CompRowProps, 'comp'>;
}

function CompGroup({ title, comps, accentClass, rowProps }: CompGroupProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn('flex items-center gap-2 text-xs font-semibold uppercase tracking-wider pb-1 border-b w-full text-left', accentClass)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {title}
        <span className="ml-1 normal-case font-normal text-muted-foreground">({comps.length})</span>
      </button>
      {open && (
        <div className="space-y-1.5">
          {comps.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 italic pl-4 py-1">No comps in this group</p>
          ) : (
            comps.map(c => <CompRow key={c.id} comp={c} {...rowProps} />)
          )}
        </div>
      )}
    </div>
  );
}
