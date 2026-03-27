import { useState, useMemo, useCallback } from 'react';
import { MapPin, Check, ChevronsUpDown, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUserState, US_STATES } from '@/hooks/useUserState';
import { useDeals } from '@/context/DealsContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';


interface StateSelectorProps {
  collapsed?: boolean;
}

export function StateSelector({ collapsed }: StateSelectorProps) {
  const { selectedState, stateName, isLoading, updateState } = useUserState();
  const { deals, refetch } = useDeals();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Deals outside the pending new state
  // Helper: resolve the effective state for a deal (address_state, or fallback to address_city if it looks like a state code)
  const getDealState = useCallback((d: typeof deals[0]) => {
    const st = d.address?.state?.toUpperCase().trim();
    if (st) return st;
    // Some new deals have state code in the city field (e.g. city="TN")
    const city = d.address?.city?.toUpperCase().trim();
    if (city && city.length === 2 && US_STATES.some(s => s.code === city)) return city;
    return '';
  }, []);

  const outsideDeals = useMemo(() => {
    if (!pendingState || pendingState === 'ALL') return [];
    const target = pendingState.toUpperCase().trim();
    return deals.filter(d => {
      const dealState = getDealState(d);
      // Include deals with no identifiable state OR deals with a different state
      return !dealState || dealState !== target;
    });
  }, [deals, pendingState, getDealState]);

  const pendingStateName = pendingState === 'ALL'
    ? 'All States'
    : pendingState
      ? US_STATES.find(s => s.code === pendingState)?.name || pendingState
      : '';

  const handleStateSelect = useCallback((stateCode: string) => {
    setOpen(false);
    if (stateCode === selectedState) return;

    setPendingState(stateCode);
    
    // "All States" — no filtering, just update
    if (stateCode === 'ALL') {
      updateState(stateCode);
      return;
    }

    // Check if there are deals outside the new state
    const outside = deals.filter(d => {
      const ds = getDealState(d);
      return !ds || ds !== stateCode.toUpperCase().trim();
    });

    if (outside.length > 0) {
      setSelectedForDeletion(new Set());
      setShowCleanupDialog(true);
    } else {
      updateState(stateCode);
    }
  }, [selectedState, deals, updateState]);

  const handleDeleteSelected = async () => {
    if (selectedForDeletion.size === 0 || !pendingState) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedForDeletion);
      const { error } = await supabase
        .from('deals')
        .delete()
        .in('id', ids);
      if (error) throw error;
      toast({ title: `${ids.length} deals deleted` });
    } catch (e) {
      toast({ title: 'Error deleting deals', variant: 'destructive' });
    }
    await updateState(pendingState);
    await refetch();
    setIsDeleting(false);
    setShowCleanupDialog(false);
    setPendingState(null);
  };

  const handleDeleteAll = async () => {
    if (!pendingState) return;
    setIsDeleting(true);
    try {
      const ids = outsideDeals.map(d => d.id);
      const { error } = await supabase
        .from('deals')
        .delete()
        .in('id', ids);
      if (error) throw error;
      toast({ title: `${ids.length} deals deleted` });
    } catch (e) {
      toast({ title: 'Error deleting deals', variant: 'destructive' });
    }
    await updateState(pendingState);
    await refetch();
    setIsDeleting(false);
    setShowCleanupDialog(false);
    setPendingState(null);
  };

  const handleKeepAll = async () => {
    if (!pendingState) return;
    await updateState(pendingState);
    setShowCleanupDialog(false);
    setPendingState(null);
  };

  const toggleDealSelection = (id: string) => {
    setSelectedForDeletion(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedForDeletion.size === outsideDeals.length) {
      setSelectedForDeletion(new Set());
    } else {
      setSelectedForDeletion(new Set(outsideDeals.map(d => d.id)));
    }
  };

  if (isLoading) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-start gap-2 text-xs font-medium",
              !selectedState && selectedState !== 'ALL' && "text-destructive"
            )}
          >
            <MapPin className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <span className="truncate">
                {selectedState === 'ALL' ? 'All States' : selectedState ? stateName : 'Select State'}
              </span>
            )}
            {!collapsed && <ChevronsUpDown className="ml-auto w-3 h-3 opacity-50 shrink-0" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start" side="right">
          <Command>
            <CommandInput placeholder="Search state..." />
            <CommandList>
              <CommandEmpty>No state found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="All States"
                  onSelect={() => handleStateSelect('ALL')}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedState === 'ALL' ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-medium">All States</span>
                </CommandItem>
                {US_STATES.map((state) => (
                  <CommandItem
                    key={state.code}
                    value={`${state.name} ${state.code}`}
                    onSelect={() => handleStateSelect(state.code)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedState === state.code ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="font-medium mr-1">{state.code}</span>
                    <span className="text-muted-foreground">{state.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Cleanup dialog */}
      <Dialog open={showCleanupDialog} onOpenChange={(o) => { if (!o && !isDeleting) { setShowCleanupDialog(false); setPendingState(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Switching to {pendingStateName}
            </DialogTitle>
            <DialogDescription>
              You have {outsideDeals.length} deal{outsideDeals.length !== 1 ? 's' : ''} from other states. What would you like to do?
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[40vh] -mx-6 px-6">
            <div className="space-y-1">
              {/* Select all */}
              <div
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50"
                onClick={toggleAll}
              >
                <Checkbox
                  checked={selectedForDeletion.size === outsideDeals.length && outsideDeals.length > 0}
                  onCheckedChange={toggleAll}
                />
                <span className="text-sm font-medium">Select All</span>
                <Badge variant="outline" className="text-xs ml-auto">{outsideDeals.length}</Badge>
              </div>

              {outsideDeals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 cursor-pointer"
                  onClick={() => toggleDealSelection(deal.id)}
                >
                  <Checkbox
                    checked={selectedForDeletion.has(deal.id)}
                    onCheckedChange={() => toggleDealSelection(deal.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{deal.address?.full || deal.address?.street}</p>
                    <p className="text-xs text-muted-foreground">
                      {deal.address?.city}, {deal.address?.state} · {deal.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleKeepAll}
              disabled={isDeleting}
              className="flex-1"
            >
              Keep All
            </Button>
            {selectedForDeletion.size > 0 && (
              <Button
                variant="destructive"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="flex-1"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete {selectedForDeletion.size} Selected
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={isDeleting}
              className="flex-1"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete All ({outsideDeals.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
