import { useState } from 'react';
import { useInvestors, InvestorInput } from '@/hooks/useInvestors';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Users, 
  Loader2,
  Phone,
  Mail,
  TrendingUp,
  Home,
  RefreshCw,
  Percent,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { InvestorDealsPanel } from '@/components/investors/InvestorDealsPanel';

const STRATEGY_OPTIONS = [
  { value: 'flip', label: 'Flip', icon: TrendingUp, color: 'text-orange-400' },
  { value: 'rental', label: 'Rental', icon: Home, color: 'text-cyan-400' },
  { value: 'brrrr', label: 'BRRRR', icon: RefreshCw, color: 'text-purple-400' },
];

export default function InvestorsPage() {
  const { investors, loading, addInvestor, updateInvestor, deleteInvestor } = useInvestors();
  const { isAdmin } = useUserRole();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<string | null>(null);
  const [expandedInvestor, setExpandedInvestor] = useState<string | null>(null);
  const [formData, setFormData] = useState<InvestorInput>({
    name: '',
    email: '',
    phone: '',
    strategies: [],
    profit_split_percent: 50,
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      strategies: [],
      profit_split_percent: 50,
      notes: '',
    });
    setEditingInvestor(null);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.email) {
      toast.error('Name and email are required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingInvestor) {
        await updateInvestor(editingInvestor, formData);
        toast.success('Investor updated successfully');
      } else {
        await addInvestor(formData);
        toast.success('Investor added successfully');
      }
      resetForm();
      setIsAddDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save investor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (investor: typeof investors[0]) => {
    setFormData({
      name: investor.name,
      email: investor.email,
      phone: investor.phone || '',
      strategies: investor.strategies,
      profit_split_percent: investor.profit_split_percent,
      notes: investor.notes || '',
    });
    setEditingInvestor(investor.id);
    setIsAddDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this investor?')) return;
    try {
      await deleteInvestor(id);
      toast.success('Investor deleted');
    } catch (err) {
      toast.error('Failed to delete investor');
    }
  };

  const toggleStrategy = (strategy: string) => {
    setFormData(prev => ({
      ...prev,
      strategies: prev.strategies?.includes(strategy)
        ? prev.strategies.filter(s => s !== strategy)
        : [...(prev.strategies || []), strategy],
    }));
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Investors</h1>
            <p className="text-muted-foreground text-sm">Manage your investor partners</p>
          </div>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Investor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingInvestor ? 'Edit Investor' : 'Add New Investor'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="john@example.com"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profit_split">Profit Split (%)</Label>
                  <Input
                    id="profit_split"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.profit_split_percent}
                    onChange={(e) => setFormData(prev => ({ ...prev, profit_split_percent: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Preferred Strategies</Label>
                <div className="flex gap-3">
                  {STRATEGY_OPTIONS.map(strategy => (
                    <div
                      key={strategy.value}
                      onClick={() => toggleStrategy(strategy.value)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                        formData.strategies?.includes(strategy.value)
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-muted-foreground"
                      )}
                    >
                      <Checkbox 
                        checked={formData.strategies?.includes(strategy.value)}
                        onCheckedChange={() => toggleStrategy(strategy.value)}
                      />
                      <strategy.icon className={cn("w-4 h-4", strategy.color)} />
                      <span className="text-sm">{strategy.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes about this investor..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingInvestor ? 'Update' : 'Add'} Investor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : investors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Investors Yet</h3>
            <p className="text-muted-foreground mb-4">Add your first investor to start sharing deals.</p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Investor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Investors ({investors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Strategies</TableHead>
                  <TableHead>Profit Split</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((investor) => (
                  <Collapsible
                    key={investor.id}
                    open={expandedInvestor === investor.id}
                    onOpenChange={(open) => setExpandedInvestor(open ? investor.id : null)}
                    asChild
                  >
                    <>
                      <CollapsibleTrigger asChild>
                        <TableRow className="cursor-pointer hover:bg-accent/50">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {expandedInvestor === investor.id ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                              {investor.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 text-sm">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Mail className="w-3 h-3" />
                                {investor.email}
                              </div>
                              {investor.phone && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Phone className="w-3 h-3" />
                                  {investor.phone}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {investor.strategies.map(strategy => {
                                const opt = STRATEGY_OPTIONS.find(s => s.value === strategy);
                                return opt ? (
                                  <Badge key={strategy} variant="outline" className={cn("text-xs", opt.color)}>
                                    {opt.label}
                                  </Badge>
                                ) : null;
                              })}
                              {investor.strategies.length === 0 && (
                                <span className="text-muted-foreground text-xs">None</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Percent className="w-3 h-3 text-muted-foreground" />
                              <span>{investor.profit_split_percent}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(investor)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(investor.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleTrigger>
                      <CollapsibleContent asChild>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={5} className="p-4">
                            <InvestorDealsPanel 
                              investorId={investor.id} 
                              investorName={investor.name} 
                            />
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
