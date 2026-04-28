import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { useSettings } from '@/context/SettingsContext';
import { isDealAnalyzed } from '@/utils/dealHelpers';
import { coerceLotSizeSqft } from '@/utils/lotSize';
import { detectSuspiciousData } from '@/utils/suspiciousData';
import { analyzeArv, analyzeRehab } from '@/utils/maoCalculations';
import { calculateInvestmentScore } from '@/utils/investmentScore';
import { DealStatusBadge } from '@/components/deals/DealStatusBadge';
import { PropertyMap } from '@/components/deals/PropertyMap';
import { formatCurrency, formatPercent, getEffectiveValue, calculateFinancials, validateArvAgainstComps, calculateArvFromRecentComps, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { DEAL_SOURCE_LABELS, DealStatus, DEAL_STATUS_CONFIG } from '@/types/deal';
import { FINANCIAL_CONFIG } from '@/config/financial';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
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
  ArrowLeft,
  Zap,
  XCircle,
  Trash2,
  MessageSquare,
  Send,
  MapPin,
  Calendar,
  Mail,
  DollarSign,
  TrendingUp,
  Home,
  FileText,
  Loader2,
  ExternalLink,
  Building2,
  Clock,
  Map,
  History,
  AlertTriangle,
  Thermometer,
  GraduationCap,
  MapPinned,
  Info,
  Copy,
  Phone,
  Calculator,
  RotateCcw,
  Save,
  ChevronUp,
  ChevronDown,
  HelpCircle,
  Lock,
  Unlock,
  RefreshCw,
  ShieldAlert,
  BarChart3
} from 'lucide-react';
import { ZillowIcon } from '@/components/icons/ZillowIcon';
import { generateDealPDF } from '@/utils/pdfExport';
import { FileDown } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { WhatIfAnalysis } from '@/components/deals/WhatIfAnalysis';
import { BestStrategyCard } from '@/components/deals/BestStrategyCard';
import { FlipAnalysisCard } from '@/components/deals/FlipAnalysisCard'; // updated
import { ExpansionAnalysisCard } from '@/components/deals/ExpansionAnalysisCard';
import { RentalAnalysisCard } from '@/components/deals/RentalAnalysisCard';
import { BrrrrAnalysisCard } from '@/components/deals/BrrrrAnalysisCard';
import { DealInvestorsManager } from '@/components/deals/DealInvestorsManager';
import { ZipMarketCard } from '@/components/deals/ZipMarketCard';
import { useDealMessages } from '@/hooks/useDealMessages';
import { EmailThreadChat } from '@/components/deals/EmailThreadChat';
import { OfferEmailDraft } from '@/components/deals/OfferEmailDraft';

// Build the string-form overrides object that drives the form inputs.
// Centralizes the deal.overrides → string normalization (used in initial state, deal-id sync, and updatedAt sync).
function dealOverridesToStrings(deal: { overrides?: any } | null | undefined) {
  const o: any = deal?.overrides;
  return {
    arv: o?.arv?.toString() || '',
    rent: o?.rent?.toString() || '',
    rehabCost: o?.rehabCost?.toString() || '',
    purchasePrice: o?.purchasePrice?.toString() || '',
    downPaymentPercent: o?.downPaymentPercent?.toString() || '',
    interestRate: o?.interestRate?.toString() || '',
    loanTermYears: o?.loanTermYears?.toString() || '',
    targetBedrooms: o?.targetBedrooms?.toString() || '',
    targetBathrooms: o?.targetBathrooms?.toString() || '',
    holdingMonths: o?.holdingMonths?.toString() || '',
    propertyTaxMonthly: o?.propertyTaxMonthly?.toString() || '',
    insuranceMonthly: o?.insuranceMonthly?.toString() || '',
    rentalInsuranceMonthly: o?.rentalInsuranceMonthly?.toString() || '',
    stateTaxMonthly: o?.stateTaxMonthly?.toString() || '',
    hoaMonthly: o?.hoaMonthly?.toString() || '',
    utilitiesMonthly: o?.utilitiesMonthly?.toString() || '',
    propertyManagementPercent: o?.propertyManagementPercent?.toString() || '',
    maintenanceVacancyPercent: o?.maintenanceVacancyPercent?.toString() || '',
    closingCostsPercent: o?.closingCostsPercent?.toString() || '',
    closingCostsDollar: o?.closingCostsDollar?.toString() || '',
    closingCostsSalePercent: o?.closingCostsSalePercent?.toString() || '',
    closingCostsSaleDollar: o?.closingCostsSaleDollar?.toString() || '',
    contingencyPercent: o?.contingencyPercent?.toString() || '',
    agentCommissionPercent: o?.agentCommissionPercent?.toString() || '',
    notaryFees: o?.notaryFees?.toString() || '',
    cashNotaryFee: o?.cashNotaryFee?.toString() || '',
    titleFees: o?.titleFees?.toString() || '',
    hmlLoanType: o?.hmlLoanType || 'ltc',
    brrrrPhase1Type: o?.brrrrPhase1Type || 'hml',
    hmlLtvPurchasePercent: o?.hmlLtvPurchasePercent?.toString() || '',
    hmlLtvRehabPercent: o?.hmlLtvRehabPercent?.toString() || '',
    hmlPointsPercent: o?.hmlPointsPercent?.toString() || '',
    hmlInterestRate: o?.hmlInterestRate?.toString() || '',
    hmlProcessingFee: o?.hmlProcessingFee?.toString() || '',
    hmlAppraisalCost: o?.hmlAppraisalCost?.toString() || '',
    hmlUnderwritingFee: o?.hmlUnderwritingFee?.toString() || '',
    hmlOtherFees: o?.hmlOtherFees?.toString() || '',
    hmlAnnualInsurance: o?.hmlAnnualInsurance?.toString() || '',
    refiLenderName: o?.refiLenderName?.toString() || '',
    refiLtvPercent: o?.refiLtvPercent?.toString() || '',
    refiInterestRate: o?.refiInterestRate?.toString() || '',
    refiAppraisalCost: o?.refiAppraisalCost?.toString() || '',
    refiUnderwritingFee: o?.refiUnderwritingFee?.toString() || '',
    refiPointsPercent: o?.refiPointsPercent?.toString() || '',
    refiOtherFees: o?.refiOtherFees?.toString() || '',
    refiClosingPercent: o?.refiClosingPercent?.toString() || '',
    capexPercent: o?.capexPercent?.toString() || '',
    lotSizeSqft: o?.lotSizeSqft?.toString() || '',
    holdingOtherMonthly: o?.holdingOtherMonthly?.toString() || '',
    rentalAppraisalCost: o?.rentalAppraisalCost?.toString() || '',
    rentalUnderwritingFee: o?.rentalUnderwritingFee?.toString() || '',
    rentalPointsPercent: o?.rentalPointsPercent?.toString() || '',
    rentalOtherFees: o?.rentalOtherFees?.toString() || '',
    rentalInterestOnly: o?.rentalInterestOnly?.toString() || '',
    brrrrInterestOnly: o?.brrrrInterestOnly?.toString() || '',
    inventoryMonths: o?.inventoryMonths?.toString() || '',
  };
}

export default function DealDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const analysisState = location.state as { analysisResult?: 'new' | 'duplicate'; apiCharged?: boolean; analyzedAt?: string; originalAddress?: string } | null;
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { settings } = useSettings();
  const loanDefaults = settings.loanDefaults;
  const { getDeal, updateDealStatus, updateDealOverrides, updateDealNotes, refreshDealFromApi, refetch, isLoading, toggleDealLock, deleteDeal } = useDeals();

  const arvOverrideRef = useRef<HTMLInputElement>(null);
  const rehabOverrideRef = useRef<HTMLInputElement>(null);
  const rentOverrideRef = useRef<HTMLInputElement>(null);

  const focusOverrideField = (field: 'arv' | 'rehabCost' | 'rent') => {
    const inputId = field === 'arv' ? 'arv-override' : field === 'rehabCost' ? 'rehab-override' : 'rent-override';
    document.getElementById(inputId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    window.setTimeout(() => {
      if (field === 'arv') arvOverrideRef.current?.focus();
      if (field === 'rehabCost') rehabOverrideRef.current?.focus();
      if (field === 'rent') rentOverrideRef.current?.focus();
    }, 250);
  };
  
  // Force refetch on mount to get latest data from DB
  useEffect(() => {
    refetch();
  }, [id]);
  
  const deal = getDeal(id || '');
  const { messages: smsMessages, sending: smsSending, sendSms } = useDealMessages(deal?.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localOverrides, setLocalOverrides] = useState(() => dealOverridesToStrings(deal));
  const [isOverridesDirty, setIsOverridesDirty] = useState(false);
  const baselineOverridesRef = useRef(localOverrides);
  
  const [explicitlyResetFields, setExplicitlyResetFields] = useState<Set<string>>(new Set());
  const [isSavingOverrides, setIsSavingOverrides] = useState(false);
  const [notes, setNotes] = useState(deal?.notes || '');
  const [newNoteText, setNewNoteText] = useState('');
  const [isNotesDirty, setIsNotesDirty] = useState(false);
  const [rejectionReason, setRejectionReason] = useState(deal?.rejectionReason || '');
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [isResetAllDialogOpen, setIsResetAllDialogOpen] = useState(false);
  const [showRentCompsOpen, setShowRentCompsOpen] = useState(false);
  const [taxHistoryOpen, setTaxHistoryOpen] = useState(false);
  const [olderCompsOpen, setOlderCompsOpen] = useState(false);
  const [isLoiDialogOpen, setIsLoiDialogOpen] = useState(false);
  const [isExportSummaryDialogOpen, setIsExportSummaryDialogOpen] = useState(false);
  const [isSmsDialogOpen, setIsSmsDialogOpen] = useState(false);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsBody, setSmsBody] = useState('');
  
  // Collapsible section states - all closed by default for clean initial view
  const [modifiedAssumptionsOpen, setModifiedAssumptionsOpen] = useState(false);
  const [bestStrategyOpen, setBestStrategyOpen] = useState(false);
  const [flipAnalysisOpen, setFlipAnalysisOpen] = useState(false);
  const [expansionAnalysisOpen, setExpansionAnalysisOpen] = useState(false);
  const [rentalAnalysisOpen, setRentalAnalysisOpen] = useState(false);
  const [brrrrAnalysisOpen, setBrrrrAnalysisOpen] = useState(false);
  const [acquisitionEngineOpen, setAcquisitionEngineOpen] = useState(false);
  const [saleCompsOpen, setSaleCompsOpen] = useState(false);
  const [rentCompsOpen, setRentCompsOpen] = useState(false);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [hmlFeesDetailOpen, setHmlFeesDetailOpen] = useState(false);
  const [hmlCashToCloseOpen, setHmlCashToCloseOpen] = useState(false);
  const [hmlHoldingDetailOpen, setHmlHoldingDetailOpen] = useState(false);
  const [hmlTotalInvestmentDetailOpen, setHmlTotalInvestmentDetailOpen] = useState(false);
  const [hmlCashOutDetailOpen, setHmlCashOutDetailOpen] = useState(false);
  const [refiFeesOpen, setRefiFeesOpen] = useState(false);

  // Parse notes as array (stored as JSON or legacy single string)
  const parsedNotes: string[] = useMemo(() => {
    if (!notes) return [];
    try {
      const parsed = JSON.parse(notes);
      if (Array.isArray(parsed)) return parsed;
      return [notes]; // Legacy: single string
    } catch {
      return notes.trim() ? [notes] : []; // Legacy: single string
    }
  }, [notes]);

  // Sync local state when deal changes (e.g., navigating to another deal)
  useEffect(() => {
    if (!deal) return;
    const initial = dealOverridesToStrings(deal);
    setLocalOverrides(initial);
    baselineOverridesRef.current = initial;
    setNotes(deal.notes || '');
    setRejectionReason(deal.rejectionReason || '');
    setIsOverridesDirty(false);
  }, [deal?.id]);

  // Sync updates coming from DB only when deal data actually changes from server
  // Uses a ref to track the last synced updatedAt to avoid re-syncing on dirty flag changes
  const lastSyncedUpdatedAtRef = useRef(deal?.updatedAt);
  useEffect(() => {
    if (!deal) return;
    // Only sync when deal?.updatedAt actually changed (real DB update)
    if (lastSyncedUpdatedAtRef.current === deal.updatedAt) return;
    lastSyncedUpdatedAtRef.current = deal.updatedAt;
    
    if (!isOverridesDirty) {
      const synced = dealOverridesToStrings(deal);
      setLocalOverrides(synced);
      baselineOverridesRef.current = synced;
    }
    if (!isNotesDirty) {
      setNotes(deal.notes || '');
    }
    setRejectionReason(deal.rejectionReason || '');
  }, [deal?.updatedAt]);

  // Auto-apply rehab minimums only when value comes from the API (not a manual override)
  useEffect(() => {
    if (!deal) return;
    let floor = 0;
    if (deal.source === 'api') floor = 60_000;
    else if (deal.source === 'email') floor = 80_000;
    if (floor === 0) return;
    // Never override a value the user manually entered
    if (deal.overrides?.rehabCost != null) return;
    const apiRehab = deal.apiData?.rehabCost ?? 0;
    if (apiRehab >= floor) return;
    updateDealOverrides(deal.id, { rehabCost: floor });
    setLocalOverrides(prev => ({ ...prev, rehabCost: floor.toString() }));
  }, [deal?.id]);

  const financials = deal?.financials;
  const apiData = deal?.apiData;
  
  // Normalize rawResponse property access - handle different API response structures
  const rawProperty = apiData?.rawResponse?.data?.property || apiData?.rawResponse?.property || {};


  // Real-time calculated financials based on current overrides
  const liveFinancials = useMemo(() => {
    if (!apiData) return null;
    const currentOverrides = {
      arv: localOverrides.arv ? parseFloat(localOverrides.arv) : null,
      rent: localOverrides.rent ? parseFloat(localOverrides.rent) : null,
      rehabCost: localOverrides.rehabCost ? parseFloat(localOverrides.rehabCost) : null,
      purchasePrice: localOverrides.purchasePrice ? parseFloat(localOverrides.purchasePrice) : null,
      downPaymentPercent: localOverrides.downPaymentPercent ? parseFloat(localOverrides.downPaymentPercent) : null,
      interestRate: localOverrides.interestRate ? parseFloat(localOverrides.interestRate) : null,
      loanTermYears: localOverrides.loanTermYears ? parseFloat(localOverrides.loanTermYears) : null,
      targetBedrooms: localOverrides.targetBedrooms ? parseFloat(localOverrides.targetBedrooms) : null,
      targetBathrooms: localOverrides.targetBathrooms ? parseFloat(localOverrides.targetBathrooms) : null,
      holdingMonths: localOverrides.holdingMonths ? parseFloat(localOverrides.holdingMonths) : null,
      propertyTaxMonthly: localOverrides.propertyTaxMonthly ? parseFloat(localOverrides.propertyTaxMonthly) : null,
      insuranceMonthly: localOverrides.insuranceMonthly ? parseFloat(localOverrides.insuranceMonthly) : null,
      rentalInsuranceMonthly: localOverrides.rentalInsuranceMonthly ? parseFloat(localOverrides.rentalInsuranceMonthly) : null,
      stateTaxMonthly: localOverrides.stateTaxMonthly ? parseFloat(localOverrides.stateTaxMonthly) : null,
      hoaMonthly: localOverrides.hoaMonthly ? parseFloat(localOverrides.hoaMonthly) : null,
      utilitiesMonthly: localOverrides.utilitiesMonthly ? parseFloat(localOverrides.utilitiesMonthly) : null,
      propertyManagementPercent: localOverrides.propertyManagementPercent ? parseFloat(localOverrides.propertyManagementPercent) : null,
      maintenanceVacancyPercent: localOverrides.maintenanceVacancyPercent ? parseFloat(localOverrides.maintenanceVacancyPercent) : null,
      closingCostsPercent: localOverrides.closingCostsPercent ? parseFloat(localOverrides.closingCostsPercent) : null,
      closingCostsDollar: localOverrides.closingCostsDollar ? parseFloat(localOverrides.closingCostsDollar) : null,
      closingCostsSalePercent: (localOverrides as any).closingCostsSalePercent ? parseFloat((localOverrides as any).closingCostsSalePercent) : null,
      closingCostsSaleDollar: (localOverrides as any).closingCostsSaleDollar ? parseFloat((localOverrides as any).closingCostsSaleDollar) : null,
      contingencyPercent: localOverrides.contingencyPercent ? parseFloat(localOverrides.contingencyPercent) : null,
      agentCommissionPercent: localOverrides.agentCommissionPercent ? parseFloat(localOverrides.agentCommissionPercent) : null,
      notaryFees: localOverrides.notaryFees ? parseFloat(localOverrides.notaryFees) : null,
      cashNotaryFee: localOverrides.cashNotaryFee ? parseFloat(localOverrides.cashNotaryFee) : null,
      titleFees: localOverrides.titleFees ? parseFloat(localOverrides.titleFees) : null,
      hmlLoanType: localOverrides.hmlLoanType !== 'ltc' ? localOverrides.hmlLoanType : null,
      brrrrPhase1Type: localOverrides.brrrrPhase1Type !== 'hml' ? localOverrides.brrrrPhase1Type : null,
      hmlLtvPurchasePercent: localOverrides.hmlLtvPurchasePercent ? parseFloat(localOverrides.hmlLtvPurchasePercent) : null,
      hmlLtvRehabPercent: localOverrides.hmlLtvRehabPercent ? parseFloat(localOverrides.hmlLtvRehabPercent) : null,
      hmlPointsPercent: localOverrides.hmlPointsPercent ? parseFloat(localOverrides.hmlPointsPercent) : null,
      hmlInterestRate: localOverrides.hmlInterestRate ? parseFloat(localOverrides.hmlInterestRate) : null,
      hmlProcessingFee: localOverrides.hmlProcessingFee ? parseFloat(localOverrides.hmlProcessingFee) : null,
      hmlAppraisalCost: localOverrides.hmlAppraisalCost ? parseFloat(localOverrides.hmlAppraisalCost) : null,
      hmlUnderwritingFee: localOverrides.hmlUnderwritingFee ? parseFloat(localOverrides.hmlUnderwritingFee) : null,
      hmlOtherFees: localOverrides.hmlOtherFees ? parseFloat(localOverrides.hmlOtherFees) : null,
      hmlAnnualInsurance: localOverrides.hmlAnnualInsurance ? parseFloat(localOverrides.hmlAnnualInsurance) : null,
      refiLenderName: localOverrides.refiLenderName || null,
      refiLtvPercent: localOverrides.refiLtvPercent ? parseFloat(localOverrides.refiLtvPercent) : null,
      refiInterestRate: localOverrides.refiInterestRate ? parseFloat(localOverrides.refiInterestRate) : null,
      refiAppraisalCost: localOverrides.refiAppraisalCost ? parseFloat(localOverrides.refiAppraisalCost) : null,
      refiUnderwritingFee: localOverrides.refiUnderwritingFee ? parseFloat(localOverrides.refiUnderwritingFee) : null,
      refiPointsPercent: localOverrides.refiPointsPercent ? parseFloat(localOverrides.refiPointsPercent) : null,
      refiOtherFees: localOverrides.refiOtherFees ? parseFloat(localOverrides.refiOtherFees) : null,
      refiClosingPercent: localOverrides.refiClosingPercent ? parseFloat(localOverrides.refiClosingPercent) : null,
      capexPercent: localOverrides.capexPercent ? parseFloat(localOverrides.capexPercent) : null,
      lotSizeSqft: localOverrides.lotSizeSqft ? parseFloat(localOverrides.lotSizeSqft) : null,
      holdingOtherMonthly: localOverrides.holdingOtherMonthly ? parseFloat(localOverrides.holdingOtherMonthly) : null,
      inventoryMonths: localOverrides.inventoryMonths ? parseFloat(localOverrides.inventoryMonths) : null,
      rentalAppraisalCost: localOverrides.rentalAppraisalCost ? parseFloat(localOverrides.rentalAppraisalCost) : null,
      rentalUnderwritingFee: localOverrides.rentalUnderwritingFee ? parseFloat(localOverrides.rentalUnderwritingFee) : null,
      rentalPointsPercent: localOverrides.rentalPointsPercent ? parseFloat(localOverrides.rentalPointsPercent) : null,
      rentalOtherFees: localOverrides.rentalOtherFees ? parseFloat(localOverrides.rentalOtherFees) : null,
    };
    return calculateFinancials(apiData, currentOverrides, loanDefaults);
  }, [localOverrides, apiData, loanDefaults]);

  // Calculate expanded scenario (if property < 1200 sqft, calculate for 1350 sqft + 3/2 conversion)
  const expansionScenario = useMemo(() => {
    if (!apiData || !apiData.sqft || apiData.sqft >= 1200) return null;
    
    const targetSqft = 1350;
    const targetBedrooms = 3;
    const targetBathrooms = 2;
    const currentSqft = apiData.sqft;
    const currentBed = apiData.bedrooms ?? 3;
    const currentBath = apiData.bathrooms ?? 1;
    
    // Calculate additional rehab cost
    // Base $20K for expansion + $15K if adding bathroom (3/1 -> 3/2)
    const needsBathroomAddition = currentBath < targetBathrooms;
    const additionalRehabCost = 20000 + (needsBathroomAddition ? 15000 : 0);
    
    // Filter sale comps for 3/2 properties with 1200-1500 sqft
    const saleComps = apiData.saleComps || [];
    const matchingComps = saleComps.filter(c => 
      c.saleDate && 
      c.sqft && c.sqft >= 1200 && c.sqft <= 1500 &&
      c.bedrooms === targetBedrooms &&
      c.bathrooms === targetBathrooms
    );
    
    // Fallback to just size-filtered comps if no 3/2 matches
    const sizeFilteredComps = saleComps.filter(c => 
      c.saleDate && c.sqft && c.sqft >= 1200 && c.sqft <= 1500
    );
    
    const soldCompsToUse = matchingComps.length > 0 ? matchingComps : sizeFilteredComps;
    
    let expandedArv = 0;
    const currentArv = localOverrides.arv ? parseFloat(localOverrides.arv) : (apiData.arv ?? 0);
    if (soldCompsToUse.length > 0) {
      const avgPricePerSqft = soldCompsToUse.reduce((sum, c) => sum + (c.salePrice / c.sqft), 0) / soldCompsToUse.length;
      expandedArv = Math.round(avgPricePerSqft * targetSqft);
      // Ensure expanded ARV is at least 12% higher than current
      if (expandedArv < currentArv * 1.12) {
        expandedArv = Math.round(currentArv * 1.12);
      }
    } else {
      // Fallback: add 12% to existing ARV when no comps available
      expandedArv = Math.round(currentArv * 1.12);
    }
    
    // Filter rent comps for 3/2 properties with 1200-1500 sqft
    const rentComps = apiData.rentComps || [];
    const matchingRentComps = rentComps.filter(c => 
      c.sqft && c.sqft >= 1200 && c.sqft <= 1500 &&
      c.bedrooms === targetBedrooms &&
      c.bathrooms === targetBathrooms
    );
    
    // Fallback to just size-filtered rent comps
    const sizeFilteredRentComps = rentComps.filter(c => 
      c.sqft && c.sqft >= 1200 && c.sqft <= 1500
    );
    
    const rentCompsToUse = matchingRentComps.length > 0 ? matchingRentComps : sizeFilteredRentComps;
    
    let expandedRent = 0;
    if (rentCompsToUse.length > 0) {
      const avgRentPerSqft = rentCompsToUse.reduce((sum, c) => sum + (c.adjustedRent / c.sqft), 0) / rentCompsToUse.length;
      expandedRent = Math.round(avgRentPerSqft * targetSqft);
    } else {
      // Fallback: scale existing rent proportionally
      const currentRent = localOverrides.rent ? parseFloat(localOverrides.rent) : (apiData.rent ?? 0);
      expandedRent = Math.round((currentRent / currentSqft) * targetSqft);
    }
    
    const currentRehabCost = localOverrides.rehabCost ? parseFloat(localOverrides.rehabCost) : (apiData.rehabCost ?? 0);
    const expandedRehabCost = currentRehabCost + additionalRehabCost;
    
    // Calculate financials for expanded scenario
    const expandedOverrides = {
      arv: expandedArv,
      rent: expandedRent,
      rehabCost: expandedRehabCost,
      purchasePrice: localOverrides.purchasePrice ? parseFloat(localOverrides.purchasePrice) : null,
      downPaymentPercent: localOverrides.downPaymentPercent ? parseFloat(localOverrides.downPaymentPercent) : null,
      interestRate: localOverrides.interestRate ? parseFloat(localOverrides.interestRate) : null,
      loanTermYears: localOverrides.loanTermYears ? parseFloat(localOverrides.loanTermYears) : null,
      targetBedrooms: targetBedrooms,
      targetBathrooms: targetBathrooms,
      holdingMonths: localOverrides.holdingMonths ? parseFloat(localOverrides.holdingMonths) : null,
      propertyTaxMonthly: localOverrides.propertyTaxMonthly ? parseFloat(localOverrides.propertyTaxMonthly) : null,
      insuranceMonthly: localOverrides.insuranceMonthly ? parseFloat(localOverrides.insuranceMonthly) : null,
      rentalInsuranceMonthly: localOverrides.rentalInsuranceMonthly ? parseFloat(localOverrides.rentalInsuranceMonthly) : null,
      stateTaxMonthly: localOverrides.stateTaxMonthly ? parseFloat(localOverrides.stateTaxMonthly) : null,
      hoaMonthly: localOverrides.hoaMonthly ? parseFloat(localOverrides.hoaMonthly) : null,
      utilitiesMonthly: localOverrides.utilitiesMonthly ? parseFloat(localOverrides.utilitiesMonthly) : null,
      propertyManagementPercent: localOverrides.propertyManagementPercent ? parseFloat(localOverrides.propertyManagementPercent) : null,
      maintenanceVacancyPercent: localOverrides.maintenanceVacancyPercent ? parseFloat(localOverrides.maintenanceVacancyPercent) : null,
      closingCostsPercent: localOverrides.closingCostsPercent ? parseFloat(localOverrides.closingCostsPercent) : null,
      closingCostsDollar: localOverrides.closingCostsDollar ? parseFloat(localOverrides.closingCostsDollar) : null,
      closingCostsSalePercent: (localOverrides as any).closingCostsSalePercent ? parseFloat((localOverrides as any).closingCostsSalePercent) : null,
      closingCostsSaleDollar: (localOverrides as any).closingCostsSaleDollar ? parseFloat((localOverrides as any).closingCostsSaleDollar) : null,
      contingencyPercent: localOverrides.contingencyPercent ? parseFloat(localOverrides.contingencyPercent) : null,
      agentCommissionPercent: localOverrides.agentCommissionPercent ? parseFloat(localOverrides.agentCommissionPercent) : null,
      notaryFees: localOverrides.notaryFees ? parseFloat(localOverrides.notaryFees) : null,
      cashNotaryFee: localOverrides.cashNotaryFee ? parseFloat(localOverrides.cashNotaryFee) : null,
      titleFees: localOverrides.titleFees ? parseFloat(localOverrides.titleFees) : null,
      hmlLoanType: localOverrides.hmlLoanType !== 'ltc' ? localOverrides.hmlLoanType : null,
      brrrrPhase1Type: localOverrides.brrrrPhase1Type !== 'hml' ? localOverrides.brrrrPhase1Type : null,
      hmlLtvPurchasePercent: localOverrides.hmlLtvPurchasePercent ? parseFloat(localOverrides.hmlLtvPurchasePercent) : null,
      hmlLtvRehabPercent: localOverrides.hmlLtvRehabPercent ? parseFloat(localOverrides.hmlLtvRehabPercent) : null,
      hmlPointsPercent: localOverrides.hmlPointsPercent ? parseFloat(localOverrides.hmlPointsPercent) : null,
      hmlInterestRate: localOverrides.hmlInterestRate ? parseFloat(localOverrides.hmlInterestRate) : null,
      hmlProcessingFee: localOverrides.hmlProcessingFee ? parseFloat(localOverrides.hmlProcessingFee) : null,
      hmlAppraisalCost: localOverrides.hmlAppraisalCost ? parseFloat(localOverrides.hmlAppraisalCost) : null,
      hmlUnderwritingFee: localOverrides.hmlUnderwritingFee ? parseFloat(localOverrides.hmlUnderwritingFee) : null,
      hmlOtherFees: localOverrides.hmlOtherFees ? parseFloat(localOverrides.hmlOtherFees) : null,
      hmlAnnualInsurance: localOverrides.hmlAnnualInsurance ? parseFloat(localOverrides.hmlAnnualInsurance) : null,
      refiLenderName: null,
      refiLtvPercent: localOverrides.refiLtvPercent ? parseFloat(localOverrides.refiLtvPercent) : null,
      refiInterestRate: localOverrides.refiInterestRate ? parseFloat(localOverrides.refiInterestRate) : null,
      refiAppraisalCost: localOverrides.refiAppraisalCost ? parseFloat(localOverrides.refiAppraisalCost) : null,
      refiUnderwritingFee: localOverrides.refiUnderwritingFee ? parseFloat(localOverrides.refiUnderwritingFee) : null,
      refiPointsPercent: localOverrides.refiPointsPercent ? parseFloat(localOverrides.refiPointsPercent) : null,
      refiOtherFees: localOverrides.refiOtherFees ? parseFloat(localOverrides.refiOtherFees) : null,
      refiClosingPercent: localOverrides.refiClosingPercent ? parseFloat(localOverrides.refiClosingPercent) : null,
      capexPercent: localOverrides.capexPercent ? parseFloat(localOverrides.capexPercent) : null,
      lotSizeSqft: localOverrides.lotSizeSqft ? parseFloat(localOverrides.lotSizeSqft) : null,
      holdingOtherMonthly: localOverrides.holdingOtherMonthly ? parseFloat(localOverrides.holdingOtherMonthly) : null,
      rentalAppraisalCost: localOverrides.rentalAppraisalCost ? parseFloat(localOverrides.rentalAppraisalCost) : null,
      rentalUnderwritingFee: localOverrides.rentalUnderwritingFee ? parseFloat(localOverrides.rentalUnderwritingFee) : null,
      rentalPointsPercent: localOverrides.rentalPointsPercent ? parseFloat(localOverrides.rentalPointsPercent) : null,
      rentalOtherFees: localOverrides.rentalOtherFees ? parseFloat(localOverrides.rentalOtherFees) : null,
    };
    
    const expandedFinancials = calculateFinancials(apiData, expandedOverrides);
    
    return {
      targetSqft,
      targetBedrooms,
      targetBathrooms,
      additionalRehabCost,
      needsBathroomAddition,
      expandedArv,
      expandedRent,
      expandedRehabCost,
      financials: expandedFinancials,
      compsUsed: {
        saleComps: matchingComps.length,
        saleCompsFallback: matchingComps.length === 0 && sizeFilteredComps.length > 0,
        rentComps: matchingRentComps.length,
        rentCompsFallback: matchingRentComps.length === 0 && sizeFilteredRentComps.length > 0,
      },
      currentConfig: `${currentBed}/${currentBath}`,
      targetConfig: `${targetBedrooms}/${targetBathrooms}`,
    };
  }, [localOverrides, apiData]);

  // Derived values - calculated once at component level for use across all sections
  const derivedValues = useMemo(() => {
    if (!apiData || !liveFinancials) return null;
    
    // Base values from overrides or API
    const purchasePrice = localOverrides.purchasePrice ? parseFloat(localOverrides.purchasePrice) : (apiData.purchasePrice ?? 0);
    const baseArv = localOverrides.arv ? parseFloat(localOverrides.arv) : (apiData.arv ?? 0);
    const baseRehabCost = localOverrides.rehabCost ? parseFloat(localOverrides.rehabCost) : (apiData.rehabCost ?? 0);
    
    // Rent from liveFinancials (includes layout adjustments)
    const rent = liveFinancials.monthlyGrossRent;
    
    // Layout adjustments
    const currentBedrooms = apiData.bedrooms ?? 0;
    const currentBathrooms = apiData.bathrooms ?? 0;
    const targetBedrooms = localOverrides.targetBedrooms ? parseFloat(localOverrides.targetBedrooms) : currentBedrooms;
    const targetBathrooms = localOverrides.targetBathrooms ? parseFloat(localOverrides.targetBathrooms) : currentBathrooms;
    const bedroomsAdded = Math.max(0, targetBedrooms - currentBedrooms);
    const bathroomsAdded = Math.max(0, targetBathrooms - currentBathrooms);
    const layoutRehabCost = (bedroomsAdded * 20000) + (bathroomsAdded * 15000);
    const layoutArvIncrease = (bedroomsAdded * 30000) + (bathroomsAdded * 20000);
    
    // ARV from liveFinancials (already validated and includes layout)
    const arv = liveFinancials.arv;
    const rehabCost = baseRehabCost + layoutRehabCost;
    
    // Holding costs
    const propertyTaxMonthly = localOverrides.propertyTaxMonthly 
      ? parseFloat(localOverrides.propertyTaxMonthly) 
      : (apiData.propertyTax ?? 0) / 12;
    const insuranceMonthly = localOverrides.insuranceMonthly 
      ? parseFloat(localOverrides.insuranceMonthly) 
      : getEffectiveMonthlyInsurance(apiData.insurance);
    const stateTaxMonthly = localOverrides.stateTaxMonthly ? parseFloat(localOverrides.stateTaxMonthly) : 0;
    const hoaMonthly = localOverrides.hoaMonthly ? parseFloat(localOverrides.hoaMonthly) : 0;
    const utilitiesMonthly = localOverrides.utilitiesMonthly ? parseFloat(localOverrides.utilitiesMonthly) : 300;
    const monthlyHoldingCost = propertyTaxMonthly + insuranceMonthly + stateTaxMonthly + hoaMonthly + utilitiesMonthly;
    const rehabMonths = localOverrides.holdingMonths ? parseInt(localOverrides.holdingMonths) : loanDefaults.holdingMonths;
    const totalHoldingCosts = monthlyHoldingCost * rehabMonths;
    
    // Closing costs
    const closingCostsPercent = localOverrides.closingCostsPercent 
      ? parseFloat(localOverrides.closingCostsPercent) / 100 
      : loanDefaults.closingCostsPercent / 100;
    const closingCostsBuy = localOverrides.closingCostsDollar 
      ? parseFloat(localOverrides.closingCostsDollar)
      : purchasePrice * closingCostsPercent;
    
    // ========== FLIP SUMMARY METRICS ==========
    const flipContingencyPercent = localOverrides.contingencyPercent 
      ? parseFloat(localOverrides.contingencyPercent) / 100 
      : loanDefaults.contingencyPercent / 100;
    const flipAgentPercent = localOverrides.agentCommissionPercent 
      ? parseFloat(localOverrides.agentCommissionPercent) / 100 
      : loanDefaults.agentCommissionPercent / 100;
    const flipRehabContingency = rehabCost * flipContingencyPercent;
    const notaryFee = localOverrides.notaryFees ? parseFloat(localOverrides.notaryFees) : FINANCIAL_CONFIG.notaryFeePerSigning;
    const titleFee = localOverrides.titleFees ? parseFloat(localOverrides.titleFees) : FINANCIAL_CONFIG.titleFees;
    const flipTotalInvestment = purchasePrice + closingCostsBuy + rehabCost + flipRehabContingency + totalHoldingCosts;
    const flipAgentCommission = arv * flipAgentPercent;
    const flipNotaryCost = notaryFee * 2; // HML signing + sale signing
    const flipNetProfit = arv - flipTotalInvestment - flipAgentCommission - flipNotaryCost - titleFee;
    const flipRoi = flipTotalInvestment > 0 ? (flipNetProfit / flipTotalInvestment) * 100 : 0;
    
    // ========== RENTAL SUMMARY METRICS ==========
    const rentalInsuranceVal = localOverrides.rentalInsuranceMonthly 
      ? parseFloat(localOverrides.rentalInsuranceMonthly) 
      : insuranceMonthly;
    const rentalInsuranceDiff = rentalInsuranceVal - insuranceMonthly;
    const rentalMonthlyCashflow = liveFinancials.monthlyCashflow - rentalInsuranceDiff;
    const rentalAdjustedNOI = liveFinancials.yearlyNOI - (rentalInsuranceDiff * 12);
    const rentalMonthlyNOI = rentalAdjustedNOI / 12;
    const rentalCapRate = purchasePrice > 0 ? (rentalAdjustedNOI / purchasePrice) * 100 : 0;
    
    // ========== BRRRR SUMMARY METRICS ==========
    const brrrrHmlLtvPurchase = localOverrides.hmlLtvPurchasePercent 
      ? parseFloat(localOverrides.hmlLtvPurchasePercent) / 100 
      : loanDefaults.hmlLtvPurchasePercent / 100;
    const brrrrHmlLtvRehab = localOverrides.hmlLtvRehabPercent 
      ? parseFloat(localOverrides.hmlLtvRehabPercent) / 100 
      : loanDefaults.hmlLtvRehabPercent / 100;
    const brrrrHmlPointsPercent = localOverrides.hmlPointsPercent 
      ? parseFloat(localOverrides.hmlPointsPercent) / 100 
      : loanDefaults.hmlPointsPercent / 100;
    const brrrrHmlInterestRate = localOverrides.hmlInterestRate 
      ? parseFloat(localOverrides.hmlInterestRate) / 100 
      : loanDefaults.hmlInterestRate / 100;
    const brrrrHmlProcessingFee = localOverrides.hmlProcessingFee 
      ? parseFloat(localOverrides.hmlProcessingFee) 
      : loanDefaults.hmlProcessingFee;
    const brrrrRefiLtv = localOverrides.refiLtvPercent 
      ? parseFloat(localOverrides.refiLtvPercent) / 100 
      : loanDefaults.refiLtvPercent / 100;
    
    const brrrrHmlIsLtv = localOverrides.hmlLoanType === 'ltv';
    const brrrrHmlLoanPurchase = brrrrHmlIsLtv ? arv * brrrrHmlLtvPurchase : purchasePrice * brrrrHmlLtvPurchase;
    const brrrrHmlDefaultRehabLtv = brrrrHmlIsLtv ? 0 : loanDefaults.hmlLtvRehabPercent / 100;
    const brrrrHmlEffectiveRehabLtv = localOverrides.hmlLtvRehabPercent ? brrrrHmlLtvRehab : brrrrHmlDefaultRehabLtv;
    const brrrrHmlLoanRehab = rehabCost * brrrrHmlEffectiveRehabLtv;
    const brrrrHmlTotalLoan = brrrrHmlLoanPurchase + brrrrHmlLoanRehab;
    const brrrrHmlPoints = brrrrHmlTotalLoan * brrrrHmlPointsPercent;
    const brrrrHmlInterest = brrrrHmlTotalLoan * (brrrrHmlInterestRate / 12) * rehabMonths;
    const brrrrTotalCashIn = (purchasePrice - brrrrHmlLoanPurchase) + (rehabCost - brrrrHmlLoanRehab) + closingCostsBuy + brrrrHmlPoints + brrrrHmlProcessingFee + brrrrHmlInterest + totalHoldingCosts + notaryFee; // HML signing
    
    const brrrrRefiLoanAmount = arv * brrrrRefiLtv;
    const brrrrCashOut = brrrrRefiLoanAmount - brrrrHmlTotalLoan - (brrrrRefiLoanAmount * 0.02) - notaryFee; // Refi signing
    const brrrrCashLeftInDeal = brrrrTotalCashIn - Math.max(0, brrrrCashOut);
    
    const brrrrRefiTermMonths = (localOverrides.loanTermYears ? parseFloat(localOverrides.loanTermYears) : loanDefaults.loanTermYears) * 12;
    const brrrrMonthlyMortgage = brrrrRefiLoanAmount > 0
      ? brrrrRefiLoanAmount * ((loanDefaults.interestRate / 100 / 12) * Math.pow(1 + (loanDefaults.interestRate / 100 / 12), brrrrRefiTermMonths)) / (Math.pow(1 + (loanDefaults.interestRate / 100 / 12), brrrrRefiTermMonths) - 1)
      : 0;
    const brrrrNoi = rent - (liveFinancials.monthlyExpenses ?? 0);
    const brrrrMonthlyCashflow = brrrrNoi - brrrrMonthlyMortgage;
    const brrrrEquity = arv - brrrrRefiLoanAmount;
    
    return {
      purchasePrice,
      arv,
      rehabCost,
      rent,
      propertyTaxMonthly,
      insuranceMonthly,
      stateTaxMonthly,
      hoaMonthly,
      utilitiesMonthly,
      monthlyHoldingCost,
      rehabMonths,
      totalHoldingCosts,
      closingCostsBuy,
      targetBedrooms,
      targetBathrooms,
      bedroomsAdded,
      bathroomsAdded,
      // Strategy summary metrics
      flipTotalInvestment,
      flipNetProfit,
      flipRoi,
      rentalMonthlyCashflow,
      rentalMonthlyNOI,
      rentalCapRate,
      brrrrCashLeftInDeal,
      brrrrMonthlyCashflow,
      brrrrEquity,
    };
  }, [localOverrides, apiData, liveFinancials, loanDefaults]);
  
  // Destructure for easy access (with defaults for when derivedValues is null)
  // Use (val || 0) instead of (val ?? 0) to also guard against NaN from calc errors
  const safeNum = (v: number | null | undefined) => (v != null && isFinite(v) ? v : 0);
  const purchasePrice = safeNum(derivedValues?.purchasePrice);
  const arv           = safeNum(derivedValues?.arv);
  const rehabCost     = safeNum(derivedValues?.rehabCost);
  const rent          = safeNum(derivedValues?.rent);
  const propertyTaxMonthly  = safeNum(derivedValues?.propertyTaxMonthly);
  const insuranceMonthly    = safeNum(derivedValues?.insuranceMonthly);
  const monthlyHoldingCost  = safeNum(derivedValues?.monthlyHoldingCost);
  const rehabMonths         = safeNum(derivedValues?.rehabMonths) || 6;
  const totalHoldingCosts   = safeNum(derivedValues?.totalHoldingCosts);
  const closingCostsBuy     = safeNum(derivedValues?.closingCostsBuy);
  // Strategy summary metrics
  const flipNetProfit        = safeNum(derivedValues?.flipNetProfit);
  const flipRoi              = safeNum(derivedValues?.flipRoi);
  const rentalMonthlyCashflow= safeNum(derivedValues?.rentalMonthlyCashflow);
  const rentalMonthlyNOI     = safeNum(derivedValues?.rentalMonthlyNOI);
  const rentalCapRate        = safeNum(derivedValues?.rentalCapRate);
  const brrrrCashLeftInDeal  = safeNum(derivedValues?.brrrrCashLeftInDeal);
  const brrrrMonthlyCashflow = safeNum(derivedValues?.brrrrMonthlyCashflow);
  const brrrrEquity          = safeNum(derivedValues?.brrrrEquity);

  // Investment Score for header badge — computed once, shared everywhere
  const headerInvestmentScore = useMemo(() => {
    if (!arv || !purchasePrice) return null;
    return calculateInvestmentScore({
      monthlyCashflow: brrrrMonthlyCashflow || null,
      cashLeftInDeal: brrrrCashLeftInDeal || null,
      arv,
      purchasePrice,
      rehabCost,
      schoolTotal: apiData?.schoolScore ?? null,
      inventoryMonths: localOverrides.inventoryMonths ? parseFloat(localOverrides.inventoryMonths) : null,
    }, settings.investmentScoreSettings);
  }, [arv, purchasePrice, rehabCost, brrrrMonthlyCashflow, brrrrCashLeftInDeal, apiData?.schoolScore, localOverrides.inventoryMonths, settings.investmentScoreSettings]);

  // ARV-vs-comps validation result, memoized so the comp-loop doesn't run on every render.
  // Returns null when the user has manually overridden ARV (we trust their value) or when prerequisites are missing.
  const arvValidationMemo = useMemo(() => {
    if (!apiData || !derivedValues || localOverrides.arv) return null;
    const baseArv = apiData.arv ?? 0;
    const layoutArvIncrease = (derivedValues.bedroomsAdded * 30000) + (derivedValues.bathroomsAdded * 20000);
    const arvBeforeValidation = baseArv + layoutArvIncrease;
    const sqft = apiData.sqft ?? 0;
    return validateArvAgainstComps(
      arvBeforeValidation,
      apiData.saleComps || [],
      sqft,
      derivedValues.targetBedrooms,
      derivedValues.targetBathrooms,
    );
  }, [apiData, derivedValues, localOverrides.arv]);

  const suspiciousCheckMemo = useMemo(() => {
    if (!apiData) return null;
    const effectiveArvForCheck = localOverrides.arv ? parseFloat(localOverrides.arv) : (liveFinancials?.arv ?? null);
    return detectSuspiciousData(apiData, {
      arv: effectiveArvForCheck,
      purchasePrice: localOverrides.purchasePrice ? parseFloat(localOverrides.purchasePrice) : null,
      rent: localOverrides.rent ? parseFloat(localOverrides.rent) : null,
      rehabCost: localOverrides.rehabCost ? parseFloat(localOverrides.rehabCost) : null,
    });
  }, [apiData, liveFinancials?.arv, localOverrides.arv, localOverrides.purchasePrice, localOverrides.rent, localOverrides.rehabCost]);

  const arvAnalysisMemo = useMemo(() => {
    if (!apiData) return null;
    return analyzeArv(arv, apiData?.saleComps ?? []);
  }, [arv, apiData]);

  const rehabAnalysisMemo = useMemo(() => {
    if (!deal) return null;
    return analyzeRehab(deal);
  }, [deal]);

  // Build display-default map: what shows in each input when override is empty
  const fieldDisplayDefaults = useMemo((): Record<string, string> => {
    if (!apiData) return {};
    const baseArv = apiData.arv ?? 0;
    const baseRehab = apiData.rehabCost ?? 0;
    const baseRent = apiData.rent ?? 0;
    const basePurchase = apiData.purchasePrice ?? 0;
    return {
      purchasePrice: Math.round(basePurchase).toString(),
      arv: Math.round(baseArv).toString(),
      rehabCost: Math.round(baseRehab).toString(),
      rent: Math.round(baseRent).toString(),
      targetBedrooms: (apiData.bedrooms ?? 0).toString(),
      targetBathrooms: (apiData.bathrooms ?? 0).toString(),
      downPaymentPercent: loanDefaults.downPaymentPercent.toString(),
      interestRate: loanDefaults.interestRate.toString(),
      loanTermYears: loanDefaults.loanTermYears.toString(),
      holdingMonths: loanDefaults.holdingMonths.toString(),
      closingCostsPercent: loanDefaults.closingCostsPercent.toString(),
      contingencyPercent: loanDefaults.contingencyPercent.toString(),
      agentCommissionPercent: loanDefaults.agentCommissionPercent.toString(),
      propertyManagementPercent: loanDefaults.propertyManagementPercent.toString(),
      maintenanceVacancyPercent: loanDefaults.maintenanceVacancyPercent.toString(),
      capexPercent: loanDefaults.capexPercent.toString(),
      hmlLtvPurchasePercent: loanDefaults.hmlLtvPurchasePercent.toString(),
      hmlLtvRehabPercent: loanDefaults.hmlLtvRehabPercent.toString(),
      hmlPointsPercent: loanDefaults.hmlPointsPercent.toString(),
      hmlInterestRate: loanDefaults.hmlInterestRate.toString(),
      hmlProcessingFee: loanDefaults.hmlProcessingFee.toString(),
      hmlAppraisalCost: '',
      hmlUnderwritingFee: '',
      hmlOtherFees: '',
      hmlAnnualInsurance: '',
      refiLtvPercent: loanDefaults.refiLtvPercent.toString(),
      refiClosingPercent: loanDefaults.refiClosingPercent.toString(),
      propertyTaxMonthly: Math.round((apiData.propertyTax ?? 0) / 12).toString(),
      insuranceMonthly: Math.round((apiData.insurance ?? 1200) / 12).toString(),
      stateTaxMonthly: '0',
      hoaMonthly: '0',
      utilitiesMonthly: '300',
      notaryFees: FINANCIAL_CONFIG.notaryFeePerSigning.toString(),
      cashNotaryFee: '400',
      titleFees: FINANCIAL_CONFIG.titleFees.toString(),
      hmlLoanType: 'ltc',
      brrrrPhase1Type: 'hml',
    };
  }, [apiData, loanDefaults]);

  // Check if current local overrides differ from baseline (what was loaded from DB)
  // Resolves empty values to their display defaults so typing the default value = no change
  const hasUnsavedChanges = useMemo(() => {
    if (!deal) return false;
    const baseline = baselineOverridesRef.current;
    
    for (const field of Object.keys(localOverrides) as (keyof typeof localOverrides)[]) {
      const localVal = localOverrides[field];
      const baseVal = baseline[field];
      // Direct match - no change
      if (localVal === baseVal) continue;
      // Resolve empty values to their display defaults
      const defaultVal = fieldDisplayDefaults[field] || '';
      const effectiveLocal = localVal || defaultVal;
      const effectiveBase = baseVal || defaultVal;
      if (effectiveLocal !== effectiveBase) return true;
    }
    return false;
  }, [localOverrides, deal, fieldDisplayDefaults]);

  // Warn user before leaving page with unsaved changes (browser refresh/close)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Note: Internal navigation blocking removed (useBlocker requires data router).
  // The beforeunload handler above still protects against tab close/refresh.

  // Loading state - show spinner while data is being fetched
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading deal...</p>
        </div>
      </div>
    );
  }

  // Early return after all hooks - only show if NOT loading AND deal not found
  if (!deal) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">Deal Not Found</h2>
          <p className="text-muted-foreground mb-4">The deal you're looking for doesn't exist.</p>
          <Button onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Deals
          </Button>
        </div>
      </div>
    );
  }

  const handleAnalyze = async () => {
    setIsRefreshing(true);
    try {
      await refreshDealFromApi(deal.id);
      toast.success('Deal analyzed successfully!');
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to analyze deal');
    } finally {
      setIsRefreshing(false);
    }
  };

  const sanitizeNumericInput = (raw: string, opts?: { allowDecimal?: boolean }) => {
    const allowDecimal = opts?.allowDecimal ?? false;
    // Keep only digits and (optionally) a single dot.
    let cleaned = raw.replace(/[^0-9.]/g, '');
    if (!allowDecimal) {
      cleaned = cleaned.replace(/\./g, '');
    } else {
      const firstDot = cleaned.indexOf('.');
      if (firstDot !== -1) {
        cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
      }
    }
    return cleaned;
  };

  const toNumberOrNull = (value: string) => (value.trim() === '' ? null : parseFloat(value));

  // Get original API value for a field
  const getOriginalValue = (field: keyof typeof localOverrides): number | null => {
    if (!apiData) return null;
    switch (field) {
      case 'arv': return apiData.arv ?? null;
      case 'rent': return apiData.rent ?? null;
      case 'rehabCost': return apiData.rehabCost ?? null;
      case 'purchasePrice': return apiData.purchasePrice ?? null;
      case 'targetBedrooms': return apiData.bedrooms ?? null;
      case 'targetBathrooms': return apiData.bathrooms ?? null;
      default: return null;
    }
  };

  // Check if override differs significantly from original (>50%) and warning not dismissed
  const isSignificantDeviation = (field: keyof typeof localOverrides): boolean => {
    if (dismissedWarnings.has(field)) return false;
    const overrideStr = localOverrides[field];
    if (!overrideStr) return false;
    const overrideVal = parseFloat(overrideStr);
    if (isNaN(overrideVal)) return false;
    const originalVal = getOriginalValue(field);
    if (!originalVal || originalVal === 0) return false;
    const deviation = Math.abs(overrideVal - originalVal) / originalVal;
    return deviation > 0.5; // More than 50% difference
  };

  // Dismiss a deviation warning
  const handleDismissWarning = (field: keyof typeof localOverrides) => {
    setDismissedWarnings(prev => new Set(prev).add(field));
  };

  // Reset a single override field
  const handleResetOverride = (field: keyof typeof localOverrides) => {
    setLocalOverrides(prev => ({ ...prev, [field]: '' }));
    setExplicitlyResetFields(prev => new Set(prev).add(field));
    setIsOverridesDirty(true);
  };

  // Discard current unsaved changes - revert to what's saved in DB
  const handleDiscardChanges = () => {
    const saved = deal?.overrides || {};
    setLocalOverrides({
      arv: (saved as any).arv?.toString() || '',
      rent: (saved as any).rent?.toString() || '',
      rehabCost: (saved as any).rehabCost?.toString() || '',
      purchasePrice: (saved as any).purchasePrice?.toString() || '',
      downPaymentPercent: (saved as any).downPaymentPercent?.toString() || '',
      interestRate: (saved as any).interestRate?.toString() || '',
      loanTermYears: (saved as any).loanTermYears?.toString() || '',
      targetBedrooms: (saved as any).targetBedrooms?.toString() || '',
      targetBathrooms: (saved as any).targetBathrooms?.toString() || '',
      holdingMonths: (saved as any).holdingMonths?.toString() || '',
      propertyTaxMonthly: (saved as any).propertyTaxMonthly?.toString() || '',
      insuranceMonthly: (saved as any).insuranceMonthly?.toString() || '',
      rentalInsuranceMonthly: (saved as any).rentalInsuranceMonthly?.toString() || '',
      stateTaxMonthly: (saved as any).stateTaxMonthly?.toString() || '',
      hoaMonthly: (saved as any).hoaMonthly?.toString() || '',
      utilitiesMonthly: (saved as any).utilitiesMonthly?.toString() || '',
      propertyManagementPercent: (saved as any).propertyManagementPercent?.toString() || '',
      maintenanceVacancyPercent: (saved as any).maintenanceVacancyPercent?.toString() || '',
      closingCostsPercent: (saved as any).closingCostsPercent?.toString() || '',
      closingCostsDollar: (saved as any).closingCostsDollar?.toString() || '',
      contingencyPercent: (saved as any).contingencyPercent?.toString() || '',
      agentCommissionPercent: (saved as any).agentCommissionPercent?.toString() || '',
      notaryFees: (saved as any).notaryFees?.toString() || '',
      cashNotaryFee: (saved as any).cashNotaryFee?.toString() || '',
      titleFees: (saved as any).titleFees?.toString() || '',
      hmlLoanType: (saved as any).hmlLoanType || 'ltc',
      brrrrPhase1Type: (saved as any).brrrrPhase1Type || 'hml',
      hmlLtvPurchasePercent: (saved as any).hmlLtvPurchasePercent?.toString() || '',
      hmlLtvRehabPercent: (saved as any).hmlLtvRehabPercent?.toString() || '',
      hmlPointsPercent: (saved as any).hmlPointsPercent?.toString() || '',
      hmlInterestRate: (saved as any).hmlInterestRate?.toString() || '',
      hmlProcessingFee: (saved as any).hmlProcessingFee?.toString() || '',
      hmlAppraisalCost: (saved as any).hmlAppraisalCost?.toString() || '',
      hmlUnderwritingFee: (saved as any).hmlUnderwritingFee?.toString() || '',
      hmlOtherFees: (saved as any).hmlOtherFees?.toString() || '',
      hmlAnnualInsurance: (saved as any).hmlAnnualInsurance?.toString() || '',
      refiLenderName: (saved as any).refiLenderName?.toString() || '',
      refiLtvPercent: (saved as any).refiLtvPercent?.toString() || '',
      refiInterestRate: (saved as any).refiInterestRate?.toString() || '',
      refiAppraisalCost: (saved as any).refiAppraisalCost?.toString() || '',
      refiUnderwritingFee: (saved as any).refiUnderwritingFee?.toString() || '',
      refiPointsPercent: (saved as any).refiPointsPercent?.toString() || '',
      refiOtherFees: (saved as any).refiOtherFees?.toString() || '',
      refiClosingPercent: (saved as any).refiClosingPercent?.toString() || '',
      capexPercent: (saved as any).capexPercent?.toString() || '',
      lotSizeSqft: (saved as any).lotSizeSqft?.toString() || '',
      holdingOtherMonthly: (saved as any).holdingOtherMonthly?.toString() || '',
      rentalAppraisalCost: (saved as any).rentalAppraisalCost?.toString() || '',
      rentalUnderwritingFee: (saved as any).rentalUnderwritingFee?.toString() || '',
      rentalPointsPercent: (saved as any).rentalPointsPercent?.toString() || '',
      rentalOtherFees: (saved as any).rentalOtherFees?.toString() || '',
      rentalInterestOnly: (saved as any).rentalInterestOnly?.toString() || '',
      brrrrInterestOnly: (saved as any).brrrrInterestOnly?.toString() || '',
      inventoryMonths: (saved as any).inventoryMonths?.toString() || '',
    });
    baselineOverridesRef.current = {
      arv: (saved as any).arv?.toString() || '',
      rent: (saved as any).rent?.toString() || '',
      rehabCost: (saved as any).rehabCost?.toString() || '',
      purchasePrice: (saved as any).purchasePrice?.toString() || '',
      downPaymentPercent: (saved as any).downPaymentPercent?.toString() || '',
      interestRate: (saved as any).interestRate?.toString() || '',
      loanTermYears: (saved as any).loanTermYears?.toString() || '',
      targetBedrooms: (saved as any).targetBedrooms?.toString() || '',
      targetBathrooms: (saved as any).targetBathrooms?.toString() || '',
      holdingMonths: (saved as any).holdingMonths?.toString() || '',
      propertyTaxMonthly: (saved as any).propertyTaxMonthly?.toString() || '',
      insuranceMonthly: (saved as any).insuranceMonthly?.toString() || '',
      rentalInsuranceMonthly: (saved as any).rentalInsuranceMonthly?.toString() || '',
      stateTaxMonthly: (saved as any).stateTaxMonthly?.toString() || '',
      hoaMonthly: (saved as any).hoaMonthly?.toString() || '',
      utilitiesMonthly: (saved as any).utilitiesMonthly?.toString() || '',
      propertyManagementPercent: (saved as any).propertyManagementPercent?.toString() || '',
      maintenanceVacancyPercent: (saved as any).maintenanceVacancyPercent?.toString() || '',
      closingCostsPercent: (saved as any).closingCostsPercent?.toString() || '',
      closingCostsDollar: (saved as any).closingCostsDollar?.toString() || '',
      contingencyPercent: (saved as any).contingencyPercent?.toString() || '',
      agentCommissionPercent: (saved as any).agentCommissionPercent?.toString() || '',
      notaryFees: (saved as any).notaryFees?.toString() || '',
      cashNotaryFee: (saved as any).cashNotaryFee?.toString() || '',
      titleFees: (saved as any).titleFees?.toString() || '',
      hmlLoanType: (saved as any).hmlLoanType || 'ltc',
      brrrrPhase1Type: (saved as any).brrrrPhase1Type || 'hml',
      hmlLtvPurchasePercent: (saved as any).hmlLtvPurchasePercent?.toString() || '',
      hmlLtvRehabPercent: (saved as any).hmlLtvRehabPercent?.toString() || '',
      hmlPointsPercent: (saved as any).hmlPointsPercent?.toString() || '',
      hmlInterestRate: (saved as any).hmlInterestRate?.toString() || '',
      hmlProcessingFee: (saved as any).hmlProcessingFee?.toString() || '',
      hmlAppraisalCost: (saved as any).hmlAppraisalCost?.toString() || '',
      hmlUnderwritingFee: (saved as any).hmlUnderwritingFee?.toString() || '',
      hmlOtherFees: (saved as any).hmlOtherFees?.toString() || '',
      hmlAnnualInsurance: (saved as any).hmlAnnualInsurance?.toString() || '',
      refiLenderName: (saved as any).refiLenderName?.toString() || '',
      refiLtvPercent: (saved as any).refiLtvPercent?.toString() || '',
      refiInterestRate: (saved as any).refiInterestRate?.toString() || '',
      refiAppraisalCost: (saved as any).refiAppraisalCost?.toString() || '',
      refiUnderwritingFee: (saved as any).refiUnderwritingFee?.toString() || '',
      refiPointsPercent: (saved as any).refiPointsPercent?.toString() || '',
      refiOtherFees: (saved as any).refiOtherFees?.toString() || '',
      refiClosingPercent: (saved as any).refiClosingPercent?.toString() || '',
      capexPercent: (saved as any).capexPercent?.toString() || '',
      lotSizeSqft: (saved as any).lotSizeSqft?.toString() || '',
      holdingOtherMonthly: (saved as any).holdingOtherMonthly?.toString() || '',
      rentalAppraisalCost: (saved as any).rentalAppraisalCost?.toString() || '',
      rentalUnderwritingFee: (saved as any).rentalUnderwritingFee?.toString() || '',
      rentalPointsPercent: (saved as any).rentalPointsPercent?.toString() || '',
      rentalOtherFees: (saved as any).rentalOtherFees?.toString() || '',
      rentalInterestOnly: (saved as any).rentalInterestOnly?.toString() || '',
      brrrrInterestOnly: (saved as any).brrrrInterestOnly?.toString() || '',
      inventoryMonths: (saved as any).inventoryMonths?.toString() || '',
    };
    setIsOverridesDirty(false);
    toast.success('Changes discarded');
  };

  // Reset ALL overrides to original API values and save to DB
  const handleResetAllOverrides = async () => {
    if (!deal) return;
    
    const emptyOverrides = {
      arv: '',
      rent: '',
      rehabCost: '',
      purchasePrice: '',
      downPaymentPercent: '',
      interestRate: '',
      loanTermYears: '',
      targetBedrooms: '',
      targetBathrooms: '',
      holdingMonths: '',
      propertyTaxMonthly: '',
      insuranceMonthly: '',
      rentalInsuranceMonthly: '',
      stateTaxMonthly: '',
      hoaMonthly: '',
      utilitiesMonthly: '',
      propertyManagementPercent: '',
      maintenanceVacancyPercent: '',
      closingCostsPercent: '',
      closingCostsDollar: '',
      contingencyPercent: '',
      agentCommissionPercent: '',
      notaryFees: '',
      cashNotaryFee: '',
      titleFees: '',
      hmlLoanType: 'ltc',
      brrrrPhase1Type: 'hml',
      hmlLtvPurchasePercent: '',
      hmlLtvRehabPercent: '',
      hmlPointsPercent: '',
      hmlInterestRate: '',
      hmlProcessingFee: '',
      hmlAppraisalCost: '',
      hmlUnderwritingFee: '',
      hmlOtherFees: '',
      hmlAnnualInsurance: '',
      refiLenderName: '',
      refiLtvPercent: '',
      refiInterestRate: '',
      refiAppraisalCost: '',
      refiUnderwritingFee: '',
      refiPointsPercent: '',
      refiOtherFees: '',
      refiClosingPercent: '',
      capexPercent: '',
      lotSizeSqft: '',
      holdingOtherMonthly: '',
      rentalAppraisalCost: '',
      rentalUnderwritingFee: '',
      rentalPointsPercent: '',
      rentalOtherFees: '',
      rentalInterestOnly: '',
      brrrrInterestOnly: '',
    };
    
    setLocalOverrides(emptyOverrides);
    
    // Also save to DB so the banner goes away
    try {
      const overridesToSave = {
        arv: null,
        rent: null,
        rehabCost: null,
        purchasePrice: null,
        downPaymentPercent: null,
        interestRate: null,
        loanTermYears: null,
        targetBedrooms: null,
        targetBathrooms: null,
        holdingMonths: null,
        propertyTaxMonthly: null,
        insuranceMonthly: null,
        stateTaxMonthly: null,
        hoaMonthly: null,
        utilitiesMonthly: null,
        propertyManagementPercent: null,
        maintenanceVacancyPercent: null,
        closingCostsPercent: null,
        closingCostsDollar: null,
        contingencyPercent: null,
        agentCommissionPercent: null,
        notaryFees: null,
        cashNotaryFee: null,
        titleFees: null,
        hmlLoanType: null,
        hmlLtvPurchasePercent: null,
        hmlLtvRehabPercent: null,
        hmlPointsPercent: null,
        hmlInterestRate: null,
        hmlProcessingFee: null,
        hmlAppraisalCost: null,
        hmlUnderwritingFee: null,
        hmlOtherFees: null,
        hmlAnnualInsurance: null,
        refiLtvPercent: null,
        refiClosingPercent: null,
        capexPercent: null,
      };
      await Promise.resolve((updateDealOverrides as any)(deal.id, overridesToSave));
      setIsOverridesDirty(false);
      toast.success('All overrides reset to API values');
    } catch (e) {
      console.error('Reset overrides error:', e);
      toast.error('Failed to reset overrides');
    }
  };

  const handleOverrideChange = (field: keyof typeof localOverrides, value: string) => {
    // Block changes if locked
    if (deal?.isLocked) {
      toast.error('Deal is locked. Unlock to make changes.');
      return;
    }
    // Boolean toggle fields - skip numeric sanitization
    const booleanFields = ['rentalInterestOnly', 'brrrrInterestOnly', 'hmlLoanType', 'brrrrPhase1Type'];
    if (booleanFields.includes(field)) {
      setLocalOverrides(prev => ({ ...prev, [field]: value }));
      setIsOverridesDirty(true);
      return;
    }
    // Allow decimals for all percentage fields and bathrooms
    const allowDecimal = field === 'downPaymentPercent' || field === 'interestRate' || field === 'targetBathrooms' 
      || field === 'hmlPointsPercent' || field === 'hmlInterestRate' || field === 'hmlLtvPurchasePercent' || field === 'hmlLtvRehabPercent'
      || field === 'refiLtvPercent' || field === 'refiClosingPercent' || field === 'refiPointsPercent'
      || field === 'rentalPointsPercent'
      || field === 'propertyManagementPercent' || field === 'maintenanceVacancyPercent' || field === 'closingCostsPercent'
      || field === 'contingencyPercent' || field === 'agentCommissionPercent' || field === 'capexPercent';
    const sanitized = sanitizeNumericInput(value, { allowDecimal });
    setLocalOverrides(prev => ({ ...prev, [field]: sanitized }));
    setIsOverridesDirty(true);
    // If user types a new value after resetting, remove from explicitlyResetFields
    if (sanitized !== '' && explicitlyResetFields.has(field)) {
      setExplicitlyResetFields(prev => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
    }
  };

  const handleSaveOverrides = async () => {
    if (!deal) return;
    if (deal.isLocked) {
      toast.error('Deal is locked. Unlock to make changes.');
      return;
    }
    setIsSavingOverrides(true);
    try {
      // Helper to check if a value differs from the default
      // Only save as override if it's different from settings default
      const getOverrideIfDifferent = (
        localValue: string,
        defaultValue: number | undefined,
        existingOverride: number | null | undefined,
        fieldName?: string
      ): number | null => {
        const numValue = toNumberOrNull(localValue);
        
        // If field was explicitly reset by user, clear the override
        if (fieldName && explicitlyResetFields.has(fieldName)) {
          return null;
        }
        
        // If there's no local value (empty string), keep existing override or null
        if (localValue === '' || localValue === undefined) {
          return existingOverride ?? null;
        }
        
        // If value matches the default AND there was no existing override, skip saving
        // But if there WAS an existing override, preserve it to prevent reverting
        if (numValue !== null && defaultValue !== undefined && numValue === defaultValue) {
          if (existingOverride === null || existingOverride === undefined) {
            return null; // No existing override, matches default - skip
          }
          // Existing override exists - preserve it even if it matches current default
          return numValue;
        }
        
        // Value is different from default, save it as override
        return numValue;
      };

      // Build overrides object - only include values that differ from defaults
      const overridesToSave = {
        // Core property values - these don't have defaults in settings
        arv: explicitlyResetFields.has('arv') ? null : toNumberOrNull(localOverrides.arv),
        rent: explicitlyResetFields.has('rent') ? null : toNumberOrNull(localOverrides.rent),
        rehabCost: explicitlyResetFields.has('rehabCost') ? null : toNumberOrNull(localOverrides.rehabCost),
        purchasePrice: explicitlyResetFields.has('purchasePrice') ? null : toNumberOrNull(localOverrides.purchasePrice),
        targetBedrooms: explicitlyResetFields.has('targetBedrooms') ? null : toNumberOrNull(localOverrides.targetBedrooms),
        targetBathrooms: explicitlyResetFields.has('targetBathrooms') ? null : toNumberOrNull(localOverrides.targetBathrooms),
        
        // Monthly costs - no defaults in settings
        propertyTaxMonthly: explicitlyResetFields.has('propertyTaxMonthly') ? null : toNumberOrNull(localOverrides.propertyTaxMonthly),
        insuranceMonthly: explicitlyResetFields.has('insuranceMonthly') ? null : toNumberOrNull(localOverrides.insuranceMonthly),
        stateTaxMonthly: explicitlyResetFields.has('stateTaxMonthly') ? null : toNumberOrNull(localOverrides.stateTaxMonthly),
        hoaMonthly: explicitlyResetFields.has('hoaMonthly') ? null : toNumberOrNull(localOverrides.hoaMonthly),
        utilitiesMonthly: explicitlyResetFields.has('utilitiesMonthly') ? null : toNumberOrNull(localOverrides.utilitiesMonthly),
        notaryFees: explicitlyResetFields.has('notaryFees') ? null : toNumberOrNull(localOverrides.notaryFees),
        cashNotaryFee: explicitlyResetFields.has('cashNotaryFee') ? null : toNumberOrNull(localOverrides.cashNotaryFee),
        titleFees: explicitlyResetFields.has('titleFees') ? null : toNumberOrNull(localOverrides.titleFees),
        closingCostsDollar: explicitlyResetFields.has('closingCostsDollar') ? null : toNumberOrNull(localOverrides.closingCostsDollar),
        
        // Loan parameters - compare with settings defaults
        downPaymentPercent: getOverrideIfDifferent(localOverrides.downPaymentPercent, loanDefaults.downPaymentPercent, deal.overrides.downPaymentPercent, 'downPaymentPercent'),
        interestRate: getOverrideIfDifferent(localOverrides.interestRate, loanDefaults.interestRate, deal.overrides.interestRate, 'interestRate'),
        loanTermYears: getOverrideIfDifferent(localOverrides.loanTermYears, loanDefaults.loanTermYears, deal.overrides.loanTermYears, 'loanTermYears'),
        
        // Flip parameters
        holdingMonths: getOverrideIfDifferent(localOverrides.holdingMonths, loanDefaults.holdingMonths, deal.overrides.holdingMonths, 'holdingMonths'),
        closingCostsPercent: getOverrideIfDifferent(localOverrides.closingCostsPercent, loanDefaults.closingCostsPercent, deal.overrides.closingCostsPercent, 'closingCostsPercent'),
        contingencyPercent: getOverrideIfDifferent(localOverrides.contingencyPercent, loanDefaults.contingencyPercent, deal.overrides.contingencyPercent, 'contingencyPercent'),
        agentCommissionPercent: getOverrideIfDifferent(localOverrides.agentCommissionPercent, loanDefaults.agentCommissionPercent, deal.overrides.agentCommissionPercent, 'agentCommissionPercent'),
        
        // HML parameters
        hmlLoanType: localOverrides.hmlLoanType !== 'ltc' ? localOverrides.hmlLoanType : null,
        brrrrPhase1Type: localOverrides.brrrrPhase1Type !== 'hml' ? localOverrides.brrrrPhase1Type : null,
        hmlLtvPurchasePercent: getOverrideIfDifferent(localOverrides.hmlLtvPurchasePercent, loanDefaults.hmlLtvPurchasePercent, deal.overrides.hmlLtvPurchasePercent, 'hmlLtvPurchasePercent'),
        hmlLtvRehabPercent: getOverrideIfDifferent(localOverrides.hmlLtvRehabPercent, loanDefaults.hmlLtvRehabPercent, deal.overrides.hmlLtvRehabPercent, 'hmlLtvRehabPercent'),
        hmlPointsPercent: getOverrideIfDifferent(localOverrides.hmlPointsPercent, loanDefaults.hmlPointsPercent, deal.overrides.hmlPointsPercent, 'hmlPointsPercent'),
        hmlInterestRate: getOverrideIfDifferent(localOverrides.hmlInterestRate, loanDefaults.hmlInterestRate, deal.overrides.hmlInterestRate, 'hmlInterestRate'),
        hmlProcessingFee: getOverrideIfDifferent(localOverrides.hmlProcessingFee, loanDefaults.hmlProcessingFee, deal.overrides.hmlProcessingFee, 'hmlProcessingFee'),
        hmlAppraisalCost: localOverrides.hmlAppraisalCost ? parseFloat(localOverrides.hmlAppraisalCost) : null,
        hmlUnderwritingFee: localOverrides.hmlUnderwritingFee ? parseFloat(localOverrides.hmlUnderwritingFee) : null,
        hmlOtherFees: localOverrides.hmlOtherFees ? parseFloat(localOverrides.hmlOtherFees) : null,
        hmlAnnualInsurance: localOverrides.hmlAnnualInsurance ? parseFloat(localOverrides.hmlAnnualInsurance) : null,
        
        // BRRRR/Refi parameters
        refiLtvPercent: getOverrideIfDifferent(localOverrides.refiLtvPercent, loanDefaults.refiLtvPercent, deal.overrides.refiLtvPercent, 'refiLtvPercent'),
        refiClosingPercent: getOverrideIfDifferent(localOverrides.refiClosingPercent, loanDefaults.refiClosingPercent, deal.overrides.refiClosingPercent, 'refiClosingPercent'),
        
        // Rental parameters
        propertyManagementPercent: getOverrideIfDifferent(localOverrides.propertyManagementPercent, loanDefaults.propertyManagementPercent, deal.overrides.propertyManagementPercent, 'propertyManagementPercent'),
        maintenanceVacancyPercent: getOverrideIfDifferent(localOverrides.maintenanceVacancyPercent, loanDefaults.maintenanceVacancyPercent, deal.overrides.maintenanceVacancyPercent, 'maintenanceVacancyPercent'),
        capexPercent: getOverrideIfDifferent(localOverrides.capexPercent, loanDefaults.capexPercent, deal.overrides.capexPercent, 'capexPercent'),
        
        // Rental-specific overrides
        rentalInsuranceMonthly: explicitlyResetFields.has('rentalInsuranceMonthly') ? null : toNumberOrNull(localOverrides.rentalInsuranceMonthly),
        rentalAppraisalCost: explicitlyResetFields.has('rentalAppraisalCost') ? null : toNumberOrNull(localOverrides.rentalAppraisalCost),
        rentalUnderwritingFee: explicitlyResetFields.has('rentalUnderwritingFee') ? null : toNumberOrNull(localOverrides.rentalUnderwritingFee),
        rentalPointsPercent: explicitlyResetFields.has('rentalPointsPercent') ? null : toNumberOrNull(localOverrides.rentalPointsPercent),
        rentalOtherFees: explicitlyResetFields.has('rentalOtherFees') ? null : toNumberOrNull(localOverrides.rentalOtherFees),
        
        // Boolean toggle fields
        rentalInterestOnly: localOverrides.rentalInterestOnly === 'true' ? true : null,
        brrrrInterestOnly: localOverrides.brrrrInterestOnly === 'true' ? true : null,
        
        // Other overrides
        lotSizeSqft: explicitlyResetFields.has('lotSizeSqft') ? null : toNumberOrNull(localOverrides.lotSizeSqft),
        holdingOtherMonthly: explicitlyResetFields.has('holdingOtherMonthly') ? null : toNumberOrNull(localOverrides.holdingOtherMonthly),
        
        // Refi detail overrides
        refiLenderName: localOverrides.refiLenderName || null,
        refiInterestRate: explicitlyResetFields.has('refiInterestRate') ? null : toNumberOrNull(localOverrides.refiInterestRate),
        refiAppraisalCost: explicitlyResetFields.has('refiAppraisalCost') ? null : toNumberOrNull(localOverrides.refiAppraisalCost),
        refiUnderwritingFee: explicitlyResetFields.has('refiUnderwritingFee') ? null : toNumberOrNull(localOverrides.refiUnderwritingFee),
        refiPointsPercent: explicitlyResetFields.has('refiPointsPercent') ? null : toNumberOrNull(localOverrides.refiPointsPercent),
        refiOtherFees: explicitlyResetFields.has('refiOtherFees') ? null : toNumberOrNull(localOverrides.refiOtherFees),
      };

      
      await Promise.resolve((updateDealOverrides as any)(deal.id, overridesToSave));
      toast.success('Overrides saved');
      baselineOverridesRef.current = { ...localOverrides };
      
      setIsOverridesDirty(false);
      setExplicitlyResetFields(new Set());
    } catch (e) {
      console.error('Save overrides error:', e);
      toast.error('Failed to save overrides');
    } finally {
      setIsSavingOverrides(false);
    }
  };

  const handleToggleLock = async () => {
    if (!deal) return;
    await toggleDealLock(deal.id);
    toast.success(deal.isLocked ? 'Deal unlocked' : 'Deal locked');
  };

  const handleDeleteDeal = async () => {
    if (!deal) return;
    await deleteDeal(deal.id);
    toast.success('Deal deleted permanently');
    navigate(-1);
  };

  const openSmsDialog = (phone: string) => {
    if (!deal) return;
    const agentName = deal.apiData.agentName || deal.senderName || '';
    const price = deal.overrides.purchasePrice ?? deal.apiData.purchasePrice ?? null;
    const priceStr = price ? `$${Math.round(price).toLocaleString()}` : '[PRICE]';
    const defaultMsg = `Hi${agentName ? ` ${agentName.split(' ')[0]}` : ''}, I'm interested in ${deal.address.street}. I'd like to make a cash offer of ${priceStr}. Can we discuss? Thank you`;
    setSmsPhone(phone);
    setSmsBody(defaultMsg);
    setIsSmsDialogOpen(true);
  };

  const handleSendSms = async () => {
    try {
      await sendSms(smsPhone, smsBody);
      toast.success('SMS sent successfully');
      setSmsBody('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send SMS');
    }
  };

  const handleStatusChange = (status: DealStatus) => {
    if (status === 'not_relevant') {
      updateDealStatus(deal.id, status, rejectionReason || 'Not specified');
    } else {
      updateDealStatus(deal.id, status);
    }
    toast.success(`Status updated to ${DEAL_STATUS_CONFIG[status].label}`);
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setIsNotesDirty(true);
    updateDealNotes(deal.id, value);
  };

  const handleAddNote = () => {
    if (!newNoteText.trim()) return;
    const updatedNotes = [...parsedNotes, newNoteText.trim()];
    const notesJson = JSON.stringify(updatedNotes);
    setNotes(notesJson);
    updateDealNotes(deal.id, notesJson);
    setNewNoteText('');
    toast.success('Note added');
  };

  const handleDeleteNote = (index: number) => {
    const updatedNotes = parsedNotes.filter((_, i) => i !== index);
    const notesJson = updatedNotes.length > 0 ? JSON.stringify(updatedNotes) : '';
    setNotes(notesJson);
    updateDealNotes(deal.id, notesJson);
    toast.success('Note deleted');
  };

  const handleNotesBlur = () => {
    // Reset dirty state after user leaves the field
    setTimeout(() => setIsNotesDirty(false), 500);
  };
  

  // Check if any overrides are active
  const hasOverrides = Object.values(localOverrides).some(v => v !== '');

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-6 animate-fade-in pb-24">
      {/* Reset All Confirmation Dialog */}
      <Dialog open={isResetAllDialogOpen} onOpenChange={setIsResetAllDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Reset All Overrides?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will reset <strong>ALL</strong> your customizations back to the original API values, including:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>ARV, Rehab Cost, Rent overrides</li>
              <li>Purchase Price adjustments</li>
              <li>Layout changes (Target Beds/Baths)</li>
              <li>Holding cost modifications</li>
              <li>Loan terms (Down Payment, Interest Rate)</li>
              <li>All other custom values</li>
            </ul>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
              <p className="text-xs text-destructive">
                This action cannot be undone. All your analysis adjustments will be lost.
              </p>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsResetAllDialogOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleResetAllOverrides();
                setIsResetAllDialogOpen(false);
              }}
              className="flex-1"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset All
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Save Banner - Always visible when there are unsaved changes */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-500/95 backdrop-blur-sm border-t border-amber-600 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Save className="w-5 h-5 text-black" />
              <div>
                <p className="text-sm font-semibold text-black">You have unsaved changes</p>
                <p className="text-xs text-black/70">Save now to keep your modifications for next time</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Discard current unsaved changes only */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscardChanges}
                className="text-xs h-8 px-3 bg-transparent border-black/30 text-black hover:bg-black/10"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Discard
              </Button>
              {/* Reset ALL overrides to original API values */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsResetAllDialogOpen(true)}
                className="text-xs h-8 px-3 bg-red-600/90 border-red-700 text-white hover:bg-red-700"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Reset All to Original
              </Button>
              <Button
                size="sm"
                onClick={handleSaveOverrides}
                disabled={isSavingOverrides}
                className="text-xs h-8 px-4 bg-black text-amber-500 hover:bg-black/80 font-semibold"
              >
                {isSavingOverrides ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Save className="w-3 h-3 mr-1" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Not Relevant Banner - Show restore option */}
      {deal.status === 'not_relevant' && (
        <div className="bg-muted/50 border border-border rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <XCircle className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">This deal was marked as Not Relevant</p>
              <p className="text-sm text-muted-foreground">
                {deal.rejectionReason || 'No reason specified'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              const targetStatus = isDealAnalyzed(deal) ? 'under_analysis' : 'new';
              updateDealStatus(deal.id, targetStatus);
              toast.success(isDealAnalyzed(deal) 
                ? 'Deal restored to Analyzed' 
                : 'Deal restored to New Deals'
              );
            }}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Restore Deal
          </Button>
        </div>
      )}

      {/* Analysis result banner */}
      {analysisState?.analysisResult && !bannerDismissed && (
        <div className={cn(
          "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
          analysisState.analysisResult === 'new'
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
        )}>
          <div className="flex items-center gap-2">
            {analysisState.analysisResult === 'new' ? (
              <>
                <span className="font-semibold">✅ New analysis complete</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">API call was charged</span>
                {analysisState.analyzedAt && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      {new Date(analysisState.analyzedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="font-semibold">♻️ Already analyzed</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">No API call was made — showing existing record</span>
                {analysisState.analyzedAt && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      Originally analyzed {new Date(analysisState.analyzedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
            onClick={() => setBannerDismissed(true)}>
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* From Email banner — shows when deal was imported from an email */}
      {deal.source === 'email' && !bannerDismissed && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-sm mb-3">
          <Mail className="w-4 h-4 text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-blue-400">From Email · </span>
            <span className="text-muted-foreground">
              {deal.senderName && `${deal.senderName} `}
              {deal.senderEmail && <span className="font-mono text-xs">{deal.senderEmail}</span>}
              {deal.emailSubject && <> · <em>&ldquo;{deal.emailSubject}&rdquo;</em></>}
            </span>
          </div>
          {/* Photo links */}
          {Array.isArray((deal.emailExtractedData as any)?.photoLinks) &&
            (deal.emailExtractedData as any).photoLinks.slice(0, 3).map((url: string, i: number) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:text-blue-300">
                📷 Photos{i > 0 ? ` ${i + 1}` : ''}
              </a>
            ))
          }
          {/* Document links */}
          {Array.isArray((deal.emailExtractedData as any)?.documentLinks) &&
            (deal.emailExtractedData as any).documentLinks.slice(0, 4).map((dl: any, i: number) => (
              <a key={i} href={dl.url} target="_blank" rel="noopener noreferrer"
                className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:text-indigo-300">
                {dl.label}
              </a>
            ))
          }
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setBannerDismissed(true)}>✕</Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
          </Button>
          
          {/* Property Thumbnail - Clickable for full size */}
          {(() => {
            const directImageExt = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;
            const emailImageLinks: string[] = Array.isArray((deal.emailExtractedData as any)?.imageLinks)
              ? (deal.emailExtractedData as any).imageLinks
              : [];
            const thumbSrc = apiData.imgSrc || emailImageLinks.find(u => directImageExt.test(u)) || null;
            if (!thumbSrc) return null;
            return (
              <Dialog>
                <DialogTrigger asChild>
                  <img
                    src={thumbSrc}
                    alt={deal.address.street}
                    className="w-20 h-14 object-cover rounded-lg border border-border cursor-pointer hover:opacity-80 transition-opacity hidden sm:block"
                  />
                </DialogTrigger>
                <DialogContent className="max-w-4xl p-2">
                  <img
                    src={thumbSrc}
                    alt={deal.address.street}
                    className="w-full h-auto rounded-lg"
                  />
                </DialogContent>
              </Dialog>
            );
          })()}
          
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold">{deal.address.street}</h1>
              <DealStatusBadge status={deal.status} />
              {apiData.grade && (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn(
                        "cursor-pointer text-xs font-semibold",
                        apiData.grade === 'A' && "border-emerald-500 text-emerald-500",
                        apiData.grade === 'B' && "border-green-500 text-green-500",
                        apiData.grade === 'C' && "border-yellow-500 text-yellow-500",
                        apiData.grade === 'D' && "border-orange-500 text-orange-500",
                        apiData.grade === 'F' && "border-red-500 text-red-500"
                      )}
                    >
                      <Zap className="w-3 h-3 mr-1" />
                      Grade: {apiData.grade}
                    </Badge>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72" side="bottom" align="start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        <span className="font-semibold">AI Grade</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        This grade was calculated by the AI analysis engine based on:
                      </p>
                      <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Sale comps comparison</li>
                        <li>Rent comps analysis</li>
                        <li>ARV and rehab estimates</li>
                        <li>Cash flow projections</li>
                        <li>Market conditions</li>
                      </ul>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              )}
              {/* Investment Decision Score badge */}
              {headerInvestmentScore ? (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn(
                        "cursor-pointer text-xs font-semibold",
                        headerInvestmentScore.decision === 'Buy'
                          ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                          : headerInvestmentScore.finalScore >= 5
                            ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                            : "border-red-500 text-red-400 bg-red-500/10"
                      )}
                    >
                      <BarChart3 className="w-3 h-3 mr-1" />
                      Score: {headerInvestmentScore.finalScore.toFixed(1)}/10
                      <span className="ml-1.5 font-bold">
                        {headerInvestmentScore.decision === 'Buy' ? '✓' : '✗'}
                      </span>
                    </Badge>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-64" side="bottom" align="start">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Investment Score</span>
                        <span className={cn(
                          "text-sm font-bold",
                          headerInvestmentScore.decision === 'Buy' ? "text-emerald-400" : "text-red-400"
                        )}>
                          {headerInvestmentScore.decision === 'Buy' ? '✓ Buy' : '✗ Pass'}
                        </span>
                      </div>
                      {headerInvestmentScore.isFullBrrrr && (
                        <div className="px-2 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium text-center">
                          🎉 Full BRRRR — ∞ Return on Cash!
                        </div>
                      )}
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cash Flow</span>
                          <span className={cn("font-medium", headerInvestmentScore.cashFlowScore >= 7 ? "text-emerald-400" : headerInvestmentScore.cashFlowScore >= 5 ? "text-yellow-400" : "text-red-400")}>
                            {headerInvestmentScore.isFullBrrrr ? '∞ ' : ''}{headerInvestmentScore.cashFlowScore.toFixed(1)}/10
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Equity</span>
                          <span className={cn("font-medium", headerInvestmentScore.equityScore >= 7 ? "text-emerald-400" : headerInvestmentScore.equityScore >= 5 ? "text-yellow-400" : "text-red-400")}>
                            {headerInvestmentScore.equityScore.toFixed(1)}/10
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Location</span>
                          <span className={cn("font-medium", headerInvestmentScore.locationScore >= 7 ? "text-emerald-400" : headerInvestmentScore.locationScore >= 5 ? "text-yellow-400" : "text-red-400")}>
                            {headerInvestmentScore.locationScore.toFixed(1)}/10
                          </span>
                        </div>
                      </div>
                      {headerInvestmentScore.missingFields.length > 0 && (
                        <p className="text-xs text-orange-400">
                          ⚠ Partial: {headerInvestmentScore.missingFields.join(', ')} missing
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground pt-1 border-t border-border">
                        Configure weights in Settings
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              ) : liveFinancials && (
                <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">
                  <BarChart3 className="w-3 h-3 mr-1" />
                  Score: N/A
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {deal.address.city}, {deal.address.state} {deal.address.zip}
              {apiData.county && <span className="ml-2">• {apiData.county} County</span>}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Analyze / Re-analyze Button */}
          {!isDealAnalyzed(deal) ? (
            <Button
              onClick={handleAnalyze}
              disabled={isRefreshing}
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Analyze Deal
                </>
              )}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={handleAnalyze}
                  disabled={isRefreshing}
                  className="border-primary/50 text-primary hover:bg-primary/10"
                >
                  {isRefreshing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Re-analyze
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh analysis data</TooltipContent>
            </Tooltip>
          )}
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={deal.isLocked ? "default" : "outline"}
                size="icon"
                onClick={handleToggleLock}
                className={cn(
                  deal.isLocked
                    ? "bg-amber-500 hover:bg-amber-600 text-black"
                    : "border-muted-foreground/30"
                )}
              >
                {deal.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {deal.isLocked ? 'Unlock deal to allow edits' : 'Lock deal to prevent changes'}
            </TooltipContent>
          </Tooltip>

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Delete deal permanently</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Deal Permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{deal.address.street || 'this deal'}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDeleteDeal}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* SMS Conversation Dialog */}
          <Dialog open={isSmsDialogOpen} onOpenChange={setIsSmsDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  SMS — {deal?.address.street}
                </DialogTitle>
                <DialogDescription>
                  Send and receive text messages with the agent/seller
                </DialogDescription>
              </DialogHeader>

              {/* Message History */}
              {smsMessages.length > 0 && (
                <div className="border rounded-lg p-3 max-h-52 overflow-y-auto space-y-2 bg-muted/20">
                  {smsMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={cn('flex flex-col max-w-[85%] gap-0.5', msg.direction === 'outbound' ? 'ml-auto items-end' : 'items-start')}
                    >
                      <div className={cn(
                        'rounded-2xl px-3 py-2 text-sm',
                        msg.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-muted text-foreground rounded-bl-sm'
                      )}>
                        {msg.body}
                      </div>
                      <span className="text-[10px] text-muted-foreground px-1">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.direction === 'outbound' && ` · ${msg.status}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Compose */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">To (phone number)</Label>
                  <Input
                    value={smsPhone}
                    onChange={e => setSmsPhone(e.target.value)}
                    placeholder="+14045551234"
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Message</Label>
                  <Textarea
                    value={smsBody}
                    onChange={e => setSmsBody(e.target.value)}
                    rows={4}
                    placeholder="Type your message..."
                    className="text-sm resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">{smsBody.length} chars</p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsSmsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSendSms} disabled={smsSending || !smsPhone.trim() || !smsBody.trim()}>
                  {smsSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Send SMS
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isExportSummaryDialogOpen} onOpenChange={setIsExportSummaryDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                disabled={!liveFinancials}
                className="border-primary/50 text-primary hover:bg-primary/10"
              >
                <FileDown className="w-4 h-4 mr-2" />
                Export Summary
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
              {(() => {
                // Calculate values inside the dialog scope
                const purchasePrice = localOverrides.purchasePrice ? parseFloat(localOverrides.purchasePrice) : (apiData.purchasePrice ?? 0);
                const baseArv = localOverrides.arv ? parseFloat(localOverrides.arv) : (apiData.arv ?? 0);
                const baseRehabCost = localOverrides.rehabCost ? parseFloat(localOverrides.rehabCost) : (apiData.rehabCost ?? 0);
                const baseRent = localOverrides.rent ? parseFloat(localOverrides.rent) : (apiData.rent ?? 0);
                
                // Layout adjustments
                const currentBedrooms = apiData.bedrooms ?? 0;
                const currentBathrooms = apiData.bathrooms ?? 0;
                const targetBedrooms = localOverrides.targetBedrooms ? parseFloat(localOverrides.targetBedrooms) : currentBedrooms;
                const targetBathrooms = localOverrides.targetBathrooms ? parseFloat(localOverrides.targetBathrooms) : currentBathrooms;
                const bedroomsAdded = Math.max(0, targetBedrooms - currentBedrooms);
                const bathroomsAdded = Math.max(0, targetBathrooms - currentBathrooms);
                const layoutRehabCost = (bedroomsAdded * 20000) + (bathroomsAdded * 15000);
                const layoutArvIncrease = (bedroomsAdded * 30000) + (bathroomsAdded * 20000);
                
                const arv = baseArv + layoutArvIncrease;
                const rehabCost = baseRehabCost + layoutRehabCost;
                const rent = liveFinancials?.monthlyGrossRent ?? baseRent;
                
                // Calculate flip metrics
                const closingPercent = localOverrides.closingCostsPercent 
                  ? parseFloat(localOverrides.closingCostsPercent) / 100 
                  : loanDefaults.flipClosingCostsPercent / 100;
                const contingencyPercent = localOverrides.contingencyPercent 
                  ? parseFloat(localOverrides.contingencyPercent) / 100 
                  : loanDefaults.contingencyPercent / 100;
                const agentPercent = localOverrides.agentCommissionPercent 
                  ? parseFloat(localOverrides.agentCommissionPercent) / 100 
                  : loanDefaults.agentCommissionPercent / 100;
                const rehabMonths = localOverrides.holdingMonths 
                  ? parseInt(localOverrides.holdingMonths) 
                  : loanDefaults.holdingMonths;
                
                const closingCostsBuy = localOverrides.closingCostsDollar 
                  ? parseFloat(localOverrides.closingCostsDollar)
                  : purchasePrice * closingPercent;
                const rehabContingency = rehabCost * contingencyPercent;
                
                // Holding costs
                const propertyTaxMonthly = localOverrides.propertyTaxMonthly 
                  ? parseFloat(localOverrides.propertyTaxMonthly) 
                  : (apiData.propertyTax ?? 0) / 12;
                const insuranceMonthly = localOverrides.insuranceMonthly 
                  ? parseFloat(localOverrides.insuranceMonthly) 
                  : getEffectiveMonthlyInsurance(apiData.insurance);
                const utilitiesMonthly = localOverrides.utilitiesMonthly 
                  ? parseFloat(localOverrides.utilitiesMonthly) 
                  : 300;
                const monthlyHoldingCost = propertyTaxMonthly + insuranceMonthly + utilitiesMonthly;
                const totalHoldingCosts = monthlyHoldingCost * rehabMonths;
                
                const flipTotalInvestment = purchasePrice + closingCostsBuy + rehabCost + rehabContingency + totalHoldingCosts;
                const agentCommission = arv * agentPercent;
                const flipNetProfit = arv - flipTotalInvestment - agentCommission - 1000;
                const flipROI = flipTotalInvestment > 0 ? (flipNetProfit / flipTotalInvestment) : 0;
                
                // BRRRR metrics
                const hmlLtvPurchase = (localOverrides.hmlLtvPurchasePercent ? parseFloat(localOverrides.hmlLtvPurchasePercent) : loanDefaults.hmlLtvPurchasePercent) / 100;
                const hmlLtvRehab = (localOverrides.hmlLtvRehabPercent ? parseFloat(localOverrides.hmlLtvRehabPercent) : loanDefaults.hmlLtvRehabPercent) / 100;
                const hmlPointsPercent = (localOverrides.hmlPointsPercent ? parseFloat(localOverrides.hmlPointsPercent) : loanDefaults.hmlPointsPercent) / 100;
                const hmlInterestRate = (localOverrides.hmlInterestRate ? parseFloat(localOverrides.hmlInterestRate) : loanDefaults.hmlInterestRate) / 100;
                const hmlProcessingFee = localOverrides.hmlProcessingFee ? parseFloat(localOverrides.hmlProcessingFee) : loanDefaults.hmlProcessingFee;
                const refiLtv = (localOverrides.refiLtvPercent ? parseFloat(localOverrides.refiLtvPercent) : loanDefaults.refiLtvPercent) / 100;
                
                const bestHmlIsLtv = localOverrides.hmlLoanType === 'ltv';
                const hmlLoanPurchase = bestHmlIsLtv ? arv * hmlLtvPurchase : purchasePrice * hmlLtvPurchase;
                const bestHmlDefaultRehabLtv = bestHmlIsLtv ? 0 : loanDefaults.hmlLtvRehabPercent / 100;
                const bestHmlEffectiveRehabLtv = localOverrides.hmlLtvRehabPercent ? hmlLtvRehab : bestHmlDefaultRehabLtv;
                const hmlLoanRehab = rehabCost * bestHmlEffectiveRehabLtv;
                const hmlTotalLoan = hmlLoanPurchase + hmlLoanRehab;
                const hmlPoints = hmlTotalLoan * hmlPointsPercent;
                const hmlInterest = hmlTotalLoan * (hmlInterestRate / 12) * rehabMonths;
                const brrrrTotalCashIn = (purchasePrice - hmlLoanPurchase) + (rehabCost - hmlLoanRehab) + closingCostsBuy + hmlPoints + hmlProcessingFee + hmlInterest + totalHoldingCosts;
                
                const refiLoanAmount = arv * refiLtv;
                const refiClosingCosts = refiLoanAmount * 0.02;
                const cashOut = refiLoanAmount - hmlTotalLoan - refiClosingCosts;
                const brrrrCashLeftInDeal = brrrrTotalCashIn - Math.max(0, cashOut);
                const brrrrEquityCaptured = arv - refiLoanAmount;
                
                // BRRRR monthly cashflow
                const refiTermMonths2 = (localOverrides.loanTermYears ? parseFloat(localOverrides.loanTermYears) : loanDefaults.loanTermYears) * 12;
                const brrrrMonthlyMortgage = refiLoanAmount > 0
                  ? refiLoanAmount * ((loanDefaults.rentalInterestRate / 100 / 12) * Math.pow(1 + (loanDefaults.rentalInterestRate / 100 / 12), refiTermMonths2)) / (Math.pow(1 + (loanDefaults.rentalInterestRate / 100 / 12), refiTermMonths2) - 1)
                  : 0;
                const brrrrMonthlyCashflow = rent - (liveFinancials?.monthlyExpenses ?? 0) - brrrrMonthlyMortgage;

                return (
                  <>
                    <DialogHeader className="p-6 pb-4 border-b bg-gradient-to-r from-primary/10 to-transparent">
                      <DialogTitle className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/20">
                          <Home className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold">Deal Analysis Summary</h2>
                          <p className="text-sm text-muted-foreground font-normal">{deal?.address.full}</p>
                        </div>
                      </DialogTitle>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-auto p-6 space-y-6">
                      {/* Property Overview */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: 'Beds', value: apiData.bedrooms || '-', icon: <Home className="w-3.5 h-3.5" /> },
                          { label: 'Baths', value: apiData.bathrooms || '-', icon: <Home className="w-3.5 h-3.5" /> },
                          { label: 'Sqft', value: apiData.sqft?.toLocaleString() || '-', icon: <Building2 className="w-3.5 h-3.5" /> },
                          { label: 'Year Built', value: apiData.yearBuilt || '-', icon: <Calendar className="w-3.5 h-3.5" /> },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                            <div className="text-muted-foreground">{item.icon}</div>
                            <div>
                              <div className="text-xs text-muted-foreground">{item.label}</div>
                              <div className="font-semibold">{item.value}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Key Financials */}
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-primary" />
                          Key Financials
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Purchase Price', value: formatCurrency(purchasePrice), color: 'text-foreground' },
                            { label: 'ARV', value: formatCurrency(arv), color: 'text-emerald-400' },
                            { label: 'Rehab Cost', value: formatCurrency(rehabCost), color: 'text-orange-400' },
                            { label: 'Monthly Rent', value: formatCurrency(rent), color: 'text-cyan-400' },
                          ].map((item) => (
                            <div key={item.label} className="flex justify-between items-center p-3 rounded-lg border bg-card">
                              <span className="text-sm text-muted-foreground">{item.label}</span>
                              <span className={cn("font-semibold", item.color)}>{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Strategy Analysis Cards */}
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Calculator className="w-4 h-4 text-primary" />
                          Investment Strategies
                        </h3>
                        
                        {/* Flip Strategy */}
                        <div className="p-4 rounded-lg border border-orange-500/30 bg-orange-500/5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-orange-400" />
                              <span className="font-semibold text-orange-400">Flip Strategy</span>
                            </div>
                            <Badge variant="outline" className={cn(
                              "text-xs",
                              flipNetProfit > 0 ? "border-emerald-500/50 text-emerald-400" : "border-red-500/50 text-red-400"
                            )}>
                              {flipNetProfit > 0 ? 'Profitable' : 'Not Profitable'}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="text-center p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">Net Profit</div>
                              <div className={cn("font-bold", flipNetProfit >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {formatCurrency(flipNetProfit)}
                              </div>
                            </div>
                            <div className="text-center p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">ROI</div>
                              <div className={cn("font-bold", flipROI >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {formatPercent(flipROI)}
                              </div>
                            </div>
                            <div className="text-center p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">Total Investment</div>
                              <div className="font-bold text-foreground">
                                {formatCurrency(flipTotalInvestment)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Rental Strategy */}
                        <div className="p-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Home className="w-4 h-4 text-cyan-400" />
                              <span className="font-semibold text-cyan-400">Rental Strategy</span>
                            </div>
                            <Badge variant="outline" className={cn(
                              "text-xs",
                              (liveFinancials?.monthlyCashflow ?? 0) > 0 ? "border-emerald-500/50 text-emerald-400" : "border-red-500/50 text-red-400"
                            )}>
                              {(liveFinancials?.monthlyCashflow ?? 0) > 0 ? 'Cash Flow Positive' : 'Negative Cash Flow'}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="text-center p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">Monthly Cash Flow</div>
                              <div className={cn("font-bold", (liveFinancials?.monthlyCashflow ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {formatCurrency(liveFinancials?.monthlyCashflow ?? 0)}
                              </div>
                            </div>
                            <div className="text-center p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">Cash-on-Cash</div>
                              <div className={cn("font-bold", (liveFinancials?.cashOnCashReturn ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {formatPercent(liveFinancials?.cashOnCashReturn ?? 0)}
                              </div>
                            </div>
                            <div className="text-center p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">Cap Rate</div>
                              <div className="font-bold text-foreground">
                                {formatPercent(liveFinancials?.capRate ?? 0)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* BRRRR Strategy */}
                        <div className="p-4 rounded-lg border border-purple-500/30 bg-purple-500/5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <RotateCcw className="w-4 h-4 text-purple-400" />
                              <span className="font-semibold text-purple-400">BRRRR Strategy</span>
                            </div>
                            <Badge variant="outline" className={cn(
                              "text-xs",
                              brrrrCashLeftInDeal <= 10000 ? "border-emerald-500/50 text-emerald-400" : "border-amber-500/50 text-amber-400"
                            )}>
                              {brrrrCashLeftInDeal <= 10000 ? 'Cash Recovered' : 'Capital Left In'}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="text-center p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">Equity Captured</div>
                              <div className={cn("font-bold", brrrrEquityCaptured >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {formatCurrency(brrrrEquityCaptured)}
                              </div>
                            </div>
                            <div className="text-center p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">Cash Left In Deal</div>
                              <div className={cn("font-bold", brrrrCashLeftInDeal <= 10000 ? "text-emerald-400" : "text-amber-400")}>
                                {formatCurrency(brrrrCashLeftInDeal)}
                              </div>
                            </div>
                            <div className="text-center p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">Monthly Cash Flow</div>
                              <div className={cn("font-bold", brrrrMonthlyCashflow >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {formatCurrency(brrrrMonthlyCashflow)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 border-t bg-muted/30 flex flex-wrap gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const summaryText = `Deal Analysis Summary - ${deal?.address.full}

Property: ${apiData.bedrooms || '-'} bd | ${apiData.bathrooms || '-'} ba | ${apiData.sqft?.toLocaleString() || '-'} sqft | Built ${apiData.yearBuilt || '-'}

KEY FINANCIALS:
• Purchase Price: ${formatCurrency(purchasePrice)}
• ARV: ${formatCurrency(arv)}
• Rehab Cost: ${formatCurrency(rehabCost)}
• Monthly Rent: ${formatCurrency(rent)}

FLIP STRATEGY:
• Net Profit: ${formatCurrency(flipNetProfit)}
• ROI: ${formatPercent(flipROI)}
• Total Investment: ${formatCurrency(flipTotalInvestment)}

RENTAL STRATEGY:
• Monthly Cash Flow: ${formatCurrency(liveFinancials?.monthlyCashflow ?? 0)}
• Cash-on-Cash Return: ${formatPercent(liveFinancials?.cashOnCashReturn ?? 0)}
• Cap Rate: ${formatPercent(liveFinancials?.capRate ?? 0)}

BRRRR STRATEGY:
• Equity Captured: ${formatCurrency(brrrrEquityCaptured)}
• Cash Left In Deal: ${formatCurrency(brrrrCashLeftInDeal)}
• Monthly Cash Flow: ${formatCurrency(brrrrMonthlyCashflow)}`;
                          navigator.clipboard.writeText(summaryText);
                          toast.success('Summary copied to clipboard!');
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Text
                      </Button>
                      <Button
                        onClick={() => {
                          if (!liveFinancials) return;
                          generateDealPDF({
                            deal,
                            apiData,
                            financials: liveFinancials,
                            localOverrides,
                            arv: arv,
                            rehabCost: rehabCost,
                            rent: liveFinancials.monthlyGrossRent,
                            purchasePrice: purchasePrice,
                          }, 'full');
                          setIsExportSummaryDialogOpen(false);
                        }}
                        className="bg-primary hover:bg-primary/90"
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                        Download PDF
                      </Button>
                    </div>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
          <Select value={deal.status} onValueChange={(v) => handleStatusChange(v as DealStatus)} disabled={deal.isLocked}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DEAL_STATUS_CONFIG).map(([status, config]) => (
                <SelectItem key={status} value={status}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lock Banner */}
      {deal.isLocked && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <Lock className="w-5 h-5 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-500">This deal is locked</p>
            <p className="text-xs text-muted-foreground">All data is protected from changes. Unlock to edit.</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleToggleLock} className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10">
            <Unlock className="w-4 h-4 mr-2" />
            Unlock
          </Button>
        </div>
      )}

      {/* Info Bar */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {/* Left side - Property info */}
        <div className="flex flex-wrap items-center gap-4 flex-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            Source: {DEAL_SOURCE_LABELS[deal.source]} • Created: {new Date(deal.createdAt).toLocaleDateString()}
          </div>
          {apiData.bedrooms && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Home className="w-4 h-4" />
              {apiData.bedrooms} bd / {apiData.bathrooms} ba / {apiData.sqft?.toLocaleString()} sqft
              {apiData.yearBuilt && <span>/ {apiData.yearBuilt}</span>}
              {apiData.propertyType && (
                <span>
                  / {apiData.propertyType === 'single_family' ? 'Single Family' 
                    : apiData.propertyType === 'multi_family' ? 'Multi Family'
                    : apiData.propertyType === 'condo' ? 'Condo'
                    : apiData.propertyType === 'townhouse' ? 'Townhouse'
                    : apiData.propertyType === 'duplex' ? 'Duplex'
                    : apiData.propertyType === 'triplex' ? 'Triplex'
                    : apiData.propertyType === 'fourplex' ? 'Fourplex'
                    : apiData.propertyType}
                </span>
              )}
            </div>
          )}
          {(() => {
            // Lot size: use override if available, otherwise (coerced) API value
            const apiLotSqft = coerceLotSizeSqft(apiData.lotSize, apiData.sqft).sqft;
            const lotSqft = localOverrides.lotSizeSqft ? parseFloat(localOverrides.lotSizeSqft) : apiLotSqft;
            const lotAcres = lotSqft ? lotSqft / 43560 : null;
            const isOverridden = !!localOverrides.lotSizeSqft;
            const isApiValueSuspect = apiLotSqft && apiLotSqft < (apiData.sqft || 500);
            // Only show "Modified" badge if API value was reasonable (not suspect) and user changed it
            const showModifiedBadge = isOverridden && !isApiValueSuspect;
            
            if (lotSqft && lotSqft >= 500) {
              return (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors",
                      showModifiedBadge ? "text-amber-400" : "text-muted-foreground"
                    )}>
                      <Building2 className="w-4 h-4" />
                      Lot: {lotSqft >= 43560 
                        ? `${lotAcres!.toFixed(2)} acres (${lotSqft.toLocaleString()} sqft)`
                        : `${lotSqft.toLocaleString()} sqft`
                      }
                      {showModifiedBadge && <Badge variant="outline" className="text-[10px] h-4 px-1">Modified</Badge>}
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72">
                    <h4 className="font-semibold mb-2">Lot Size Override</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      {isApiValueSuspect && !isOverridden 
                        ? `API reports ${apiLotSqft ?? apiData.lotSize ?? 'N/A'} sqft which seems incorrect (smaller than building).`
                        : 'Override the lot size if API data is inaccurate.'}
                    </p>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs">Sqft</Label>
                          <Input
                            type="number"
                            value={localOverrides.lotSizeSqft || ''}
                            onChange={(e) => {
                              handleOverrideChange('lotSizeSqft', e.target.value);
                            }}
                            placeholder={(apiLotSqft ?? apiData.lotSize)?.toString() || 'Enter sqft'}
                            className="h-8"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">Acres</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={localOverrides.lotSizeSqft ? (parseFloat(localOverrides.lotSizeSqft) / 43560).toFixed(2) : ''}
                            onChange={(e) => {
                              const acres = parseFloat(e.target.value);
                              if (!isNaN(acres)) {
                                handleOverrideChange('lotSizeSqft', Math.round(acres * 43560).toString());
                              } else {
                                handleOverrideChange('lotSizeSqft', '');
                              }
                            }}
                            placeholder="Enter acres"
                            className="h-8"
                          />
                        </div>
                      </div>
                      {isOverridden && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full text-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            if (isApiValueSuspect) {
                              const ok = window.confirm(
                                `The API lot size (${apiLotSqft ?? apiData.lotSize ?? 'N/A'} sqft) looks incorrect. Clearing your override will show that value again. Continue?`
                              );
                              if (!ok) return;
                            }

                            handleResetOverride('lotSizeSqft');
                          }}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          {isApiValueSuspect ? (
                            <>Clear override (shows API: {apiLotSqft ?? apiData.lotSize ?? 'N/A'} sqft)</>
                          ) : (
                            <>Reset to API value ({apiLotSqft ?? apiData.lotSize ?? 'N/A'} sqft)</>
                          )}
                        </Button>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            } else if (isApiValueSuspect) {
              // Show editable prompt when API value is suspect
              return (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <div className="flex items-center gap-2 text-amber-400 cursor-pointer hover:text-amber-300 transition-colors">
                      <AlertTriangle className="w-4 h-4" />
                      Lot: {apiLotSqft ?? apiData.lotSize} sqft (likely incorrect)
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72">
                    <h4 className="font-semibold mb-2">Incorrect Lot Size</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      The API reports {apiLotSqft ?? apiData.lotSize} sqft which is smaller than the building ({apiData.sqft} sqft). 
                      Enter the correct lot size below.
                    </p>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs">Sqft</Label>
                          <Input
                            type="number"
                            value={localOverrides.lotSizeSqft || ''}
                            onChange={(e) => handleOverrideChange('lotSizeSqft', e.target.value)}
                            placeholder="Enter sqft"
                            className="h-8"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">Acres</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={localOverrides.lotSizeSqft ? (parseFloat(localOverrides.lotSizeSqft) / 43560).toFixed(2) : ''}
                            onChange={(e) => {
                              const acres = parseFloat(e.target.value);
                              if (!isNaN(acres)) {
                                handleOverrideChange('lotSizeSqft', Math.round(acres * 43560).toString());
                              }
                            }}
                            placeholder="Enter acres"
                            className="h-8"
                          />
                        </div>
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            }

            return null;
          })()}
          {apiData.daysOnMarket != null && apiData.daysOnMarket > 0 && (() => {
            // Calculate current days on market dynamically.
            // For older deals that don't have a fetched timestamp yet, fall back to deal.createdAt.
            let currentDaysOnMarket = apiData.daysOnMarket;

            const baseDateStr = apiData.daysOnMarketFetchedAt || deal?.createdAt || null;
            if (baseDateStr) {
              const baseDate = new Date(baseDateStr);
              if (!Number.isNaN(baseDate.getTime())) {
                const now = new Date();
                const daysSinceBase = Math.floor((now.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
                currentDaysOnMarket = apiData.daysOnMarket + Math.max(0, daysSinceBase);
              }
            }

            return (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                {currentDaysOnMarket} days on market
              </div>
            );
          })()}
          
          {/* Additional API Data with HoverCards */}
          {rawProperty?.resoFacts && (
            <HoverCard>
              <HoverCardTrigger asChild>
                <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <Info className="w-4 h-4" />
                  <span className="text-sm">Property Facts</span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 max-h-96 overflow-y-auto">
                <h4 className="font-semibold mb-2">Property Facts</h4>
                <div className="space-y-1 text-sm">
                  {rawProperty.resoFacts.atAGlanceFacts?.map((fact: any, idx: number) => (
                    <div key={idx} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{fact.factLabel}</span>
                      <span className="font-medium text-right">{fact.factValue || '-'}</span>
                    </div>
                  ))}
                  {rawProperty.resoFacts.heating && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Heating</span>
                      <span className="font-medium">{Array.isArray(rawProperty.resoFacts.heating) ? rawProperty.resoFacts.heating.join(', ') : rawProperty.resoFacts.heating}</span>
                    </div>
                  )}
                  {rawProperty.resoFacts.cooling && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Cooling</span>
                      <span className="font-medium">{Array.isArray(rawProperty.resoFacts.cooling) ? rawProperty.resoFacts.cooling.join(', ') : rawProperty.resoFacts.cooling}</span>
                    </div>
                  )}
                  {rawProperty.resoFacts.flooring && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Flooring</span>
                      <span className="font-medium">{Array.isArray(rawProperty.resoFacts.flooring) ? rawProperty.resoFacts.flooring.join(', ') : rawProperty.resoFacts.flooring}</span>
                    </div>
                  )}
                  {rawProperty.resoFacts.basement && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Basement</span>
                      <span className="font-medium">{rawProperty.resoFacts.basement}</span>
                    </div>
                  )}
                  {rawProperty.resoFacts.parking && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Parking</span>
                      <span className="font-medium">{rawProperty.resoFacts.parking}</span>
                    </div>
                  )}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
          
          {rawProperty?.climate && (
            <HoverCard>
              <HoverCardTrigger asChild>
                <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <Thermometer className="w-4 h-4" />
                  <span className="text-sm">Climate</span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent className="w-72">
                <h4 className="font-semibold mb-2">Climate Risk</h4>
                <div className="space-y-2 text-sm">
                  {rawProperty.climate.floodSources?.primary?.riskScore && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Flood Risk</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        rawProperty.climate.floodSources.primary.riskScore.value <= 3 ? "bg-emerald-500/20 text-emerald-400" :
                        rawProperty.climate.floodSources.primary.riskScore.value <= 6 ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      )}>
                        {rawProperty.climate.floodSources.primary.riskScore.label} ({rawProperty.climate.floodSources.primary.riskScore.value}/10)
                      </span>
                    </div>
                  )}
                  {rawProperty.climate.fireSources?.primary?.riskScore && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Fire Risk</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        rawProperty.climate.fireSources.primary.riskScore.value <= 3 ? "bg-emerald-500/20 text-emerald-400" :
                        rawProperty.climate.fireSources.primary.riskScore.value <= 6 ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      )}>
                        {rawProperty.climate.fireSources.primary.riskScore.label} ({rawProperty.climate.fireSources.primary.riskScore.value}/10)
                      </span>
                    </div>
                  )}
                  {rawProperty.climate.windSources?.primary?.riskScore && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Wind Risk</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        rawProperty.climate.windSources.primary.riskScore.value <= 3 ? "bg-emerald-500/20 text-emerald-400" :
                        rawProperty.climate.windSources.primary.riskScore.value <= 6 ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      )}>
                        {rawProperty.climate.windSources.primary.riskScore.label} ({rawProperty.climate.windSources.primary.riskScore.value}/10)
                      </span>
                    </div>
                  )}
                  {rawProperty.climate.heatSources?.primary?.riskScore && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Heat Risk</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        rawProperty.climate.heatSources.primary.riskScore.value <= 3 ? "bg-emerald-500/20 text-emerald-400" :
                        rawProperty.climate.heatSources.primary.riskScore.value <= 6 ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      )}>
                        {rawProperty.climate.heatSources.primary.riskScore.label} ({rawProperty.climate.heatSources.primary.riskScore.value}/10)
                      </span>
                    </div>
                  )}
                  {rawProperty.climate.airSources?.primary?.riskScore && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Air Quality</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        rawProperty.climate.airSources.primary.riskScore.value <= 3 ? "bg-emerald-500/20 text-emerald-400" :
                        rawProperty.climate.airSources.primary.riskScore.value <= 6 ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      )}>
                        {rawProperty.climate.airSources.primary.riskScore.label} ({rawProperty.climate.airSources.primary.riskScore.value}/10)
                      </span>
                    </div>
                  )}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
          
          {rawProperty?.schools && rawProperty.schools.length > 0 && (() => {
            const schools = rawProperty.schools;
            const schoolsWithRating = schools.filter((s: any) => s.rating != null);
            const avgRating = schoolsWithRating.length > 0 
              ? schoolsWithRating.reduce((sum: number, s: any) => sum + s.rating, 0) / schoolsWithRating.length 
              : null;
            
            const getSchoolColor = (avg: number | null) => {
              if (avg === null) return "text-muted-foreground";
              if (avg >= 5) return "text-emerald-400"; // avg * 3 = 15+
              if (avg >= 4) return "text-lime-400"; // avg * 3 = 12-14
              if (avg >= 3) return "text-yellow-400"; // avg * 3 = 9-12
              return "text-red-400"; // below 9
            };
            
            return (
              <HoverCard>
                <HoverCardTrigger asChild>
                  <button className={cn(
                    "flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer",
                    getSchoolColor(avgRating)
                  )}>
                    <GraduationCap className="w-4 h-4" />
                    <span className="text-sm">Schools</span>
                    {avgRating !== null && (
                      <span className="text-xs font-semibold">({(avgRating * 3).toFixed(0)})</span>
                    )}
                  </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-80 max-h-96 overflow-y-auto">
                  <h4 className="font-semibold mb-2">Nearby Schools {avgRating !== null && <span className="text-muted-foreground font-normal">(Avg: {(avgRating * 3).toFixed(0)}/30)</span>}</h4>
                  <div className="space-y-2">
                    {schools.slice(0, 6).map((school: any, idx: number) => (
                      <div key={idx} className="text-sm border-b border-border pb-2 last:border-0">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-medium">{school.name}</span>
                          {school.rating && (
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-xs font-bold shrink-0",
                              school.rating >= 8 ? "bg-emerald-500/20 text-emerald-400" :
                              school.rating >= 5 ? "bg-yellow-500/20 text-yellow-400" :
                              "bg-red-500/20 text-red-400"
                            )}>
                              {school.rating}/10
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs mt-0.5">
                          {school.level} • {school.distance} mi
                        </div>
                      </div>
                    ))}
                  </div>
                </HoverCardContent>
              </HoverCard>
            );
          })()}
          
          {rawProperty?.neighborhoodRegion?.name && (
            <HoverCard>
              <HoverCardTrigger asChild>
                <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <MapPinned className="w-4 h-4" />
                  <span className="text-sm">{rawProperty.neighborhoodRegion.name}</span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent className="w-64">
                <h4 className="font-semibold mb-2">Neighborhood</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{rawProperty.neighborhoodRegion.name}</span>
                  </div>
                  {apiData.neighborhoodRating && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Rating</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-bold",
                        apiData.neighborhoodRating === 'A' && "bg-emerald-500/20 text-emerald-400",
                        apiData.neighborhoodRating === 'B' && "bg-cyan-500/20 text-cyan-400",
                        apiData.neighborhoodRating === 'C' && "bg-yellow-500/20 text-yellow-400",
                        apiData.neighborhoodRating === 'D' && "bg-orange-500/20 text-orange-400",
                        apiData.neighborhoodRating === 'F' && "bg-red-500/20 text-red-400",
                      )}>
                        {apiData.neighborhoodRating}
                      </span>
                    </div>
                  )}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
        
        {/* Right side - Email and Phone (Phone rightmost) */}
        {(() => {
          const attrInfo = rawProperty?.attributionInfo;
          const email = attrInfo?.listingAgentEmail || attrInfo?.agentEmail || apiData.agentEmail;
          const phone = attrInfo?.listingAgentPhone || attrInfo?.agentPhoneNumber || attrInfo?.brokerPhoneNumber || apiData.agentPhone || apiData.brokerPhone;

          if (!email && !phone && !apiData.agentName && !apiData.brokerName) return null;
          
          return (
            <div className="flex items-center gap-3">
              {/* Zillow Link */}
              {(() => {
                const zillowHref = apiData.detailUrl
                  ? (apiData.detailUrl.startsWith('http') ? apiData.detailUrl : `https://www.zillow.com${apiData.detailUrl}`)
                  : `https://www.zillow.com/homes/${encodeURIComponent(deal.address.full)}/`;
                return (
                  <a
                    href={zillowHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors"
                  >
                    <ZillowIcon className="w-4 h-4" />
                    <span className="text-sm underline underline-offset-2">View on Zillow</span>
                  </a>
                );
              })()}

              {email && (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <button 
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(email);
                        toast.success('Email copied to clipboard');
                      }}
                    >
                      <Mail className="w-4 h-4" />
                      <span className="underline underline-offset-2">Email</span>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-auto p-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span>{email}</span>
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </HoverCardContent>
                </HoverCard>
              )}
              
              {(phone || apiData.agentName || apiData.brokerName) && (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <button 
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <Phone className="w-4 h-4" />
                      <span className="underline underline-offset-2">Agent Info</span>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72 p-3">
                    <div className="space-y-2 text-sm">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">Agent / Broker</p>
                      
                      {/* Agent Name */}
                      {(attrInfo?.listingAgentName || attrInfo?.agentName || apiData.agentName) && (
                        <div 
                          className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded transition-colors"
                          onClick={() => {
                            const name = attrInfo?.listingAgentName || attrInfo?.agentName || apiData.agentName;
                            navigator.clipboard.writeText(name);
                            toast.success('Name copied');
                          }}
                        >
                          <span className="text-muted-foreground">Agent</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{attrInfo?.listingAgentName || attrInfo?.agentName || apiData.agentName}</span>
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </div>
                      )}
                      
                      {/* Phone */}
                      {phone && (
                        <div className="flex items-center justify-between gap-2 p-1.5 rounded">
                          <div
                            className="flex items-center gap-1.5 cursor-pointer hover:bg-muted/50 flex-1 rounded transition-colors p-1"
                            onClick={() => {
                              navigator.clipboard.writeText(phone);
                              toast.success('Phone copied');
                            }}
                          >
                            <span className="text-muted-foreground">Phone</span>
                            <span className="text-primary">{phone}</span>
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <button
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            onClick={() => openSmsDialog(phone)}
                          >
                            <MessageSquare className="w-3 h-3" />
                            SMS
                          </button>
                        </div>
                      )}
                      
                      {/* Email */}
                      {(attrInfo?.listingAgentEmail || attrInfo?.agentEmail || apiData.agentEmail) && (
                        <div 
                          className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded transition-colors"
                          onClick={() => {
                            const agentEmail = attrInfo?.listingAgentEmail || attrInfo?.agentEmail || apiData.agentEmail;
                            navigator.clipboard.writeText(agentEmail);
                            toast.success('Email copied');
                          }}
                        >
                          <span className="text-muted-foreground">Email</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-primary truncate max-w-[140px]">{attrInfo?.listingAgentEmail || attrInfo?.agentEmail || apiData.agentEmail}</span>
                            <Copy className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          </div>
                        </div>
                      )}
                      
                      {/* Broker */}
                      {(attrInfo?.brokerName || apiData.brokerName) && (
                        <>
                          <Separator className="my-2" />
                          <div 
                            className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded transition-colors"
                            onClick={() => {
                              const broker = attrInfo?.brokerName || apiData.brokerName;
                              navigator.clipboard.writeText(broker);
                              toast.success('Broker copied');
                            }}
                          >
                            <span className="text-muted-foreground">Broker</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-right text-xs max-w-[140px] truncate">{attrInfo?.brokerName || apiData.brokerName}</span>
                              <Copy className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            </div>
                          </div>
                        </>
                      )}
                      
                      {/* MLS ID */}
                      {apiData.mlsId && (
                        <div 
                          className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(apiData.mlsId!);
                            toast.success('MLS ID copied');
                          }}
                        >
                          <span className="text-muted-foreground">MLS ID</span>
                          <div className="flex items-center gap-1.5">
                            <span>{apiData.mlsId}</span>
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              )}
              
              {/* Seller/Wholesaler Info - only for email-sourced deals */}
              {deal.source === 'email' && (deal.senderName || deal.senderEmail) && (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <button 
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <Mail className="w-4 h-4" />
                      <span className="underline underline-offset-2">Seller Info</span>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-80 p-3">
                    <div className="space-y-2 text-sm">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">Seller / Wholesaler</p>
                      
                      {/* Sender Name */}
                      {deal.senderName && (
                        <div 
                          className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(deal.senderName!);
                            toast.success('Name copied');
                          }}
                        >
                          <span className="text-muted-foreground">Name</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{deal.senderName}</span>
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </div>
                      )}
                      
                      {/* Sender Email */}
                      {deal.senderEmail && (
                        <div 
                          className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(deal.senderEmail!);
                            toast.success('Email copied');
                          }}
                        >
                          <span className="text-muted-foreground">Email</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-primary truncate max-w-[160px]">{deal.senderEmail}</span>
                            <Copy className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          </div>
                        </div>
                      )}
                      
                      {/* Email Snippet */}
                      {deal.emailSnippet && (
                        <>
                          <Separator className="my-2" />
                          <div className="p-2 bg-muted/30 rounded text-xs text-muted-foreground leading-relaxed">
                            <span className="font-medium text-foreground/70">Message preview:</span>
                            <p className="mt-1 line-clamp-3">{deal.emailSnippet}</p>
                          </div>
                        </>
                      )}
                      
                      {/* Email Subject */}
                      {deal.emailSubject && (
                        <div
                          className="flex items-start gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(deal.emailSubject!);
                            toast.success('Subject copied');
                          }}
                        >
                          <span className="text-muted-foreground shrink-0">Subject</span>
                          <div className="flex items-start gap-1.5 min-w-0">
                            <span className="text-xs truncate">{deal.emailSubject}</span>
                            <Copy className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                          </div>
                        </div>
                      )}

                      {/* Open in Gmail link */}
                      {deal.emailId && (
                        <>
                          <Separator className="my-2" />
                          <a
                            href={`https://mail.google.com/mail/u/0/#all/${deal.emailId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-primary hover:underline text-xs p-1.5"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open original email in Gmail
                          </a>
                        </>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              )}

              {/* Open Email button — visible shortcut for email-sourced deals */}
              {deal.source === 'email' && deal.emailId && (
                <a
                  href={`https://mail.google.com/mail/u/0/#all/${deal.emailId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/50 rounded px-2.5 py-1 hover:bg-muted/50"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Open Email
                </a>
              )}

              {/* Notes Button */}
              <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
                <DialogTrigger asChild>
                  <button 
                    className={cn(
                      "flex items-center gap-2 transition-colors cursor-pointer",
                      parsedNotes.length > 0 ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <FileText className="w-4 h-4" />
                    <span className="underline underline-offset-2">Notes</span>
                    {parsedNotes.length > 0 && <span className="text-xs">({parsedNotes.length})</span>}
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Notes
                    </DialogTitle>
                  </DialogHeader>
                  
                  {/* Existing notes list */}
                  {parsedNotes.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {parsedNotes.map((note, index) => (
                        <div key={index} className="flex items-start gap-2 p-2 rounded bg-muted/50 group">
                          <p className="text-sm flex-1 whitespace-pre-wrap">{note}</p>
                          <button
                            onClick={() => handleDeleteNote(index)}
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Add new note */}
                  <div className="space-y-2 mt-2">
                    <Textarea
                      placeholder="Write a new note..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      rows={4}
                    />
                    <Button 
                      onClick={handleAddNote}
                      disabled={!newNoteText.trim()}
                      className="w-full"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Note
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Investors Manager - Only for admins */}
              <Separator orientation="vertical" className="h-4" />
              <DealInvestorsManager dealId={deal.id} dealAddress={deal.address.full} />
            </div>
          );
        })()}
      </div>

      {/* DEAL SUMMARY - Top of page analysis - Using liveFinancials for real-time sync */}
      {apiData && liveFinancials && (() => {
        // All values come from liveFinancials for perfect sync across the page
        // Base values from overrides or API
        const purchasePrice = localOverrides.purchasePrice ? parseFloat(localOverrides.purchasePrice) : (apiData.purchasePrice ?? 0);
        const baseArv = localOverrides.arv ? parseFloat(localOverrides.arv) : (apiData.arv ?? 0);
        const baseRehabCost = localOverrides.rehabCost ? parseFloat(localOverrides.rehabCost) : (apiData.rehabCost ?? 0);
        const baseRent = localOverrides.rent ? parseFloat(localOverrides.rent) : (apiData.rent ?? 0);
        const rent = liveFinancials.monthlyGrossRent;
        const downPaymentPercent = localOverrides.downPaymentPercent ? parseFloat(localOverrides.downPaymentPercent) : 25;
        const interestRate = localOverrides.interestRate ? parseFloat(localOverrides.interestRate) : 7.5;
        const loanTermYears = localOverrides.loanTermYears ? parseFloat(localOverrides.loanTermYears) : 30;

        // Layout change calculations (for display purposes)
        const currentBedrooms = apiData.bedrooms ?? 0;
        const currentBathrooms = apiData.bathrooms ?? 0;
        const targetBedrooms = localOverrides.targetBedrooms ? parseFloat(localOverrides.targetBedrooms) : currentBedrooms;
        const targetBathrooms = localOverrides.targetBathrooms ? parseFloat(localOverrides.targetBathrooms) : currentBathrooms;
        const bedroomsAdded = Math.max(0, targetBedrooms - currentBedrooms);
        const bathroomsAdded = Math.max(0, targetBathrooms - currentBathrooms);
        const layoutRehabCost = (bedroomsAdded * 20000) + (bathroomsAdded * 15000);
        const layoutArvIncrease = (bedroomsAdded * 30000) + (bathroomsAdded * 20000);
        const layoutRentIncrease = (bedroomsAdded * 400) + (bathroomsAdded * 200);

        // Effective values including layout adjustments
        const arvBeforeValidation = baseArv + layoutArvIncrease;
        const sqft = apiData.sqft ?? 0;

        // Validate API-derived ARV against comps (do not override user ARV override)
        const arvValidation = arvValidationMemo;

        const arv = arvValidation ? arvValidation.validatedArv : arvBeforeValidation;
        const arvValidationDelta = arvValidation ? Math.max(0, arvBeforeValidation - arv) : 0;
        const arvExplanation = arvValidation?.explanation || 'Using API ARV';

        const rehabCost = baseRehabCost + layoutRehabCost;

        // Use liveFinancials for all calculated values - single source of truth
        const monthlyCashflow = liveFinancials.monthlyCashflow;
        const cashOnCashReturn = liveFinancials.cashOnCashReturn * 100; // Convert to percentage
        const capRate = liveFinancials.capRate * 100; // Convert to percentage
        const totalCashRequired = liveFinancials.totalCashRequired;

        // ARV Margin calculation
        const arvMargin = arv > 0 ? ((arv - purchasePrice - rehabCost) / arv) * 100 : 0;

        // Loan calculations for display
        const downPayment = purchasePrice * (downPaymentPercent / 100);
        const loanAmount = purchasePrice - downPayment;
        const monthlyRate = (interestRate / 100) / 12;
        const numPayments = loanTermYears * 12;
        const monthlyMortgage = loanAmount > 0 && monthlyRate > 0
          ? (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
          : 0;

        // Monthly expenses breakdown (use overrides if available)
        const propertyTaxMonthly = localOverrides.propertyTaxMonthly 
          ? parseFloat(localOverrides.propertyTaxMonthly) 
          : (apiData.propertyTax ?? 0) / 12;
        const insuranceMonthly = localOverrides.insuranceMonthly 
          ? parseFloat(localOverrides.insuranceMonthly) 
          : getEffectiveMonthlyInsurance(apiData.insurance);
        const monthlyPiti = monthlyMortgage + propertyTaxMonthly + insuranceMonthly;

        // Closing costs
        const closingCostsBuy = liveFinancials.closingCosts;

        // $/SqFt calculations
        const pricePerSqftPurchase = sqft > 0 ? Math.round(purchasePrice / sqft) : 0;
        const pricePerSqftArv = sqft > 0 ? Math.round(arv / sqft) : 0;
        
        // Flip analysis calculations - use settings defaults
        const contingencyPercentVal = localOverrides.contingencyPercent 
          ? parseFloat(localOverrides.contingencyPercent) / 100 
          : loanDefaults.contingencyPercent / 100;
        const rehabContingency = rehabCost * contingencyPercentVal;
        const rehabMonths = localOverrides.holdingMonths 
          ? parseInt(localOverrides.holdingMonths) 
          : loanDefaults.holdingMonths;
        
        // Holding costs breakdown (use overrides if available)
        const stateTaxMonthly = localOverrides.stateTaxMonthly 
          ? parseFloat(localOverrides.stateTaxMonthly) 
          : 0;
        const hoaMonthly = localOverrides.hoaMonthly 
          ? parseFloat(localOverrides.hoaMonthly) 
          : 0;
        const utilitiesMonthly = localOverrides.utilitiesMonthly 
          ? parseFloat(localOverrides.utilitiesMonthly) 
          : 300;
        const monthlyHoldingCost = propertyTaxMonthly + insuranceMonthly + stateTaxMonthly + hoaMonthly + utilitiesMonthly;
        const totalHoldingCosts = monthlyHoldingCost * rehabMonths;
        
        // Total investment (all costs)
        const totalInvestment = purchasePrice + rehabCost + rehabContingency + closingCostsBuy + totalHoldingCosts;
        
        // Sale costs - use settings defaults
        const agentCommissionPercent = localOverrides.agentCommissionPercent 
          ? parseFloat(localOverrides.agentCommissionPercent) / 100 
          : loanDefaults.agentCommissionPercent / 100;
        const agentCommission = arv * agentCommissionPercent;
        const notaryFeesVal = localOverrides.notaryFees 
          ? parseFloat(localOverrides.notaryFees) 
          : 500;
        const titleFee = localOverrides.titleFees 
          ? parseFloat(localOverrides.titleFees) 
          : 500;
        const totalSaleCosts = agentCommission + titleFee; // LOI is cash deal - no notary
        
        // Net profit and ROI for flip
        const netProfitFlip = arv - totalInvestment - totalSaleCosts;
        const roiFlip = totalInvestment > 0 ? (netProfitFlip / totalInvestment) : 0;
        
        // Cash to close (no financing)
        const cashToClose = purchasePrice + closingCostsBuy;
        
        // Check for suspicious data — use liveFinancials.arv as the effective ARV
        // (it already accounts for comp validation), so the warning only fires when
        // the *effective* ARV is unrealistic, not when the raw API value is bad but comps fixed it.
        const effectiveArvForCheck = localOverrides.arv ? parseFloat(localOverrides.arv) : (liveFinancials?.arv ?? null);
        const suspiciousCheck = suspiciousCheckMemo;
        
        return (
          <>
            {/* OFF MARKET Banner */}
            {deal.isOffMarket && (
              <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-amber-500/15 border-2 border-amber-500/60">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black tracking-widest text-amber-400 uppercase">OFF MARKET</span>
                  <Badge className="bg-amber-500 text-black font-bold text-xs px-2">Email Deal</Badge>
                </div>
                {deal.emailDate && (
                  <span className="text-sm text-muted-foreground">
                    • Received {new Date(deal.emailDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
                {deal.senderName && (
                  <span className="text-sm text-muted-foreground">
                    • From <span className="text-foreground font-medium">{deal.senderName}</span>
                  </span>
                )}
              </div>
            )}

            {/* Suspicious Data Warning Banner */}
            {suspiciousCheck.hasSuspiciousData && (
              <Card className="border-2 border-orange-500 bg-orange-500/10">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-6 h-6 text-orange-500 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <p className="font-semibold text-orange-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Suspicious Data Detected - Review Required
                      </p>
                      <div className="space-y-1">
                        {suspiciousCheck.fields.map((field, idx) => (
                          <p key={idx} className="text-sm text-orange-300">
                            • <span className="font-medium">{field.label}:</span> {field.reason}
                          </p>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        These values appear unrealistic for typical residential real estate. 
                        Please review and either correct the values using overrides, or confirm they are accurate.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-orange-400 border-orange-500 hover:bg-orange-500/20"
                          onClick={() => setModifiedAssumptionsOpen(true)}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Edit Values
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes display (if exists) - Above Deal Analysis */}
            {parsedNotes.length > 0 && (
              <Card 
                className="border border-muted hover:border-primary/50 transition-colors"
              >
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <FileText className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <p 
                        className="text-xs text-muted-foreground cursor-pointer hover:text-primary"
                        onClick={() => setIsNotesDialogOpen(true)}
                      >
                        Notes ({parsedNotes.length}) - click to edit
                      </p>
                      {parsedNotes.map((note, index) => (
                        <div 
                          key={index} 
                          className="flex items-start gap-2 p-2 rounded bg-muted/30 group"
                        >
                          <p className="text-sm whitespace-pre-wrap flex-1">{note}</p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNote(index);
                            }}
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-0.5 flex-shrink-0"
                            title="Delete note"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Email Data + Thread Chat — unified collapsible card */}
            {(deal.isOffMarket || deal.source === 'email') && (deal.emailExtractedData || deal.senderEmail || deal.gmailThreadId) && (
              <Collapsible defaultOpen>
                <Card className="border border-blue-500/30 bg-blue-500/5">
                  {/* Header — always visible, click to toggle */}
                  <CollapsibleTrigger asChild>
                    <CardHeader className="pb-2 pt-3 px-4 cursor-pointer hover:bg-blue-500/5 transition-colors select-none">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-400">
                          <Mail className="w-4 h-4" />
                          Email Data
                          {deal.senderName && (
                            <span className="text-muted-foreground font-normal text-xs hidden sm:inline">
                              · {deal.senderName}
                              {deal.emailDate && (
                                <> · {new Date(deal.emailDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                              )}
                            </span>
                          )}
                        </CardTitle>
                        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="px-4 pb-4 space-y-4">
                      {/* Sender + Date row */}
                      {deal.emailExtractedData && <div className="flex flex-wrap gap-4 text-sm">
                        {deal.senderName && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">From:</span>
                            <span className="font-medium">{deal.senderName}</span>
                            {deal.senderEmail && (
                              <span className="text-muted-foreground">({deal.senderEmail})</span>
                            )}
                          </div>
                        )}
                        {deal.emailDate && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Received:</span>
                            <span className="font-medium">
                              {new Date(deal.emailDate).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                        )}
                        {deal.emailSubject && (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-muted-foreground shrink-0">Subject:</span>
                            <span className="text-xs truncate max-w-xs">{deal.emailSubject}</span>
                          </div>
                        )}
                      </div>}

                      {/* Photo / Gallery links */}
                      {deal.emailExtractedData && Array.isArray(deal.emailExtractedData.imageLinks) && deal.emailExtractedData.imageLinks.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Photos / Gallery</p>
                          <div className="flex flex-wrap gap-2">
                            {(deal.emailExtractedData.imageLinks as string[]).map((link: string, idx: number) => (
                              <Button
                                key={idx}
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                                onClick={() => window.open(link, '_blank', 'noopener,noreferrer')}
                              >
                                <ExternalLink className="w-3 h-3" />
                                {idx === 0 ? 'View Photos' : `Photo Link ${idx + 1}`}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Document links */}
                      {deal.emailExtractedData && Array.isArray(deal.emailExtractedData.documentLinks) && deal.emailExtractedData.documentLinks.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Documents</p>
                          <div className="flex flex-wrap gap-2">
                            {(deal.emailExtractedData.documentLinks as Array<{label: string; url: string}>).map((dl, idx) => (
                              <Button
                                key={idx}
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 gap-1.5 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                                onClick={() => window.open(dl.url, '_blank', 'noopener,noreferrer')}
                              >
                                <ExternalLink className="w-3 h-3" />
                                {dl.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Property Description from AI */}
                      {deal.emailExtractedData?.propertyDescription && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property Description</p>
                          <div className="p-3 rounded-lg bg-muted/30 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                            {deal.emailExtractedData.propertyDescription}
                          </div>
                        </div>
                      )}

                      {/* Additional extracted info */}
                      {deal.emailExtractedData && (() => {
                        const ed = deal.emailExtractedData;
                        const infoRows: { label: string; value: string; source?: string }[] = [];
                        if (ed.bedrooms)   infoRows.push({ label: 'Beds',      value: String(ed.bedrooms),   source: 'email' });
                        if (ed.bathrooms)  infoRows.push({ label: 'Baths',     value: String(ed.bathrooms),  source: 'email' });
                        if (ed.sqft)       infoRows.push({ label: 'Sqft',      value: Number(ed.sqft).toLocaleString(), source: 'email' });
                        if (ed.yearBuilt)  infoRows.push({ label: 'Year Built', value: String(ed.yearBuilt), source: 'email' });
                        if (ed.lotSize)    infoRows.push({ label: 'Lot Size',  value: String(ed.lotSize),    source: 'email' });
                        if (ed.rehabCost)  infoRows.push({ label: 'Seller Rehab', value: `$${Number(ed.rehabCost).toLocaleString()}`, source: 'email' });
                        if (ed.arv)        infoRows.push({ label: 'Seller ARV ⚠', value: `$${Number(ed.arv).toLocaleString()}`, source: 'seller' });
                        if (ed.rent)       infoRows.push({ label: 'Seller Rent ⚠', value: `$${Number(ed.rent).toLocaleString()}/mo`, source: 'seller' });
                        if (ed.occupancy)  infoRows.push({ label: 'Occupancy', value: ed.occupancy });
                        if (ed.condition)  infoRows.push({ label: 'Condition', value: ed.condition });
                        if (ed.exterior)   infoRows.push({ label: 'Exterior',  value: ed.exterior });
                        if (ed.access)     infoRows.push({ label: 'Access',    value: ed.access });
                        if (ed.county)     infoRows.push({ label: 'County',    value: ed.county });
                        if (ed.neighborhood) infoRows.push({ label: 'Area',   value: ed.neighborhood });
                        if (ed.units)      infoRows.push({ label: 'Units',     value: String(ed.units) });
                        if (ed.capRate)    infoRows.push({ label: 'Cap Rate',  value: `${ed.capRate}%` });
                        if (ed.cashFlow)   infoRows.push({ label: 'Cash Flow', value: `$${Number(ed.cashFlow).toLocaleString()}/mo` });
                        if (ed.existingLoanBalance) infoRows.push({ label: 'Existing Loan', value: `$${Number(ed.existingLoanBalance).toLocaleString()}` });
                        if (ed.monthlyPITI) infoRows.push({ label: 'Monthly PITI', value: `$${Number(ed.monthlyPITI).toLocaleString()}` });
                        if (ed.financingNotes) infoRows.push({ label: 'Financing', value: ed.financingNotes });
                        if (ed.dealNotes) infoRows.push({ label: 'Deal Notes', value: ed.dealNotes });
                        if (infoRows.length === 0) return null;
                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {infoRows.map(({ label, value, source }) => (
                              <div key={label} className="text-sm">
                                <span className="text-muted-foreground text-xs">{label}: </span>
                                <span className={`font-medium ${source === 'seller' ? 'text-amber-400/70 line-through' : ''}`}>{value}</span>
                                {source === 'seller' && <span className="ml-1 text-[10px] text-amber-500/60">not used</span>}
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* AI Offer Email Draft */}
                      {deal.source === 'email' && deal.senderEmail && deal.financials && (
                        <div className="border-t border-blue-500/20 pt-4">
                          <OfferEmailDraft deal={deal} />
                        </div>
                      )}

                      {/* Email Thread / Reply */}
                      {deal.source === 'email' && (deal.senderEmail || deal.gmailThreadId) && (
                        <div className="border-t border-blue-500/20 pt-4 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {deal.gmailThreadId ? 'Email Thread' : 'Send Email to Seller'}
                          </p>
                          <EmailThreadChat deal={deal} />
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* Email Details Card — fallback when no structured email data available */}
            {deal.source === 'email' && !deal.emailExtractedData && deal.emailSnippet && (
              <Collapsible>
                <Card className="border-border/50 bg-card/50">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="pb-2 pt-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          Email Details
                        </CardTitle>
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="px-4 pb-4 space-y-3">
                      <div className="flex flex-wrap gap-4 text-sm">
                        {deal.senderName && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">From:</span>
                            <span className="font-medium">{deal.senderName}</span>
                            {deal.senderEmail && <span className="text-muted-foreground text-xs">({deal.senderEmail})</span>}
                          </div>
                        )}
                        {deal.emailSubject && (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-muted-foreground shrink-0">Subject:</span>
                            <span className="text-xs truncate max-w-xs">{deal.emailSubject}</span>
                          </div>
                        )}
                      </div>
                      <div className="p-3 bg-muted/30 rounded text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {deal.emailSnippet}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* Primary Metrics Card - Editable - Collapsible */}
            <Collapsible open={modifiedAssumptionsOpen} onOpenChange={setModifiedAssumptionsOpen}>
              <Card className={cn(
                "border-2 bg-gradient-to-r from-primary/10 to-primary/5 transition-all",
                hasUnsavedChanges ? "border-amber-500 ring-2 ring-amber-500/30" : "border-primary"
              )}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 pt-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        {hasUnsavedChanges && (
                          <span className="flex items-center gap-1.5 text-amber-400 animate-pulse">
                            <Save className="w-3.5 h-3.5" />
                            <span className="text-xs font-semibold">Unsaved</span>
                          </span>
                        )}
                        {hasOverrides && !hasUnsavedChanges && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        )}
                        {hasOverrides ? 'Modified Assumptions' : 'Key Assumptions'}
                        {!modifiedAssumptionsOpen && (
                          <span className="text-xs text-muted-foreground ml-2">(Click to expand)</span>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {hasUnsavedChanges && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleSaveOverrides(); }}
                            disabled={isSavingOverrides}
                            className="text-xs h-7 px-3 bg-amber-500 hover:bg-amber-600 text-black font-semibold animate-pulse"
                          >
                            {isSavingOverrides ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <Save className="w-3 h-3 mr-1" />
                            )}
                            Save Changes
                          </Button>
                        )}
                        {hasOverrides && modifiedAssumptionsOpen && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setIsResetAllDialogOpen(true); }}
                            className="text-[10px] h-5 px-1.5 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                            Reset
                          </Button>
                        )}
                        {modifiedAssumptionsOpen ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {/* Asking Price - Editable */}
                  <div className={cn(
                    "text-center p-3 rounded-lg group cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all relative",
                    localOverrides.purchasePrice ? "bg-amber-500/10 border border-amber-500/30" : "bg-background/50"
                  )}>
                    <div className="flex items-center justify-center gap-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Asking Price</p>
                      {localOverrides.purchasePrice && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">Modified</span>
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={localOverrides.purchasePrice || (apiData.purchasePrice ?? 0).toString()}
                      onChange={(e) => handleOverrideChange('purchasePrice', e.target.value)}
                      className={cn(
                        "w-full text-center text-lg font-bold mt-1 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary rounded px-1",
                        localOverrides.purchasePrice ? "text-amber-400" : "text-foreground"
                      )}
                    />
                    {localOverrides.purchasePrice && (
                      <p className="mt-1 text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                        <span>Original:</span>
                        <span className="line-through">{formatCurrency(apiData.purchasePrice ?? 0)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResetOverride('purchasePrice'); }}
                          className="ml-1 p-0.5 rounded hover:bg-muted"
                          title="Reset to original"
                        >
                          <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </p>
                    )}
                  </div>
                  
                  {/* ARV - Live (includes layout impact) */}
                  <div className={cn(
                    "text-center p-3 rounded-lg group cursor-pointer hover:ring-2 hover:ring-emerald-500/50 transition-all relative",
                    localOverrides.arv ? "bg-amber-500/10 border border-amber-500/30" : "bg-background/50"
                  )}>
                    <div className="flex items-center justify-center gap-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">ARV</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button 
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <HelpCircle className="w-3 h-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm text-left">
                          <div className="space-y-1.5 text-xs">
                            <p className="font-semibold">How ARV is calculated:</p>
                            <ul className="space-y-1 text-muted-foreground">
                              <li>• <span className="text-foreground">API ARV:</span> {formatCurrency(apiData.arv ?? 0)}</li>
                              {layoutArvIncrease > 0 && (
                                <li>• <span className="text-purple-400">Layout change:</span> +{formatCurrency(layoutArvIncrease)}</li>
                              )}
                            </ul>
                            <div className="pt-1.5 border-t border-border/50">
                              <p className="text-muted-foreground leading-relaxed">{arvExplanation}</p>
                            </div>
                            <div className="pt-1 border-t border-border/50">
                              <span className="text-emerald-400 font-medium">Final ARV: {formatCurrency(arv)}</span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                      {localOverrides.arv && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">Modified</span>
                      )}
                    </div>

                    <input
                      type="text"
                      inputMode="numeric"
                      value={localOverrides.arv || Math.round(arv).toString()}
                      onChange={(e) => handleOverrideChange('arv', e.target.value)}
                      className={cn(
                        "w-full text-center text-lg font-bold mt-1 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary rounded px-1",
                        localOverrides.arv ? "text-amber-400" : "text-emerald-400"
                      )}
                    />

                    {localOverrides.arv && (
                      <p className="mt-1 text-[10px] text-muted-foreground flex items-center justify-center gap-1 flex-wrap">
                        <span>Original:</span>
                        <span className="line-through">{formatCurrency(apiData.arv ?? 0)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResetOverride('arv'); }}
                          className="p-0.5 rounded hover:bg-muted"
                          title="Reset to original"
                        >
                          <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </p>
                    )}
                  </div>

                  {/* Rehab Cost - Live (includes layout impact) */}
                  <div className={cn(
                    "text-center p-3 rounded-lg group cursor-pointer hover:ring-2 hover:ring-amber-500/50 transition-all relative",
                    localOverrides.rehabCost ? "bg-amber-500/10 border border-amber-500/30" : "bg-background/50"
                  )}>
                    <div className="flex items-center justify-center gap-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Rehab</p>
                      {localOverrides.rehabCost && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">Modified</span>
                      )}
                    </div>

                    <input
                      type="text"
                      inputMode="numeric"
                      value={localOverrides.rehabCost || Math.round(rehabCost).toString()}
                      onChange={(e) => handleOverrideChange('rehabCost', e.target.value)}
                      className={cn(
                        "w-full text-center text-lg font-bold mt-1 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary rounded px-1",
                        localOverrides.rehabCost ? "text-amber-400" : "text-amber-400"
                      )}
                    />

                    {(layoutRehabCost > 0 || localOverrides.rehabCost) && (
                      <p className="mt-1 text-[10px] text-muted-foreground flex items-center justify-center gap-1 flex-wrap">
                        {localOverrides.rehabCost && (() => {
                          const floor = deal?.source === 'api' ? 60_000 : deal?.source === 'email' ? 80_000 : 0;
                          return floor > 0 && (apiData.rehabCost ?? 0) < floor && localOverrides.rehabCost === floor.toString();
                        })() ? (
                          <>
                            <span className="text-violet-400">Min {deal?.source === 'email' ? '$80K' : '$60K'}</span>
                            <span>(original: {formatCurrency(apiData.rehabCost ?? 0)})</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleResetOverride('rehabCost'); }}
                              className="p-0.5 rounded hover:bg-muted"
                              title="Reset to original"
                            >
                              <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" />
                            </button>
                          </>
                        ) : localOverrides.rehabCost ? (
                          <>
                            <span>Original:</span>
                            <span className="line-through">{formatCurrency(apiData.rehabCost ?? 0)}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleResetOverride('rehabCost'); }}
                              className="p-0.5 rounded hover:bg-muted"
                              title="Reset to original"
                            >
                              <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" />
                            </button>
                          </>
                        ) : null}
                        {layoutRehabCost > 0 && (
                          <span className="text-purple-400">+{formatCurrency(layoutRehabCost)} layout</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Monthly Rent - Live (includes layout impact) */}
                  <div className={cn(
                    "text-center p-3 rounded-lg group cursor-pointer hover:ring-2 hover:ring-cyan-500/50 transition-all relative",
                    localOverrides.rent ? "bg-amber-500/10 border border-amber-500/30" : "bg-background/50"
                  )}>
                    <div className="flex items-center justify-center gap-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Rent</p>
                      {localOverrides.rent && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">Modified</span>
                      )}
                    </div>

                    <input
                      type="text"
                      inputMode="numeric"
                      value={localOverrides.rent || Math.round(rent).toString()}
                      onChange={(e) => handleOverrideChange('rent', e.target.value)}
                      className={cn(
                        "w-full text-center text-lg font-bold mt-1 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary rounded px-1",
                        localOverrides.rent ? "text-amber-400" : "text-cyan-400"
                      )}
                    />

                    {(layoutRentIncrease > 0 || localOverrides.rent) && (
                      <p className="mt-1 text-[10px] text-muted-foreground flex items-center justify-center gap-1 flex-wrap">
                        {localOverrides.rent && (
                          <>
                            <span>Original:</span>
                            <span className="line-through">{formatCurrency(apiData.rent ?? 0)}/mo</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleResetOverride('rent'); }}
                              className="p-0.5 rounded hover:bg-muted"
                              title="Reset to original"
                            >
                              <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" />
                            </button>
                          </>
                        )}
                        {layoutRentIncrease > 0 && (
                          <span className="text-purple-400">+{formatCurrency(layoutRentIncrease)}/mo layout</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* PPSQFT Calculations */}
                  <div className="col-span-full flex items-center gap-4 mt-2 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase">PPSQFT Purchase:</span>
                      <span className="text-xs font-semibold text-foreground">
                        {apiData.sqft ? `$${Math.round((localOverrides.purchasePrice ? parseFloat(localOverrides.purchasePrice) : (apiData.purchasePrice ?? 0)) / apiData.sqft)}` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase">PPSQFT Sale:</span>
                      <span className="text-xs font-semibold text-emerald-400">
                        {apiData.sqft ? `$${Math.round(arv / apiData.sqft)}` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Layout Change Row */}
                <div className="col-span-full border-t border-border pt-3 mt-2">
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-purple-400" />
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Layout Change</p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground ml-6">
                      <span><span className="text-purple-400 font-medium">Per Bed:</span> +$30K ARV, +$20K Rehab, +$400/mo Rent</span>
                      <span><span className="text-purple-400 font-medium">Per Bath:</span> +$20K ARV, +$15K Rehab, +$200/mo Rent</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Current Bedrooms (Read Only) */}
                    <div className="text-center p-2 rounded-lg bg-background/30">
                      <p className="text-[10px] text-muted-foreground uppercase">Current Beds</p>
                      <p className="text-lg font-bold text-muted-foreground">{apiData.bedrooms ?? 0}</p>
                    </div>
                    
                    {/* Target Bedrooms (Editable) */}
                    <div className={cn(
                      "text-center p-2 rounded-lg group cursor-pointer hover:ring-2 hover:ring-purple-500/50 transition-all",
                      localOverrides.targetBedrooms && parseFloat(localOverrides.targetBedrooms) !== (apiData.bedrooms ?? 0)
                        ? "bg-amber-500/10 border border-amber-500/30" 
                        : "bg-purple-500/10 border border-purple-500/30"
                    )}>
                      <div className="flex items-center justify-center gap-1">
                        <p className="text-[10px] text-purple-400 uppercase">Target Beds</p>
                        {localOverrides.targetBedrooms && parseFloat(localOverrides.targetBedrooms) !== (apiData.bedrooms ?? 0) && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">+{parseFloat(localOverrides.targetBedrooms) - (apiData.bedrooms ?? 0)}</span>
                        )}
                      </div>
                      <input
                        type="number"
                        min={apiData.bedrooms ?? 0}
                        max={10}
                        step={1}
                        value={localOverrides.targetBedrooms || (apiData.bedrooms ?? 0).toString()}
                        onChange={(e) => handleOverrideChange('targetBedrooms', e.target.value)}
                        className={cn(
                          "w-full text-center text-lg font-bold bg-transparent border-none outline-none focus:ring-2 focus:ring-purple-500 rounded px-1",
                          localOverrides.targetBedrooms && parseFloat(localOverrides.targetBedrooms) !== (apiData.bedrooms ?? 0) ? "text-amber-400" : "text-purple-400"
                        )}
                      />
                      {localOverrides.targetBedrooms && parseFloat(localOverrides.targetBedrooms) !== (apiData.bedrooms ?? 0) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResetOverride('targetBedrooms'); }}
                          className="mt-1 text-[9px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-0.5"
                          title="Reset to original"
                        >
                          <RotateCcw className="w-2 h-2" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                    
                    {/* Current Bathrooms (Read Only) */}
                    <div className="text-center p-2 rounded-lg bg-background/30">
                      <p className="text-[10px] text-muted-foreground uppercase">Current Baths</p>
                      <p className="text-lg font-bold text-muted-foreground">{apiData.bathrooms ?? 0}</p>
                    </div>
                    
                    {/* Target Bathrooms (Editable) */}
                    <div className={cn(
                      "text-center p-2 rounded-lg group cursor-pointer hover:ring-2 hover:ring-purple-500/50 transition-all",
                      localOverrides.targetBathrooms && parseFloat(localOverrides.targetBathrooms) !== (apiData.bathrooms ?? 0)
                        ? "bg-amber-500/10 border border-amber-500/30" 
                        : "bg-purple-500/10 border border-purple-500/30"
                    )}>
                      <div className="flex items-center justify-center gap-1">
                        <p className="text-[10px] text-purple-400 uppercase">Target Baths</p>
                        {localOverrides.targetBathrooms && parseFloat(localOverrides.targetBathrooms) !== (apiData.bathrooms ?? 0) && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">+{parseFloat(localOverrides.targetBathrooms) - (apiData.bathrooms ?? 0)}</span>
                        )}
                      </div>
                      <input
                        type="number"
                        min={apiData.bathrooms ?? 0}
                        max={10}
                        step={0.5}
                        value={localOverrides.targetBathrooms || (apiData.bathrooms ?? 0).toString()}
                        onChange={(e) => handleOverrideChange('targetBathrooms', e.target.value)}
                        className={cn(
                          "w-full text-center text-lg font-bold bg-transparent border-none outline-none focus:ring-2 focus:ring-purple-500 rounded px-1",
                          localOverrides.targetBathrooms && parseFloat(localOverrides.targetBathrooms) !== (apiData.bathrooms ?? 0) ? "text-amber-400" : "text-purple-400"
                        )}
                      />
                      {localOverrides.targetBathrooms && parseFloat(localOverrides.targetBathrooms) !== (apiData.bathrooms ?? 0) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResetOverride('targetBathrooms'); }}
                          className="mt-1 text-[9px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-0.5"
                          title="Reset to original"
                        >
                          <RotateCcw className="w-2 h-2" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Layout Impact Summary */}
                  {((localOverrides.targetBedrooms && parseFloat(localOverrides.targetBedrooms) > (apiData.bedrooms ?? 0)) ||
                    (localOverrides.targetBathrooms && parseFloat(localOverrides.targetBathrooms) > (apiData.bathrooms ?? 0))) && (
                    <div className="mt-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
                      <div className="flex items-center justify-between text-purple-300">
                        <span>Layout Change Impact:</span>
                        <div className="flex gap-3">
                          <span>
                            ARV: +{formatCurrency(
                              Math.max(0, (parseFloat(localOverrides.targetBedrooms || '0') - (apiData.bedrooms ?? 0))) * 30000 +
                              Math.max(0, (parseFloat(localOverrides.targetBathrooms || '0') - (apiData.bathrooms ?? 0))) * 20000
                            )}
                          </span>
                          <span>
                            Rehab: +{formatCurrency(
                              Math.max(0, (parseFloat(localOverrides.targetBedrooms || '0') - (apiData.bedrooms ?? 0))) * 20000 +
                              Math.max(0, (parseFloat(localOverrides.targetBathrooms || '0') - (apiData.bathrooms ?? 0))) * 15000
                            )}
                          </span>
                          <span>
                            Rent: +{formatCurrency(
                              Math.max(0, (parseFloat(localOverrides.targetBedrooms || '0') - (apiData.bedrooms ?? 0))) * 400 +
                              Math.max(0, (parseFloat(localOverrides.targetBathrooms || '0') - (apiData.bathrooms ?? 0))) * 200
                            )}/mo
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Removed: ROI and Profit Row + Secondary Metrics - these appear in Flip/Rental Analysis sections */}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* ========================================== */}
            {/* BEST STRATEGY RECOMMENDATION - Dynamic ranking based on metrics */}
            {/* ========================================== */}
            {(() => {
              // Calculate metrics for each strategy to rank them
              
              // Get current effective values (same logic as main section)
              const purchasePrice = localOverrides.purchasePrice ? parseFloat(localOverrides.purchasePrice) : (apiData?.purchasePrice ?? 0);
              const baseRehabCost = localOverrides.rehabCost ? parseFloat(localOverrides.rehabCost) : (apiData?.rehabCost ?? 0);
              const baseArv = localOverrides.arv ? parseFloat(localOverrides.arv) : (liveFinancials?.arv ?? apiData?.arv ?? 0);
              const rent = liveFinancials?.monthlyGrossRent ?? 0;
              
              // Layout adjustments
              const currentBedrooms = apiData?.bedrooms ?? 0;
              const currentBathrooms = apiData?.bathrooms ?? 0;
              const targetBedrooms = localOverrides.targetBedrooms ? parseFloat(localOverrides.targetBedrooms) : currentBedrooms;
              const targetBathrooms = localOverrides.targetBathrooms ? parseFloat(localOverrides.targetBathrooms) : currentBathrooms;
              const bedroomsAdded = Math.max(0, targetBedrooms - currentBedrooms);
              const bathroomsAdded = Math.max(0, targetBathrooms - currentBathrooms);
              const layoutRehabCost = (bedroomsAdded * 20000) + (bathroomsAdded * 15000);
              const layoutArvIncrease = (bedroomsAdded * 30000) + (bathroomsAdded * 20000);
              
              const rehabCost = baseRehabCost + layoutRehabCost;
              // Use the same ARV the user sees (override or apiData.arv), not comp-recalculated liveFinancials.arv
              const arv = baseArv + layoutArvIncrease;
              
              // Holding costs calculation
              const propertyTaxMonthly = localOverrides.propertyTaxMonthly 
                ? parseFloat(localOverrides.propertyTaxMonthly) 
                : (apiData?.propertyTax ?? 0) / 12;
              const insuranceMonthly = localOverrides.insuranceMonthly 
                ? parseFloat(localOverrides.insuranceMonthly) 
                : (apiData?.insurance ?? 0) / 12;
              const stateTaxMonthly = localOverrides.stateTaxMonthly ? parseFloat(localOverrides.stateTaxMonthly) : 0;
              const hoaMonthly = localOverrides.hoaMonthly ? parseFloat(localOverrides.hoaMonthly) : 0;
              const utilitiesMonthly = localOverrides.utilitiesMonthly ? parseFloat(localOverrides.utilitiesMonthly) : 300;
              const monthlyHoldingCost = propertyTaxMonthly + insuranceMonthly + stateTaxMonthly + hoaMonthly + utilitiesMonthly;
              const flipRehabMonths = localOverrides.holdingMonths 
                ? parseInt(localOverrides.holdingMonths) 
                : loanDefaults.holdingMonths;
              const totalHoldingCosts = monthlyHoldingCost * flipRehabMonths;
              
              // FLIP metrics (Cash deal)
              const flipClosingPercent = localOverrides.closingCostsPercent
                ? parseFloat(localOverrides.closingCostsPercent) / 100 
                : loanDefaults.closingCostsPercent / 100;
              const flipContingencyPercent = localOverrides.contingencyPercent 
                ? parseFloat(localOverrides.contingencyPercent) / 100 
                : loanDefaults.contingencyPercent / 100;
              const flipAgentPercent = localOverrides.agentCommissionPercent 
                ? parseFloat(localOverrides.agentCommissionPercent) / 100 
                : loanDefaults.agentCommissionPercent / 100;
              const flipClosingCostsBuy = localOverrides.closingCostsDollar 
                ? parseFloat(localOverrides.closingCostsDollar)
                : purchasePrice * flipClosingPercent;
              const flipRehabContingency = rehabCost * flipContingencyPercent;
              const flipTotalInvestment = purchasePrice + flipClosingCostsBuy + rehabCost + flipRehabContingency + (totalHoldingCosts || 0);
              const flipAgentCommission = arv * flipAgentPercent;
              const scoreNotaryFee = localOverrides.notaryFees ? parseFloat(localOverrides.notaryFees) : FINANCIAL_CONFIG.notaryFeePerSigning;
              const scoreTitleFee = localOverrides.titleFees ? parseFloat(localOverrides.titleFees) : FINANCIAL_CONFIG.titleFees;
              const flipNetProfit = arv - flipTotalInvestment - flipAgentCommission - (scoreNotaryFee * 2) - scoreTitleFee;
              const flipRoi = flipTotalInvestment > 0 ? (flipNetProfit / flipTotalInvestment) * 100 : 0;

              // Confidence-adjusted scoring: ARV and rehab uncertainty reduce the score
              const _arvConf = (arvAnalysisMemo?.confidence ?? 'green');
              const _rehabConf = (rehabAnalysisMemo?.confidence ?? 'high');
              const _arvFactor = _arvConf === 'green' ? 1.0 : _arvConf === 'yellow' ? 0.85 : 0.70;
              const _rehabFactor = _rehabConf === 'high' ? 1.0 : _rehabConf === 'medium' ? 0.88 : 0.75;
              const _confMultiplier = _arvFactor * _rehabFactor;

              // RENTAL metrics
              const rentalMonthlyCashflow = liveFinancials?.monthlyCashflow ?? 0;
              const rentalCashOnCash = (liveFinancials?.cashOnCashReturn ?? 0) * 100;
              // Cap Rate for scoring should use total investment (purchase + rehab), not just purchase price
              const rentalTotalBasis = purchasePrice + rehabCost;
              const rentalAnnualNoi = (liveFinancials?.yearlyNOI ?? 0);
              const rentalCapRate = rentalTotalBasis > 0 ? (rentalAnnualNoi / rentalTotalBasis) * 100 : 0;
              const rentalAnnualCashflow = rentalMonthlyCashflow * 12;
              
              // BRRRR metrics
              const brrrrHmlLtvPurchase = localOverrides.hmlLtvPurchasePercent 
                ? parseFloat(localOverrides.hmlLtvPurchasePercent) / 100 
                : loanDefaults.hmlLtvPurchasePercent / 100;
              const brrrrHmlLtvRehab = localOverrides.hmlLtvRehabPercent 
                ? parseFloat(localOverrides.hmlLtvRehabPercent) / 100 
                : loanDefaults.hmlLtvRehabPercent / 100;
              const brrrrHmlPointsPercent = localOverrides.hmlPointsPercent 
                ? parseFloat(localOverrides.hmlPointsPercent) / 100 
                : loanDefaults.hmlPointsPercent / 100;
              const brrrrHmlInterestRate = localOverrides.hmlInterestRate 
                ? parseFloat(localOverrides.hmlInterestRate) / 100 
                : loanDefaults.hmlInterestRate / 100;
              const brrrrHmlProcessingFee = localOverrides.hmlProcessingFee 
                ? parseFloat(localOverrides.hmlProcessingFee) 
                : loanDefaults.hmlProcessingFee;
              const brrrrRefiLtv = localOverrides.refiLtvPercent 
                ? parseFloat(localOverrides.refiLtvPercent) / 100 
                : loanDefaults.refiLtvPercent / 100;
              
              const brrrrHmlLoanPurchase = purchasePrice * brrrrHmlLtvPurchase;
              const brrrrHmlLoanRehab = rehabCost * brrrrHmlLtvRehab;
              const brrrrHmlTotalLoan = brrrrHmlLoanPurchase + brrrrHmlLoanRehab;
              const brrrrHmlPoints = brrrrHmlTotalLoan * brrrrHmlPointsPercent;
              const brrrrHmlInterest = brrrrHmlTotalLoan * (brrrrHmlInterestRate / 12) * flipRehabMonths;
              const brrrrNotaryFee = scoreNotaryFee;
              const brrrrTotalCashIn = (purchasePrice - brrrrHmlLoanPurchase) + (rehabCost - brrrrHmlLoanRehab) + flipClosingCostsBuy + brrrrHmlPoints + brrrrHmlProcessingFee + brrrrHmlInterest + (totalHoldingCosts || 0) + brrrrNotaryFee; // HML signing
              
              const brrrrRefiLoanAmount = arv * brrrrRefiLtv;
              const brrrrCashOut = brrrrRefiLoanAmount - brrrrHmlTotalLoan - (brrrrRefiLoanAmount * 0.02) - brrrrNotaryFee; // 2% refi closing + refi signing
              const brrrrCashLeftInDeal = brrrrTotalCashIn - Math.max(0, brrrrCashOut);
              
              // BRRRR monthly cashflow (simplified)
              const refiTermMonths3 = (localOverrides.loanTermYears ? parseFloat(localOverrides.loanTermYears) : loanDefaults.loanTermYears) * 12;
              const brrrrMonthlyMortgage = brrrrRefiLoanAmount > 0
                ? brrrrRefiLoanAmount * ((loanDefaults.interestRate / 100 / 12) * Math.pow(1 + (loanDefaults.interestRate / 100 / 12), refiTermMonths3)) / (Math.pow(1 + (loanDefaults.interestRate / 100 / 12), refiTermMonths3) - 1)
                : 0;
              const brrrrNoi = rent - (liveFinancials?.monthlyExpenses ?? 0);
              const brrrrMonthlyCashflow = brrrrNoi - brrrrMonthlyMortgage;
              const brrrrCocReturn = brrrrCashLeftInDeal > 0 ? ((brrrrMonthlyCashflow * 12) / brrrrCashLeftInDeal) * 100 : (brrrrMonthlyCashflow > 0 ? 999 : 0);
              
              // Create strategy array with scores
              const strategies = [
                {
                  id: 'flip' as const,
                  name: 'Flip',
                  icon: <TrendingUp className="w-4 h-4" />,
                  color: 'orange',
                  primaryMetric: flipNetProfit,
                  primaryLabel: 'Net Profit',
                  primaryFormat: formatCurrency(flipNetProfit),
                  secondaryMetric: flipRoi,
                  secondaryLabel: 'ROI',
                  secondaryFormat: `${flipRoi.toFixed(1)}%`,
                  tertiaryLabel: `${flipRehabMonths}mo hold`,
                  // Net Profit warnings/success indicators
                  netProfitWarning: flipNetProfit < 25000,
                  netProfitSuccess: flipNetProfit >= 50000,
                  // Flip score 1-10 based on ROI %, penalised for low ARV/rehab confidence
                  score: (() => {
                    const roi = flipRoi;
                    let base: number;
                    if (roi >= 25) base = 10;
                    else if (roi >= 20) base = 9;
                    else if (roi >= 18) base = 8;
                    else if (roi >= 17) base = 7;
                    else if (roi >= 15) base = 6;
                    else if (roi >= 13) base = 5;
                    else if (roi >= 11) base = 4;
                    else if (roi >= 10) base = 3;
                    else if (roi >= 8) base = 2;
                    else base = 1;
                    return Math.max(1, Math.round(base * _confMultiplier));
                  })(),
                  isProfitable: flipNetProfit > 0,
                },
                {
                  id: 'rental' as const,
                  name: 'Rental',
                  icon: <Home className="w-4 h-4" />,
                  color: 'cyan',
                  primaryMetric: rentalMonthlyCashflow,
                  primaryLabel: 'Cashflow/mo',
                  primaryFormat: formatCurrency(rentalMonthlyCashflow),
                  secondaryMetric: rentalCashOnCash,
                  secondaryLabel: 'CoC',
                  secondaryFormat: `${rentalCashOnCash.toFixed(1)}%`,
                  tertiaryLabel: `${rentalCapRate.toFixed(1)}% Cap`,
                  // Rental score 1-10 based on Cap Rate (cash deal, no financing)
                  // ≤3% = 1, 3-5% = 2-3, 5-7% = 3-5, 6-7% = 6 (bad rentals end here)
                  // 8% = 7, 9-11% = 8, 12-15% = 9, ≥15% = 10
                  score: (() => {
                    const cap = rentalCapRate; // Already in % (e.g., 8.5 = 8.5%)
                    if (cap >= 15) return 10;
                    if (cap >= 12) return 9;
                    if (cap >= 9) return 8;
                    if (cap >= 8) return 7;
                    if (cap >= 7) return 6;
                    if (cap >= 6) return 5;
                    if (cap >= 5) return 3;
                    if (cap >= 3) return 2;
                    return 1;
                  })(),
                  isProfitable: rentalMonthlyCashflow > 0,
                },
                (() => {
                  // Calculate BRRRR scores for 3 parameters
                  const cashLeft = brrrrCashLeftInDeal;
                  let moneyScore = 1;
                  if (cashLeft <= 0) moneyScore = 10;
                  else if (cashLeft <= 10000) moneyScore = 9;
                  else if (cashLeft <= 20000) moneyScore = 8;
                  else if (cashLeft <= 30000) moneyScore = 7;
                  else if (cashLeft <= 40000) moneyScore = 6;
                  else if (cashLeft <= 50000) moneyScore = 5;
                  else if (cashLeft <= 60000) moneyScore = 4;
                  else moneyScore = 2;
                  
                  const cf = brrrrMonthlyCashflow;
                  let cashflowScore = 1;
                  if (cf >= 300) cashflowScore = 10;
                  else if (cf >= 275) cashflowScore = 9;
                  else if (cf >= 250) cashflowScore = 8;
                  else if (cf >= 200) cashflowScore = 7;
                  else if (cf >= 150) cashflowScore = 6;
                  else if (cf >= 100) cashflowScore = 5;
                  else if (cf >= 50) cashflowScore = 4;
                  else if (cf >= 0) cashflowScore = 3;
                  else cashflowScore = 2;
                  
                  const brrrrEquity = arv - brrrrRefiLoanAmount - cashLeft;
                  let equityScore = 1;
                  if (brrrrEquity >= 100000) equityScore = 10;
                  else if (brrrrEquity >= 80000) equityScore = 9;
                  else if (brrrrEquity >= 60000) equityScore = 8;
                  else if (brrrrEquity >= 45000) equityScore = 7;
                  else if (brrrrEquity >= 35000) equityScore = 6;
                  else if (brrrrEquity >= 30000) equityScore = 5;
                  else if (brrrrEquity >= 20000) equityScore = 4;
                  else if (brrrrEquity >= 10000) equityScore = 3;
                  else equityScore = 2;
                  
                  const minScore = Math.min(moneyScore, cashflowScore, equityScore);
                  const avgScore = Math.round((moneyScore + cashflowScore + equityScore) / 3);
                  const finalScore = minScore < 7 ? Math.min(avgScore, 6) : avgScore;
                  
                  return {
                    id: 'brrrr' as const,
                    name: 'BRRRR',
                    icon: <RefreshCw className="w-4 h-4" />,
                    color: 'purple',
                    primaryMetric: brrrrCashLeftInDeal,
                    primaryLabel: 'Cash Left',
                    primaryFormat: formatCurrency(brrrrCashLeftInDeal),
                    secondaryMetric: brrrrCocReturn,
                    secondaryLabel: 'CoC',
                    secondaryFormat: brrrrCocReturn > 100 ? '∞' : `${brrrrCocReturn.toFixed(1)}%`,
                    tertiaryLabel: `${formatCurrency(brrrrMonthlyCashflow)}/mo`,
                    score: finalScore,
                    isProfitable: brrrrMonthlyCashflow > 0,
                    // BRRRR breakdown for tooltip
                    scoreBreakdown: {
                      moneyInDeal: { score: moneyScore, value: cashLeft },
                      cashflow: { score: cashflowScore, value: cf },
                      equity: { score: equityScore, value: brrrrEquity },
                      isMarginal: minScore < 7,
                    },
                  };
                })(),
              ];
              
              // Sort by score (descending), then by primary metric
              const rankedStrategies = [...strategies].sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                // For flip, higher profit is better; for rental/brrrr, cashflow matters
                if (a.id === 'flip') return b.primaryMetric - a.primaryMetric;
                return b.primaryMetric - a.primaryMetric;
              });
              
              const bestStrategy = rankedStrategies[0];
              
              // Check if ALL strategies score below 7 (no good strategy)
              const allBelowThreshold = strategies.every(s => s.score < 7);
              
              const colorMap: Record<string, string> = {
                orange: 'border-orange-500/50 bg-orange-500/10',
                cyan: 'border-cyan-500/50 bg-cyan-500/10',
                purple: 'border-purple-500/50 bg-purple-500/10',
                gray: 'border-muted-foreground/30 bg-muted/20',
              };
              const textColorMap: Record<string, string> = {
                orange: 'text-orange-400',
                cyan: 'text-cyan-400',
                purple: 'text-purple-400',
                gray: 'text-muted-foreground',
              };
              
              return (
                <Collapsible open={bestStrategyOpen} onOpenChange={setBestStrategyOpen}>
                  <Card className={cn("border", allBelowThreshold ? colorMap.gray : colorMap[bestStrategy.color])}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="pb-2 pt-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Calculator className={cn("w-4 h-4", allBelowThreshold ? textColorMap.gray : textColorMap[bestStrategy.color])} />
                          <span className={allBelowThreshold ? textColorMap.gray : textColorMap[bestStrategy.color]}>Best Strategy</span>
                          {allBelowThreshold ? (
                            <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-400 bg-red-500/10">
                              No Good Strategy
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={cn("text-[10px]", textColorMap[bestStrategy.color], `border-${bestStrategy.color}-500/50`)}>
                              {bestStrategy.name} Recommended
                            </Badge>
                          )}
                          {!bestStrategyOpen && !allBelowThreshold && (
                            <div className="flex items-center gap-2 ml-2 text-xs">
                              <span className={cn("font-bold", textColorMap[bestStrategy.color])}>
                                {bestStrategy.score}/10
                              </span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground">{bestStrategy.primaryLabel}:</span>
                              <span className={cn("font-bold", 
                                // For BRRRR, Cash Left should be red when high (bad), green when low (good)
                                bestStrategy.id === 'brrrr' 
                                  ? (bestStrategy.scoreBreakdown?.moneyInDeal?.value ?? 0) <= 20000 
                                    ? "text-emerald-400" 
                                    : (bestStrategy.scoreBreakdown?.moneyInDeal?.value ?? 0) <= 40000 
                                      ? "text-amber-400" 
                                      : "text-red-400"
                                  : bestStrategy.isProfitable ? "text-emerald-400" : "text-red-400"
                              )}>
                                {bestStrategy.primaryFormat}
                              </span>
                            </div>
                          )}
                          <div className="ml-auto">
                            {bestStrategyOpen ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </CardTitle>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="px-4 pb-3 pt-0">
                    <div className="space-y-2">
                      {rankedStrategies.map((strategy, index) => (
                        <div 
                          key={strategy.id}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded-lg transition-all",
                            index === 0 
                              ? cn("border", colorMap[strategy.color]) 
                              : "bg-muted/30 opacity-75"
                          )}
                        >
                          {/* Rank number */}
                          <div className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                            index === 0 
                              ? cn("bg-gradient-to-br", strategy.color === 'orange' ? 'from-orange-500 to-amber-600' : strategy.color === 'cyan' ? 'from-cyan-500 to-blue-600' : 'from-purple-500 to-pink-600', "text-white")
                              : "bg-muted text-muted-foreground"
                          )}>
                            {index + 1}
                          </div>
                          
                          {/* Icon and name */}
                          <div className={cn("flex items-center gap-1.5", index === 0 ? textColorMap[strategy.color] : "text-muted-foreground")}>
                            {strategy.icon}
                            <span className="font-medium text-xs">{strategy.name}</span>
                            {/* Show score badge for all strategies (1-10) with tooltip explaining criteria */}
                            {strategy.id === 'brrrr' && 'scoreBreakdown' in strategy ? (
                              <HoverCard openDelay={100} closeDelay={50}>
                                <HoverCardTrigger asChild>
                                  <Badge 
                                    variant="outline" 
                                    className={cn(
                                      "text-[9px] px-1.5 py-0 h-4 font-bold cursor-help",
                                      strategy.score >= 7 
                                        ? "border-green-500/50 text-green-400 bg-green-500/10" 
                                        : strategy.score >= 5 
                                          ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10"
                                          : "border-red-500/50 text-red-400 bg-red-500/10"
                                    )}
                                  >
                                    {strategy.score}/10
                                  </Badge>
                                </HoverCardTrigger>
                                <HoverCardContent side="bottom" align="start" className="w-56 p-3 text-xs">
                                  <div className="space-y-2">
                                    <div className="font-semibold text-foreground">BRRRR Score Breakdown</div>
                                    <div className="space-y-1.5">
                                      {(() => {
                                        const breakdown = (strategy as any).scoreBreakdown;
                                        const getScoreColor = (s: number) => s >= 7 ? "text-green-500" : s >= 5 ? "text-yellow-500" : "text-red-500";
                                        return (
                                          <>
                                            <div className="flex justify-between items-center">
                                              <span className="text-muted-foreground">Money In Deal</span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground text-[10px]">{formatCurrency(breakdown.moneyInDeal.value)}</span>
                                                <span className={cn("font-bold", getScoreColor(breakdown.moneyInDeal.score))}>{breakdown.moneyInDeal.score}/10</span>
                                              </div>
                                            </div>
                                            <div className="flex justify-between items-center">
                                              <span className="text-muted-foreground">Cashflow</span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground text-[10px]">{formatCurrency(breakdown.cashflow.value)}/mo</span>
                                                <span className={cn("font-bold", getScoreColor(breakdown.cashflow.score))}>{breakdown.cashflow.score}/10</span>
                                              </div>
                                            </div>
                                            <div className="flex justify-between items-center">
                                              <span className="text-muted-foreground">Equity</span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground text-[10px]">{formatCurrency(breakdown.equity.value)}</span>
                                                <span className={cn("font-bold", getScoreColor(breakdown.equity.score))}>{breakdown.equity.score}/10</span>
                                              </div>
                                            </div>
                                          </>
                                        );
                                      })()}
                                    </div>
                                    {(strategy as any).scoreBreakdown.isMarginal && (
                                      <div className="text-[10px] text-yellow-500 pt-1 border-t border-border">
                                        {(strategy as any).scoreBreakdown.moneyInDeal.score === 0 
                                          ? "⚠️ Disqualified - Money in deal exceeds $50K"
                                          : "⚠️ Marginal deal - at least one parameter below 7"}
                                      </div>
                                    )}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            ) : (
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-[9px] px-1.5 py-0 h-4 font-bold",
                                  strategy.score >= 7 
                                    ? "border-green-500/50 text-green-400 bg-green-500/10" 
                                    : strategy.score >= 5 
                                      ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10"
                                      : "border-red-500/50 text-red-400 bg-red-500/10"
                                )}
                              >
                                {strategy.score}/10
                              </Badge>
                            )}
                          </div>
                          
                          {/* Metrics */}
                          <div className="flex-1 flex items-center justify-end gap-4 text-[11px]">
                            <div className="text-right flex items-center gap-1">
                              <span className="text-muted-foreground">{strategy.primaryLabel}: </span>
                              <span className={cn("font-semibold", strategy.isProfitable ? (index === 0 ? textColorMap[strategy.color] : "text-foreground") : "text-red-400")}>
                                {strategy.primaryFormat}
                              </span>
                              {/* Flip Net Profit warnings */}
                              {strategy.id === 'flip' && 'netProfitWarning' in strategy && strategy.netProfitWarning && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="w-3 h-3 text-yellow-400" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Net Profit under $25K - low margin
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {strategy.id === 'flip' && 'netProfitSuccess' in strategy && strategy.netProfitSuccess && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <TrendingUp className="w-3 h-3 text-green-400" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Net Profit over $50K - strong margin!
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <div className="text-right hidden sm:block">
                              <span className="text-muted-foreground">{strategy.secondaryLabel}: </span>
                              <span className={cn("font-semibold", strategy.isProfitable ? (index === 0 ? textColorMap[strategy.color] : "text-foreground") : "text-red-400")}>
                                {strategy.secondaryFormat}
                              </span>
                            </div>
                            <div className="text-muted-foreground text-[10px] hidden md:block w-16 text-right">
                              {strategy.tertiaryLabel}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })()}

            {/* Analysis Sections Container - uses CSS flexbox order for dynamic reordering */}
            <div className="flex flex-col gap-6">
            
            {/* ========================================== */}
            {/* FLIP ANALYSIS - order controlled by settings.analysisViewsOrder */}
            {/* ========================================== */}
            <Collapsible open={flipAnalysisOpen} onOpenChange={setFlipAnalysisOpen}>
              <Card className="border border-orange-500/30 bg-card/50" style={{ order: settings.analysisViewsOrder.indexOf('flip') }}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-orange-400" />
                        <span className="text-orange-400">Flip Analysis</span>
                        {!flipAnalysisOpen && (() => {
                          // Compute cash-deal summary using same formula as expanded section
                          const _cp = localOverrides.closingCostsPercent ? parseFloat(localOverrides.closingCostsPercent) / 100 : loanDefaults.closingCostsPercent / 100;
                          const _closing = localOverrides.closingCostsDollar ? parseFloat(localOverrides.closingCostsDollar) : purchasePrice * _cp;
                          const _contingency = rehabCost * (localOverrides.contingencyPercent ? parseFloat(localOverrides.contingencyPercent) / 100 : loanDefaults.contingencyPercent / 100);
                          const _totalInv = purchasePrice + _closing + rehabCost + _contingency + totalHoldingCosts;
                          const _agent = arv * (localOverrides.agentCommissionPercent ? parseFloat(localOverrides.agentCommissionPercent) / 100 : loanDefaults.agentCommissionPercent / 100);
                          const _notary = localOverrides.cashNotaryFee ? parseFloat(localOverrides.cashNotaryFee) : 400;
                          const _title = localOverrides.titleFees ? parseFloat(localOverrides.titleFees) : 500;
                          const _profit = arv - _totalInv - _agent - _notary - _title;
                          const _roi = _totalInv > 0 ? (_profit / _totalInv) * 100 : 0;
                          return (
                            <div className="flex items-center gap-3 ml-2 text-xs">
                              <span className="text-muted-foreground">Profit:</span>
                              <span className={cn("font-bold", _profit >= 30000 ? "text-emerald-400" : _profit >= 0 ? "text-amber-400" : "text-red-400")}>
                                {formatCurrency(_profit)}
                              </span>
                              <span className="text-muted-foreground">ROI:</span>
                              <span className={cn("font-bold", _roi >= 25 ? "text-emerald-400" : _roi >= 15 ? "text-amber-400" : "text-red-400")}>
                                {_roi.toFixed(1)}%
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            generateDealPDF({
                              deal,
                              apiData,
                              financials: liveFinancials!,
                              localOverrides,
                              arv,
                              rehabCost,
                              rent,
                              purchasePrice,
                            }, 'flip');
                          }}
                          className="h-7 px-2 text-xs text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                        >
                          <FileDown className="w-3 h-3 mr-1" />
                          Export
                        </Button>
                        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", flipAnalysisOpen && "rotate-180")} />
                      </div>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-3 pt-2">
                {(() => {
                  // Flip deal assumptions from overrides or loanDefaults from settings
                  const closingPercent = localOverrides.closingCostsPercent 
                    ? parseFloat(localOverrides.closingCostsPercent) / 100 
                    : loanDefaults.closingCostsPercent / 100;
                  const contingencyPercentVal = localOverrides.contingencyPercent 
                    ? parseFloat(localOverrides.contingencyPercent) / 100 
                    : loanDefaults.contingencyPercent / 100;
                  const agentPercentVal = localOverrides.agentCommissionPercent 
                    ? parseFloat(localOverrides.agentCommissionPercent) / 100 
                    : loanDefaults.agentCommissionPercent / 100;
                  const notaryFeesCalc = localOverrides.notaryFees 
                    ? parseFloat(localOverrides.notaryFees) 
                    : 500;
                  const titleFeesCalc = localOverrides.titleFees 
                    ? parseFloat(localOverrides.titleFees) 
                    : 500;
                  
                  // Closing can be % or $ - dollar overrides percentage
                  const closingCostsBuyCalc = localOverrides.closingCostsDollar 
                    ? parseFloat(localOverrides.closingCostsDollar)
                    : purchasePrice * closingPercent;
                  
                  // Recalculated values based on overrides
                  const rehabContingencyCalc = rehabCost * contingencyPercentVal;
                  const agentCommissionCalc = arv * agentPercentVal;
                  const totalSaleCostsWithLoan = agentCommissionCalc + notaryFeesCalc + titleFeesCalc;
                   const cashNotaryFee = localOverrides.cashNotaryFee 
                     ? parseFloat(localOverrides.cashNotaryFee) 
                     : 400;
                   const totalSaleCostsCash = agentCommissionCalc + titleFeesCalc + cashNotaryFee;
                  
                  // CASH DEAL calculations (no financing)
                  const cashTotalInvestment = purchasePrice + closingCostsBuyCalc + rehabCost + rehabContingencyCalc + totalHoldingCosts;
                  const cashNetProfit = arv - cashTotalInvestment - totalSaleCostsCash;
                  const cashRoi = cashTotalInvestment > 0 ? cashNetProfit / cashTotalInvestment : 0;
                  
                  // HML financing assumptions - from overrides or loanDefaults
                  const hmlLtvPurchase = localOverrides.hmlLtvPurchasePercent 
                    ? parseFloat(localOverrides.hmlLtvPurchasePercent) / 100 
                    : loanDefaults.hmlLtvPurchasePercent / 100;
                  const hmlLtvRehab = localOverrides.hmlLtvRehabPercent 
                    ? parseFloat(localOverrides.hmlLtvRehabPercent) / 100 
                    : loanDefaults.hmlLtvRehabPercent / 100;
                  const hmlPointsPercentVal = localOverrides.hmlPointsPercent 
                    ? parseFloat(localOverrides.hmlPointsPercent) / 100 
                    : loanDefaults.hmlPointsPercent / 100;
                  const hmlInterestRateVal = localOverrides.hmlInterestRate 
                    ? parseFloat(localOverrides.hmlInterestRate) / 100 
                    : loanDefaults.hmlInterestRate / 100;
                  const hmlProcessingFeeVal = localOverrides.hmlProcessingFee 
                    ? parseFloat(localOverrides.hmlProcessingFee) 
                    : loanDefaults.hmlProcessingFee;
                  const hmlAppraisalCostVal = localOverrides.hmlAppraisalCost 
                    ? parseFloat(localOverrides.hmlAppraisalCost) 
                    : 700;
                  const hmlUnderwritingFeeVal = localOverrides.hmlUnderwritingFee 
                    ? parseFloat(localOverrides.hmlUnderwritingFee) 
                    : 0;
                  const hmlOtherFeesVal = localOverrides.hmlOtherFees 
                    ? parseFloat(localOverrides.hmlOtherFees) 
                    : 0;
                   const hmlAnnualInsuranceVal = localOverrides.hmlAnnualInsurance 
                     ? parseFloat(localOverrides.hmlAnnualInsurance) 
                     : insuranceMonthly * 12;
                  const hmlAllFees = hmlProcessingFeeVal + hmlAppraisalCostVal + hmlUnderwritingFeeVal + hmlOtherFeesVal;
                  
                  // HML Loan amounts
                  const hmlIsLtv = localOverrides.hmlLoanType === 'ltv';
                  const hmlDefaultRehabLtv = hmlIsLtv ? 0 : loanDefaults.hmlLtvRehabPercent / 100;
                  const hmlEffectiveRehabLtv = localOverrides.hmlLtvRehabPercent ? hmlLtvRehab : hmlDefaultRehabLtv;
                  const hmlLoanPurchase = hmlIsLtv ? arv * hmlLtvPurchase : purchasePrice * hmlLtvPurchase;
                  const hmlLoanRehab = rehabCost * hmlEffectiveRehabLtv;
                  const hmlTotalLoan = hmlLoanPurchase + hmlLoanRehab;
                  
                  // HML Loan costs
                  const hmlPoints = hmlTotalLoan * hmlPointsPercentVal;
                  const hmlMonthlyInterest = hmlTotalLoan * (hmlInterestRateVal / 12);
                  const hmlTotalInterest = hmlMonthlyInterest * rehabMonths;
                  const hmlTotalLoanCost = hmlPoints + hmlAllFees + hmlTotalInterest;
                  
                  // HML holding costs exclude insurance (paid annually upfront in Acquisition)
                  const holdingOtherMonthlyVal = localOverrides.holdingOtherMonthly ? parseFloat(localOverrides.holdingOtherMonthly) : 0;
                  const hmlMonthlyHoldingCost = propertyTaxMonthly + stateTaxMonthly + hoaMonthly + utilitiesMonthly + holdingOtherMonthlyVal;
                  const hmlTotalHoldingCosts = hmlMonthlyHoldingCost * rehabMonths;
                  
                  // HML Total investment
                  const hmlTotalInvestment = purchasePrice + rehabCost + rehabContingencyCalc + closingCostsBuyCalc + hmlTotalHoldingCosts + hmlTotalLoanCost + hmlAnnualInsuranceVal;
                  
                   // HML Cash to Close = down payments + closing + contingency + holding (no insurance) + HML fees + insurance (annual) + HML interest
                  const hmlCashToClose = (purchasePrice - hmlLoanPurchase) + (rehabCost - hmlLoanRehab) + closingCostsBuyCalc + rehabContingencyCalc + hmlTotalHoldingCosts + hmlPoints + hmlAllFees + hmlAnnualInsuranceVal + hmlTotalInterest;
                  
                  // HML Cash out of pocket = Cash to Close
                  const hmlCashOutOfPocket = hmlCashToClose;
                  
                   // HML Net profit and ROI
                   // Total HML Payoff = principal only (interest already included in Cash to Close)
                   const hmlTotalPayoff = hmlTotalLoan;
                   const hmlClosingCostSale = localOverrides.closingCostsDollar ? parseFloat(localOverrides.closingCostsDollar) : 1000;
                   const hmlNetProfit = arv - hmlTotalPayoff - hmlCashOutOfPocket - hmlClosingCostSale - notaryFeesCalc - agentCommissionCalc;
                  const hmlRoi = hmlCashOutOfPocket > 0 ? hmlNetProfit / hmlCashOutOfPocket : 0;
                  
                  return (
                    <div className="space-y-4">
                      {/* Top Section - Cash Deal Analysis (3 columns) */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                        {/* Column 1 - Acquisition Costs */}
                        <div className="space-y-1.5">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">
                            Acquisition Costs
                          </h4>
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Purchase Price</span>
                              <span className="font-medium">{formatCurrency(purchasePrice)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">Closing</span>
                                {(localOverrides.closingCostsPercent || localOverrides.closingCostsDollar) && (
                                  <button onClick={() => { handleResetOverride('closingCostsPercent'); handleResetOverride('closingCostsDollar'); }} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                                <span className="text-muted-foreground">(</span>
                                <Input type="text" inputMode="numeric" value={localOverrides.closingCostsPercent || loanDefaults.closingCostsPercent.toString()} onChange={(e) => { handleOverrideChange('closingCostsPercent', e.target.value); if (e.target.value) handleOverrideChange('closingCostsDollar', ''); }} className={cn("w-7 h-5 text-xs text-center px-0.5", localOverrides.closingCostsPercent && "border-accent/50 bg-accent/5")} />
                                <span className="text-muted-foreground">%</span>
                                <span className="text-muted-foreground mx-0.5">|</span>
                                <span className="text-muted-foreground">$</span>
                                <Input type="text" inputMode="numeric" value={localOverrides.closingCostsDollar || ''} placeholder="—" onChange={(e) => { handleOverrideChange('closingCostsDollar', e.target.value); if (e.target.value) handleOverrideChange('closingCostsPercent', ''); }} className={cn("w-12 h-5 text-xs text-right px-0.5", localOverrides.closingCostsDollar && "border-accent/50 bg-accent/5")} />
                                <span className="text-muted-foreground">)</span>
                              </div>
                              <span className="font-medium">{formatCurrency(closingCostsBuyCalc)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Rehab</span>
                              <span className="font-medium text-amber-400">{formatCurrency(rehabCost)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">Contingency (</span>
                                {localOverrides.contingencyPercent && (
                                  <button onClick={() => handleResetOverride('contingencyPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                                <Input type="text" inputMode="numeric" value={localOverrides.contingencyPercent || loanDefaults.contingencyPercent.toString()} onChange={(e) => handleOverrideChange('contingencyPercent', e.target.value)} className={cn("w-8 h-5 text-xs text-center px-0.5", localOverrides.contingencyPercent && "border-accent/50 bg-accent/5")} />
                                <span className="text-muted-foreground">%)</span>
                              </div>
                              <span className="font-medium text-amber-400">{formatCurrency(rehabContingencyCalc)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-border">
                              <span className="font-semibold">Subtotal</span>
                              <span className="font-bold">{formatCurrency(purchasePrice + closingCostsBuyCalc + rehabCost + rehabContingencyCalc)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Column 2 - Holding Costs */}
                        <div className="space-y-1.5">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1 flex items-center gap-1">
                            Holding Costs
                            <span className="text-[10px] font-normal text-muted-foreground">(</span>
                            {localOverrides.holdingMonths && (
                              <button onClick={() => handleResetOverride('holdingMonths')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>
                            )}
                            <Input type="text" inputMode="numeric" value={localOverrides.holdingMonths || loanDefaults.holdingMonths.toString()} onChange={(e) => handleOverrideChange('holdingMonths', e.target.value)} className={cn("w-6 h-4 text-[10px] text-center px-0.5", localOverrides.holdingMonths && "border-accent/50 bg-accent/5")} />
                            <span className="text-[10px] font-normal text-muted-foreground">mo)</span>
                          </h4>
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Property Tax</span>
                              <div className="flex items-center gap-0.5">
                                {localOverrides.propertyTaxMonthly && (
                                  <button onClick={() => handleResetOverride('propertyTaxMonthly')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                                <span className="text-muted-foreground text-[10px]">$</span>
                                <Input type="text" inputMode="numeric" value={localOverrides.propertyTaxMonthly || Math.round((apiData.propertyTax ?? 0) / 12).toString()} onChange={(e) => handleOverrideChange('propertyTaxMonthly', e.target.value)} className={cn("w-10 h-5 text-xs text-right px-0.5", localOverrides.propertyTaxMonthly && "border-accent/50 bg-accent/5")} />
                                <span className="text-muted-foreground text-[10px]">/mo</span>
                              </div>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Insurance</span>
                              <div className="flex items-center gap-0.5">
                                {localOverrides.insuranceMonthly && (
                                  <button onClick={() => handleResetOverride('insuranceMonthly')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                                <span className="text-muted-foreground text-[10px]">$</span>
                                <Input type="text" inputMode="numeric" value={localOverrides.insuranceMonthly || getEffectiveMonthlyInsurance(apiData.insurance).toString()} onChange={(e) => handleOverrideChange('insuranceMonthly', e.target.value)} className={cn("w-10 h-5 text-xs text-right px-0.5", localOverrides.insuranceMonthly && "border-accent/50 bg-accent/5")} />
                                <span className="text-muted-foreground text-[10px]">/mo</span>
                              </div>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Utilities</span>
                              <div className="flex items-center gap-0.5">
                                {localOverrides.utilitiesMonthly && (
                                  <button onClick={() => handleResetOverride('utilitiesMonthly')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                                <span className="text-muted-foreground text-[10px]">$</span>
                                <Input type="text" inputMode="numeric" value={localOverrides.utilitiesMonthly || '300'} onChange={(e) => handleOverrideChange('utilitiesMonthly', e.target.value)} className={cn("w-10 h-5 text-xs text-right px-0.5", localOverrides.utilitiesMonthly && "border-accent/50 bg-accent/5")} />
                                <span className="text-muted-foreground text-[10px]">/mo</span>
                              </div>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-border">
                              <span className="font-semibold">Monthly</span>
                              <span className="font-bold">{formatCurrency(monthlyHoldingCost)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="font-semibold">Total ({rehabMonths}mo)</span>
                              <span className="font-bold text-amber-400">{formatCurrency(totalHoldingCosts)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Column 3 - Sale & Profit (Cash Deal) */}
                        <div className="space-y-1.5">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">
                            Sale & Profit (Cash)
                          </h4>
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">ARV</span>
                              <span className="font-medium text-emerald-400">{formatCurrency(arv)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">Agent (</span>
                                {localOverrides.agentCommissionPercent && (
                                  <button onClick={() => handleResetOverride('agentCommissionPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                                <Input type="text" inputMode="numeric" value={localOverrides.agentCommissionPercent || loanDefaults.agentCommissionPercent.toString()} onChange={(e) => handleOverrideChange('agentCommissionPercent', e.target.value)} className={cn("w-8 h-5 text-xs text-center px-0.5", localOverrides.agentCommissionPercent && "border-accent/50 bg-accent/5")} />
                                <span className="text-muted-foreground">%)</span>
                              </div>
                              <span className="font-medium">{formatCurrency(agentCommissionCalc)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">Title</span>
                                {localOverrides.titleFees && (
                                  <button onClick={() => handleResetOverride('titleFees')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground text-[10px]">$</span>
                                <Input type="text" inputMode="numeric" value={localOverrides.titleFees || '500'} onChange={(e) => handleOverrideChange('titleFees', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-1", localOverrides.titleFees && "border-accent/50 bg-accent/5")} />
                              </div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">Notary</span>
                                {localOverrides.cashNotaryFee && (
                                  <button onClick={() => handleResetOverride('cashNotaryFee')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground text-[10px]">$</span>
                                <Input type="text" inputMode="numeric" value={localOverrides.cashNotaryFee || '400'} onChange={(e) => handleOverrideChange('cashNotaryFee', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-1", localOverrides.cashNotaryFee && "border-accent/50 bg-accent/5")} />
                              </div>
                            </div>
                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <div className="flex justify-between items-center cursor-pointer group">
                                  <span className="text-muted-foreground flex items-center gap-1">
                                    Total Investment
                                    <ChevronDown className="w-3 h-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                  </span>
                                  <span className="font-medium text-amber-400">{formatCurrency(cashTotalInvestment)}</span>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="ml-2 mt-1 space-y-0.5 text-[11px] border-l-2 border-amber-500/20 pl-2">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Purchase Price</span>
                                    <span>{formatCurrency(purchasePrice)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Closing (Buy)</span>
                                    <span>{formatCurrency(closingCostsBuyCalc)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Rehab</span>
                                    <span>{formatCurrency(rehabCost)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Contingency</span>
                                    <span>{formatCurrency(rehabContingencyCalc)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Holding Costs</span>
                                    <span>{formatCurrency(totalHoldingCosts)}</span>
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                            <div className="flex justify-between items-center pt-2 mt-2 border-t border-border">
                              <span className="font-semibold">Net Profit</span>
                              <span className={cn("font-bold text-lg", cashNetProfit >= 30000 ? "text-emerald-400" : cashNetProfit >= 0 ? "text-amber-400" : "text-red-400")}>
                                {formatCurrency(cashNetProfit)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="font-semibold">ROI</span>
                              <span className={cn("font-bold text-xl", cashRoi >= 0.25 ? "text-emerald-400" : cashRoi >= 0 ? "text-amber-400" : "text-red-400")}>
                                {formatPercent(cashRoi)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Section - HML Financing - Collapsible */}
                      <Collapsible>
                        <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 text-xs">
                          <CollapsibleTrigger asChild>
                            <div className="group p-3 cursor-pointer hover:bg-orange-500/5 transition-colors flex items-center justify-between">
                              <h4 className="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center gap-2">
                                🏦 With HML Financing
                              </h4>
                              <div className="flex items-center gap-3">
                                <span className={cn("font-bold", hmlNetProfit >= 30000 ? "text-emerald-400" : hmlNetProfit >= 0 ? "text-amber-400" : "text-red-400")}>
                                  {formatCurrency(hmlNetProfit)}
                                </span>
                                <span className={cn("font-bold", hmlRoi >= 0.25 ? "text-emerald-400" : hmlRoi >= 0 ? "text-amber-400" : "text-red-400")}>
                                  {formatPercent(hmlRoi)}
                                </span>
                                <ChevronDown className="w-3 h-3 text-orange-400 transition-transform group-data-[state=open]:rotate-180" />
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-3 pb-3 space-y-3">
                              {/* HML Inputs */}
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="flex flex-col p-2 rounded bg-background/50">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        const newType = localOverrides.hmlLoanType === 'ltv' ? 'ltc' : 'ltv';
                                        setLocalOverrides(prev => ({ ...prev, hmlLoanType: newType }));
                                        setIsOverridesDirty(true);
                                      }}
                                      className={cn(
                                        "text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer transition-colors",
                                        localOverrides.hmlLoanType === 'ltv' 
                                          ? "bg-orange-500/20 text-orange-400" 
                                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                                      )}
                                    >
                                      {localOverrides.hmlLoanType === 'ltv' ? 'LTV' : 'LTC'}
                                    </button>
                                    <span className="text-[10px] text-muted-foreground">
                                      {localOverrides.hmlLoanType === 'ltv' ? '(% of ARV)' : '(% of Price)'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-0.5 mt-0.5">
                                    <Input type="text" inputMode="numeric" value={localOverrides.hmlLtvPurchasePercent || loanDefaults.hmlLtvPurchasePercent.toString()} onChange={(e) => handleOverrideChange('hmlLtvPurchasePercent', e.target.value)} className={cn("w-14 h-5 text-xs text-center", localOverrides.hmlLtvPurchasePercent && "border-accent/50 bg-accent/5")} />
                                    <span className="text-[10px] text-muted-foreground">%</span>
                                    {localOverrides.hmlLtvPurchasePercent && (
                                      <button onClick={() => handleResetOverride('hmlLtvPurchasePercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                        <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col p-2 rounded bg-background/50">
                                  <span className="text-[10px] text-muted-foreground">Rehab LTV</span>
                                  <div className="flex items-center gap-0.5 mt-0.5">
                                    <Input type="text" inputMode="numeric" value={localOverrides.hmlLtvRehabPercent || (hmlIsLtv ? '0' : loanDefaults.hmlLtvRehabPercent.toString())} onChange={(e) => handleOverrideChange('hmlLtvRehabPercent', e.target.value)} className={cn("w-14 h-5 text-xs text-center", localOverrides.hmlLtvRehabPercent && "border-accent/50 bg-accent/5")} />
                                    <span className="text-[10px] text-muted-foreground">%</span>
                                    {localOverrides.hmlLtvRehabPercent && (
                                      <button onClick={() => handleResetOverride('hmlLtvRehabPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                        <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col p-2 rounded bg-background/50">
                                  <span className="text-[10px] text-muted-foreground">Points</span>
                                  <div className="flex items-center gap-0.5 mt-0.5">
                                    <Input type="text" inputMode="numeric" value={localOverrides.hmlPointsPercent || loanDefaults.hmlPointsPercent.toString()} onChange={(e) => handleOverrideChange('hmlPointsPercent', e.target.value)} className={cn("w-14 h-5 text-xs text-center", localOverrides.hmlPointsPercent && "border-accent/50 bg-accent/5")} />
                                    <span className="text-[10px] text-muted-foreground">%</span>
                                    {localOverrides.hmlPointsPercent && (
                                      <button onClick={() => handleResetOverride('hmlPointsPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                        <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col p-2 rounded bg-background/50">
                                  <span className="text-[10px] text-muted-foreground">Interest Rate</span>
                                  <div className="flex items-center gap-0.5 mt-0.5">
                                    <Input type="text" inputMode="numeric" value={localOverrides.hmlInterestRate || loanDefaults.hmlInterestRate.toString()} onChange={(e) => handleOverrideChange('hmlInterestRate', e.target.value)} className={cn("w-14 h-5 text-xs text-center", localOverrides.hmlInterestRate && "border-accent/50 bg-accent/5")} />
                                    <span className="text-[10px] text-muted-foreground">%</span>
                                    {localOverrides.hmlInterestRate && (
                                      <button onClick={() => handleResetOverride('hmlInterestRate')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                        <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* HML Layout - Acquisition + Sale & Profit */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                                {/* Acquisition Costs */}
                                <div className="space-y-1.5">
                                  <h5 className="text-xs font-semibold text-orange-400/70 uppercase tracking-wider border-b border-orange-500/20 pb-1">
                                    Acquisition Costs
                                  </h5>
                                  <div className="space-y-1">
                                    {/* Total HML - collapsible */}
                                    <Collapsible>
                                      <CollapsibleTrigger asChild>
                                        <div className="flex justify-between items-center cursor-pointer group">
                                          <span className="font-semibold text-orange-300 flex items-center gap-1">
                                            Total HML
                                            <span className="text-[10px] text-muted-foreground font-normal">({(hmlLtvPurchase * 100).toFixed(0)}% {hmlIsLtv ? 'ARV' : 'purchase'} + {(hmlEffectiveRehabLtv * 100).toFixed(0)}% rehab)</span>
                                            <ChevronDown className="w-3 h-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                          </span>
                                          <span className="font-bold text-orange-300">{formatCurrency(hmlTotalLoan)}</span>
                                        </div>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <div className="ml-2 mt-1 space-y-0.5 text-[11px] border-l-2 border-orange-500/20 pl-2">
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Loan on Purchase ({(hmlLtvPurchase * 100).toFixed(0)}% of {hmlIsLtv ? 'ARV' : 'Price'})</span>
                                            <span>{formatCurrency(hmlLoanPurchase)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Loan on Rehab ({(hmlEffectiveRehabLtv * 100).toFixed(0)}%)</span>
                                            <span>{formatCurrency(hmlLoanRehab)}</span>
                                          </div>
                                        </div>
                                      </CollapsibleContent>
                                    </Collapsible>

                                     {/* Cash to Close - collapsible */}
                                    <Collapsible>
                                      <CollapsibleTrigger asChild>
                                        <div className="flex justify-between items-center cursor-pointer group">
                                          <span className="font-semibold text-cyan-300 flex items-center gap-1">
                                            Cash to Close
                                            <ChevronDown className="w-3 h-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                          </span>
                                          <span className="font-bold text-cyan-300">{formatCurrency(hmlCashToClose)}</span>
                                        </div>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <div className="ml-2 mt-1 space-y-0.5 text-[11px] border-l-2 border-cyan-500/20 pl-2">
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Down (Purchase)</span>
                                            <span>{formatCurrency(purchasePrice - hmlLoanPurchase)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Down (Rehab)</span>
                                            <span>{formatCurrency(rehabCost - hmlLoanRehab)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Closing Costs (Buy)</span>
                                            <span>{formatCurrency(closingCostsBuyCalc)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Contingency</span>
                                            <span>{formatCurrency(rehabContingencyCalc)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Holding Costs ({rehabMonths}mo)</span>
                                            <span>{formatCurrency(hmlTotalHoldingCosts)}</span>
                                          </div>
                                          {/* HML Fees - nested collapsible */}
                                          <Collapsible>
                                            <CollapsibleTrigger asChild>
                                              <div className="flex justify-between cursor-pointer group">
                                                <span className="text-muted-foreground flex items-center gap-1">
                                                  HML Fees
                                                  <ChevronDown className="w-2.5 h-2.5 transition-transform group-data-[state=open]:rotate-180" />
                                                </span>
                                                <span>{formatCurrency(hmlPoints + hmlAllFees)}</span>
                                              </div>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                              <div className="ml-2 mt-0.5 space-y-0.5 text-[10px] border-l-2 border-orange-500/20 pl-2">
                                                <div className="flex justify-between">
                                                  <span className="text-muted-foreground">Points ({(hmlPointsPercentVal * 100).toFixed(1)}%)</span>
                                                  <span>{formatCurrency(hmlPoints)}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                  <div className="flex items-center gap-0.5">
                                                    <span className="text-muted-foreground">Processing Fee</span>
                                                    {localOverrides.hmlProcessingFee && (
                                                      <button onClick={(e) => { e.stopPropagation(); handleResetOverride('hmlProcessingFee'); }} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                                        <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                                      </button>
                                                    )}
                                                  </div>
                                                  <div className="flex items-center gap-0.5">
                                                    <span className="text-muted-foreground text-[10px]">$</span>
                                                    <Input type="text" inputMode="numeric" value={localOverrides.hmlProcessingFee || loanDefaults.hmlProcessingFee.toString()} onChange={(e) => handleOverrideChange('hmlProcessingFee', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.hmlProcessingFee && "border-accent/50 bg-accent/5")} />
                                                  </div>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                  <div className="flex items-center gap-0.5">
                                                    <span className="text-muted-foreground">Appraisal (BPO)</span>
                                                    {localOverrides.hmlAppraisalCost && (
                                                      <button onClick={(e) => { e.stopPropagation(); handleResetOverride('hmlAppraisalCost'); }} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                                        <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                                      </button>
                                                    )}
                                                  </div>
                                                  <div className="flex items-center gap-0.5">
                                                    <span className="text-muted-foreground text-[10px]">$</span>
                                                    <Input type="text" inputMode="numeric" value={localOverrides.hmlAppraisalCost || '700'} onChange={(e) => handleOverrideChange('hmlAppraisalCost', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.hmlAppraisalCost && "border-accent/50 bg-accent/5")} />
                                                  </div>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                  <div className="flex items-center gap-0.5">
                                                    <span className="text-muted-foreground">Underwriting</span>
                                                    {localOverrides.hmlUnderwritingFee && (
                                                      <button onClick={(e) => { e.stopPropagation(); handleResetOverride('hmlUnderwritingFee'); }} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                                        <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                                      </button>
                                                    )}
                                                  </div>
                                                  <div className="flex items-center gap-0.5">
                                                    <span className="text-muted-foreground text-[10px]">$</span>
                                                    <Input type="text" inputMode="numeric" value={localOverrides.hmlUnderwritingFee || '0'} onChange={(e) => handleOverrideChange('hmlUnderwritingFee', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.hmlUnderwritingFee && "border-accent/50 bg-accent/5")} />
                                                  </div>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                  <div className="flex items-center gap-0.5">
                                                    <span className="text-muted-foreground">Other Fees</span>
                                                    {localOverrides.hmlOtherFees && (
                                                      <button onClick={(e) => { e.stopPropagation(); handleResetOverride('hmlOtherFees'); }} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                                        <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                                      </button>
                                                    )}
                                                  </div>
                                                  <div className="flex items-center gap-0.5">
                                                    <span className="text-muted-foreground text-[10px]">$</span>
                                                    <Input type="text" inputMode="numeric" value={localOverrides.hmlOtherFees || '0'} onChange={(e) => handleOverrideChange('hmlOtherFees', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.hmlOtherFees && "border-accent/50 bg-accent/5")} />
                                                  </div>
                                                </div>
                                              </div>
                                            </CollapsibleContent>
                                          </Collapsible>
                                          {/* Insurance (Annual) inside Cash to Close */}
                                          <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-0.5">
                                              <span className="text-muted-foreground">Insurance (Annual)</span>
                                              {localOverrides.hmlAnnualInsurance && (
                                                <button onClick={(e) => { e.stopPropagation(); handleResetOverride('hmlAnnualInsurance'); }} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                                  <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                                </button>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-0.5">
                                              <span className="text-muted-foreground text-[10px]">$</span>
                                              <Input type="text" inputMode="numeric" value={localOverrides.hmlAnnualInsurance || Math.round(insuranceMonthly * 12).toString()} onChange={(e) => handleOverrideChange('hmlAnnualInsurance', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.hmlAnnualInsurance && "border-accent/50 bg-accent/5")} />
                                            </div>
                                          </div>
                                          {/* HML Loan Repayment (Interest) inside Cash to Close */}
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Loan Repayment ({rehabMonths}mo × {formatCurrency(hmlMonthlyInterest)}/mo)</span>
                                            <span>{formatCurrency(hmlTotalInterest)}</span>
                                          </div>
                                        </div>
                                      </CollapsibleContent>
                                    </Collapsible>
                                  </div>
                                </div>

                                {/* Sale & Profit */}
                                <div className="space-y-1.5">
                                  <h5 className="text-xs font-semibold text-orange-400/70 uppercase tracking-wider border-b border-orange-500/20 pb-1">
                                    Sale & Profit
                                  </h5>
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">ARV</span>
                                      <span className="font-medium text-emerald-400">{formatCurrency(arv)}</span>
                                    </div>

                                    {/* Total Investment - collapsible */}
                                    {(() => {
                                      const hmlClosingCostSaleVal = localOverrides.closingCostsDollar ? parseFloat(localOverrides.closingCostsDollar) : 1000;
                                      const notaryFeesCalcVal = localOverrides.notaryFees ? parseFloat(localOverrides.notaryFees) : 500;
                                      const hmlTotalInvestmentFull = hmlTotalPayoff + hmlCashOutOfPocket + agentCommissionCalc + notaryFeesCalcVal + hmlClosingCostSaleVal;
                                      return (
                                        <Collapsible>
                                          <CollapsibleTrigger asChild>
                                            <div className="flex justify-between items-center cursor-pointer group">
                                              <span className="font-semibold text-amber-400 flex items-center gap-1">
                                                Total Investment
                                                <ChevronDown className="w-3 h-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                              </span>
                                              <span className="font-bold text-amber-400">{formatCurrency(hmlTotalInvestmentFull)}</span>
                                            </div>
                                          </CollapsibleTrigger>
                                          <CollapsibleContent>
                                            <div className="ml-2 mt-1 space-y-0.5 text-[11px] border-l-2 border-amber-500/20 pl-2">
                                              <div className="flex justify-between">
                                                <span className="text-muted-foreground">HML Payoff (Principal)</span>
                                                <span>{formatCurrency(hmlTotalPayoff)}</span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span className="text-muted-foreground">Cash to Close</span>
                                                <span>{formatCurrency(hmlCashOutOfPocket)}</span>
                                              </div>
                                              <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-0.5">
                                                  <span className="text-muted-foreground">Agent ({(agentPercentVal * 100).toFixed(0)}%)</span>
                                                </div>
                                                <span>{formatCurrency(agentCommissionCalc)}</span>
                                              </div>
                                              <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-0.5">
                                                  <span className="text-muted-foreground">Notary</span>
                                                  {localOverrides.notaryFees && (
                                                    <button onClick={() => handleResetOverride('notaryFees')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                                      <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                                    </button>
                                                  )}
                                                </div>
                                                <div className="flex items-center gap-0.5">
                                                  <span className="text-muted-foreground text-[10px]">$</span>
                                                  <Input type="text" inputMode="numeric" value={localOverrides.notaryFees || '500'} onChange={(e) => handleOverrideChange('notaryFees', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.notaryFees && "border-accent/50 bg-accent/5")} />
                                                </div>
                                              </div>
                                              <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-0.5">
                                                  <span className="text-muted-foreground">Closing Costs (Sale)</span>
                                                  {localOverrides.closingCostsDollar && (
                                                    <button onClick={() => handleResetOverride('closingCostsDollar')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                                      <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                                    </button>
                                                  )}
                                                </div>
                                                <div className="flex items-center gap-0.5">
                                                  <span className="text-muted-foreground text-[10px]">$</span>
                                                  <Input type="text" inputMode="numeric" value={localOverrides.closingCostsDollar || '1000'} onChange={(e) => handleOverrideChange('closingCostsDollar', e.target.value)} className={cn("w-16 h-5 text-xs text-right px-0.5", localOverrides.closingCostsDollar && "border-accent/50 bg-accent/5")} />
                                                </div>
                                              </div>
                                            </div>
                                          </CollapsibleContent>
                                        </Collapsible>
                                      );
                                    })()}

                                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-orange-500/20">
                                      <span className="font-semibold">Net Profit</span>
                                      <span className={cn("font-bold text-lg", hmlNetProfit >= 30000 ? "text-emerald-400" : hmlNetProfit >= 0 ? "text-amber-400" : "text-red-400")}>
                                        {formatCurrency(hmlNetProfit)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="font-semibold">ROI</span>
                                      <span className="text-[10px] text-muted-foreground ml-1">(Net Profit / Cash to Close)</span>
                                      <span className={cn("font-bold text-xl ml-auto", hmlRoi >= 0.25 ? "text-emerald-400" : hmlRoi >= 0 ? "text-amber-400" : "text-red-400")}>
                                        {formatPercent(hmlRoi)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    </div>
                  );
                })()}
              </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* ========================================== */}
            {/* EXPANSION ANALYSIS - only for 3bd/1ba < 1100 sqft */}
            {/* ========================================== */}
            {apiData && (
              <ExpansionAnalysisCard
                isOpen={expansionAnalysisOpen}
                onOpenChange={setExpansionAnalysisOpen}
                apiData={apiData}
                arv={arv}
                rehabCost={rehabCost}
                purchasePrice={purchasePrice}
                rehabMonths={rehabMonths}
                monthlyHoldingCost={monthlyHoldingCost}
                flipNetProfit={flipNetProfit}
                loanDefaults={loanDefaults}
                localOverrides={localOverrides}
                orderIndex={settings.analysisViewsOrder.indexOf('flip') + 0.5}
              />
            )}

            {/* ========================================== */}
            {/* RENTAL ANALYSIS - order controlled by settings.analysisViewsOrder */}
            {/* ========================================== */}
            <Collapsible open={rentalAnalysisOpen} onOpenChange={setRentalAnalysisOpen}>
              <Card className="border border-cyan-500/30 bg-card/50" style={{ order: settings.analysisViewsOrder.indexOf('rental') }}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Home className="w-4 h-4 text-cyan-400" />
                        <span className="text-cyan-400">Rental Analysis</span>
                        {!rentalAnalysisOpen && (
                          <div className="flex items-center gap-3 ml-2 text-xs">
                            <span className="text-muted-foreground">NOI:</span>
                            <span className={cn("font-bold", rentalMonthlyNOI >= 200 ? "text-emerald-400" : rentalMonthlyNOI >= 0 ? "text-amber-400" : "text-red-400")}>
                              {formatCurrency(rentalMonthlyNOI)}/mo
                            </span>
                            <span className="text-muted-foreground">Cap Rate:</span>
                            <span className={cn("font-bold", rentalCapRate >= 8 ? "text-emerald-400" : rentalCapRate >= 6 ? "text-amber-400" : "text-red-400")}>
                              {rentalCapRate.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            generateDealPDF({
                              deal,
                              apiData,
                              financials: liveFinancials!,
                              localOverrides,
                              arv,
                              rehabCost,
                              rent,
                              purchasePrice,
                            }, 'rental');
                          }}
                          className="h-7 px-2 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                        >
                          <FileDown className="w-3 h-3 mr-1" />
                          Export
                        </Button>
                        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", rentalAnalysisOpen && "rotate-180")} />
                      </div>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-3 pt-2">
                {(() => {
                  // Rental-specific calculations - use loanDefaults from settings
                  const maintenanceVacancyRate = localOverrides.maintenanceVacancyPercent 
                    ? parseFloat(localOverrides.maintenanceVacancyPercent) / 100 
                    : loanDefaults.maintenanceVacancyPercent / 100;
                  const managementRate = localOverrides.propertyManagementPercent 
                    ? parseFloat(localOverrides.propertyManagementPercent) / 100 
                    : loanDefaults.propertyManagementPercent / 100;
                  const capexRate = localOverrides.capexPercent 
                    ? parseFloat(localOverrides.capexPercent) / 100 
                    : loanDefaults.capexPercent / 100;
                  
                  const grossMonthlyRent = rent;
                  
                  const maintenanceMonthly = grossMonthlyRent * maintenanceVacancyRate;
                  const managementMonthly = grossMonthlyRent * managementRate;
                  const capexMonthly = grossMonthlyRent * capexRate;
                  
                  // Rental uses its own insurance override, falling back to Flip's insurance value
                  const rentalInsurance = localOverrides.rentalInsuranceMonthly 
                    ? parseFloat(localOverrides.rentalInsuranceMonthly) 
                    : insuranceMonthly;
                  
                  const totalOperatingExpenses = propertyTaxMonthly + rentalInsurance + maintenanceMonthly + managementMonthly + capexMonthly;
                  const noi = grossMonthlyRent - totalOperatingExpenses;
                  
                  // Annual figures
                  const annualNoi = noi * 12;
                  
                  // Financing scenario - Loan = 70% of ARV
                  const financeInterestRate = localOverrides.interestRate 
                    ? parseFloat(localOverrides.interestRate) 
                    : loanDefaults.interestRate;
                  const financeLoanTermYears = localOverrides.loanTermYears 
                    ? parseInt(localOverrides.loanTermYears) 
                    : loanDefaults.loanTermYears;
                  
                  // Loan Amount = 70% of ARV
                  const loanLtvPercent = localOverrides.downPaymentPercent 
                    ? (100 - parseFloat(localOverrides.downPaymentPercent)) 
                    : 70;
                  const loanAmount = arv * (loanLtvPercent / 100);
                  const downPaymentAmount = arv - loanAmount;
                  const monthlyInterestRate = financeInterestRate / 100 / 12;
                  const numberOfPayments = financeLoanTermYears * 12;
                  
                  // Monthly mortgage payment (P&I or Interest-Only)
                  const isInterestOnly = localOverrides.rentalInterestOnly === 'true';
                  const financeMortgagePI = monthlyInterestRate > 0 
                    ? loanAmount * (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments)) / (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1)
                    : loanAmount / numberOfPayments;
                  const financeMortgageIO = loanAmount * monthlyInterestRate;
                  const financeMortgage = isInterestOnly ? financeMortgageIO : financeMortgagePI;
                  
                  // Loan fees & escrow
                  const rentalAppraisal = localOverrides.rentalAppraisalCost ? parseFloat(localOverrides.rentalAppraisalCost) : 1150;
                  const rentalUnderwriting = localOverrides.rentalUnderwritingFee ? parseFloat(localOverrides.rentalUnderwritingFee) : 750;
                  const rentalPointsPct = localOverrides.rentalPointsPercent ? parseFloat(localOverrides.rentalPointsPercent) : 1;
                  const rentalPointsAmount = loanAmount * (rentalPointsPct / 100);
                  const rentalOtherFeesVal = localOverrides.rentalOtherFees ? parseFloat(localOverrides.rentalOtherFees) : 3500;
                  const totalLoanFees = rentalAppraisal + rentalUnderwriting + rentalPointsAmount + rentalOtherFeesVal;
                  const loanFeesPercent = loanAmount > 0 ? (totalLoanFees / loanAmount) * 100 : 0;
                  
                  // Loan closing costs
                  const loanTitlePercent = 2; // 2% of ARV
                  const loanTitleCost = arv * (loanTitlePercent / 100);
                  const loanClosingNotary = localOverrides.notaryFees ? parseFloat(localOverrides.notaryFees) : 500;
                  const totalLoanClosingCost = loanTitleCost + loanClosingNotary;
                  
                  // Metrics
                  const flipTotalInv = derivedValues?.flipTotalInvestment ?? (purchasePrice + rehabCost);
                  const rentalCapRate = flipTotalInv > 0 ? (annualNoi / flipTotalInv) * 100 : 0;
                  const onePercentRule = flipTotalInv > 0 ? (grossMonthlyRent / flipTotalInv) * 100 : 0;
                  const grm = grossMonthlyRent > 0 ? flipTotalInv / (grossMonthlyRent * 12) : 0;

                  // Money in the Deal
                  const cashToBorrower = loanAmount - totalLoanFees - totalLoanClosingCost;
                  const moneyInDeal = Math.max(0, flipTotalInv - cashToBorrower);
                  
                  // Cash flow = Rent - Operating Expenses - Mortgage
                  const financeCashflowMonthly = noi - financeMortgage;
                  const financeCashflowAnnual = financeCashflowMonthly * 12;
                  // CoC = Annual Cashflow / Money in the Deal
                  const financeCoCReturn = moneyInDeal > 0 ? (financeCashflowAnnual / moneyInDeal) * 100 : 0;

                  return (
                    <div className="space-y-3">
                      {/* Top row: Gross Rent + Metrics */}
                      <div className="flex items-center justify-between text-xs border-b border-border pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Gross Rent:</span>
                          <span className="font-bold text-cyan-400 text-sm">{formatCurrency(grossMonthlyRent)}/mo</span>
                        </div>
                        <div className="flex gap-3">
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Cap Rate</p>
                            <p className={cn("font-bold text-xs", rentalCapRate >= 8 ? "text-emerald-400" : rentalCapRate >= 5 ? "text-amber-400" : "text-red-400")}>
                              {rentalCapRate.toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">1% Rule</p>
                            <p className={cn("font-bold text-xs", onePercentRule >= 1 ? "text-emerald-400" : "text-amber-400")}>
                              {onePercentRule.toFixed(2)}%
                            </p>
                          </div>
                          <div className="text-center group relative cursor-help">
                            <p className="text-[10px] text-muted-foreground">GRM</p>
                            <p className={cn("font-bold text-xs", grm <= 10 ? "text-emerald-400" : grm <= 15 ? "text-amber-400" : "text-red-400")}>
                              {grm.toFixed(1)}
                            </p>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-lg text-xs text-popover-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                              <p className="font-semibold mb-1">Gross Rent Multiplier</p>
                              <p className="text-muted-foreground">Total Investment / Annual Rent</p>
                              <p className="text-muted-foreground">Lower = Better (under 10 is great)</p>
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Annual NOI</p>
                            <p className={cn("font-bold text-xs", annualNoi >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {formatCurrency(annualNoi)}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Operating Expenses - Redesigned */}
                      <div className="text-xs">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Operating Expenses</h4>
                          <div className="flex-1 h-px bg-border" />
                          <span className="font-semibold text-red-400">{formatCurrency(totalOperatingExpenses)}/mo</span>
                          <span className="text-muted-foreground">|</span>
                          <span className="font-semibold">NOI</span>
                          <span className={cn("font-bold", noi >= 0 ? "text-emerald-400" : "text-red-400")}>{formatCurrency(noi)}/mo</span>
                        </div>
                        
                        {/* Fixed Expenses Row */}
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div className="flex items-center justify-between p-1.5 rounded bg-muted/30">
                            <span className="text-muted-foreground text-[11px]">Property Tax</span>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground text-[10px]">$</span>
                              <Input 
                                type="text" 
                                inputMode="numeric" 
                                value={localOverrides.propertyTaxMonthly || Math.round((apiData.propertyTax ?? 0) / 12).toString()} 
                                onChange={(e) => handleOverrideChange('propertyTaxMonthly', e.target.value)} 
                                className={cn("w-14 h-5 text-[11px] text-right px-1", localOverrides.propertyTaxMonthly && "border-accent/50 bg-accent/5")} 
                              />
                              {localOverrides.propertyTaxMonthly && (
                                <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => handleResetOverride('propertyTaxMonthly')} title="Reset">
                                  <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between p-1.5 rounded bg-muted/30">
                            <span className="text-muted-foreground text-[11px]">Insurance</span>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground text-[10px]">$</span>
                              <Input 
                                type="text" 
                                inputMode="numeric" 
                                value={localOverrides.rentalInsuranceMonthly || Math.round(insuranceMonthly).toString()} 
                                onChange={(e) => handleOverrideChange('rentalInsuranceMonthly', e.target.value)} 
                                className={cn("w-14 h-5 text-[11px] text-right px-1", localOverrides.rentalInsuranceMonthly && "border-accent/50 bg-accent/5")} 
                              />
                              {localOverrides.rentalInsuranceMonthly && (
                                <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => handleResetOverride('rentalInsuranceMonthly')} title="Reset">
                                  <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Percentage-Based Expenses */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex flex-col p-1.5 rounded bg-muted/30">
                            <span className="text-muted-foreground text-[10px] mb-1">CapEx</span>
                            <div className="flex items-center gap-1">
                              <Input 
                                type="text" 
                                inputMode="decimal" 
                                value={localOverrides.capexPercent || loanDefaults.capexPercent.toString()} 
                                onChange={(e) => handleOverrideChange('capexPercent', e.target.value)} 
                                className={cn("w-10 h-5 text-[11px] text-right px-1", localOverrides.capexPercent && "border-accent/50 bg-accent/5")} 
                              />
                              <span className="text-muted-foreground text-[10px]">%</span>
                              {localOverrides.capexPercent && (
                                <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => handleResetOverride('capexPercent')} title="Reset">
                                  <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                                </Button>
                              )}
                            </div>
                            <span className="text-foreground font-medium text-[11px] mt-0.5">{formatCurrency(capexMonthly)}</span>
                          </div>
                          <div className="flex flex-col p-1.5 rounded bg-muted/30">
                            <span className="text-muted-foreground text-[10px] mb-1">Maint+Vac</span>
                            <div className="flex items-center gap-1">
                              <Input 
                                type="text" 
                                inputMode="numeric" 
                                value={localOverrides.maintenanceVacancyPercent || loanDefaults.maintenanceVacancyPercent.toString()} 
                                onChange={(e) => handleOverrideChange('maintenanceVacancyPercent', e.target.value)} 
                                className={cn("w-10 h-5 text-[11px] text-right px-1", localOverrides.maintenanceVacancyPercent && "border-accent/50 bg-accent/5")} 
                              />
                              <span className="text-muted-foreground text-[10px]">%</span>
                              {localOverrides.maintenanceVacancyPercent && (
                                <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => handleResetOverride('maintenanceVacancyPercent')} title="Reset">
                                  <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                                </Button>
                              )}
                            </div>
                            <span className="text-foreground font-medium text-[11px] mt-0.5">{formatCurrency(maintenanceMonthly)}</span>
                          </div>
                          <div className="flex flex-col p-1.5 rounded bg-muted/30">
                            <span className="text-muted-foreground text-[10px] mb-1">Management</span>
                            <div className="flex items-center gap-1">
                              <Input 
                                type="text" 
                                inputMode="numeric" 
                                value={localOverrides.propertyManagementPercent || loanDefaults.propertyManagementPercent.toString()} 
                                onChange={(e) => handleOverrideChange('propertyManagementPercent', e.target.value)} 
                                className={cn("w-10 h-5 text-[11px] text-right px-1", localOverrides.propertyManagementPercent && "border-accent/50 bg-accent/5")} 
                              />
                              <span className="text-muted-foreground text-[10px]">%</span>
                              {localOverrides.propertyManagementPercent && (
                                <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => handleResetOverride('propertyManagementPercent')} title="Reset">
                                  <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                                </Button>
                              )}
                            </div>
                            <span className="text-foreground font-medium text-[11px] mt-0.5">{formatCurrency(managementMonthly)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Financing Section */}
                      <Collapsible>
                        <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs">
                          <CollapsibleTrigger asChild>
                            <div className="group p-2 cursor-pointer hover:bg-cyan-500/5 transition-colors flex items-center justify-between">
                              <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                                🏦 With Financing
                              </h4>
                              <div className="flex items-center gap-3">
                                <span className={cn("font-bold text-xs", financeCashflowMonthly >= 200 ? "text-emerald-400" : financeCashflowMonthly >= 0 ? "text-amber-400" : "text-red-400")}>
                                  {formatCurrency(financeCashflowMonthly)}/mo
                                </span>
                                <span className={cn("font-bold text-xs", financeCoCReturn >= 10 ? "text-emerald-400" : financeCoCReturn >= 6 ? "text-amber-400" : "text-red-400")}>
                                  {financeCoCReturn.toFixed(2)}%
                                </span>
                                <ChevronDown className="w-3 h-3 text-cyan-400 transition-transform group-data-[state=open]:rotate-180" />
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-2 pb-2 space-y-2">
                              {/* Inputs: Down + Rate + Term */}
                              <div className="flex flex-wrap gap-2 pb-1 border-b border-cyan-500/30">
                                <div className="flex items-center gap-0.5">
                                  <span className="text-muted-foreground text-[10px]">Down</span>
                                  <Input type="text" inputMode="numeric" value={localOverrides.downPaymentPercent || loanDefaults.downPaymentPercent.toString()} onChange={(e) => handleOverrideChange('downPaymentPercent', e.target.value)} className={cn("w-8 h-4 text-[11px] text-right px-0.5", localOverrides.downPaymentPercent && "border-accent/50 bg-accent/5")} />
                                  <span className="text-muted-foreground text-[10px]">%</span>
                                  {localOverrides.downPaymentPercent && (
                                    <button onClick={() => handleResetOverride('downPaymentPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                      <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <span className="text-muted-foreground text-[10px]">Rate</span>
                                  <Input type="text" inputMode="decimal" value={localOverrides.interestRate || loanDefaults.interestRate.toString()} onChange={(e) => handleOverrideChange('interestRate', e.target.value)} className={cn("w-8 h-4 text-[11px] text-right px-0.5", localOverrides.interestRate && "border-accent/50 bg-accent/5")} />
                                  <span className="text-muted-foreground text-[10px]">%</span>
                                  {localOverrides.interestRate && (
                                    <button onClick={() => handleResetOverride('interestRate')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                      <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <span className="text-muted-foreground text-[10px]">Term</span>
                                  <Input type="text" inputMode="numeric" value={localOverrides.loanTermYears || loanDefaults.loanTermYears.toString()} onChange={(e) => handleOverrideChange('loanTermYears', e.target.value)} className={cn("w-7 h-4 text-[11px] text-right px-0.5", localOverrides.loanTermYears && "border-accent/50 bg-accent/5")} />
                                  <span className="text-muted-foreground text-[10px]">yrs</span>
                                  {localOverrides.loanTermYears && (
                                    <button onClick={() => handleResetOverride('loanTermYears')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                      <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Loan Amount = 70% of ARV */}
                              <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">Loan Amount <span className="text-[10px]">({loanLtvPercent.toFixed(0)}% of ARV)</span></span>
                                  <span className="font-medium">{formatCurrency(loanAmount)}</span>
                                </div>
                                
                                {/* Loan Fees & Escrow - Collapsible */}
                                <Collapsible>
                                  <CollapsibleTrigger asChild>
                                    <div className="flex justify-between items-center cursor-pointer hover:bg-cyan-500/5 rounded px-1 -mx-1 group/fees">
                                      <span className="text-muted-foreground flex items-center gap-1">
                                        Loan Fees & Escrow <span className="text-[10px]">({loanFeesPercent.toFixed(1)}%)</span>
                                        <ChevronDown className="w-2.5 h-2.5 text-muted-foreground transition-transform group-data-[state=open]/fees:rotate-180" />
                                      </span>
                                      <span className="font-medium text-amber-400">{formatCurrency(totalLoanFees)}</span>
                                    </div>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="ml-2 mt-1 space-y-1 border-l-2 border-cyan-500/20 pl-2">
                                      {/* Appraisal */}
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-muted-foreground">Appraisal</span>
                                          {localOverrides.rentalAppraisalCost && (
                                            <button onClick={() => handleResetOverride('rentalAppraisalCost')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                              <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                            </button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-muted-foreground text-[10px]">$</span>
                                          <Input type="text" inputMode="numeric" value={localOverrides.rentalAppraisalCost || '1150'} onChange={(e) => handleOverrideChange('rentalAppraisalCost', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.rentalAppraisalCost && "border-accent/50 bg-accent/5")} />
                                        </div>
                                      </div>
                                      {/* Underwriting */}
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-muted-foreground">Underwriting</span>
                                          {localOverrides.rentalUnderwritingFee && (
                                            <button onClick={() => handleResetOverride('rentalUnderwritingFee')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                              <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                            </button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-muted-foreground text-[10px]">$</span>
                                          <Input type="text" inputMode="numeric" value={localOverrides.rentalUnderwritingFee || '750'} onChange={(e) => handleOverrideChange('rentalUnderwritingFee', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.rentalUnderwritingFee && "border-accent/50 bg-accent/5")} />
                                        </div>
                                      </div>
                                      {/* Points */}
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-muted-foreground">Points</span>
                                          {localOverrides.rentalPointsPercent && (
                                            <button onClick={() => handleResetOverride('rentalPointsPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                              <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                            </button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Input type="text" inputMode="decimal" value={localOverrides.rentalPointsPercent || '1'} onChange={(e) => handleOverrideChange('rentalPointsPercent', e.target.value)} className={cn("w-10 h-5 text-xs text-right px-0.5", localOverrides.rentalPointsPercent && "border-accent/50 bg-accent/5")} />
                                          <span className="text-muted-foreground text-[10px]">%</span>
                                          <span className="text-muted-foreground text-[10px]">= {formatCurrency(rentalPointsAmount)}</span>
                                        </div>
                                      </div>
                                      {/* Other Fees */}
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-muted-foreground">Other Fees</span>
                                          {localOverrides.rentalOtherFees && (
                                            <button onClick={() => handleResetOverride('rentalOtherFees')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                              <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                            </button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-muted-foreground text-[10px]">$</span>
                                          <Input type="text" inputMode="numeric" value={localOverrides.rentalOtherFees || '3500'} onChange={(e) => handleOverrideChange('rentalOtherFees', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.rentalOtherFees && "border-accent/50 bg-accent/5")} />
                                        </div>
                                      </div>
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>

                                {/* Loan Closing Cost - Collapsible */}
                                <Collapsible>
                                  <CollapsibleTrigger asChild>
                                    <div className="flex justify-between items-center cursor-pointer hover:bg-cyan-500/5 rounded px-1 -mx-1 group/lcc">
                                      <span className="text-muted-foreground flex items-center gap-1">
                                        Loan Closing Cost
                                        <ChevronDown className="w-2.5 h-2.5 text-muted-foreground transition-transform group-data-[state=open]/lcc:rotate-180" />
                                      </span>
                                      <span className="font-medium text-amber-400">{formatCurrency(totalLoanClosingCost)}</span>
                                    </div>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="ml-2 mt-1 space-y-1 border-l-2 border-cyan-500/20 pl-2">
                                      {/* Title */}
                                      <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Title <span className="text-[10px]">({loanTitlePercent}% of ARV)</span></span>
                                        <span className="font-medium">{formatCurrency(loanTitleCost)}</span>
                                      </div>
                                      {/* Notary */}
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-muted-foreground">Notary</span>
                                          {localOverrides.notaryFees && (
                                            <button onClick={() => handleResetOverride('notaryFees')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                              <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                            </button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-muted-foreground text-[10px]">$</span>
                                          <Input type="text" inputMode="numeric" value={localOverrides.notaryFees || '500'} onChange={(e) => handleOverrideChange('notaryFees', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.notaryFees && "border-accent/50 bg-accent/5")} />
                                        </div>
                                      </div>
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>

                              </div>

                              {/* Cash to Borrower - Collapsible */}
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <div className="flex justify-between items-center cursor-pointer hover:bg-cyan-500/5 rounded px-1 -mx-1 pt-1 border-t border-cyan-500/20 group/ctb">
                                    <span className="font-semibold text-emerald-400 flex items-center gap-1">
                                      Cash to Borrower
                                      <ChevronDown className="w-2.5 h-2.5 text-emerald-400 transition-transform group-data-[state=open]/ctb:rotate-180" />
                                    </span>
                                    <span className="font-bold text-emerald-400">{formatCurrency(loanAmount - totalLoanFees - totalLoanClosingCost)}</span>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="ml-2 mt-1 space-y-1 border-l-2 border-emerald-500/20 pl-2 text-xs">
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Loan Amount</span>
                                      <span className="font-medium">{formatCurrency(loanAmount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">- Loan Fees & Escrow</span>
                                      <span className="font-medium text-red-400">-{formatCurrency(totalLoanFees)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">- Loan Closing Cost</span>
                                      <span className="font-medium text-red-400">-{formatCurrency(totalLoanClosingCost)}</span>
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>

                              {/* Money in the Deal */}
                              <div className="flex justify-between items-center pt-1 border-t border-cyan-500/20">
                                <span className="font-semibold text-cyan-300">💰 Money in the Deal</span>
                                <span className={cn("font-bold text-lg", moneyInDeal <= 0 ? "text-emerald-400" : moneyInDeal <= 20000 ? "text-amber-400" : "text-cyan-300")}>
                                  {formatCurrency(moneyInDeal)}
                                </span>
                              </div>

                              {/* Rent */}
                              <div className="flex justify-between items-center pt-2 border-t border-cyan-500/20">
                                <span className="text-muted-foreground">Rent</span>
                                <span className="font-medium text-cyan-300">{formatCurrency(grossMonthlyRent)}/mo</span>
                              </div>

                              {/* Operating Expenses - Collapsible */}
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <div className="flex justify-between items-center cursor-pointer hover:bg-cyan-500/5 rounded px-1 -mx-1 group/opex">
                                    <span className="text-muted-foreground flex items-center gap-1">
                                      Operating Expenses
                                      <ChevronDown className="w-2.5 h-2.5 text-muted-foreground transition-transform group-data-[state=open]/opex:rotate-180" />
                                    </span>
                                    <span className="font-medium text-red-400">-{formatCurrency(totalOperatingExpenses)}/mo</span>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="ml-2 mt-1 space-y-1 border-l-2 border-cyan-500/20 pl-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Property Tax</span>
                                      <span className="font-medium">{formatCurrency(propertyTaxMonthly)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Insurance</span>
                                      <span className="font-medium">{formatCurrency(rentalInsurance)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Management ({(managementRate * 100).toFixed(0)}%)</span>
                                      <span className="font-medium">{formatCurrency(managementMonthly)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Maint+Vacancy ({(maintenanceVacancyRate * 100).toFixed(0)}%)</span>
                                      <span className="font-medium">{formatCurrency(maintenanceMonthly)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">CapEx ({(capexRate * 100).toFixed(0)}%)</span>
                                      <span className="font-medium">{formatCurrency(capexMonthly)}</span>
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>

                              {/* Mortgage with Interest-Only toggle */}
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Mortgage</span>
                                  <button
                                    onClick={() => handleOverrideChange('rentalInterestOnly', isInterestOnly ? '' : 'true')}
                                    className={cn(
                                      "text-[9px] px-1.5 py-0.5 rounded border transition-colors",
                                      isInterestOnly 
                                        ? "bg-amber-500/20 border-amber-500/50 text-amber-400" 
                                        : "bg-muted/30 border-border text-muted-foreground hover:border-cyan-500/50"
                                    )}
                                  >
                                    {isInterestOnly ? 'I/O' : 'P&I'}
                                  </button>
                                </div>
                                <span className="font-medium text-red-400">-{formatCurrency(financeMortgage)}/mo</span>
                              </div>

                              {/* Monthly Cashflow */}
                              <div className="flex justify-between items-center pt-1 border-t border-cyan-500/20">
                                <span className="font-medium">Monthly Cashflow</span>
                                <span className={cn("font-bold", financeCashflowMonthly >= 200 ? "text-emerald-400" : financeCashflowMonthly >= 0 ? "text-amber-400" : "text-red-400")}>
                                  {formatCurrency(financeCashflowMonthly)}/mo
                                </span>
                              </div>

                              {/* Cash-on-Cash Return */}
                              <div className="flex justify-between items-center pt-1 border-t border-cyan-500/30">
                                <span className="font-semibold">Cash-on-Cash Return</span>
                                <span className={cn("font-bold text-lg", financeCoCReturn >= 10 ? "text-emerald-400" : financeCoCReturn >= 6 ? "text-amber-400" : "text-red-400")}>
                                  {financeCoCReturn.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    </div>
                  );
                })()}
              </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* ========================================== */}
            {/* BRRRR ANALYSIS - order controlled by settings.analysisViewsOrder */}
            {/* ========================================== */}
            <Collapsible open={brrrrAnalysisOpen} onOpenChange={setBrrrrAnalysisOpen}>
              <Card className="border border-purple-500/30 bg-card/50" style={{ order: settings.analysisViewsOrder.indexOf('brrrr') }}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-purple-400" />
                        <span className="text-purple-400">BRRRR Analysis</span>
                        {!brrrrAnalysisOpen && (
                          <div className="flex items-center gap-3 ml-2 text-xs">
                            <span className="text-muted-foreground">Money in Deal:</span>
                            <span className={cn("font-bold", brrrrCashLeftInDeal <= 0 ? "text-emerald-400" : brrrrCashLeftInDeal <= 20000 ? "text-amber-400" : "text-cyan-400")}>
                              {formatCurrency(Math.max(0, brrrrCashLeftInDeal))}
                            </span>
                            <span className="text-muted-foreground">CF:</span>
                            <span className={cn("font-bold", brrrrMonthlyCashflow >= 200 ? "text-emerald-400" : brrrrMonthlyCashflow >= 0 ? "text-amber-400" : "text-red-400")}>
                              {formatCurrency(brrrrMonthlyCashflow)}/mo
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            generateDealPDF({
                              deal,
                              apiData,
                              financials: liveFinancials!,
                              localOverrides,
                              arv,
                              rehabCost,
                              rent,
                              purchasePrice,
                            }, 'brrrr');
                          }}
                          className="h-7 px-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                        >
                          <FileDown className="w-3 h-3 mr-1" />
                          Export
                        </Button>
                        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", brrrrAnalysisOpen && "rotate-180")} />
                      </div>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-3 pt-2">
                  {/* Investment Score Breakdown */}
                  {headerInvestmentScore && (
                    <div className="mb-4 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-purple-300">Investment Score</span>
                        <span className={cn(
                          "text-sm font-bold px-2 py-0.5 rounded",
                          headerInvestmentScore.decision === 'Buy'
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        )}>
                          {headerInvestmentScore.decision === 'Buy' ? '✓ Buy' : '✗ Pass'} · {headerInvestmentScore.finalScore.toFixed(1)}/10
                        </span>
                      </div>
                      {headerInvestmentScore.isFullBrrrr && (
                        <div className="px-2 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium text-center">
                          🎉 Full BRRRR — כל הכסף חזר! תשואה = ∞
                        </div>
                      )}
                      <div className="space-y-2">
                        {[
                          { label: 'Cash Flow', score: headerInvestmentScore.cashFlowScore, weight: 33, detail: `${formatCurrency(headerInvestmentScore.monthlyCashflow)}/mo · ${headerInvestmentScore.isFullBrrrr ? '∞ CoC' : headerInvestmentScore.annualReturnPct.toFixed(1) + '% CoC'}` },
                          { label: 'Equity',    score: headerInvestmentScore.equityScore,    weight: 33, detail: `${formatCurrency(headerInvestmentScore.trueEquity)} true equity` },
                          { label: 'Location',  score: headerInvestmentScore.locationScore,  weight: 34, detail: headerInvestmentScore.schoolTotal > 0 ? `Schools: ${headerInvestmentScore.schoolTotal.toFixed(1)}/15${headerInvestmentScore.inventoryMonths != null ? ` · Inv: ${headerInvestmentScore.inventoryMonths}mo` : ''}` : 'School data missing' },
                        ].map(({ label, score, weight, detail }) => (
                          <div key={label} className="flex items-center gap-2 text-xs">
                            <span className="w-20 text-muted-foreground shrink-0">{label} <span className="text-muted-foreground/50">{weight}%</span></span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all", score >= 7 ? "bg-emerald-500" : score >= 5 ? "bg-yellow-500" : "bg-red-500")}
                                style={{ width: `${score * 10}%` }}
                              />
                            </div>
                            <span className={cn("w-8 text-right font-medium shrink-0", score >= 7 ? "text-emerald-400" : score >= 5 ? "text-yellow-400" : "text-red-400")}>
                              {score.toFixed(1)}
                            </span>
                            <span className="text-muted-foreground truncate max-w-[140px]">{detail}</span>
                          </div>
                        ))}
                      </div>
                      {headerInvestmentScore.missingFields.length > 0 && (
                        <p className="text-xs text-orange-400 mt-2">⚠ Partial: {headerInvestmentScore.missingFields.join(', ')} missing</p>
                      )}
                    </div>
                  )}
                {(() => {
                  // BRRRR combines HML for acquisition + Refi loan for long-term hold
                  // Phase 1: HML acquisition (reuses Flip HML calculations)
                  const hmlLtvPurchase = localOverrides.hmlLtvPurchasePercent 
                    ? parseFloat(localOverrides.hmlLtvPurchasePercent) / 100 
                    : loanDefaults.hmlLtvPurchasePercent / 100;
                  const hmlLtvRehab = localOverrides.hmlLtvRehabPercent 
                    ? parseFloat(localOverrides.hmlLtvRehabPercent) / 100 
                    : loanDefaults.hmlLtvRehabPercent / 100;
                  const hmlPointsPercentVal = localOverrides.hmlPointsPercent 
                    ? parseFloat(localOverrides.hmlPointsPercent) / 100 
                    : loanDefaults.hmlPointsPercent / 100;
                  const hmlInterestRateVal = localOverrides.hmlInterestRate 
                    ? parseFloat(localOverrides.hmlInterestRate) / 100 
                    : loanDefaults.hmlInterestRate / 100;
                  const hmlProcessingFeeVal = localOverrides.hmlProcessingFee 
                    ? parseFloat(localOverrides.hmlProcessingFee) 
                    : loanDefaults.hmlProcessingFee;
                  const hmlAppraisalVal = localOverrides.hmlAppraisalCost ? parseFloat(localOverrides.hmlAppraisalCost) : 700;
                  const hmlUnderwritingVal = localOverrides.hmlUnderwritingFee ? parseFloat(localOverrides.hmlUnderwritingFee) : 0;
                  const hmlOtherFeesVal = localOverrides.hmlOtherFees ? parseFloat(localOverrides.hmlOtherFees) : 0;
                  const hmlAllFees = hmlProcessingFeeVal + hmlAppraisalVal + hmlUnderwritingVal + hmlOtherFeesVal;
                  
                  const closingPercent = localOverrides.closingCostsPercent 
                    ? parseFloat(localOverrides.closingCostsPercent) / 100 
                    : loanDefaults.closingCostsPercent / 100;
                  const contingencyPercentVal = localOverrides.contingencyPercent 
                    ? parseFloat(localOverrides.contingencyPercent) / 100 
                    : loanDefaults.contingencyPercent / 100;
                  
                  const closingCostsBuyCalc = localOverrides.closingCostsDollar 
                    ? parseFloat(localOverrides.closingCostsDollar)
                    : purchasePrice * closingPercent;
                  
                  const rehabContingencyCalc = rehabCost * contingencyPercentVal;
                  
                  // HML Loan calculations
                  const brrrrCardIsLtv = localOverrides.hmlLoanType === 'ltv';
                  const brrrrCardDefaultRehabLtv = brrrrCardIsLtv ? 0 : loanDefaults.hmlLtvRehabPercent / 100;
                  const brrrrCardEffectiveRehabLtv = localOverrides.hmlLtvRehabPercent ? hmlLtvRehab : brrrrCardDefaultRehabLtv;
                  const hmlLoanPurchase = brrrrCardIsLtv ? arv * hmlLtvPurchase : purchasePrice * hmlLtvPurchase;
                  const hmlLoanRehab = rehabCost * brrrrCardEffectiveRehabLtv;
                  const hmlTotalLoan = hmlLoanPurchase + hmlLoanRehab;
                  const hmlPoints = hmlTotalLoan * hmlPointsPercentVal;
                  const hmlMonthlyInterest = hmlTotalLoan * (hmlInterestRateVal / 12);
                  const hmlTotalInterest = hmlMonthlyInterest * rehabMonths;
                  
                   // Insurance (annual, paid upfront)
                   const brrrrHmlAnnualInsuranceVal = localOverrides.hmlAnnualInsurance 
                     ? parseFloat(localOverrides.hmlAnnualInsurance) 
                     : insuranceMonthly * 12;
                   
                   // HML holding costs exclude insurance (paid annually upfront in Cash to Close)
                   const holdingOtherMonthlyBrrrr = localOverrides.holdingOtherMonthly ? parseFloat(localOverrides.holdingOtherMonthly) : 0;
                   const brrrrHmlMonthlyHolding = propertyTaxMonthly + stateTaxMonthly + hoaMonthly + utilitiesMonthly + holdingOtherMonthlyBrrrr;
                   const brrrrHmlTotalHoldingCosts = brrrrHmlMonthlyHolding * rehabMonths;
                   
                   const isBrrrrCashPurchase = localOverrides.brrrrPhase1Type === 'cash';

                   // Cash to Close = down payments + closing + contingency + holding + HML fees + insurance (annual) + HML interest
                   const hmlCashToClose = (purchasePrice - hmlLoanPurchase) + (rehabCost - hmlLoanRehab) + closingCostsBuyCalc + rehabContingencyCalc + brrrrHmlTotalHoldingCosts + hmlPoints + hmlAllFees + brrrrHmlAnnualInsuranceVal + hmlTotalInterest;
                   // Cash purchase: full purchase + rehab + costs (no loan)
                   const cashPurchaseCashToClose = purchasePrice + rehabCost + closingCostsBuyCalc + rehabContingencyCalc + brrrrHmlTotalHoldingCosts + brrrrHmlAnnualInsuranceVal;
                   const totalCashOutOfPocket = isBrrrrCashPurchase ? cashPurchaseCashToClose : hmlCashToClose;

                   // HML Payoff = principal only (interest already included in Cash to Close)
                   const hmlTotalPayoff = isBrrrrCashPurchase ? 0 : hmlTotalLoan;
                  
                  // Phase 2: Refinance
                  const refiLtvPercentVal = localOverrides.refiLtvPercent 
                    ? parseFloat(localOverrides.refiLtvPercent) / 100 
                    : loanDefaults.refiLtvPercent / 100;
                  const refiLoanAmount = arv * refiLtvPercentVal;
                  
                  // Refi costs (same as rental: loan fees + closing costs)
                  const refiAppraisal = localOverrides.refiAppraisalCost ? parseFloat(localOverrides.refiAppraisalCost) : 1150;
                  const refiUnderwriting = localOverrides.refiUnderwritingFee ? parseFloat(localOverrides.refiUnderwritingFee) : 750;
                  const refiPointsPct = localOverrides.refiPointsPercent ? parseFloat(localOverrides.refiPointsPercent) : 1;
                  const refiPointsAmount = refiLoanAmount * (refiPointsPct / 100);
                  const refiOtherFeesVal = localOverrides.refiOtherFees ? parseFloat(localOverrides.refiOtherFees) : 3500;
                  const refiLoanFees = refiAppraisal + refiUnderwriting + refiPointsAmount + refiOtherFeesVal;
                  
                  const refiTitlePercent = 2;
                  const refiTitleCost = arv * (refiTitlePercent / 100);
                  const refiNotary = localOverrides.notaryFees ? parseFloat(localOverrides.notaryFees) : 500;
                  const refiClosingCosts = refiTitleCost + refiNotary;
                  const totalRefiCosts = refiLoanFees + refiClosingCosts;
                  
                   // Cash to Borrower = Loan Amount - Refi Costs
                   const cashToBorrower = refiLoanAmount - totalRefiCosts;
                   // Cash to Borrower After Paying HML = Cash to Borrower - Pay off to HML
                   const cashToBorrowerAfterHml = cashToBorrower - hmlTotalPayoff;
                   // Money in the Deal = Total Cash Out of Pocket - Cash to Borrower After Paying HML
                   const moneyInDeal = Math.max(0, totalCashOutOfPocket - Math.max(0, cashToBorrowerAfterHml));
                  
                  // Phase 3: Rent
                  const refiInterestRate = localOverrides.interestRate 
                    ? parseFloat(localOverrides.interestRate) 
                    : loanDefaults.interestRate;
                  const refiLoanTermYears = localOverrides.loanTermYears 
                    ? parseInt(localOverrides.loanTermYears) 
                    : loanDefaults.loanTermYears;
                  
                  const refiMonthlyInterestRate = refiInterestRate / 100 / 12;
                  const refiNumberOfPayments = refiLoanTermYears * 12;
                  
                  const isBrrrrInterestOnly = localOverrides.brrrrInterestOnly === 'true';
                  const refiMortgagePI = refiMonthlyInterestRate > 0 
                    ? refiLoanAmount * (refiMonthlyInterestRate * Math.pow(1 + refiMonthlyInterestRate, refiNumberOfPayments)) / (Math.pow(1 + refiMonthlyInterestRate, refiNumberOfPayments) - 1)
                    : refiLoanAmount / refiNumberOfPayments;
                  const refiMortgageIO = refiLoanAmount * refiMonthlyInterestRate;
                  const refiMortgage = isBrrrrInterestOnly ? refiMortgageIO : refiMortgagePI;
                  
                  const maintenanceVacancyRate = localOverrides.maintenanceVacancyPercent 
                    ? parseFloat(localOverrides.maintenanceVacancyPercent) / 100 
                    : loanDefaults.maintenanceVacancyPercent / 100;
                  const managementRate = localOverrides.propertyManagementPercent 
                    ? parseFloat(localOverrides.propertyManagementPercent) / 100 
                    : loanDefaults.propertyManagementPercent / 100;
                  const capexRate = localOverrides.capexPercent 
                    ? parseFloat(localOverrides.capexPercent) / 100 
                    : loanDefaults.capexPercent / 100;
                  
                  const grossMonthlyRent = rent;
                  const maintenanceMonthly = grossMonthlyRent * maintenanceVacancyRate;
                  const managementMonthly = grossMonthlyRent * managementRate;
                  const capexMonthly = grossMonthlyRent * capexRate;
                  
                  const totalOperatingExpenses = propertyTaxMonthly + insuranceMonthly + maintenanceMonthly + managementMonthly + capexMonthly;
                  
                  const brrrrCashflowMonthly = grossMonthlyRent - totalOperatingExpenses - refiMortgage;
                  const brrrrCashflowAnnual = brrrrCashflowMonthly * 12;
                  const brrrrCoCReturn = moneyInDeal > 0 ? (brrrrCashflowAnnual / moneyInDeal) * 100 : (brrrrCashflowAnnual > 0 ? Infinity : 0);

                  // === Target Money in Deal Slider ===
                  const sliderStep = 5000;
                  const sliderMax = 30000;
                  // Fixed refi costs (not dependent on loan amount)
                  const refiFixedCostsFull = refiAppraisal + refiUnderwriting + refiOtherFeesVal + refiTitleCost + refiNotary;
                  const refiPointsRate = refiPointsPct / 100;

                  // Reverse: given target moneyInDeal → required refi LTV%
                  const ltvForMoneyTarget = (target: number): number => {
                    const loan = (totalCashOutOfPocket + refiFixedCostsFull + hmlTotalPayoff - target) / (1 - refiPointsRate);
                    return Math.max(0, (loan / arv) * 100);
                  };

                  // Cashflow at a hypothetical loan amount
                  const cashflowAtLoan = (loan: number): number => {
                    const r = refiMonthlyInterestRate;
                    const n = refiNumberOfPayments;
                    const mortgage = isBrrrrInterestOnly
                      ? loan * r
                      : r > 0 ? loan * (r * Math.pow(1+r,n)) / (Math.pow(1+r,n)-1) : loan/n;
                    return grossMonthlyRent - totalOperatingExpenses - mortgage;
                  };

                  // Slider min: most cash you can pull while keeping cashflow ≥ 0 (or 80% LTV hard cap)
                  const breakEvenMortgageAmt = grossMonthlyRent - totalOperatingExpenses;
                  const hardMaxLoan = arv * 0.80;
                  const beLoan = breakEvenMortgageAmt > 0 && refiMonthlyInterestRate > 0
                    ? (isBrrrrInterestOnly
                        ? breakEvenMortgageAmt / refiMonthlyInterestRate
                        : breakEvenMortgageAmt * (Math.pow(1+refiMonthlyInterestRate, refiNumberOfPayments)-1) / (refiMonthlyInterestRate * Math.pow(1+refiMonthlyInterestRate, refiNumberOfPayments)))
                    : 0;
                  const effectiveMinLoan = Math.min(Math.max(beLoan, 0), hardMaxLoan);
                  const moneyAtMinLoan = totalCashOutOfPocket - Math.max(0, effectiveMinLoan*(1-refiPointsRate) - refiFixedCostsFull - hmlTotalPayoff);
                  const sliderMin = breakEvenMortgageAmt > 0
                    ? Math.floor(moneyAtMinLoan / sliderStep) * sliderStep
                    : 0;

                  // Current slider position (derived from current LTV/moneyInDeal)
                  const actualMoneyForSlider = totalCashOutOfPocket - Math.max(0, cashToBorrowerAfterHml);
                  const sliderValue = Math.max(sliderMin, Math.min(sliderMax, Math.round(actualMoneyForSlider / sliderStep) * sliderStep));

                  // Preview cashflow at slider position
                  const previewLoan = arv * ltvForMoneyTarget(sliderValue) / 100;
                  const previewCashflow = cashflowAtLoan(previewLoan);

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                      {/* Phase 1: Acquisition & Rehab */}
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider border-b border-orange-500/30 pb-1 flex items-center justify-between">
                          <span>Phase 1: Acquisition & Rehab</span>
                          <div className="flex items-center rounded overflow-hidden border border-orange-500/30 normal-case">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOverrideChange('brrrrPhase1Type', 'hml'); }}
                              className={cn("text-[10px] px-2 py-0.5 font-normal tracking-normal transition-colors", !isBrrrrCashPurchase ? "bg-orange-500/30 text-orange-300" : "text-muted-foreground hover:text-orange-300")}
                            >HML</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOverrideChange('brrrrPhase1Type', 'cash'); }}
                              className={cn("text-[10px] px-2 py-0.5 font-normal tracking-normal border-l border-orange-500/30 transition-colors", isBrrrrCashPurchase ? "bg-cyan-500/30 text-cyan-300" : "text-muted-foreground hover:text-cyan-300")}
                            >Cash</button>
                          </div>
                        </h4>
                        <div className="space-y-1">
                          {!isBrrrrCashPurchase ? (
                            /* HML mode - collapsible */
                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <div className="flex justify-between items-center cursor-pointer group">
                                  <span className="font-semibold text-orange-300 flex items-center gap-1">
                                    Total HML
                                    <ChevronDown className="w-3 h-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                  </span>
                                  <span className="font-bold text-orange-300">{formatCurrency(hmlTotalLoan)}</span>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="ml-2 mt-1 space-y-0.5 text-[11px] border-l-2 border-orange-500/20 pl-2">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Loan on Purchase ({(hmlLtvPurchase * 100).toFixed(0)}%)</span>
                                    <span>{formatCurrency(hmlLoanPurchase)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Loan on Rehab ({(brrrrCardEffectiveRehabLtv * 100).toFixed(0)}%)</span>
                                    <span>{formatCurrency(hmlLoanRehab)}</span>
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          ) : (
                            /* Cash purchase mode - collapsible breakdown */
                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <div className="flex justify-between items-center cursor-pointer group">
                                  <span className="font-semibold text-cyan-300 flex items-center gap-1">
                                    Total Investment
                                    <ChevronDown className="w-3 h-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                  </span>
                                  <span className="font-bold text-cyan-300">{formatCurrency(cashPurchaseCashToClose)}</span>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="ml-2 mt-1 space-y-0.5 text-[11px] border-l-2 border-cyan-500/20 pl-2">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Purchase Price</span>
                                    <span>{formatCurrency(purchasePrice)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Rehab Cost</span>
                                    <span>{formatCurrency(rehabCost)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Closing Costs</span>
                                    <span>{formatCurrency(closingCostsBuyCalc)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Contingency</span>
                                    <span>{formatCurrency(rehabContingencyCalc)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Holding Costs</span>
                                    <span>{formatCurrency(brrrrHmlTotalHoldingCosts)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Insurance (Annual)</span>
                                    <span>{formatCurrency(brrrrHmlAnnualInsuranceVal)}</span>
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          )}

                          {/* Total Cash Out of Pocket */}
                          <div className="flex justify-between items-center pt-1 border-t border-orange-500/20">
                            <span className="font-semibold text-cyan-400">Cash to Close</span>
                            <span className="font-bold text-cyan-400">{formatCurrency(totalCashOutOfPocket)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Phase 2: Refinance */}
                      <div className="space-y-1.5 p-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
                        <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider border-b border-purple-500/30 pb-1">
                          Phase 2: Refinance
                        </h4>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Loan Amount</span>
                            <div className="flex items-center gap-0.5">
                              <Input type="text" inputMode="decimal" value={localOverrides.refiLtvPercent || loanDefaults.refiLtvPercent.toString()} onChange={(e) => handleOverrideChange('refiLtvPercent', e.target.value)} className={cn("w-10 h-4 text-[11px] text-right px-0.5", localOverrides.refiLtvPercent && "border-accent/50 bg-accent/5")} />
                              <span className="text-muted-foreground text-[10px]">%</span>
                              {localOverrides.refiLtvPercent && (
                                <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => handleResetOverride('refiLtvPercent')} title="Reset">
                                  <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                </Button>
                              )}
                              <span className="font-medium text-purple-400 ml-0.5">{formatCurrency(refiLoanAmount)}</span>
                            </div>
                          </div>
                          {/* Refi Costs - collapsible */}
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <div className="flex justify-between items-center cursor-pointer group">
                                <span className="text-muted-foreground flex items-center gap-1">
                                  Refi Costs
                                  <ChevronDown className="w-2.5 h-2.5 transition-transform group-data-[state=open]:rotate-180" />
                                </span>
                                <span className="font-medium text-red-400">-{formatCurrency(totalRefiCosts)}</span>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-2 mt-1 space-y-0.5 text-[10px] border-l-2 border-purple-500/20 pl-2">
                                {/* Loan Fees & Escrow - expandable */}
                                <div
                                  className="flex justify-between cursor-pointer hover:bg-muted/30 rounded px-0.5 -mx-0.5"
                                  onClick={(e) => { e.stopPropagation(); setRefiFeesOpen(!refiFeesOpen); }}
                                >
                                  <span className="text-muted-foreground flex items-center gap-1">
                                    Loan Fees & Escrow <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", refiFeesOpen && "rotate-180")} />
                                  </span>
                                  <span>{formatCurrency(refiLoanFees)}</span>
                                </div>
                                {refiFeesOpen && (
                                  <div className="ml-2 space-y-0.5 border-l border-purple-500/10 pl-2">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Appraisal</span>
                                      <span>{formatCurrency(refiAppraisal)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Underwriting</span>
                                      <span>{formatCurrency(refiUnderwriting)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <div className="flex items-center gap-0.5">
                                        <span className="text-muted-foreground">Points (</span>
                                        {localOverrides.refiPointsPercent && (
                                          <button onClick={() => handleResetOverride('refiPointsPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                          </button>
                                        )}
                                        <Input type="text" inputMode="decimal" value={localOverrides.refiPointsPercent || '1'} onChange={(e) => handleOverrideChange('refiPointsPercent', e.target.value)} className={cn("w-10 h-4 text-[10px] text-center px-0.5", localOverrides.refiPointsPercent && "border-accent/50 bg-accent/5")} />
                                        <span className="text-muted-foreground">%)</span>
                                      </div>
                                      <span>{formatCurrency(refiPointsAmount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Other Fees</span>
                                      <span>{formatCurrency(refiOtherFeesVal)}</span>
                                    </div>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Title ({refiTitlePercent}%)</span>
                                  <span>{formatCurrency(refiTitleCost)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Notary</span>
                                  <span>{formatCurrency(refiNotary)}</span>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>

                          <div className="flex justify-between items-center pt-1 mt-1 border-t border-purple-500/20">
                            <span className="text-muted-foreground">Cash to Borrower</span>
                            <span className={cn("font-medium", cashToBorrower >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {formatCurrency(cashToBorrower)}
                            </span>
                          </div>
                          {!isBrrrrCashPurchase && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Pay Off to HML</span>
                              <span className="font-medium text-red-400">-{formatCurrency(hmlTotalPayoff)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{isBrrrrCashPurchase ? 'Net Cash from Refi' : 'Cash After Paying HML'}</span>
                            <span className={cn("font-medium", cashToBorrowerAfterHml >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {formatCurrency(cashToBorrowerAfterHml)}
                            </span>
                          </div>
                          
                          <div className="pt-2 mt-1 border-t border-purple-500/30 space-y-0.5">
                            <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                              <span>Cash to Close (Phase 1)</span>
                              <span>{formatCurrency(totalCashOutOfPocket)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                              <span>{isBrrrrCashPurchase ? 'Net Cash from Refi' : 'Cash After Paying HML'}</span>
                              <span className={cashToBorrowerAfterHml >= 0 ? "text-emerald-400" : "text-red-400"}>-{formatCurrency(Math.max(0, cashToBorrowerAfterHml))}</span>
                            </div>
                            <div className="flex justify-between items-center pt-0.5">
                              <span className="font-semibold">💰 Money in the Deal</span>
                              <span className={cn("font-bold text-lg", moneyInDeal <= 0 ? "text-emerald-400" : moneyInDeal <= 20000 ? "text-amber-400" : "text-cyan-400")}>
                                {formatCurrency(moneyInDeal)}
                              </span>
                            </div>
                          </div>
                          {moneyInDeal <= 0 && (
                            <div className="text-center text-emerald-400 text-[10px] font-semibold mt-1 p-1 bg-emerald-500/10 rounded">
                              ✨ Full Cash Out! All money recovered!
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Phase 3: Rent */}
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider border-b border-cyan-500/30 pb-1">
                          Phase 3: Rent
                        </h4>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Gross Rent</span>
                            <span className="font-medium text-cyan-400">{formatCurrency(grossMonthlyRent)}/mo</span>
                          </div>
                          
                          {/* Operating Expenses - collapsible */}
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <div className="flex justify-between items-center cursor-pointer group">
                                <span className="text-muted-foreground flex items-center gap-1">
                                  Operating Expenses
                                  <ChevronDown className="w-2.5 h-2.5 transition-transform group-data-[state=open]:rotate-180" />
                                </span>
                                <span className="font-medium text-red-400">-{formatCurrency(totalOperatingExpenses)}</span>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-2 mt-1 space-y-0.5 text-[10px] border-l-2 border-cyan-500/20 pl-2">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Property Tax</span>
                                  <span>{formatCurrency(propertyTaxMonthly)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Insurance</span>
                                  <span>{formatCurrency(insuranceMonthly)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Management ({(managementRate * 100).toFixed(0)}%)</span>
                                  <span>{formatCurrency(managementMonthly)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Maintenance ({(maintenanceVacancyRate * 100).toFixed(0)}%)</span>
                                  <span>{formatCurrency(maintenanceMonthly)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">CapEx ({(capexRate * 100).toFixed(0)}%)</span>
                                  <span>{formatCurrency(capexMonthly)}</span>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>

                          {/* Mortgage with P&I / IO toggle */}
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">Mortgage</span>
                              <button
                                onClick={() => {
                                  const newVal = isBrrrrInterestOnly ? '' : 'true';
                                  handleOverrideChange('brrrrInterestOnly', newVal);
                                }}
                                className={cn(
                                  "text-[9px] font-semibold px-1 py-0.5 rounded cursor-pointer transition-colors",
                                  isBrrrrInterestOnly 
                                    ? "bg-purple-500/20 text-purple-400" 
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                )}
                              >
                                {isBrrrrInterestOnly ? 'I/O' : 'P&I'}
                              </button>
                            </div>
                            <span className="font-medium text-red-400">-{formatCurrency(refiMortgage)}</span>
                          </div>

                          <div className="flex justify-between items-center pt-1 border-t border-cyan-500/30">
                            <span className="font-semibold">Monthly Cashflow</span>
                            <span className={cn("font-bold", brrrrCashflowMonthly >= 200 ? "text-emerald-400" : brrrrCashflowMonthly >= 0 ? "text-amber-400" : "text-red-400")}>
                              {formatCurrency(brrrrCashflowMonthly)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">Annual Cashflow</span>
                            <span className={cn("font-bold", brrrrCashflowAnnual >= 2400 ? "text-emerald-400" : brrrrCashflowAnnual >= 0 ? "text-amber-400" : "text-red-400")}>
                              {formatCurrency(brrrrCashflowAnnual)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-2 mt-2 border-t border-cyan-500/30">
                            <span className="font-semibold">Cash-on-Cash</span>
                            <span className={cn("font-bold text-xl", 
                              moneyInDeal <= 0 ? "text-emerald-400" : 
                              brrrrCoCReturn >= 20 ? "text-emerald-400" : 
                              brrrrCoCReturn >= 10 ? "text-amber-400" : "text-red-400"
                            )}>
                              {moneyInDeal <= 0 ? "∞" : `${brrrrCoCReturn.toFixed(1)}%`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Investment Decision Score ── */}
                {(() => {
                  const invScore = headerInvestmentScore;
                  const isBuy = invScore?.decision === 'Buy';
                  return (
                    <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-base">Investment Decision Score</h3>
                        {invScore ? (
                          <div className="flex items-center gap-3">
                            <span className="text-2xl font-bold">{invScore.finalScore.toFixed(1)}<span className="text-sm text-muted-foreground">/10</span></span>
                            <span className={cn("text-sm font-bold px-3 py-1 rounded-full border", isBuy ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-red-500/20 text-red-400 border-red-500/40")}>
                              {isBuy ? '✓ Buy' : '✗ Pass'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">N/A — missing data</span>
                        )}
                      </div>

                      {invScore && (
                        <div className="grid grid-cols-1 gap-3 text-sm">
                          {/* Cash Flow */}
                          <div className="rounded-lg border border-border bg-card/60 p-3 space-y-1.5">
                            <div className="flex justify-between font-medium">
                              <span>1. Cash Flow Score</span>
                              <span className={cn("font-bold", invScore.cashFlowScore >= 8 ? "text-emerald-400" : invScore.cashFlowScore >= 6 ? "text-amber-400" : "text-red-400")}>{invScore.cashFlowScore.toFixed(1)}/10</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground pl-2">
                              <span>Monthly cashflow</span>
                              <span>{formatCurrency(invScore.monthlyCashflow)}/mo → <span className="text-foreground">{invScore.monthlyCashFlowScore.toFixed(1)}</span></span>
                            </div>
                            <div className="flex justify-between text-muted-foreground pl-2">
                              <span>Annual CoC return</span>
                              <span>{invScore.annualReturnPct > 100 ? '∞' : `${invScore.annualReturnPct.toFixed(1)}%`} → <span className="text-foreground">{invScore.annualReturnScore.toFixed(1)}</span></span>
                            </div>
                          </div>

                          {/* Equity */}
                          <div className="rounded-lg border border-border bg-card/60 p-3 space-y-1.5">
                            <div className="flex justify-between font-medium">
                              <span>2. True Equity Score</span>
                              <span className={cn("font-bold", invScore.equityScore >= 8 ? "text-emerald-400" : invScore.equityScore >= 6 ? "text-amber-400" : "text-red-400")}>{invScore.equityScore.toFixed(1)}/10</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground pl-2">
                              <span>ARV − Purchase − Rehab</span>
                              <span>{formatCurrency(invScore.trueEquity)}</span>
                            </div>
                          </div>

                          {/* Location */}
                          <div className="rounded-lg border border-border bg-card/60 p-3 space-y-1.5">
                            <div className="flex justify-between font-medium">
                              <span>3. Location Score</span>
                              <span className={cn("font-bold", invScore.locationScore >= 8 ? "text-emerald-400" : invScore.locationScore >= 6 ? "text-amber-400" : "text-red-400")}>{invScore.locationScore.toFixed(1)}/10</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground pl-2">
                              <span>School score (cumulative)</span>
                              <span>{invScore.schoolTotal.toFixed(1)} → <span className="text-foreground">{invScore.schoolScore.toFixed(1)}</span></span>
                            </div>
                            {invScore.inventoryScore != null && (
                              <div className="flex justify-between text-muted-foreground pl-2">
                                <span>Inventory</span>
                                <span>{invScore.inventoryMonths} mo → <span className="text-foreground">{invScore.inventoryScore.toFixed(1)}</span></span>
                              </div>
                            )}
                            {invScore.inventoryScore == null && (
                              <div className="pl-2 text-xs text-muted-foreground/70 italic">Inventory not set — score based on schools only</div>
                            )}
                            <div className="flex items-center gap-2 pt-1.5">
                              <Label className="text-xs text-muted-foreground shrink-0">Inventory (months)</Label>
                              <Input
                                type="number"
                                placeholder="e.g. 4"
                                className="h-7 text-xs w-24"
                                value={localOverrides.inventoryMonths || ''}
                                onChange={e => setLocalOverrides(prev => ({ ...prev, inventoryMonths: e.target.value }))}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* ACQUISITION ENGINE */}
            {headerInvestmentScore && (
            <Collapsible open={acquisitionEngineOpen} onOpenChange={setAcquisitionEngineOpen}>
              <Card className="border border-emerald-500/30 bg-card/50">
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">Acquisition Engine</span>
                        {!acquisitionEngineOpen && (
                          <span className={cn(
                            "text-xs font-bold ml-1",
                            headerInvestmentScore.decision === 'Buy' ? "text-emerald-400" : "text-red-400"
                          )}>
                            {headerInvestmentScore.decision === 'Buy' ? '✓ Buy' : '✗ Pass'} · {headerInvestmentScore.finalScore.toFixed(1)}/10
                          </span>
                        )}
                      </div>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", acquisitionEngineOpen && "rotate-180")} />
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-4 pt-0 space-y-4">
                    {/* Verdict */}
                    <div className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      headerInvestmentScore.decision === 'Buy'
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-red-500/40 bg-red-500/10"
                    )}>
                      <div>
                        <p className={cn("text-2xl font-bold", headerInvestmentScore.decision === 'Buy' ? "text-emerald-400" : "text-red-400")}>
                          {headerInvestmentScore.decision === 'Buy' ? '✓ BUY' : '✗ PASS'}
                        </p>
                        {headerInvestmentScore.isFullBrrrr && (
                          <p className="text-xs text-emerald-300 font-semibold mt-0.5">🎉 Full BRRRR — ∞ תשואה על הכסף!</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">Threshold: ≥{(settings.investmentScoreSettings?.buyThreshold ?? 7).toFixed(1)} to Buy</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-foreground">{headerInvestmentScore.finalScore.toFixed(1)}</p>
                        <p className="text-xs text-muted-foreground">out of 10</p>
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="space-y-1">
                      <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", headerInvestmentScore.decision === 'Buy' ? "bg-emerald-500" : headerInvestmentScore.finalScore >= 5 ? "bg-yellow-500" : "bg-red-500")}
                          style={{ width: `${headerInvestmentScore.finalScore * 10}%` }}
                        />
                        {/* Threshold marker */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-white/50"
                          style={{ left: `${(settings.investmentScoreSettings?.buyThreshold ?? 7) * 10}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        <span className="text-white/50">← Buy threshold at {(settings.investmentScoreSettings?.buyThreshold ?? 7).toFixed(1)}</span>
                        <span>10</span>
                      </div>
                    </div>

                    {/* Component breakdown */}
                    <div className="space-y-3">
                      {[
                        {
                          label: 'Cash Flow', score: headerInvestmentScore.cashFlowScore, weight: settings.investmentScoreSettings?.cashFlowWeight ?? 33,
                          lines: [
                            `Monthly CF: ${formatCurrency(headerInvestmentScore.monthlyCashflow)}/mo → ${headerInvestmentScore.monthlyCashFlowScore.toFixed(1)}/10`,
                            `Annual CoC: ${headerInvestmentScore.annualReturnPct >= 100 ? '∞ (full BRRRR)' : headerInvestmentScore.annualReturnPct.toFixed(1) + '%'} → ${headerInvestmentScore.annualReturnScore.toFixed(1)}/10`,
                          ],
                        },
                        {
                          label: 'Equity', score: headerInvestmentScore.equityScore, weight: settings.investmentScoreSettings?.equityWeight ?? 33,
                          lines: [
                            `ARV ${formatCurrency(arv)} − Purchase ${formatCurrency(purchasePrice)} − Rehab ${formatCurrency(rehabCost)}`,
                            `True Equity: ${formatCurrency(headerInvestmentScore.trueEquity)}`,
                          ],
                        },
                        {
                          label: 'Location', score: headerInvestmentScore.locationScore, weight: settings.investmentScoreSettings?.locationWeight ?? 34,
                          lines: [
                            `Schools: ${headerInvestmentScore.schoolTotal.toFixed(1)}/15 → ${headerInvestmentScore.schoolScore.toFixed(1)}/10 (60%)`,
                            headerInvestmentScore.inventoryMonths != null
                              ? `Inventory: ${headerInvestmentScore.inventoryMonths}mo → ${headerInvestmentScore.inventoryScore?.toFixed(1)}/10 (40%)`
                              : `Inventory: not set (enter in overrides)`,
                          ],
                        },
                      ].map(({ label, score, weight, lines }) => (
                        <div key={label} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium w-24 shrink-0">{label} <span className="text-muted-foreground">{weight}%</span></span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", score >= 7 ? "bg-emerald-500" : score >= 5 ? "bg-yellow-500" : "bg-red-500")}
                                style={{ width: `${score * 10}%` }}
                              />
                            </div>
                            <span className={cn("text-xs font-bold w-10 text-right shrink-0", score >= 7 ? "text-emerald-400" : score >= 5 ? "text-yellow-400" : "text-red-400")}>
                              {score.toFixed(1)}/10
                            </span>
                          </div>
                          {lines.map((l, i) => (
                            <p key={i} className="text-xs text-muted-foreground ml-26 pl-1">{l}</p>
                          ))}
                        </div>
                      ))}
                    </div>

                    {headerInvestmentScore.missingFields.length > 0 && (
                      <p className="text-xs text-orange-400 border border-orange-500/30 rounded p-2 bg-orange-500/5">
                        ⚠ Partial score — {headerInvestmentScore.missingFields.join(', ')} missing. Add in Modified Assumptions.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground border-t border-border pt-2">Adjust weights & threshold in Settings → Investment Score</p>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
            )}

            {/* ZIP Market Intelligence */}
            {deal.address.zip && (
              <ZipMarketCard
                zipCode={deal.address.zip}
                city={deal.address.city}
                state={deal.address.state}
              />
            )}

            {/* SENSITIVITY ANALYSIS - Interactive What-If with Sliders */}
            <WhatIfAnalysis
              purchasePrice={purchasePrice}
              arv={arv}
              rehabCost={rehabCost}
              rent={rent}
              interestRate={localOverrides.interestRate ? parseFloat(localOverrides.interestRate) : loanDefaults.rentalInterestRate}
              holdingMonths={localOverrides.holdingMonths ? parseInt(localOverrides.holdingMonths) : loanDefaults.holdingMonths}
              liveFinancials={liveFinancials}
              apiData={apiData}
              localOverrides={localOverrides}
              loanDefaults={loanDefaults}
              totalHoldingCosts={totalHoldingCosts}
            />

            {/* LOI (Letter of Intent) Generator Button */}
            {(() => {
              // Calculate MAO based on Flip strategy (70% rule)
              // MAO = ARV × 70% - Rehab - Closing Costs - Contingency
              const closingPercent = localOverrides.closingCostsPercent 
                ? parseFloat(localOverrides.closingCostsPercent) / 100 
                : loanDefaults.closingCostsPercent / 100;
              const contingencyPercent = localOverrides.contingencyPercent 
                ? parseFloat(localOverrides.contingencyPercent) / 100 
                : loanDefaults.contingencyPercent / 100;
              const agentPercent = localOverrides.agentCommissionPercent 
                ? parseFloat(localOverrides.agentCommissionPercent) / 100 
                : loanDefaults.agentCommissionPercent / 100;
              
              // MAO = ARV × 75% - rehab - holding costs, with minimum $50k profit guarantee
              const rehabWithContingency = rehabCost * (1 + contingencyPercent);
              const estimatedSellingCosts = arv * agentPercent + 1000; // Agent + closing
              const MIN_PROFIT = 50000;

              // 75% rule MAO
              let mao = Math.round((arv * 0.75) - rehabWithContingency - totalHoldingCosts);

              // Verify profit at this MAO; if < $50k, solve backwards for MAO that yields $50k
              // profit = ARV - MAO - MAO*closingPercent - rehab - holdingCosts - sellingCosts
              // MAO*(1+closingPercent) = ARV - rehab - holdingCosts - sellingCosts - MIN_PROFIT
              const maoTotalInvestment = mao + (mao * closingPercent) + rehabWithContingency + totalHoldingCosts;
              const maoExpectedProfit = arv - maoTotalInvestment - estimatedSellingCosts;
              if (maoExpectedProfit < MIN_PROFIT) {
                mao = Math.round((arv - rehabWithContingency - totalHoldingCosts - estimatedSellingCosts - MIN_PROFIT) / (1 + closingPercent));
              }
              
              const loiText = `Subject: Letter of Intent - ${deal?.address.full}

Dear Seller,

Thank you for considering my offer on the property located at ${deal?.address.full}.

After thorough analysis of the property's condition, comparable sales in the area, and current market conditions, I am pleased to submit my Maximum Allowable Offer (MAO):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OFFER AMOUNT: ${formatCurrency(mao)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BASIS FOR THIS OFFER:

• After Repair Value (ARV): ${formatCurrency(arv)}
• Estimated Rehab Costs: ${formatCurrency(rehabCost)}
• Contingency (${Math.round(contingencyPercent * 100)}%): ${formatCurrency(rehabCost * contingencyPercent)}
• Estimated Holding Costs: ${formatCurrency(totalHoldingCosts)}

Our offer is calculated using the industry-standard 70% rule, which accounts for:
- Required renovations to bring the property to market-ready condition
- Holding costs during the renovation period
- Transaction costs (closing, commissions, etc.)
- A reasonable profit margin for the investment risk

At this price, we project a net profit of approximately ${formatCurrency(maoExpectedProfit)}, which represents a fair return for the capital and effort required.

This offer is subject to:
- Property inspection
- Clear title verification
- Financing approval (if applicable)

We are prepared to close quickly and can work around your preferred timeline.

Please feel free to reach out if you have any questions or would like to discuss further.

Best regards`;

              return (
                <Dialog open={isLoiDialogOpen} onOpenChange={setIsLoiDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Generate LOI (Letter of Intent)
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        MAO: {formatCurrency(mao)}
                      </Badge>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        Letter of Intent
                      </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto">
                      <div className="bg-muted/30 rounded-lg p-4 border">
                        <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
                          {loiText}
                        </pre>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(loiText);
                          toast.success('LOI copied to clipboard!');
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy to Clipboard
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              );
            })()}
            </div>

          </>
        );
      })()}

      {deal.status === 'not_relevant' && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="font-medium text-destructive">Marked as Not Relevant</span>
            </div>
            <Input
              placeholder="Reason for rejection..."
              value={rejectionReason}
              onChange={(e) => {
                setRejectionReason(e.target.value);
                updateDealStatus(deal.id, 'not_relevant', e.target.value);
              }}
              className="mt-2"
            />
          </CardContent>
        </Card>
      )}

      {/* More Info - Collapsible section for comps and property details */}
      <Collapsible open={moreInfoOpen} onOpenChange={setMoreInfoOpen}>
        <Card className="border-muted-foreground/20">
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">More Info</span>
                  <span className="text-xs text-muted-foreground/70">(Comps, Property Details, Map)</span>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", moreInfoOpen && "rotate-180")} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Financial Analysis */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Summary + Financial Summary - hidden, data kept in DB, all metrics shown in Deal Analysis cards above */}


          {/* Sale Comps - Separated by sold status and recency */}
          {apiData.saleComps && apiData.saleComps.length > 0 && (() => {
            const now = new Date();
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
            const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            
            // Target bed/bath for filtering (from overrides or property data)
            const targetBed = localOverrides.targetBedrooms ? parseInt(localOverrides.targetBedrooms) : (apiData.bedrooms ?? 0);
            const targetBath = localOverrides.targetBathrooms ? parseInt(localOverrides.targetBathrooms) : (apiData.bathrooms ?? 0);

            // Filter comps: show matching layout + up to 1 bed/bath difference
            const filterByLayoutRange = (comps: typeof apiData.saleComps) => {
              return comps.filter(c => {
                const bedDiff = Math.abs((c.bedrooms || 0) - targetBed);
                const bathDiff = Math.abs((c.bathrooms || 0) - targetBath);
                return bedDiff <= 1 && bathDiff <= 1;
              });
            };

            // Sort comps: exact match first, then by similarity score
            const sortByLayoutMatch = (comps: typeof apiData.saleComps) => {
              return [...comps].sort((a, b) => {
                const aExactMatch = a.bedrooms === targetBed && a.bathrooms === targetBath;
                const bExactMatch = b.bedrooms === targetBed && b.bathrooms === targetBath;
                if (aExactMatch && !bExactMatch) return -1;
                if (!aExactMatch && bExactMatch) return 1;
                // Within same category, sort by price descending
                return b.salePrice - a.salePrice;
              });
            };

            // Sold properties (have sale date) vs still on market (no sale date)
            const allSoldComps = apiData.saleComps.filter(c => c.saleDate);
            const allOnMarketComps = apiData.saleComps.filter(c => !c.saleDate);

            // Apply filtering and sorting
            const soldComps = sortByLayoutMatch(filterByLayoutRange(allSoldComps));
            const onMarketComps = sortByLayoutMatch(filterByLayoutRange(allOnMarketComps));

            // Split sold comps by recency
            const recentSoldComps = soldComps
              .filter(c => new Date(c.saleDate) >= sixMonthsAgo)
              .slice(0, 8);

            const olderSoldComps = soldComps
              .filter(c => new Date(c.saleDate) < sixMonthsAgo && new Date(c.saleDate) >= oneYearAgo)
              .slice(0, 8);

            // Calculate ARV from older comps (average of top 3 by price) - REFERENCE ONLY
            const olderCompsForArv = olderSoldComps.filter(c => c.bedrooms === targetBed && c.bathrooms === targetBath).slice(0, 3);
            const olderArv = olderCompsForArv.length > 0
              ? Math.round(olderCompsForArv.reduce((sum, c) => sum + c.salePrice, 0) / olderCompsForArv.length)
              : null;

            // Calculate ARV from RECENT comps only (last 6 months) - THIS IS WHAT WE USE
            const recentExactMatchComps = recentSoldComps.filter(c => c.bedrooms === targetBed && c.bathrooms === targetBath);
            const recentCompsForArv = recentExactMatchComps.length > 0 
              ? recentExactMatchComps.slice(0, 5)  // Top 5 exact matches
              : recentSoldComps.slice(0, 5);  // Fallback to any recent comps
            
            const calculatedArv = recentCompsForArv.length > 0
              ? Math.round(recentCompsForArv.reduce((sum, c) => sum + c.salePrice, 0) / recentCompsForArv.length)
              : null;

            // API's ARV from deal data
            const apiArv = apiData.arv ?? 0;
            
            // Compare: If API ARV is within 90% of calculated ARV, use API ARV
            const arvDifferencePercent = calculatedArv && calculatedArv > 0 
              ? Math.abs(apiArv - calculatedArv) / calculatedArv 
              : 1;
            const useApiArv = arvDifferencePercent <= 0.10; // Within 10% difference
            
            // Final ARV to use (if no override set)
            const finalCalculatedArv = useApiArv ? apiArv : (calculatedArv ?? apiArv);
            
            // ARV explanation
            const arvExplanation = {
              method: useApiArv ? 'API (validated)' : 'Calculated from comps',
              apiArv,
              calculatedArv,
              compsUsed: recentCompsForArv.length,
              exactMatchComps: recentExactMatchComps.length,
              differencePercent: (arvDifferencePercent * 100).toFixed(1),
              useApiArv,
              finalArv: finalCalculatedArv,
            };

            const filteredOutCount = allSoldComps.length + allOnMarketComps.length - soldComps.length - onMarketComps.length;


            return (
              <div className="space-y-4">
                {/* Layout range indicator */}
                {filteredOutCount > 0 && (
                  <div className="p-3 rounded-lg bg-accent/10 border border-accent/30 text-accent">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-accent" />
                        <span className="text-sm font-medium">
                          Showing comps for: {targetBed} bd / {targetBath} ba ±1
                        </span>
                      </div>
                      <span className="text-xs">
                        {filteredOutCount} comps hidden (layout too different)
                      </span>
                    </div>
                  </div>
                )}

                {/* Sold Comps - Combined Card */}
                {(recentSoldComps.length > 0 || olderSoldComps.length > 0) && (() => {
                  // Calculate avg DOM from recent comps that have it
                  const domValues = recentSoldComps
                    .map(c => (c as any).daysOnMarket)
                    .filter((d): d is number => d != null && d > 0);
                  const avgDom = domValues.length > 0
                    ? Math.round(domValues.reduce((s, d) => s + d, 0) / domValues.length)
                    : null;
                  return (
                  <Collapsible open={saleCompsOpen} onOpenChange={setSaleCompsOpen}>
                    <Card className="border-success/30">
                      <CollapsibleTrigger asChild>
                        <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
                          <CardTitle className="text-base flex flex-wrap items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            Recently Sold (Last 6 Months) - {targetBed}/{targetBath} ±1
                            {calculatedArv && (
                              <span className="text-success font-bold ml-2">
                                ARV: {formatCurrency(finalCalculatedArv)}
                              </span>
                            )}
                            {avgDom != null && (
                              <span className="text-xs text-muted-foreground font-normal">
                                🕐 Avg {avgDom}d to sell
                              </span>
                            )}
                            <Badge variant="outline" className="text-muted-foreground text-xs">{recentSoldComps.length} comps</Badge>
                            <div className="flex items-center gap-2 ml-auto">
                              <HoverCard>
                                <HoverCardTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                                    <Info className="w-3 h-3 mr-1" />
                                    How ARV calculated?
                                  </Button>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-80" side="left">
                                  <div className="space-y-3 text-sm">
                                    <h4 className="font-semibold">ARV Calculation Method</h4>
                                    <div className="space-y-2">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">API ARV:</span>
                                        <span className="font-medium">{formatCurrency(arvExplanation.apiArv)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Calculated from comps:</span>
                                        <span className="font-medium">{arvExplanation.calculatedArv ? formatCurrency(arvExplanation.calculatedArv) : 'N/A'}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Comps used:</span>
                                        <span className="font-medium">{arvExplanation.compsUsed} ({arvExplanation.exactMatchComps} exact match)</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Difference:</span>
                                        <span className={cn("font-medium", arvExplanation.useApiArv ? "text-success" : "text-warning")}>
                                          {arvExplanation.differencePercent}%
                                        </span>
                                      </div>
                                      <Separator />
                                      <div className="p-2 rounded bg-muted/50">
                                        <p className="text-xs text-muted-foreground mb-1">
                                          {arvExplanation.useApiArv 
                                            ? '✅ API ARV is within 10% of calculated → Using API ARV' 
                                            : '⚠️ API ARV differs >10% → Using calculated ARV from comps'}
                                        </p>
                                        <p className="text-sm font-semibold text-success">
                                          Final ARV: {formatCurrency(arvExplanation.finalArv)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", saleCompsOpen && "rotate-180")} />
                            </div>
                          </CardTitle>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="space-y-3">
                      {/* Recent Sold Comps */}
                      {recentSoldComps.length > 0 ? (
                        recentSoldComps.map((comp, idx) => {
                          const isExactMatch = comp.bedrooms === targetBed && comp.bathrooms === targetBath;
                          return (
                            <div key={idx} className={cn(
                              "p-3 rounded-lg border",
                              isExactMatch 
                                ? "bg-success/5 border-success/20" 
                                : "bg-muted/30 border-muted-foreground/20"
                            )}>
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{comp.address}</span>
                                  {!isExactMatch && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">
                                      {comp.bedrooms}/{comp.bathrooms}
                                    </Badge>
                                  )}
                                </div>
                                <span className={cn("font-bold", isExactMatch ? "text-success" : "text-foreground")}>
                                  {formatCurrency(comp.salePrice)}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                <span className={isExactMatch ? "text-success font-medium" : ""}>{comp.bedrooms} bd / {comp.bathrooms} ba</span>
                                <span>{comp.sqft?.toLocaleString()} sqft</span>
                                <span>{comp.distance?.toFixed(2)} mi away</span>
                                <span className={isExactMatch ? "text-success font-medium" : ""}>Sold {new Date(comp.saleDate).toLocaleDateString()}</span>
                                {(comp as any).daysOnMarket != null && <span>🕐 {(comp as any).daysOnMarket}d on market</span>}
                                {comp.similarityScore > 0 && <span className="text-primary">Score: {comp.similarityScore.toFixed(0)}%</span>}
                                {comp.notes && comp.notes.length > 0 && (
                                  <HoverCard>
                                    <HoverCardTrigger asChild>
                                      <span className="text-accent cursor-pointer underline decoration-dotted">Notes</span>
                                    </HoverCardTrigger>
                                    <HoverCardContent className="w-64" side="top">
                                      <ul className="text-xs space-y-1 list-disc list-inside">
                                        {comp.notes.map((note, i) => (
                                          <li key={i}>{note}</li>
                                        ))}
                                      </ul>
                                    </HoverCardContent>
                                  </HoverCard>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm">
                          ⚠️ No sold properties in the last 6 months.
                        </div>
                      )}

                      {/* Older Sold Comps - Collapsible */}
                      {olderSoldComps.length > 0 && (
                        <Collapsible open={olderCompsOpen} onOpenChange={setOlderCompsOpen}>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground h-auto py-2 px-2">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                                <span>Older Sales (6-12 Months) - {olderSoldComps.length} comps</span>
                                {olderArv && (
                                  <span className="text-xs text-muted-foreground/70">
                                    ARV: {formatCurrency(olderArv)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-muted-foreground">Reference Only</Badge>
                                <ChevronDown className={cn("w-4 h-4 transition-transform", olderCompsOpen && "rotate-180")} />
                              </div>
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-3 pt-3">
                            {olderSoldComps.map((comp, idx) => {
                              const isExactMatch = comp.bedrooms === targetBed && comp.bathrooms === targetBath;
                              return (
                                <div key={idx} className={cn(
                                  "p-3 rounded-lg border",
                                  isExactMatch ? "bg-muted/30 border-border/50" : "bg-muted/10 border-border/30"
                                )}>
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm text-muted-foreground">{comp.address}</span>
                                      {!isExactMatch && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">
                                          {comp.bedrooms}/{comp.bathrooms}
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="font-bold">{formatCurrency(comp.salePrice)}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                    <span>{comp.bedrooms} bd / {comp.bathrooms} ba</span>
                                    <span>{comp.sqft?.toLocaleString()} sqft</span>
                                    <span>{comp.distance?.toFixed(2)} mi away</span>
                                    <span>Sold {new Date(comp.saleDate).toLocaleDateString()}</span>
                                    {(comp as any).daysOnMarket != null && <span>🕐 {(comp as any).daysOnMarket}d on market</span>}
                                    {comp.similarityScore > 0 && <span className="text-primary">Score: {comp.similarityScore.toFixed(0)}%</span>}
                                    {comp.notes && comp.notes.length > 0 && (
                                      <HoverCard>
                                        <HoverCardTrigger asChild>
                                          <span className="text-accent cursor-pointer underline decoration-dotted">Notes</span>
                                        </HoverCardTrigger>
                                        <HoverCardContent className="w-64" side="top">
                                          <ul className="text-xs space-y-1 list-disc list-inside">
                                            {comp.notes.map((note, i) => (
                                              <li key={i}>{note}</li>
                                            ))}
                                          </ul>
                                        </HoverCardContent>
                                      </HoverCard>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                  );
                })()}


                {/* Still on Market - NOT for ARV */}
                {onMarketComps.length > 0 && (
                  <Card className="border-warning/30">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2 text-warning">
                        <span className="w-2 h-2 rounded-full bg-warning" />
                        Listed (Not Yet Sold)
                        <Badge variant="outline" className="ml-auto text-warning border-warning/50">Not Used for ARV</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground mb-3">These properties are currently listed but haven't sold yet - prices may change.</p>
                      <div className="space-y-3">
                        {onMarketComps.slice(0, 3).map((comp, idx) => (
                          <div key={idx} className="p-3 rounded-lg bg-warning/5 border border-warning/20">
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-medium text-sm text-muted-foreground">{comp.address}</span>
                              <span className="font-bold text-warning">{formatCurrency(comp.salePrice)}</span>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span>{comp.bedrooms} bd / {comp.bathrooms} ba</span>
                              <span>{comp.sqft?.toLocaleString()} sqft</span>
                              <span>{comp.distance?.toFixed(2)} mi away</span>
                              <span className="text-warning">Currently Listed</span>
                              {(comp as any).daysOnMarket != null && <span className="text-warning">🕐 {(comp as any).daysOnMarket}d listed</span>}
                              {comp.notes && comp.notes.length > 0 && (
                                <HoverCard>
                                  <HoverCardTrigger asChild>
                                    <span className="text-accent cursor-pointer underline decoration-dotted">Notes</span>
                                  </HoverCardTrigger>
                                  <HoverCardContent className="w-64" side="top">
                                    <ul className="text-xs space-y-1 list-disc list-inside">
                                      {comp.notes.map((note, i) => (
                                        <li key={i}>{note}</li>
                                      ))}
                                    </ul>
                                  </HoverCardContent>
                                </HoverCard>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

              </div>
            );
          })()}

          {/* Estimated Rent (from high-end comps adjusted to property size) */}
          {apiData.rentComps && apiData.rentComps.length > 0 && (() => {
            // Target bed/bath for filtering rent comps
            const targetBed = localOverrides.targetBedrooms ? parseInt(localOverrides.targetBedrooms) : null;
            const targetBath = localOverrides.targetBathrooms ? parseInt(localOverrides.targetBathrooms) : null;
            const isFiltering = targetBed || targetBath;
            
            // Filter rent comps by target bed/bath if set
            const filteredRentComps = isFiltering 
              ? apiData.rentComps.filter(c => {
                  const bedMatch = !targetBed || c.bedrooms === targetBed;
                  const bathMatch = !targetBath || c.bathrooms === targetBath;
                  return bedMatch && bathMatch;
                })
              : apiData.rentComps;
            
            const propertySqft = apiData.sqft || 1500;
            const sortedComps = [...filteredRentComps].sort((a, b) => b.adjustedRent - a.adjustedRent);
            const topComps = sortedComps.slice(0, 3);
            
            if (topComps.length === 0) {
              return (
                <Card className="border-warning/30">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2 text-warning">
                      <AlertTriangle className="w-4 h-4" />
                      No Rent Comps for {targetBed}/{targetBath}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      No rent comparables found matching your target configuration. Try adjusting the target bed/bath or clear the filter.
                    </p>
                  </CardContent>
                </Card>
              );
            }
            
            const avgRentPerSqft = topComps.reduce((sum, c) => sum + (c.adjustedRent / (c.sqft || 1)), 0) / topComps.length;
            const estimatedRent = Math.round(avgRentPerSqft * propertySqft);
            
            return (
              <Card className="border-success/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between relative">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-success" />
                      Estimated Rent {isFiltering && `(${targetBed}/${targetBath})`}
                    </div>
                    <Collapsible open={showRentCompsOpen} onOpenChange={setShowRentCompsOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground">
                          <span>{topComps.length} comps</span>
                          <ChevronDown className={cn("w-3 h-3 ml-1 transition-transform", showRentCompsOpen && "rotate-180")} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border bg-popover p-3 shadow-lg">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Top Rent Comps Used</p>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {topComps.map((comp, idx) => (
                            <div key={idx} className="p-2 rounded bg-muted/50 text-xs">
                              <p className="font-medium truncate">{comp.address}</p>
                              <div className="flex justify-between text-muted-foreground mt-1">
                                <span>{comp.bedrooms}bd/{comp.bathrooms}ba • {comp.sqft?.toLocaleString()} sqft</span>
                                <span className="text-success font-medium">${comp.adjustedRent?.toLocaleString()}/mo</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {filteredRentComps.length > topComps.length && (
                          <p className="text-[10px] text-muted-foreground mt-2 text-center">
                            + {filteredRentComps.length - topComps.length} more comps available
                          </p>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {isFiltering && (
                      <div className="p-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-xs">
                        Filtered to {targetBed} bd / {targetBath} ba comps ({filteredRentComps.length} of {apiData.rentComps.length})
                      </div>
                    )}
                    <div className="text-center p-4 rounded-lg bg-success/10 border border-success/30">
                      <p className="text-xs text-muted-foreground mb-1">Based on top {topComps.length} highest asking rents</p>
                      <p className="text-3xl font-bold text-success">{formatCurrency(estimatedRent)}<span className="text-lg font-normal">/mo</span></p>
                      <p className="text-xs text-muted-foreground mt-2">
                        ${avgRentPerSqft.toFixed(2)}/sqft × {propertySqft.toLocaleString()} sqft
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Assumes high-quality renovation to match premium listings in the area
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Section 8 Rent Limits - Compact */}
          {apiData.section8 && (() => {
            const targetBed = localOverrides.targetBedrooms ? parseInt(localOverrides.targetBedrooms) : null;
            const targetBath = localOverrides.targetBathrooms ? parseInt(localOverrides.targetBathrooms) : null;
            const isFiltering = targetBed || targetBath;
            
            const filteredComps = isFiltering && apiData.rentComps
              ? apiData.rentComps.filter(c => {
                  const bedMatch = !targetBed || c.bedrooms === targetBed;
                  const bathMatch = !targetBath || c.bathrooms === targetBath;
                  return bedMatch && bathMatch;
                })
              : apiData.rentComps || [];
            
            return (
              <div className="flex flex-col gap-2 p-3 rounded-lg border border-cyan-500/30 bg-card">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="w-2 h-2 rounded-full bg-cyan-500" />
                  Section 8 Rent Limits
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Area</span>
                  <span className="text-right">{apiData.section8.areaName}</span>
                  <span className="text-muted-foreground">Bedrooms</span>
                  <span className="text-right">{apiData.section8.bedrooms}</span>
                  <span className="text-muted-foreground">Rent Range</span>
                  <span className="text-right text-success font-medium">
                    {formatCurrency(apiData.section8.minRent)} - {formatCurrency(apiData.section8.maxRent)}
                  </span>
                </div>
                {apiData.rentComps && apiData.rentComps.length > 0 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-warning hover:text-warning hover:bg-warning/10 justify-start px-2 mt-1">
                        <span className="w-2 h-2 rounded-full bg-warning mr-2" />
                        Currently Listed for Rent - {filteredComps.length} comps
                        <ExternalLink className="w-3 h-3 ml-auto" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-warning">
                          <span className="w-2 h-2 rounded-full bg-warning" />
                          Currently Listed for Rent {isFiltering && `(${targetBed}/${targetBath})`} - {filteredComps.length} comps
                          <Badge variant="outline" className="ml-auto text-warning border-warning/50">On Market</Badge>
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        {isFiltering && filteredComps.length < apiData.rentComps.length && (
                          <div className="p-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-xs">
                            Showing {filteredComps.length} of {apiData.rentComps.length} comps matching {targetBed} bd / {targetBath} ba
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Properties currently listed for rent (asking prices, not leased yet)
                        </p>
                        {filteredComps.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No rent comps matching {targetBed}/{targetBath}. Clear filter to see all comps.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {[...filteredComps]
                              .sort((a, b) => b.adjustedRent - a.adjustedRent)
                              .map((comp, idx) => (
                                <div key={idx} className="p-3 rounded-lg bg-warning/5 border border-warning/20">
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="font-medium text-sm">{comp.address}</span>
                                    <span className="font-bold text-warning">{formatCurrency(comp.adjustedRent)}<span className="text-xs font-normal">/mo</span></span>
                                  </div>
                                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                    <span>{comp.bedrooms} bd / {comp.bathrooms} ba</span>
                                    <span>{comp.sqft?.toLocaleString()} sqft</span>
                                    {comp.adjustedRent !== comp.originalRent && (
                                      <span className="text-primary">Adjusted: {comp.adjustmentReason}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            );
          })()}

          {/* Sales History - Moved to bottom */}
          {apiData.priceHistory && apiData.priceHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="w-4 h-4 text-primary" />
                  Sales History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {apiData.priceHistory.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm py-2 border-b border-border last:border-0">
                      <div>
                        <span className="font-medium">{item.event}</span>
                        <span className="text-muted-foreground ml-2">
                          {new Date(item.date).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="font-medium">{formatCurrency(item.price)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tax History - Collapsible */}
          {apiData.taxHistory && apiData.taxHistory.length > 0 && (() => {
            const sortedTaxHistory = [...apiData.taxHistory].sort((a, b) => b.time - a.time);
            const latestTax = sortedTaxHistory[0];
            const latestYear = latestTax?.time ? new Date(latestTax.time).getFullYear() : null;
            
            return (
              <Collapsible open={taxHistoryOpen} onOpenChange={setTaxHistoryOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                      <CardTitle className="flex items-center justify-between text-base">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          Tax History
                        </div>
                        <div className="flex items-center gap-3 text-sm font-normal">
                          {latestYear && (
                            <span className="text-muted-foreground">{latestYear}</span>
                          )}
                          {latestTax?.value && (
                            <span className="text-muted-foreground">
                              Assessment: <span className="text-foreground font-medium">{formatCurrency(latestTax.value)}</span>
                            </span>
                          )}
                          {latestTax?.taxPaid && (
                            <span className="text-muted-foreground">
                              Tax: <span className="text-foreground font-medium">{formatCurrency(latestTax.taxPaid)}</span>
                            </span>
                          )}
                          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", taxHistoryOpen && "rotate-180")} />
                        </div>
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {sortedTaxHistory.map((item, idx) => {
                          const year = item.time ? new Date(item.time).getFullYear() : 'N/A';
                          return (
                            <div key={idx} className="flex justify-between items-center text-sm py-2 border-b border-border last:border-0">
                              <span className="text-muted-foreground font-medium">{year}</span>
                              <div className="flex items-center gap-4">
                                {item.value && (
                                  <span className="text-muted-foreground">
                                    Assessment: <span className="text-foreground">{formatCurrency(item.value)}</span>
                                  </span>
                                )}
                                {item.taxPaid && (
                                  <span className="text-muted-foreground">
                                    Tax: <span className="text-foreground font-medium">{formatCurrency(item.taxPaid)}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })()}
        </div>

        {/* Right Column - API Data & Overrides */}
        <div className="space-y-6">
          {/* Property Map */}
          {apiData.latitude && apiData.longitude && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Map className="w-4 h-4 text-primary" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PropertyMap 
                  latitude={apiData.latitude} 
                  longitude={apiData.longitude} 
                  address={deal.address.full}
                />
              </CardContent>
            </Card>
          )}
          {/* API Original Data - Read Only */}
          <Card className="border border-muted bg-muted/20">
            <CardHeader className="pb-1 pt-2 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <FileText className="w-3 h-3" />
                API Data (Read Only)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="text-center p-1.5 rounded bg-background/50">
                  <p className="text-[10px] text-muted-foreground uppercase">Price</p>
                  <p className="font-semibold">{formatCurrency(apiData?.purchasePrice ?? 0)}</p>
                </div>
                <div className="text-center p-1.5 rounded bg-background/50">
                  <p className="text-[10px] text-muted-foreground uppercase">ARV</p>
                  <p className="font-semibold text-emerald-400">{formatCurrency(apiData?.arv ?? 0)}</p>
                </div>
                <div className="text-center p-1.5 rounded bg-background/50">
                  <p className="text-[10px] text-muted-foreground uppercase">Rehab</p>
                  <p className="font-semibold text-amber-400">{formatCurrency(apiData?.rehabCost ?? 0)}</p>
                </div>
                <div className="text-center p-1.5 rounded bg-background/50">
                  <p className="text-[10px] text-muted-foreground uppercase">Rent</p>
                  <p className="font-semibold text-cyan-400">{formatCurrency(apiData?.rent ?? 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
