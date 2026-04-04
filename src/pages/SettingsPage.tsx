import { useState, useEffect, useMemo } from 'react';
import { useSettings, ThemeMode, DesignTheme, DefaultAnalysisView, LoanDefaults, getDefaultLoanDefaults } from '@/context/SettingsContext';
import { useDeals } from '@/context/DealsContext';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Sun, Moon, Smartphone, Palette, Waves, Sunset, Trees, 
  Calculator, TrendingUp, Home, RefreshCw, RotateCcw, Save,
  AlertTriangle, GripVertical, Star, ChevronDown, Loader2, Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ApiKeysManager } from '@/components/settings/ApiKeysManager';
import { ExternalApiKeysManager } from '@/components/settings/ExternalApiKeysManager';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type LoanDefaultKey = keyof LoanDefaults;

interface FieldConfig {
  key: LoanDefaultKey;
  label: string;
  type: 'percent' | 'number' | 'currency' | 'years' | 'months';
  step?: number;
}

// Flip-specific fields (including loan settings)
const flipLoanFields: FieldConfig[] = [
  { key: 'flipDownPaymentPercent', label: 'Down Payment', type: 'percent' },
  { key: 'flipInterestRate', label: 'Interest Rate', type: 'percent', step: 0.1 },
  { key: 'flipLoanTermYears', label: 'Loan Term', type: 'years' },
  { key: 'flipClosingCostsPercent', label: 'Closing Costs (Buy)', type: 'percent' },
];

const flipFields: FieldConfig[] = [
  { key: 'contingencyPercent', label: 'Rehab Contingency', type: 'percent' },
  { key: 'agentCommissionPercent', label: 'Agent Commission (Sell)', type: 'percent' },
  { key: 'holdingMonths', label: 'Default Holding Period', type: 'months' },
];

// Hard Money Loan fields (used in Flip)
const hmlFields: FieldConfig[] = [
  { key: 'hmlLtvPurchasePercent', label: 'LTV (Purchase)', type: 'percent' },
  { key: 'hmlLtvRehabPercent', label: 'LTV (Rehab)', type: 'percent' },
  { key: 'hmlPointsPercent', label: 'Points', type: 'percent' },
  { key: 'hmlInterestRate', label: 'Interest Rate', type: 'percent', step: 0.1 },
  { key: 'hmlProcessingFee', label: 'Processing Fee', type: 'currency' },
];

// Rental-specific fields (including loan settings)
const rentalLoanFields: FieldConfig[] = [
  { key: 'rentalDownPaymentPercent', label: 'Down Payment', type: 'percent' },
  { key: 'rentalInterestRate', label: 'Interest Rate', type: 'percent', step: 0.1 },
  { key: 'rentalLoanTermYears', label: 'Loan Term', type: 'years' },
  { key: 'rentalClosingCostsPercent', label: 'Closing Costs (Buy)', type: 'percent' },
];

const rentalFields: FieldConfig[] = [
  { key: 'propertyManagementPercent', label: 'Property Management', type: 'percent' },
  { key: 'maintenanceVacancyPercent', label: 'Reserves (Maint+Vac+CapEx)', type: 'percent' },
];

// BRRRR-specific fields (including loan settings)
const brrrrLoanFields: FieldConfig[] = [
  { key: 'brrrrDownPaymentPercent', label: 'Down Payment', type: 'percent' },
  { key: 'brrrrInterestRate', label: 'Interest Rate', type: 'percent', step: 0.1 },
  { key: 'brrrrLoanTermYears', label: 'Loan Term', type: 'years' },
  { key: 'brrrrClosingCostsPercent', label: 'Closing Costs (Buy)', type: 'percent' },
];

const brrrrFields: FieldConfig[] = [
  { key: 'refiLtvPercent', label: 'Refinance LTV', type: 'percent' },
  { key: 'refiClosingPercent', label: 'Refinance Closing Costs', type: 'percent' },
];

const analysisViewsConfig: Record<DefaultAnalysisView, { label: string; icon: React.ReactNode; description: string }> = {
  flip: { label: 'Flip', icon: <TrendingUp className="w-4 h-4" />, description: 'Fix & Flip analysis' },
  rental: { label: 'Rental', icon: <Home className="w-4 h-4" />, description: 'Buy & Hold analysis' },
  brrrr: { label: 'BRRRR', icon: <RefreshCw className="w-4 h-4" />, description: 'BRRRR strategy' },
};

export default function SettingsPage() {
  const { settings, updateSettings, updateLoanDefaults } = useSettings();
  const { deals, recalculateAllDealsFinancials, refetch } = useDeals();
  const systemDefaults = getDefaultLoanDefaults();
  
  // Local state for editing
  const [localDefaults, setLocalDefaults] = useState<LoanDefaults>(settings.loanDefaults);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAllDeals = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('deals')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) {
        console.error('Error deleting deals:', error);
        toast.error('Failed to delete deals');
        return;
      }

      toast.success('All deals deleted successfully');
      refetch();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Failed to delete deals');
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Track which fields have been modified from saved values
  const isDirty = useMemo(() => {
    return JSON.stringify(localDefaults) !== JSON.stringify(settings.loanDefaults);
  }, [localDefaults, settings.loanDefaults]);

  // Sync local state when settings change externally
  useEffect(() => {
    setLocalDefaults(settings.loanDefaults);
  }, [settings.loanDefaults]);

  const handleFieldChange = (key: LoanDefaultKey, value: string) => {
    const numValue = parseFloat(value) || 0;
    setLocalDefaults(prev => ({ ...prev, [key]: numValue }));
  };

  const handleResetField = (key: LoanDefaultKey) => {
    setLocalDefaults(prev => ({ ...prev, [key]: systemDefaults[key] }));
  };

  const handleSave = async () => {
    updateLoanDefaults(localDefaults);
    toast.success('Settings saved successfully');
    
    // Recalculate all unlocked deals with new defaults
    setIsRecalculating(true);
    try {
      await recalculateAllDealsFinancials();
      toast.success('All unlocked deals updated with new defaults');
    } catch (err) {
      console.error('Error recalculating deals:', err);
      toast.error('Failed to update some deals');
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleResetAll = () => {
    setLocalDefaults(systemDefaults);
    updateLoanDefaults(systemDefaults);
    toast.success('All defaults reset to system values');
  };

  const isFieldModified = (key: LoanDefaultKey) => {
    return localDefaults[key] !== settings.loanDefaults[key];
  };

  const isFieldDifferentFromSystem = (key: LoanDefaultKey) => {
    return localDefaults[key] !== systemDefaults[key];
  };

  // Drag and drop state for analysis views
  const [draggedItem, setDraggedItem] = useState<DefaultAnalysisView | null>(null);
  const [localOrder, setLocalOrder] = useState<DefaultAnalysisView[]>(settings.analysisViewsOrder || ['flip', 'rental', 'brrrr']);

  // Sync order when settings change
  useEffect(() => {
    setLocalOrder(settings.analysisViewsOrder || ['flip', 'rental', 'brrrr']);
  }, [settings.analysisViewsOrder]);

  const handleDragStart = (e: React.DragEvent, view: DefaultAnalysisView) => {
    setDraggedItem(view);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetView: DefaultAnalysisView) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetView) return;

    const newOrder = [...localOrder];
    const draggedIdx = newOrder.indexOf(draggedItem);
    const targetIdx = newOrder.indexOf(targetView);
    
    // Remove dragged item and insert at target position
    newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, draggedItem);
    
    setLocalOrder(newOrder);
    // Auto set the first one as default
    updateSettings({ 
      analysisViewsOrder: newOrder,
      defaultAnalysisView: newOrder[0]
    });
    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const setAsDefault = (view: DefaultAnalysisView) => {
    const newOrder = [...localOrder];
    const idx = newOrder.indexOf(view);
    // Move to first position
    newOrder.splice(idx, 1);
    newOrder.unshift(view);
    
    setLocalOrder(newOrder);
    updateSettings({ 
      analysisViewsOrder: newOrder,
      defaultAnalysisView: view
    });
  };

  const themeModes: { value: ThemeMode; label: string; icon: React.ReactNode; description: string }[] = [
    { value: 'light', label: 'Light', icon: <Sun className="w-5 h-5" />, description: 'Always light mode' },
    { value: 'dark', label: 'Dark', icon: <Moon className="w-5 h-5" />, description: 'Always dark mode' },
    { value: 'auto', label: 'Auto', icon: <Smartphone className="w-5 h-5" />, description: 'Based on time (7am-7pm)' },
  ];

  const designThemes: { value: DesignTheme; label: string; icon: React.ReactNode; colors: string[] }[] = [
    { value: 'default', label: 'Default', icon: <Palette className="w-5 h-5" />, colors: ['#14b8a6', '#f59e0b', '#22c55e'] },
    { value: 'ocean', label: 'Ocean', icon: <Waves className="w-5 h-5" />, colors: ['#0ea5e9', '#6366f1', '#8b5cf6'] },
    { value: 'sunset', label: 'Sunset', icon: <Sunset className="w-5 h-5" />, colors: ['#f97316', '#ef4444', '#ec4899'] },
    { value: 'forest', label: 'Forest', icon: <Trees className="w-5 h-5" />, colors: ['#22c55e', '#84cc16', '#10b981'] },
  ];


  const renderField = (field: FieldConfig) => {
    const value = localDefaults[field.key];
    const modified = isFieldModified(field.key);
    const differentFromSystem = isFieldDifferentFromSystem(field.key);

    const getSuffix = () => {
      switch (field.type) {
        case 'percent': return '%';
        case 'years': return ' years';
        case 'months': return ' mo';
        case 'currency': return '';
        default: return '';
      }
    };

    const getPrefix = () => {
      return field.type === 'currency' ? '$' : '';
    };

    return (
      <div key={field.key} className="flex items-center gap-3 py-3 px-4">
        <Label className="flex-1 text-sm font-medium">{field.label}</Label>
        <div className="flex items-center gap-2">
          {getPrefix() && <span className="text-muted-foreground text-sm">{getPrefix()}</span>}
          <Input
            type="number"
            step={field.step || 1}
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={cn(
              "w-24 h-9 text-right",
              modified && "border-warning ring-1 ring-warning/30"
            )}
          />
          <span className="text-muted-foreground text-sm w-12">{getSuffix()}</span>
          {differentFromSystem && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => handleResetField(field.key)}
              title={`Reset to system default (${systemDefaults[field.key]})`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
          {!differentFromSystem && <div className="w-7" />}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure your default values and preferences</p>
        </div>
        {isDirty && (
          <Button onClick={handleSave} className="gap-2" disabled={isRecalculating}>
            {isRecalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isRecalculating ? 'Updating Deals...' : 'Save Changes'}
          </Button>
        )}
      </div>

      {/* Appearance Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Appearance</CardTitle>
          <CardDescription>Customize the look and feel of the application</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme Mode */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Theme Mode</Label>
            <RadioGroup
              value={settings.themeMode}
              onValueChange={(value) => updateSettings({ themeMode: value as ThemeMode })}
              className="grid grid-cols-3 gap-3"
            >
              {themeModes.map((mode) => (
                <Label
                  key={mode.value}
                  htmlFor={`theme-${mode.value}`}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all",
                    settings.themeMode === mode.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <RadioGroupItem value={mode.value} id={`theme-${mode.value}`} className="sr-only" />
                  {mode.icon}
                  <span className="text-sm font-medium">{mode.label}</span>
                  <span className="text-xs text-muted-foreground text-center">{mode.description}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <Separator />

          {/* Design Theme */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Color Theme</Label>
            <RadioGroup
              value={settings.designTheme}
              onValueChange={(value) => updateSettings({ designTheme: value as DesignTheme })}
              className="grid grid-cols-4 gap-3"
            >
              {designThemes.map((theme) => (
                <Label
                  key={theme.value}
                  htmlFor={`design-${theme.value}`}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all",
                    settings.designTheme === theme.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <RadioGroupItem value={theme.value} id={`design-${theme.value}`} className="sr-only" />
                  <div className="flex gap-1">
                    {theme.colors.map((color, i) => (
                      <div
                        key={i}
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium">{theme.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analysis Preferences</CardTitle>
          <CardDescription>Configure default analysis options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Analysis Views Order - Draggable */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Analysis Views Order</Label>
              <span className="text-xs text-muted-foreground">Drag to reorder • First is default</span>
            </div>
            <div className="space-y-2">
              {localOrder.map((viewKey, index) => {
                const view = analysisViewsConfig[viewKey];
                const isDefault = index === 0;
                return (
                  <div
                    key={viewKey}
                    draggable
                    onDragStart={(e) => handleDragStart(e, viewKey)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, viewKey)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing",
                      isDefault 
                        ? "border-primary bg-primary/10" 
                        : "border-border hover:border-primary/30 bg-muted/30",
                      draggedItem === viewKey && "opacity-50 scale-95"
                    )}
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                    <span className="text-lg font-bold text-muted-foreground w-6">{index + 1}</span>
                    <div className="flex items-center gap-2 flex-1">
                      {view.icon}
                      <div>
                        <span className="text-sm font-medium">{view.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">{view.description}</span>
                      </div>
                    </div>
                    {isDefault ? (
                      <span className="flex items-center gap-1 text-xs text-primary font-medium px-2 py-0.5 rounded-full bg-primary/20">
                        <Star className="w-3 h-3 fill-current" />
                        Default
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAsDefault(viewKey)}
                        className="text-xs h-7"
                      >
                        Set as Default
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>


          <Separator />

          {/* Toggles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-Save Overrides</p>
                <p className="text-xs text-muted-foreground">Automatically save changes to deal overrides</p>
              </div>
              <Switch
                checked={settings.autoSaveOverrides}
                onCheckedChange={(checked) => updateSettings({ autoSaveOverrides: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Compact Mode</p>
                <p className="text-xs text-muted-foreground">Reduce spacing throughout the app</p>
              </div>
              <Switch
                checked={settings.compactMode}
                onCheckedChange={(checked) => updateSettings({ compactMode: checked })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loan & Financial Defaults */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Loan & Financial Defaults
            </CardTitle>
            <CardDescription>These values will be used as defaults for all new deal analyses</CardDescription>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Reset All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  Reset All Defaults?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset all loan and financial defaults to their original system values. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetAll}>Reset All</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardHeader>
        <CardContent className="space-y-4">
        {/* Flip Strategy */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-left">
                  <span className="text-sm font-semibold">Flip</span>
                  <p className="text-xs text-muted-foreground">Fix & Flip settings</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 pl-3 space-y-3">
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">Loan Settings</h5>
                <div className="divide-y divide-border border rounded-lg bg-background">
                  {flipLoanFields.map(renderField)}
                </div>
              </div>
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">Flip Costs</h5>
                <div className="divide-y divide-border border rounded-lg bg-background">
                  {flipFields.map(renderField)}
                </div>
              </div>
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">Hard Money Loan (HML)</h5>
                <div className="divide-y divide-border border rounded-lg bg-background">
                  {hmlFields.map(renderField)}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Rental Strategy */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Home className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-left">
                  <span className="text-sm font-semibold">Rental</span>
                  <p className="text-xs text-muted-foreground">Buy & Hold settings</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 pl-3 space-y-3">
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">Loan Settings</h5>
                <div className="divide-y divide-border border rounded-lg bg-background">
                  {rentalLoanFields.map(renderField)}
                </div>
              </div>
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">Operating Expenses</h5>
                <div className="divide-y divide-border border rounded-lg bg-background">
                  {rentalFields.map(renderField)}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* BRRRR Strategy */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-left">
                  <span className="text-sm font-semibold">BRRRR</span>
                  <p className="text-xs text-muted-foreground">Buy, Rehab, Rent, Refinance, Repeat</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 pl-3 space-y-3">
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">Loan Settings</h5>
                <div className="divide-y divide-border border rounded-lg bg-background">
                  {brrrrLoanFields.map(renderField)}
                </div>
              </div>
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">Refinance Settings</h5>
                <div className="divide-y divide-border border rounded-lg bg-background">
                  {brrrrFields.map(renderField)}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* External API Keys (third-party services this app calls) */}
      <ExternalApiKeysManager />

      {/* API Keys Management (keys this app generates for external access) */}
      <ApiKeysManager />

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
          <CardDescription>Destructive actions that cannot be undone</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete All Deals</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete all {deals.length} deals from the system
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeleting || deals.length === 0}>
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Delete All Deals
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {deals.length} deals from the system. 
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteAllDeals} 
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Sticky Save Bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-64 right-0 bg-background/95 backdrop-blur border-t border-border p-4 flex items-center justify-between z-50">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">You have unsaved changes</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLocalDefaults(settings.loanDefaults)} disabled={isRecalculating}>
              Discard
            </Button>
            <Button onClick={handleSave} className="gap-2" disabled={isRecalculating}>
              {isRecalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isRecalculating ? 'Updating Deals...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
