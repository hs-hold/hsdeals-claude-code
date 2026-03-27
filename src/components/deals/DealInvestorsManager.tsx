import { useState } from 'react';
import { useInvestors } from '@/hooks/useInvestors';
import { useDealInvestors, DealInvestor } from '@/hooks/useDealInvestors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { 
  Users, 
  Plus, 
  Trash2, 
  Loader2,
  TrendingUp,
  Home,
  RefreshCw,
  Percent,
  MessageSquare,
  ExternalLink,
  Edit2,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const STRATEGY_OPTIONS = [
  { value: 'flip', label: 'Flip', icon: TrendingUp, color: 'text-orange-400' },
  { value: 'rental', label: 'Rental', icon: Home, color: 'text-cyan-400' },
  { value: 'brrrr', label: 'BRRRR', icon: RefreshCw, color: 'text-purple-400' },
];

interface DealInvestorsManagerProps {
  dealId: string;
  dealAddress: string;
}

export function DealInvestorsManager({ dealId, dealAddress }: DealInvestorsManagerProps) {
  const { investors, loading: investorsLoading } = useInvestors();
  const { dealInvestors, loading, assignInvestor, updateDealInvestor, removeInvestor } = useDealInvestors(dealId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<DealInvestor | null>(null);
  const [selectedInvestorId, setSelectedInvestorId] = useState<string>('');
  const [profitSplit, setProfitSplit] = useState<string>('50');
  const [preferredReturn, setPreferredReturn] = useState<string>('15');
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(['flip', 'rental', 'brrrr']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter out already assigned investors
  const availableInvestors = investors.filter(
    inv => !dealInvestors.some(di => di.investor_id === inv.id)
  );

  const handleAssign = async () => {
    if (!selectedInvestorId) {
      toast.error('Please select an investor');
      return;
    }

    setIsSubmitting(true);
    try {
      const investor = investors.find(i => i.id === selectedInvestorId);
      await assignInvestor({
        deal_id: dealId,
        investor_id: selectedInvestorId,
        profit_split_percent: profitSplit ? Number(profitSplit) : (investor?.profit_split_percent ?? 50),
        preferred_return_percent: preferredReturn ? Number(preferredReturn) : 15,
        visible_strategies: selectedStrategies,
      });
      toast.success('Investor assigned to deal');
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign investor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (di: DealInvestor) => {
    setEditingInvestor(di);
    setProfitSplit(String(di.profit_split_percent ?? di.investor?.profit_split_percent ?? 50));
    setPreferredReturn(String(di.preferred_return_percent ?? 15));
    setSelectedStrategies(di.visible_strategies);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingInvestor) return;
    setIsSubmitting(true);
    try {
      await updateDealInvestor(editingInvestor.id, {
        profit_split_percent: profitSplit ? Number(profitSplit) : null,
        preferred_return_percent: preferredReturn ? Number(preferredReturn) : 15,
        visible_strategies: selectedStrategies,
      });
      toast.success('Investor settings updated');
      setIsEditDialogOpen(false);
      setEditingInvestor(null);
      resetForm();
    } catch (err) {
      toast.error('Failed to update investor settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (di: DealInvestor) => {
    if (!confirm(`Remove ${di.investor?.name} from this deal?`)) return;
    try {
      await removeInvestor(di.id);
      toast.success('Investor removed from deal');
    } catch (err) {
      toast.error('Failed to remove investor');
    }
  };

  const resetForm = () => {
    setSelectedInvestorId('');
    setProfitSplit('50');
    setPreferredReturn('15');
    setSelectedStrategies(['flip', 'rental', 'brrrr']);
  };

  const toggleStrategy = (strategy: string) => {
    setSelectedStrategies(prev =>
      prev.includes(strategy)
        ? prev.filter(s => s !== strategy)
        : [...prev, strategy]
    );
  };

  if (loading || investorsLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading investors...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Shared with Investors</span>
          {dealInvestors.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {dealInvestors.length}
            </Badge>
          )}
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={availableInvestors.length === 0}>
              <Plus className="w-3 h-3 mr-1" />
              Add Investor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle>Share Deal with Investor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Select Investor</Label>
                <Select value={selectedInvestorId} onValueChange={setSelectedInvestorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an investor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInvestors.map(inv => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.name} ({inv.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Star className="w-3 h-3 text-amber-400" />
                  Preferred Return (%)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={preferredReturn}
                  onChange={(e) => setPreferredReturn(e.target.value)}
                  placeholder="15"
                />
                <p className="text-xs text-muted-foreground">
                  Investor gets this % return first, then you catch up, then 50/50 split
                </p>
              </div>

              <div className="space-y-2">
                <Label>Profit Split (%) - After Pref + Catch-up</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={profitSplit}
                  onChange={(e) => setProfitSplit(e.target.value)}
                  placeholder="50"
                />
              </div>

              <div className="space-y-2">
                <Label>Visible Strategies</Label>
                <div className="flex gap-2 flex-wrap">
                  {STRATEGY_OPTIONS.map(strategy => (
                    <div
                      key={strategy.value}
                      onClick={() => toggleStrategy(strategy.value)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                        selectedStrategies.includes(strategy.value)
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-muted-foreground"
                      )}
                    >
                      <Checkbox 
                        checked={selectedStrategies.includes(strategy.value)}
                        onCheckedChange={() => toggleStrategy(strategy.value)}
                      />
                      <strategy.icon className={cn("w-4 h-4", strategy.color)} />
                      <span className="text-sm">{strategy.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleAssign} disabled={isSubmitting || !selectedInvestorId}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Share Deal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {dealInvestors.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No investors assigned to this deal yet.
          {availableInvestors.length === 0 && investors.length === 0 && (
            <> <Link to="/investors" className="text-primary hover:underline">Add investors first</Link>.</>
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {dealInvestors.map(di => (
            <div 
              key={di.id} 
              className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-medium text-primary">
                    {di.investor?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-medium text-sm">{di.investor?.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1" title="Preferred Return">
                      <Star className="w-3 h-3 text-amber-400" />
                      {di.preferred_return_percent ?? 15}%
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1" title="Profit Split">
                      <Percent className="w-3 h-3" />
                      {di.profit_split_percent ?? 50}%
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex gap-1">
                      {di.visible_strategies.map(s => {
                        const opt = STRATEGY_OPTIONS.find(o => o.value === s);
                        return opt ? (
                          <opt.icon key={s} className={cn("w-3 h-3", opt.color)} />
                        ) : null;
                      })}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                {di.investor_notes && (
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MessageSquare className="w-3.5 h-3.5 text-accent-foreground" />
                      </Button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-64">
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">Investor's Note:</div>
                        <p className="text-sm">{di.investor_notes}</p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                )}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={() => handleEdit(di)}
                  title="Edit settings"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleRemove(di)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) { setEditingInvestor(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Edit Investor Settings - {editingInvestor?.investor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Star className="w-3 h-3 text-amber-400" />
                Preferred Return (%)
              </Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={preferredReturn}
                onChange={(e) => setPreferredReturn(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Investor gets this % return first, then you catch up, then 50/50 split
              </p>
            </div>

            <div className="space-y-2">
              <Label>Profit Split (%) - After Pref + Catch-up</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={profitSplit}
                onChange={(e) => setProfitSplit(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Visible Strategies</Label>
              <div className="flex gap-2 flex-wrap">
                {STRATEGY_OPTIONS.map(strategy => (
                  <div
                    key={strategy.value}
                    onClick={() => toggleStrategy(strategy.value)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                      selectedStrategies.includes(strategy.value)
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    <Checkbox 
                      checked={selectedStrategies.includes(strategy.value)}
                      onCheckedChange={() => toggleStrategy(strategy.value)}
                    />
                    <strategy.icon className={cn("w-4 h-4", strategy.color)} />
                    <span className="text-sm">{strategy.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingInvestor(null); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
