import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, ExternalLink, ChevronDown, ChevronUp,
  Flame, Eye, SkipForward, Check,
  TrendingUp, Repeat2, Calculator, Save, RotateCcw,
  Home, DollarSign, BarChart3, FileText,
  Sparkles, AlertTriangle, ThumbsUp, Loader2, RefreshCw,
  ShieldCheck, Wrench, Building2,
} from 'lucide-react';
import { ScoutResult, DealStatus, updateResultOverrides } from '@/hooks/useScoutSearches';
import { cn } from '@/lib/utils';

// ─── Financial defaults ────────────────────────────────────────────────────────
const DEFAULTS = {
  closingCostsPercent: 2,
  contingencyPercent: 10,
  holdingMonths: 4,
  agentCommissionPercent: 6,
  propertyManagementPercent: 10,
  maintenanceVacancyPercent: 12,
  capexPercent: 0,
  hmlLtvPurchase: 90,
  hmlLtvRehab: 100,
  hmlPoints: 2,
  hmlRate: 12,
  refiLtv: 75,
  refiRate: 7,
  mortgageTerm: 30,
  downPaymentPercent: 20,
  interestRate: 7,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function num(s: string, fallback = 0): number {
  const v = parseFloat(s);
  return isNaN(v) ? fallback : v;
}

function monthlyPI(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0 || principal <= 0) return principal / (n || 1);
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ARow({
  label, value, color, bold, indent,
}: {
  label: string; value: string; color?: string; bold?: boolean; indent?: boolean;
}) {
  return (
    <div className={cn('flex justify-between items-center py-1.5 border-b border-border/20', indent && 'pl-4')}>
      <span className={cn('text-sm', indent ? 'text-muted-foreground' : 'text-foreground')}>{label}</span>
      <span className={cn('text-sm tabular-nums', bold && 'font-bold', color || 'text-foreground')}>{value}</span>
    </div>
  );
}

function SmallInput({
  label, value, onChange, prefix = '', suffix = '', placeholder = '',
}: {
  label: string; value: string; onChange: (v: string) => void;
  prefix?: string; suffix?: string; placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-foreground min-w-0 flex-1">{label}</span>
      <div className="flex items-center gap-1 shrink-0">
        {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
        <Input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-7 w-20 text-xs text-right"
        />
        {suffix && <span className="text-xs text-muted-foreground w-4">{suffix}</span>}
      </div>
    </div>
  );
}

// Large center-aligned editable box (same style as DealDetailPage assumptions)
function BigInput({
  label, value, onChange, isModified = false,
  originalValue, onReset,
}: {
  label: string; value: string; onChange: (v: string) => void;
  isModified?: boolean; originalValue?: string; onReset?: () => void;
}) {
  return (
    <div className={cn(
      'text-center p-3 rounded-lg cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all relative',
      isModified ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-background/50',
    )}>
      <div className="flex items-center justify-center gap-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        {isModified && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">Modified</span>
        )}
      </div>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'w-full text-center text-lg font-bold mt-1 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary rounded px-1',
          isModified ? 'text-amber-400' : 'text-foreground',
        )}
      />
      {isModified && originalValue && onReset && (
        <p className="mt-1 text-[10px] text-muted-foreground flex items-center justify-center gap-1">
          <span>Original:</span>
          <span className="line-through">{originalValue}</span>
          <button onClick={e => { e.stopPropagation(); onReset(); }} className="ml-1 p-0.5 rounded hover:bg-muted">
            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" />
          </button>
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  deal: ScoutResult & { zip?: string };
  onBack: () => void;
  onStatusChange?: (id: string, status: DealStatus) => void;
  onOverrideChange?: (id: string, overrides: Partial<ScoutResult>) => void;
}

export default function ScoutDealDetail({ deal: initialDeal, onBack, onStatusChange, onOverrideChange }: Props) {
  const [deal, setDeal] = useState(initialDeal);
  const [savingOverride, setSavingOverride] = useState(false);

  // AI Analysis state
  const [aiAnalysis, setAiAnalysis]     = useState<any>(null);
  const [aiLoading,  setAiLoading]      = useState(false);
  const [aiError,    setAiError]        = useState<string | null>(null);
  const [showAiView, setShowAiView]     = useState(false);
  const [aiCost,     setAiCost]         = useState<number | null>(null);
  const [aiTokens,   setAiTokens]       = useState<{ input: number; output: number } | null>(null);

  // ── Core editable values ──
  const [price, setPrice] = useState(String(deal.price || ''));
  const [arv, setArv] = useState(String(deal.arv_override ?? deal.arv ?? ''));
  const [rehab, setRehab] = useState(String(deal.rehab_override ?? deal.rehab ?? ''));
  const [rent, setRent] = useState(String(deal.rent_override ?? deal.rent ?? ''));

  // Track original API values for "Modified" badges
  const origPrice = String(deal.price || '');
  const origArv = String(deal.arv ?? '');
  const origRehab = String(deal.rehab ?? '');
  const origRent = String(deal.rent ?? '');

  // ── Holding assumptions ──
  const [holdingMonths, setHoldingMonths] = useState(String(DEFAULTS.holdingMonths));
  const [propTaxMonthly, setPropTaxMonthly] = useState(String(Math.round((num(String(deal.price || '0')) * 0.012) / 12) || '150'));
  const [insuranceMonthly, setInsuranceMonthly] = useState('100');
  const [hoaMonthly, setHoaMonthly] = useState('0');

  // ── Flip assumptions ──
  const [closingCostPct, setClosingCostPct] = useState(String(DEFAULTS.closingCostsPercent));
  const [contingencyPct, setContingencyPct] = useState(String(DEFAULTS.contingencyPercent));
  const [agentCommPct, setAgentCommPct] = useState(String(DEFAULTS.agentCommissionPercent));

  // ── Rental assumptions ──
  const [managementPct, setManagementPct] = useState(String(DEFAULTS.propertyManagementPercent));
  const [maintenanceVacancyPct, setMaintenanceVacancyPct] = useState(String(DEFAULTS.maintenanceVacancyPercent));
  const [capexPct, setCapexPct] = useState(String(DEFAULTS.capexPercent));
  const [downPaymentPct, setDownPaymentPct] = useState(String(DEFAULTS.downPaymentPercent));
  const [mortgageRate, setMortgageRate] = useState(String(DEFAULTS.interestRate));
  const [mortgageTerm, setMortgageTerm] = useState(String(DEFAULTS.mortgageTerm));

  // ── BRRRR assumptions ──
  const [brrrrMode, setBrrrrMode] = useState<'cash' | 'hml'>('cash');
  const [refiLtv, setRefiLtv] = useState(String(DEFAULTS.refiLtv));
  const [refiRate, setRefiRate] = useState(String(DEFAULTS.refiRate));
  const [refiTerm, setRefiTerm] = useState(String(DEFAULTS.mortgageTerm));
  const [refiClosingPct, setRefiClosingPct] = useState('2');
  const [hmlPurchaseLtv, setHmlPurchaseLtv] = useState(String(DEFAULTS.hmlLtvPurchase));
  const [hmlRehabPct, setHmlRehabPct] = useState(String(DEFAULTS.hmlLtvRehab));
  const [hmlRate, setHmlRate] = useState(String(DEFAULTS.hmlRate));
  const [hmlPoints, setHmlPoints] = useState(String(DEFAULTS.hmlPoints));
  const [hmlMonths, setHmlMonths] = useState(String(DEFAULTS.holdingMonths));

  // ── Notes ──
  const [notes, setNotes] = useState(deal.notes || '');
  const [notesSaved, setNotesSaved] = useState(true);

  // ── What-If ──
  const [priceAdjPct, setPriceAdjPct] = useState(0);

  // ── Collapsible states ──
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [bestStrategyOpen, setBestStrategyOpen] = useState(true);
  const [flipOpen, setFlipOpen] = useState(false);
  const [rentalOpen, setRentalOpen] = useState(false);
  const [brrrrOpen, setBrrrrOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // ── Dirty tracking ──
  const isDirty = (
    price !== origPrice || arv !== origArv || rehab !== origRehab || rent !== origRent ||
    holdingMonths !== String(DEFAULTS.holdingMonths) ||
    closingCostPct !== String(DEFAULTS.closingCostsPercent) ||
    contingencyPct !== String(DEFAULTS.contingencyPercent) ||
    agentCommPct !== String(DEFAULTS.agentCommissionPercent) ||
    managementPct !== String(DEFAULTS.propertyManagementPercent) ||
    maintenanceVacancyPct !== String(DEFAULTS.maintenanceVacancyPercent) ||
    capexPct !== String(DEFAULTS.capexPercent) ||
    refiLtv !== String(DEFAULTS.refiLtv) ||
    refiRate !== String(DEFAULTS.refiRate) ||
    hmlPurchaseLtv !== String(DEFAULTS.hmlLtvPurchase) ||
    hmlRehabPct !== String(DEFAULTS.hmlLtvRehab) ||
    hmlRate !== String(DEFAULTS.hmlRate) ||
    hmlPoints !== String(DEFAULTS.hmlPoints)
  );

  // ── Computed base values ──
  const priceV = num(price);
  const arvV = num(arv);
  const rehabV = num(rehab);
  const rentV = num(rent);

  // What-If adjusted price
  const adjPriceV = priceV * (1 + priceAdjPct / 100);

  // ── Flip calc ──────────────────────────────────────────────────────────────
  const { flipNetProfit, flipROI, flipSpread, flipTotalInvested, closingCostBuyV,
    contingencyV, totalHoldingV, agentCommV, monthlyHoldingV } = useMemo(() => {
    const closingCostBuyV = adjPriceV * (num(closingCostPct) / 100);
    const contingencyV = rehabV * (num(contingencyPct) / 100);
    const monthlyHoldingV = num(propTaxMonthly) + num(insuranceMonthly) + num(hoaMonthly);
    const totalHoldingV = monthlyHoldingV * num(holdingMonths);
    const flipTotalInvested = adjPriceV + closingCostBuyV + rehabV + contingencyV + totalHoldingV;
    const agentCommV = arvV * (num(agentCommPct) / 100);
    const flipNetProfit = arvV - flipTotalInvested - agentCommV;
    const flipROI = flipTotalInvested > 0 ? (flipNetProfit / flipTotalInvested) * 100 : 0;
    const flipSpread = arvV - adjPriceV - rehabV;
    return { flipNetProfit, flipROI, flipSpread, flipTotalInvested, closingCostBuyV, contingencyV, totalHoldingV, agentCommV, monthlyHoldingV };
  }, [adjPriceV, arvV, rehabV, closingCostPct, contingencyPct, propTaxMonthly, insuranceMonthly, hoaMonthly, holdingMonths, agentCommPct]);

  // ── Rental calc ─────────────────────────────────────────────────────────────
  const { rentalCashFlow, capRate, noi, vacancyLoss, managementCost, maintenanceCost,
    capexCost, mortgagePnI, dpV, loanV, cocReturn, cashInvested } = useMemo(() => {
    const vacancyLoss = rentV * 0.08; // 8% vacancy built into maintenanceVacancy
    const managementCost = rentV * (num(managementPct) / 100);
    const maintenanceCost = rentV * (num(maintenanceVacancyPct) / 100);
    const capexCost = rentV * (num(capexPct) / 100);
    const rentalOpEx = num(propTaxMonthly) + num(insuranceMonthly) + num(hoaMonthly) + managementCost + maintenanceCost + capexCost;
    const noi = rentV - rentalOpEx;
    const capRate = adjPriceV > 0 ? ((noi * 12) / adjPriceV) * 100 : 0;
    const dpV = adjPriceV * (num(downPaymentPct) / 100);
    const loanV = adjPriceV + rehabV - dpV;
    const mortgagePnI = monthlyPI(loanV, num(mortgageRate) / 100, num(mortgageTerm));
    const rentalCashFlow = noi - mortgagePnI;
    const cashInvested = dpV + rehabV;
    const cocReturn = cashInvested > 0 ? ((rentalCashFlow * 12) / cashInvested) * 100 : 0;
    return { rentalCashFlow, capRate, noi, vacancyLoss, managementCost, maintenanceCost, capexCost, mortgagePnI, dpV, loanV, cocReturn, cashInvested };
  }, [rentV, adjPriceV, rehabV, managementPct, maintenanceVacancyPct, capexPct, propTaxMonthly, insuranceMonthly, hoaMonthly, downPaymentPct, mortgageRate, mortgageTerm]);

  // ── BRRRR calc ──────────────────────────────────────────────────────────────
  const { moneyInDealV, brrrrCashFlow, brrrrCashToCloseV, refiLoanV, refiClosingV,
    cashToBorrowerV, brrrrMortgage, hmlTotalV, hmlInterestV, hmlPointsCostV,
    payOffHmlV, cashAfterHmlV } = useMemo(() => {
    const refiLoanV = arvV * (num(refiLtv) / 100);
    const refiClosingV = refiLoanV * (num(refiClosingPct) / 100);
    const cashToBorrowerV = refiLoanV - refiClosingV;
    const brrrrMortgage = monthlyPI(refiLoanV, num(refiRate) / 100, num(refiTerm));
    const brrrrCashFlow = noi - brrrrMortgage;
    const closingCostBuyLocal = adjPriceV * (num(closingCostPct) / 100);

    let brrrrCashToCloseV: number;
    let hmlTotalV = 0, hmlInterestV = 0, hmlPointsCostV = 0;
    let payOffHmlV = 0, cashAfterHmlV = 0;

    if (brrrrMode === 'cash') {
      brrrrCashToCloseV = adjPriceV + rehabV + closingCostBuyLocal;
    } else {
      const hmlLoanPurchaseV = adjPriceV * (num(hmlPurchaseLtv) / 100);
      const hmlLoanRehabV = rehabV * (num(hmlRehabPct) / 100);
      hmlTotalV = hmlLoanPurchaseV + hmlLoanRehabV;
      hmlInterestV = hmlTotalV * (num(hmlRate) / 100 / 12) * num(hmlMonths);
      hmlPointsCostV = hmlLoanPurchaseV * (num(hmlPoints) / 100);
      brrrrCashToCloseV = (adjPriceV - hmlLoanPurchaseV) + (rehabV - hmlLoanRehabV) + closingCostBuyLocal + hmlInterestV + hmlPointsCostV;
      payOffHmlV = hmlTotalV;
      cashAfterHmlV = cashToBorrowerV - payOffHmlV;
    }

    const moneyInDealV = Math.max(0, brrrrCashToCloseV - (brrrrMode === 'cash' ? cashToBorrowerV : cashAfterHmlV));
    return { moneyInDealV, brrrrCashFlow, brrrrCashToCloseV, refiLoanV, refiClosingV, cashToBorrowerV, brrrrMortgage, hmlTotalV, hmlInterestV, hmlPointsCostV, payOffHmlV, cashAfterHmlV };
  }, [arvV, adjPriceV, rehabV, noi, refiLtv, refiClosingPct, refiRate, refiTerm, brrrrMode, closingCostPct, hmlPurchaseLtv, hmlRehabPct, hmlRate, hmlMonths, hmlPoints]);

  // ── Best Strategy ranking ─────────────────────────────────────────────────
  const strategies = useMemo(() => {
    const brrrrCoCReturn = moneyInDealV > 0 ? ((brrrrCashFlow * 12) / moneyInDealV) * 100 : 0;
    const items = [
      { label: 'Flip', color: 'text-orange-400', score: flipROI, display: `ROI ${pct(flipROI)}`, sub: `Profit ${formatCurrency(flipNetProfit)}`, positive: flipNetProfit > 0 },
      { label: 'Rental', color: 'text-cyan-400', score: capRate, display: `Cap ${pct(capRate)}`, sub: `CF ${formatCurrency(rentalCashFlow)}/mo`, positive: rentalCashFlow > 0 },
      { label: 'BRRRR', color: 'text-purple-400', score: brrrrCashFlow >= 250 && moneyInDealV <= 30000 ? 100 - moneyInDealV / 1000 : brrrrCoCReturn, display: `In Deal ${formatCurrency(moneyInDealV)}`, sub: `CF ${formatCurrency(brrrrCashFlow)}/mo`, positive: brrrrCashFlow >= 250 && moneyInDealV <= 30000 },
    ];
    return items.sort((a, b) => b.score - a.score);
  }, [flipROI, flipNetProfit, capRate, rentalCashFlow, moneyInDealV, brrrrCashFlow]);

  // ── Status ───────────────────────────────────────────────────────────────
  const status = deal.status || 'new';
  const runAiAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    setShowAiView(true);
    try {
      const { data, error } = await supabase.functions.invoke('scout-ai-analyze', {
        body: {
          deal: {
            address: deal.address,
            zip: deal.zip,
            price: deal.price,
            arv: deal.arv_override ?? deal.arv,
            rehab: deal.rehab_override ?? deal.rehab,
            rent: deal.rent_override ?? deal.rent,
            beds: deal.beds,
            baths: deal.baths,
            sqft: deal.sqft,
            days_on_market: deal.days_on_market,
            score: deal.score,
            grade: deal.grade,
          }
        }
      });
      if (error || !data?.success) {
        setAiError(error?.message || data?.error || 'Analysis failed');
      } else {
        setAiAnalysis(data.analysis);
        setAiCost(data.costUsd ?? null);
        setAiTokens(data.inputTokens != null
          ? { input: data.inputTokens, output: data.outputTokens }
          : null);
        // Save to DB if we have an ID
        if (deal.id) {
          await supabase.from('scout_ai_analyses').upsert({
            scout_result_id: deal.id,
            zpid: deal.zpid,
            analysis: data.analysis,
            comps_used:     data.compsUsed     || 0,
            tokens_used:    data.tokensUsed    || 0,
            cost_usd:       data.costUsd       || 0,
            model:          data.model         || null,
            input_tokens:   data.inputTokens   || 0,
            output_tokens:  data.outputTokens  || 0,
          }, { onConflict: 'scout_result_id' });
        }
      }
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiLoading(false);
    }
  };

  const handleStatus = async (s: DealStatus) => {
    const newStatus = status === s ? 'new' : s;
    setDeal(d => ({ ...d, status: newStatus }));
    if (deal.id && onStatusChange) onStatusChange(deal.id, newStatus);
  };

  // ── Save overrides ─────────────────────────────────────────────────────────
  const saveOverrides = async () => {
    setSavingOverride(true);
    const overrides: Partial<ScoutResult> = {
      arv_override: arv !== origArv ? num(arv) || null : null,
      rehab_override: rehab !== origRehab ? num(rehab) || null : null,
      rent_override: rent !== origRent ? num(rent) || null : null,
      notes: notes || null,
    };
    setDeal(d => ({ ...d, ...overrides }));
    if (deal.id) {
      await updateResultOverrides(deal.id, overrides);
      if (onOverrideChange) onOverrideChange(deal.id, overrides);
    }
    setNotesSaved(true);
    setSavingOverride(false);
  };

  const handleReset = () => {
    setPrice(origPrice);
    setArv(origArv);
    setRehab(origRehab);
    setRent(origRent);
    setHoldingMonths(String(DEFAULTS.holdingMonths));
    setClosingCostPct(String(DEFAULTS.closingCostsPercent));
    setContingencyPct(String(DEFAULTS.contingencyPercent));
    setAgentCommPct(String(DEFAULTS.agentCommissionPercent));
    setManagementPct(String(DEFAULTS.propertyManagementPercent));
    setMaintenanceVacancyPct(String(DEFAULTS.maintenanceVacancyPercent));
    setCapexPct(String(DEFAULTS.capexPercent));
    setRefiLtv(String(DEFAULTS.refiLtv));
    setRefiRate(String(DEFAULTS.refiRate));
    setHmlPurchaseLtv(String(DEFAULTS.hmlLtvPurchase));
    setHmlRehabPct(String(DEFAULTS.hmlLtvRehab));
    setHmlRate(String(DEFAULTS.hmlRate));
    setHmlPoints(String(DEFAULTS.hmlPoints));
  };

  const gradeColors: Record<string, string> = {
    A: 'bg-green-500/20 text-green-400 border-green-500/40',
    B: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    C: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    D: 'bg-red-500/20 text-red-400 border-red-500/40',
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-card/40 shrink-0 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="w-px h-4 bg-border/50" />

        {deal.img_src && (
          <img src={deal.img_src} alt="" className="w-10 h-8 object-cover rounded shrink-0 opacity-90" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-xs font-bold px-2 py-0.5 rounded border', gradeColors[deal.grade] || gradeColors.D)}>
              {deal.grade}
            </span>
            <span className="text-xs text-muted-foreground">{deal.score}/100</span>
            {deal.zip && (
              <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded">
                {deal.zip}
              </span>
            )}
            <h1 className="font-semibold text-sm">{deal.address}</h1>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
            <span>
              {deal.beds}bd · {deal.baths}ba · {deal.sqft?.toLocaleString()} sqft · {deal.days_on_market}d on market
            </span>
          </div>
        </div>

        {/* Status + Zillow buttons */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {([
            {
              s: 'hot' as DealStatus, icon: Flame, label: 'Hot',
              cls: cn('hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/40', status === 'hot' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'border-border/40 text-muted-foreground'),
            },
            {
              s: 'watching' as DealStatus, icon: Eye, label: 'Watch',
              cls: cn('hover:bg-yellow-500/20 hover:text-yellow-400 hover:border-yellow-500/40', status === 'watching' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' : 'border-border/40 text-muted-foreground'),
            },
            {
              s: 'skip' as DealStatus, icon: SkipForward, label: 'Skip',
              cls: cn('hover:bg-zinc-500/20 hover:text-zinc-400 hover:border-zinc-500/40', status === 'skip' ? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' : 'border-border/40 text-muted-foreground'),
            },
          ]).map(({ s, icon: Icon, label, cls }) => (
            <button
              key={s}
              onClick={() => handleStatus(s)}
              className={cn('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border transition-all', cls)}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}

          {deal.detail_url && (
            <a
              href={deal.detail_url?.startsWith('http') ? deal.detail_url : `https://www.zillow.com${deal.detail_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-border/40 text-muted-foreground hover:text-blue-400 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Zillow
            </a>
          )}

          {/* AI Analysis button */}
          <button
            onClick={() => aiAnalysis ? setShowAiView(v => !v) : runAiAnalysis()}
            disabled={aiLoading}
            className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border font-medium transition-all',
              aiAnalysis
                ? showAiView
                  ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                  : 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20'
                : 'bg-gradient-to-r from-violet-500/20 to-blue-500/20 text-violet-300 border-violet-500/40 hover:from-violet-500/30 hover:to-blue-500/30'
            )}
          >
            {aiLoading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
              : aiAnalysis
                ? <><Sparkles className="w-3.5 h-3.5" /> {showAiView ? 'Hide AI Report' : 'Show AI Report'}</>
                : <><Sparkles className="w-3.5 h-3.5" /> 🤖 AI Deep Analysis</>
            }
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">

        {/* ── AI Analysis View ─────────────────────────────────────────────── */}
        {showAiView && (
          <div className="space-y-4">
            {/* Loading state */}
            {aiLoading && (
              <Card className="border-violet-500/30 bg-violet-500/5">
                <CardContent className="p-8 text-center space-y-4">
                  <Loader2 className="w-10 h-10 text-violet-400 animate-spin mx-auto" />
                  <div>
                    <p className="font-semibold text-violet-300">Claude is analyzing this deal...</p>
                    <p className="text-sm text-muted-foreground mt-1">Fetching comps, evaluating ARV, estimating rehab & rent</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error state */}
            {aiError && !aiLoading && (
              <Card className="border-red-500/30">
                <CardContent className="p-4 flex items-center gap-3 text-red-400">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Analysis failed</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{aiError}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={runAiAnalysis} className="ml-auto text-xs">
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {aiAnalysis && !aiLoading && <AiReport analysis={aiAnalysis} deal={deal} onRerun={runAiAnalysis} />}

            {/* Cost badge */}
            {aiAnalysis && !aiLoading && (
              <div className="flex items-center justify-center gap-2 py-1">
                <span className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  {aiTokens
                    ? `${(aiTokens.input + aiTokens.output).toLocaleString()} tokens (in:${aiTokens.input.toLocaleString()} out:${aiTokens.output.toLocaleString()})`
                    : null}
                  {aiCost != null && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-mono font-medium">
                      ${aiCost.toFixed(4)}
                    </span>
                  )}
                </span>
              </div>
            )}

            <div className="border-t border-border/30 pt-2">
              <p className="text-xs text-muted-foreground text-center">↓ Standard analysis below</p>
            </div>
          </div>
        )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* MODIFIED ASSUMPTIONS (Collapsible)                                */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Collapsible open={assumptionsOpen} onOpenChange={setAssumptionsOpen}>
            <Card className={cn(
              'border-2 bg-gradient-to-r from-primary/10 to-primary/5 transition-all',
              isDirty ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-primary',
            )}>
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 pt-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      {isDirty && (
                        <span className="flex items-center gap-1.5 text-amber-400 animate-pulse">
                          <Save className="w-3.5 h-3.5" />
                          <span className="text-xs font-semibold">Unsaved</span>
                        </span>
                      )}
                      {isDirty ? 'Modified Assumptions' : 'Key Assumptions'}
                      {!assumptionsOpen && (
                        <span className="text-xs text-muted-foreground ml-2">(Click to expand)</span>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {isDirty && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={e => { e.stopPropagation(); saveOverrides(); }}
                          disabled={savingOverride}
                          className="text-xs h-7 px-3 bg-amber-500 hover:bg-amber-600 text-black font-semibold animate-pulse"
                        >
                          {savingOverride ? '...' : <><Save className="w-3 h-3 mr-1" />Save Changes</>}
                        </Button>
                      )}
                      {isDirty && assumptionsOpen && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={e => { e.stopPropagation(); handleReset(); }}
                          className="text-[10px] h-5 px-1.5 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                          Reset
                        </Button>
                      )}
                      {assumptionsOpen
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      }
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4 pt-0 space-y-6">

                  {/* Large boxes: Price, ARV, Rehab, Rent */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <BigInput
                      label="Price"
                      value={price}
                      onChange={setPrice}
                      isModified={price !== origPrice}
                      originalValue={formatCurrency(num(origPrice))}
                      onReset={() => setPrice(origPrice)}
                    />
                    <BigInput
                      label="ARV"
                      value={arv}
                      onChange={setArv}
                      isModified={arv !== origArv}
                      originalValue={formatCurrency(num(origArv))}
                      onReset={() => setArv(origArv)}
                    />
                    <BigInput
                      label="Rehab Cost"
                      value={rehab}
                      onChange={setRehab}
                      isModified={rehab !== origRehab}
                      originalValue={formatCurrency(num(origRehab))}
                      onReset={() => setRehab(origRehab)}
                    />
                    <BigInput
                      label="Rent / mo"
                      value={rent}
                      onChange={setRent}
                      isModified={rent !== origRent}
                      originalValue={formatCurrency(num(origRent))}
                      onReset={() => setRent(origRent)}
                    />
                  </div>

                  {/* Groups */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                    {/* Holding */}
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Holding</p>
                      <SmallInput label="Months" value={holdingMonths} onChange={setHoldingMonths} placeholder="4" />
                      <SmallInput label="Prop Tax" value={propTaxMonthly} onChange={setPropTaxMonthly} prefix="$" placeholder="150" />
                      <SmallInput label="Insurance" value={insuranceMonthly} onChange={setInsuranceMonthly} prefix="$" placeholder="100" />
                      <SmallInput label="HOA" value={hoaMonthly} onChange={setHoaMonthly} prefix="$" placeholder="0" />
                    </div>

                    {/* Flip */}
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Flip</p>
                      <SmallInput label="Closing %" value={closingCostPct} onChange={setClosingCostPct} suffix="%" placeholder="2" />
                      <SmallInput label="Contingency %" value={contingencyPct} onChange={setContingencyPct} suffix="%" placeholder="10" />
                      <SmallInput label="Agent %" value={agentCommPct} onChange={setAgentCommPct} suffix="%" placeholder="6" />
                    </div>

                    {/* Rental */}
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Rental</p>
                      <SmallInput label="Management %" value={managementPct} onChange={setManagementPct} suffix="%" placeholder="10" />
                      <SmallInput label="Maint/Vacancy %" value={maintenanceVacancyPct} onChange={setMaintenanceVacancyPct} suffix="%" placeholder="12" />
                      <SmallInput label="CapEx %" value={capexPct} onChange={setCapexPct} suffix="%" placeholder="0" />
                      <SmallInput label="Down Payment %" value={downPaymentPct} onChange={setDownPaymentPct} suffix="%" placeholder="20" />
                      <SmallInput label="Rate %" value={mortgageRate} onChange={setMortgageRate} suffix="%" placeholder="7" />
                    </div>

                    {/* BRRRR */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">BRRRR</p>
                        <div className="flex rounded overflow-hidden border border-border/40">
                          {(['cash', 'hml'] as const).map(m => (
                            <button
                              key={m}
                              onClick={() => setBrrrrMode(m)}
                              className={cn(
                                'text-[10px] px-2 py-0.5 transition-colors',
                                brrrrMode === m ? 'bg-purple-500/30 text-purple-300' : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {m === 'cash' ? 'Cash' : 'HML'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <SmallInput label="Refi LTV %" value={refiLtv} onChange={setRefiLtv} suffix="%" placeholder="75" />
                      <SmallInput label="Refi Rate %" value={refiRate} onChange={setRefiRate} suffix="%" placeholder="7" />
                      {brrrrMode === 'hml' && (
                        <>
                          <SmallInput label="HML Purchase LTV" value={hmlPurchaseLtv} onChange={setHmlPurchaseLtv} suffix="%" />
                          <SmallInput label="HML Rehab %" value={hmlRehabPct} onChange={setHmlRehabPct} suffix="%" />
                          <SmallInput label="HML Rate %" value={hmlRate} onChange={setHmlRate} suffix="%" />
                          <SmallInput label="HML Points" value={hmlPoints} onChange={setHmlPoints} suffix="pts" />
                          <SmallInput label="HML Months" value={hmlMonths} onChange={setHmlMonths} />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Save / Reset buttons */}
                  <div className="flex gap-2 pt-2 border-t border-border/30">
                    <Button
                      onClick={saveOverrides}
                      disabled={savingOverride || !isDirty}
                      className={cn(
                        'flex-1 h-8 text-xs font-semibold',
                        isDirty ? 'bg-amber-500 hover:bg-amber-600 text-black' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {savingOverride ? '...' : <><Save className="w-3.5 h-3.5 mr-1" />Save Changes</>}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleReset}
                      className="h-8 text-xs text-destructive/70 hover:text-destructive"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />Reset
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* BEST STRATEGY (Collapsible)                                       */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Collapsible open={bestStrategyOpen} onOpenChange={setBestStrategyOpen}>
            <Card className="border border-primary/30 bg-card/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      <span className="text-primary">Best Strategy</span>
                      {!bestStrategyOpen && strategies[0] && (
                        <span className="text-xs text-muted-foreground ml-2">
                          Best: <span className={cn('font-semibold', strategies[0].color)}>{strategies[0].label}</span>
                        </span>
                      )}
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', bestStrategyOpen && 'rotate-180')} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4 pt-2">
                  <div className="grid grid-cols-3 gap-3">
                    {strategies.map((s, i) => (
                      <div
                        key={s.label}
                        className={cn(
                          'text-center p-3 rounded-lg border transition-all',
                          i === 0
                            ? s.label === 'Flip' ? 'border-orange-500/40 bg-orange-500/10'
                              : s.label === 'Rental' ? 'border-cyan-500/40 bg-cyan-500/10'
                              : 'border-purple-500/40 bg-purple-500/10'
                            : 'border-border/20 bg-background/30 opacity-70',
                        )}
                      >
                        {i === 0 && (
                          <div className="text-[10px] font-semibold text-amber-400 mb-1 uppercase tracking-wider">Best</div>
                        )}
                        {i === 1 && (
                          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">2nd</div>
                        )}
                        {i === 2 && (
                          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">3rd</div>
                        )}
                        <div className={cn('font-bold text-sm', s.color)}>{s.label}</div>
                        <div className={cn('text-sm font-semibold mt-1', s.positive ? 'text-emerald-400' : 'text-red-400')}>{s.display}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* FLIP ANALYSIS (Collapsible, orange)                               */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Collapsible open={flipOpen} onOpenChange={setFlipOpen}>
            <Card className="border border-orange-500/30 bg-card/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-orange-400" />
                      <span className="text-orange-400">Flip Analysis</span>
                      {!flipOpen && (
                        <div className="flex items-center gap-3 ml-2 text-xs">
                          <span className="text-muted-foreground">Profit:</span>
                          <span className={cn('font-bold', flipNetProfit >= 30000 ? 'text-emerald-400' : flipNetProfit >= 0 ? 'text-amber-400' : 'text-red-400')}>
                            {formatCurrency(flipNetProfit)}
                          </span>
                          <span className="text-muted-foreground">ROI:</span>
                          <span className={cn('font-bold', flipROI >= 25 ? 'text-emerald-400' : flipROI >= 15 ? 'text-amber-400' : 'text-red-400')}>
                            {flipROI.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', flipOpen && 'rotate-180')} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4 pt-2">
                  <div className="space-y-0">
                    <ARow label="ARV (After Repair Value)" value={formatCurrency(arvV)} color="text-emerald-400" bold />
                    <ARow label="Purchase Price" value={`-${formatCurrency(adjPriceV)}`} color="text-red-400" indent />
                    <ARow label={`Closing Costs (${closingCostPct}%)`} value={`-${formatCurrency(closingCostBuyV)}`} color="text-red-400" indent />
                    <ARow label="Rehab Cost" value={`-${formatCurrency(rehabV)}`} color="text-red-400" indent />
                    <ARow label={`Rehab Contingency (${contingencyPct}%)`} value={`-${formatCurrency(contingencyV)}`} color="text-red-400" indent />
                    <ARow
                      label={`Holding Costs (${holdingMonths} mo × ${formatCurrency(monthlyHoldingV)}/mo)`}
                      value={`-${formatCurrency(totalHoldingV)}`}
                      color="text-red-400"
                      indent
                    />
                    <ARow label="Total Invested" value={formatCurrency(flipTotalInvested)} bold />
                    <ARow label={`Agent Commission (${agentCommPct}%)`} value={`-${formatCurrency(agentCommV)}`} color="text-red-400" indent />
                    <div className={cn('flex justify-between items-center py-2 mt-1 border-t-2', flipNetProfit >= 0 ? 'border-emerald-500/40' : 'border-red-500/40')}>
                      <span className="font-bold text-sm">Net Profit</span>
                      <span className={cn('font-bold text-lg', flipNetProfit >= 30000 ? 'text-emerald-400' : flipNetProfit >= 0 ? 'text-amber-400' : 'text-red-400')}>
                        {formatCurrency(flipNetProfit)}
                      </span>
                    </div>
                    <ARow
                      label="ROI"
                      value={pct(flipROI)}
                      color={flipROI >= 25 ? 'text-emerald-400' : flipROI >= 15 ? 'text-amber-400' : 'text-red-400'}
                    />
                    <ARow
                      label="Spread (ARV - Price - Rehab)"
                      value={formatCurrency(flipSpread)}
                    />
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* RENTAL ANALYSIS (Collapsible, cyan)                               */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Collapsible open={rentalOpen} onOpenChange={setRentalOpen}>
            <Card className="border border-cyan-500/30 bg-card/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-cyan-400" />
                      <span className="text-cyan-400">Rental Analysis</span>
                      {!rentalOpen && (
                        rentV > 0 ? (
                          <div className="flex items-center gap-3 ml-2 text-xs">
                            <span className="text-muted-foreground">CF:</span>
                            <span className={cn('font-bold', rentalCashFlow >= 250 ? 'text-emerald-400' : rentalCashFlow >= 0 ? 'text-amber-400' : 'text-red-400')}>
                              {formatCurrency(rentalCashFlow)}/mo
                            </span>
                            <span className="text-muted-foreground">Cap:</span>
                            <span className={cn('font-bold', capRate >= 8 ? 'text-emerald-400' : capRate >= 5 ? 'text-amber-400' : 'text-red-400')}>
                              {pct(capRate)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground ml-2">Enter rent to calculate</span>
                        )
                      )}
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', rentalOpen && 'rotate-180')} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4 pt-2">
                  <div className="space-y-0">
                    <ARow label="Gross Monthly Rent" value={`${formatCurrency(rentV)}/mo`} bold />
                    <ARow label="Property Tax" value={`-${formatCurrency(num(propTaxMonthly))}/mo`} color="text-red-400" indent />
                    <ARow label="Insurance" value={`-${formatCurrency(num(insuranceMonthly))}/mo`} color="text-red-400" indent />
                    {num(hoaMonthly) > 0 && <ARow label="HOA" value={`-${formatCurrency(num(hoaMonthly))}/mo`} color="text-red-400" indent />}
                    <ARow label={`Management (${managementPct}%)`} value={`-${formatCurrency(managementCost)}/mo`} color="text-red-400" indent />
                    <ARow label={`Maint/Vacancy (${maintenanceVacancyPct}%)`} value={`-${formatCurrency(maintenanceCost)}/mo`} color="text-red-400" indent />
                    {num(capexPct) > 0 && <ARow label={`CapEx (${capexPct}%)`} value={`-${formatCurrency(capexCost)}/mo`} color="text-red-400" indent />}
                    <ARow label="NOI" value={`${formatCurrency(noi)}/mo`} bold />
                    <ARow
                      label={`Mortgage P&I (${downPaymentPct}% down on purchase+rehab, ${mortgageRate}%, ${mortgageTerm}yr)`}
                      value={`-${formatCurrency(mortgagePnI)}/mo`}
                      color="text-red-400"
                      indent
                    />
                    <div className={cn('flex justify-between items-center py-2 mt-1 border-t-2', rentalCashFlow >= 0 ? 'border-emerald-500/40' : 'border-red-500/40')}>
                      <span className="font-bold text-sm">Monthly Cash Flow</span>
                      <span className={cn('font-bold text-lg', rentalCashFlow >= 250 ? 'text-emerald-400' : rentalCashFlow >= 0 ? 'text-amber-400' : 'text-red-400')}>
                        {formatCurrency(rentalCashFlow)}/mo
                      </span>
                    </div>
                    <ARow label="Annual Cash Flow" value={formatCurrency(rentalCashFlow * 12)} color={rentalCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                    <ARow label="Cap Rate" value={pct(capRate)} color={capRate >= 8 ? 'text-emerald-400' : capRate >= 5 ? 'text-amber-400' : 'text-red-400'} />
                    <ARow label="Cash on Cash Return" value={pct(cocReturn)} color={cocReturn >= 10 ? 'text-emerald-400' : cocReturn >= 5 ? 'text-amber-400' : 'text-red-400'} bold />
                    <ARow label="Cash Invested (Down + Rehab)" value={formatCurrency(cashInvested)} />
                    <ARow label="Loan Amount" value={formatCurrency(loanV)} />
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* BRRRR ANALYSIS (Collapsible, purple)                              */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Collapsible open={brrrrOpen} onOpenChange={setBrrrrOpen}>
            <Card className="border border-purple-500/30 bg-card/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Repeat2 className="w-4 h-4 text-purple-400" />
                      <span className="text-purple-400">BRRRR Analysis</span>
                      {!brrrrOpen && (
                        <div className="flex items-center gap-3 ml-2 text-xs">
                          <span className="text-muted-foreground">In Deal:</span>
                          <span className={cn('font-bold', moneyInDealV <= 0 ? 'text-emerald-400' : moneyInDealV <= 5000 ? 'text-emerald-400' : moneyInDealV <= 25000 ? 'text-amber-400' : 'text-muted-foreground')}>
                            {moneyInDealV <= 0 ? 'INFINITE' : formatCurrency(moneyInDealV)}
                          </span>
                          <span className="text-muted-foreground">CF:</span>
                          <span className={cn('font-bold', brrrrCashFlow >= 250 ? 'text-emerald-400' : brrrrCashFlow >= 0 ? 'text-amber-400' : 'text-red-400')}>
                            {formatCurrency(brrrrCashFlow)}/mo
                          </span>
                        </div>
                      )}
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', brrrrOpen && 'rotate-180')} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4 pt-2 space-y-4">
                  {/* Phase 1 */}
                  <div>
                    <p className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider mb-2">
                      Phase 1: Acquisition & Rehab ({brrrrMode === 'hml' ? 'HML Financing' : 'Cash'})
                    </p>
                    {brrrrMode === 'hml' && (
                      <>
                        <ARow label="HML Total Loan" value={formatCurrency(hmlTotalV)} color="text-orange-400" bold />
                        <ARow label="HML Interest" value={`-${formatCurrency(hmlInterestV)}`} color="text-red-400" indent />
                        <ARow label="HML Points" value={`-${formatCurrency(hmlPointsCostV)}`} color="text-red-400" indent />
                      </>
                    )}
                    <ARow label="Cash to Close (Phase 1)" value={formatCurrency(brrrrCashToCloseV)} bold />
                  </div>

                  {/* Phase 2 */}
                  <div>
                    <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider mb-2">
                      Phase 2: Refinance ({refiLtv}% of ARV)
                    </p>
                    <ARow label="ARV" value={formatCurrency(arvV)} />
                    <ARow label={`Refi Loan (${refiLtv}% LTV)`} value={formatCurrency(refiLoanV)} color="text-blue-400" />
                    <ARow label={`Closing Costs (${refiClosingPct}%)`} value={`-${formatCurrency(refiClosingV)}`} color="text-red-400" indent />
                    <ARow label="Cash to Borrower" value={formatCurrency(cashToBorrowerV)} color="text-emerald-400" bold />
                    {brrrrMode === 'hml' && (
                      <>
                        <ARow label="Pay Off HML" value={`-${formatCurrency(payOffHmlV)}`} color="text-red-400" indent />
                        <ARow label="Net Cash After HML" value={formatCurrency(cashAfterHmlV)} color={cashAfterHmlV >= 0 ? 'text-emerald-400' : 'text-red-400'} bold />
                      </>
                    )}
                    <div className={cn('flex justify-between items-center py-2 mt-1 border-t-2', moneyInDealV <= 0 ? 'border-emerald-500/40' : moneyInDealV <= 30000 ? 'border-amber-500/40' : 'border-border/40')}>
                      <span className="font-bold text-sm">Money in Deal</span>
                      <span className={cn('font-bold text-lg', moneyInDealV <= 0 ? 'text-emerald-400' : moneyInDealV <= 30000 ? 'text-emerald-400' : moneyInDealV <= 50000 ? 'text-amber-400' : 'text-foreground')}>
                        {moneyInDealV <= 0 ? 'INFINITE RETURN' : formatCurrency(moneyInDealV)}
                      </span>
                    </div>
                  </div>

                  {/* Phase 3 */}
                  <div>
                    <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider mb-2">
                      Phase 3: Rental Cash Flow (refi mortgage)
                    </p>
                    <ARow label="NOI" value={`${formatCurrency(noi)}/mo`} />
                    <ARow label={`Refi Mortgage (${refiRate}%, ${refiTerm}yr)`} value={`-${formatCurrency(brrrrMortgage)}/mo`} color="text-red-400" indent />
                    <div className={cn('flex justify-between items-center py-2 mt-1 border-t-2', brrrrCashFlow >= 0 ? 'border-emerald-500/40' : 'border-red-500/40')}>
                      <span className="font-bold text-sm">Monthly Cash Flow</span>
                      <span className={cn('font-bold text-lg', brrrrCashFlow >= 250 ? 'text-emerald-400' : brrrrCashFlow >= 0 ? 'text-amber-400' : 'text-red-400')}>
                        {formatCurrency(brrrrCashFlow)}/mo
                      </span>
                    </div>
                    <ARow label="Annual Cash Flow" value={formatCurrency(brrrrCashFlow * 12)} color={brrrrCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                    {moneyInDealV > 0 && (
                      <ARow
                        label="Cash on Cash Return"
                        value={pct(((brrrrCashFlow * 12) / moneyInDealV) * 100)}
                        color={((brrrrCashFlow * 12) / moneyInDealV) * 100 >= 10 ? 'text-emerald-400' : ((brrrrCashFlow * 12) / moneyInDealV) * 100 >= 5 ? 'text-amber-400' : 'text-red-400'}
                        bold
                      />
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* WHAT-IF ANALYSIS (Collapsible)                                    */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Collapsible open={whatIfOpen} onOpenChange={setWhatIfOpen}>
            <Card className="border border-border/40 bg-card/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-muted-foreground" />
                      <span>What-If Analysis</span>
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', whatIfOpen && 'rotate-180')} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4 pt-2 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">Price Adjustment</p>
                      <span className={cn('text-sm font-bold', priceAdjPct < 0 ? 'text-emerald-400' : priceAdjPct > 0 ? 'text-red-400' : 'text-muted-foreground')}>
                        {priceAdjPct > 0 ? '+' : ''}{priceAdjPct}% ({formatCurrency(adjPriceV)})
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      step={1}
                      value={priceAdjPct}
                      onChange={e => setPriceAdjPct(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>-30% ({formatCurrency(priceV * 0.7)})</span>
                      <span>Base ({formatCurrency(priceV)})</span>
                      <span>+30% ({formatCurrency(priceV * 1.3)})</span>
                    </div>
                  </div>

                  {priceAdjPct !== 0 && (
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/30">
                      <div className="text-center p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
                        <p className="text-[10px] text-muted-foreground uppercase mb-1">Flip Profit</p>
                        <p className={cn('text-sm font-bold', flipNetProfit >= 30000 ? 'text-emerald-400' : flipNetProfit >= 0 ? 'text-amber-400' : 'text-red-400')}>
                          {formatCurrency(flipNetProfit)}
                        </p>
                        <p className={cn('text-xs', flipROI >= 20 ? 'text-emerald-400' : 'text-muted-foreground')}>ROI {pct(flipROI)}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
                        <p className="text-[10px] text-muted-foreground uppercase mb-1">Rental CF</p>
                        <p className={cn('text-sm font-bold', rentalCashFlow >= 250 ? 'text-emerald-400' : rentalCashFlow >= 0 ? 'text-amber-400' : 'text-red-400')}>
                          {formatCurrency(rentalCashFlow)}/mo
                        </p>
                        <p className={cn('text-xs', capRate >= 7 ? 'text-emerald-400' : 'text-muted-foreground')}>Cap {pct(capRate)}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
                        <p className="text-[10px] text-muted-foreground uppercase mb-1">BRRRR In Deal</p>
                        <p className={cn('text-sm font-bold', moneyInDealV <= 0 ? 'text-emerald-400' : moneyInDealV <= 25000 ? 'text-amber-400' : 'text-foreground')}>
                          {moneyInDealV <= 0 ? 'INF' : formatCurrency(moneyInDealV)}
                        </p>
                        <p className={cn('text-xs', brrrrCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400')}>CF {formatCurrency(brrrrCashFlow)}/mo</p>
                      </div>
                    </div>
                  )}

                  {priceAdjPct === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Move the slider to see how price changes affect all three strategies simultaneously.
                    </p>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPriceAdjPct(0)}
                    disabled={priceAdjPct === 0}
                    className="w-full text-xs h-7"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />Reset to Base Price
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* NOTES (Collapsible)                                               */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
            <Card className="border border-border/40 bg-card/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>Notes</span>
                      {notes && !notesOpen && (
                        <span className="text-xs text-muted-foreground ml-1">(has notes)</span>
                      )}
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', notesOpen && 'rotate-180')} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4 pt-0 space-y-3">
                  <textarea
                    value={notes}
                    onChange={e => { setNotes(e.target.value); setNotesSaved(false); }}
                    placeholder="Add notes about this deal..."
                    className="w-full h-28 text-sm bg-background border border-border/50 rounded px-3 py-2 resize-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={saveOverrides}
                      disabled={savingOverride || notesSaved}
                      className="flex-1 h-8 text-xs bg-primary hover:bg-primary/90"
                    >
                      {savingOverride ? '...' : <><Check className="w-3.5 h-3.5 mr-1" />Save Notes</>}
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* LOI Placeholder */}
          <Card className="border border-border/30 bg-card/30 opacity-60">
            <CardContent className="p-4 flex items-center gap-3 text-muted-foreground">
              <DollarSign className="w-4 h-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Letter of Intent</p>
                <p className="text-xs">LOI generation coming soon — will be available once deal is promoted to full analysis.</p>
              </div>
            </CardContent>
          </Card>

        </div>  {/* close max-w-5xl */}
      </div>
    </div>
  );
}

// ─── AI Report Component ──────────────────────────────────────────────────────
function AiReport({ analysis: a, deal, onRerun }: { analysis: any; deal: any; onRerun: () => void }) {
  const [compsOpen, setCompsOpen] = useState(false);
  const fc = (n: number | null | undefined) =>
    n == null ? '—' : `$${Math.round(n).toLocaleString()}`;

  const strategyColor = { flip: 'text-orange-400', rental: 'text-cyan-400', brrrr: 'text-purple-400', none: 'text-muted-foreground' };
  const strategyBg    = { flip: 'border-orange-500/30 bg-orange-500/5', rental: 'border-cyan-500/30 bg-cyan-500/5', brrrr: 'border-purple-500/30 bg-purple-500/5', none: 'border-border/30' };
  const best = a.strategyRecommendation?.best || 'none';

  const confidenceBadge = (c: string) => ({
    high:   'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low:    'bg-red-500/20 text-red-400 border-red-500/30',
  }[c] || 'bg-muted/20 text-muted-foreground border-border/30');

  const statusIsSold    = a.propertyStatus === 'sold';
  const statusIsPending = a.propertyStatus === 'pending';

  return (
    <div className="space-y-4">

      {/* ── Property status warning ───────────────────────────────────────── */}
      {(statusIsSold || statusIsPending) && (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-400">
                {statusIsSold ? '🚫 Property Already Sold' : '⚠️ Under Contract / Pending'}
              </p>
              <p className="text-xs text-muted-foreground">{a.propertyStatusDetail}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Header banner ────────────────────────────────────────────────── */}
      <Card className="border-violet-500/40 bg-gradient-to-r from-violet-500/10 to-blue-500/10">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-violet-400 shrink-0" />
              <div>
                <p className="font-bold text-violet-300">Claude AI Deep Analysis</p>
                <p className="text-xs text-muted-foreground mt-0.5">{deal.address}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-center">
                <p className={cn('text-2xl font-bold',
                  (a.confidenceScore||0) >= 7 ? 'text-emerald-400' : (a.confidenceScore||0) >= 5 ? 'text-yellow-400' : 'text-red-400')}>
                  {a.confidenceScore}<span className="text-sm text-muted-foreground">/10</span>
                </p>
                <p className="text-[10px] text-muted-foreground">AI Confidence</p>
              </div>
              <button onClick={onRerun} className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-all">
                <RefreshCw className="w-3 h-3" /> Re-analyze
              </button>
            </div>
          </div>
          {/* Verdict */}
          <div className={cn('mt-3 p-3 rounded-lg border text-sm font-medium', strategyBg[best as keyof typeof strategyBg] || 'border-border/30')}>
            <span className="text-muted-foreground text-xs">Verdict: </span>
            <span className={strategyColor[best as keyof typeof strategyColor]}>{a.overallVerdict}</span>
          </div>
          {/* Strategy ranking */}
          {a.strategyRecommendation?.ranking && (
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span>Ranking:</span>
              {(a.strategyRecommendation.ranking as string[]).map((s, i) => (
                <span key={s} className={cn('px-1.5 py-0.5 rounded border font-medium',
                  s === 'flip'   ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' :
                  s === 'rental' ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' :
                                   'text-purple-400 border-purple-500/30 bg-purple-500/10')}>
                  {i+1}. {s === 'flip' ? '🔥 Flip' : s === 'rental' ? '🏠 Rental' : '🔄 BRRRR'}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── ARV / Rehab / Rent cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ARV */}
        <Card className="border-green-500/30 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2 text-green-400">
              <Building2 className="w-4 h-4" /> ARV Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2 text-xs">
            <div className="flex items-end justify-between">
              <span className="text-muted-foreground">AI Recommended ARV</span>
              <span className="text-xl font-bold text-green-400">{fc(a.arvAnalysis?.recommendedARV)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Algo estimate</span>
              <span className={cn((a.arvAnalysis?.recommendedARV||0) >= ((deal.arv_override ?? deal.arv) || 0) ? 'text-emerald-400' : 'text-red-400')}>
                {fc(deal.arv_override ?? deal.arv)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price/sqft</span>
              <span>${a.arvAnalysis?.pricePerSqft || '—'}/sqft</span>
            </div>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', confidenceBadge(a.arvAnalysis?.confidence))}>
              {a.arvAnalysis?.confidence} confidence
            </span>
            <p className="text-muted-foreground text-[11px] pt-1 border-t border-border/20 leading-relaxed">{a.arvAnalysis?.reasoning}</p>
            {a.arvAnalysis?.compsSummary && (
              <p className="text-[11px] text-green-400/70 italic border-l-2 border-green-500/30 pl-2">{a.arvAnalysis.compsSummary}</p>
            )}
            <p className="text-[10px] text-violet-400/80 italic">{a.arvAnalysis?.arvVsAlgorithm}</p>
          </CardContent>
        </Card>

        {/* Rehab */}
        <Card className="border-yellow-500/30 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-400">
              <Wrench className="w-4 h-4" /> Rehab Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2 text-xs">
            <div className="flex items-end justify-between">
              <span className="text-muted-foreground">Estimated Cost</span>
              <span className="text-xl font-bold text-yellow-400">{fc(a.rehabAnalysis?.estimatedCost)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Condition</span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border',
                a.rehabAnalysis?.condition === 'light'  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                a.rehabAnalysis?.condition === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'  :
                a.rehabAnalysis?.condition === 'heavy'  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'  :
                'bg-red-500/20 text-red-400 border-red-500/30')}>
                {a.rehabAnalysis?.condition} rehab
              </span>
            </div>
            {a.rehabAnalysis?.breakdown && (
              <div className="space-y-0.5 pt-1 border-t border-border/20">
                {Object.entries(a.rehabAnalysis.breakdown)
                  .filter(([, v]) => (v as number) > 0)
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                      <span>{fc(v as number)}</span>
                    </div>
                  ))}
              </div>
            )}
            {a.rehabAnalysis?.scopeDetails && (
              <p className="text-[11px] text-yellow-400/70 italic border-l-2 border-yellow-500/30 pl-2">{a.rehabAnalysis.scopeDetails}</p>
            )}
            <p className="text-muted-foreground text-[11px] leading-relaxed">{a.rehabAnalysis?.reasoning}</p>
            <p className="text-[10px] text-violet-400/80 italic">{a.rehabAnalysis?.rehabVsAlgorithm}</p>
          </CardContent>
        </Card>

        {/* Rent */}
        <Card className="border-cyan-500/30 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2 text-cyan-400">
              <Home className="w-4 h-4" /> Rent Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2 text-xs">
            <div className="flex items-end justify-between">
              <span className="text-muted-foreground">Estimated Rent</span>
              <span className="text-xl font-bold text-cyan-400">{fc(a.rentAnalysis?.estimatedRent)}<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Algo estimate</span>
              <span>{fc(deal.rent_override ?? deal.rent)}/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Section 8</span>
              <span className={a.rentAnalysis?.section8Potential ? 'text-emerald-400' : 'text-muted-foreground'}>
                {a.rentAnalysis?.section8Potential
                  ? `✅ Yes${a.rentAnalysis?.section8Rate ? ` (~${fc(a.rentAnalysis.section8Rate)}/mo)` : ''}`
                  : '—'}
              </span>
            </div>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', confidenceBadge(a.rentAnalysis?.confidence))}>
              {a.rentAnalysis?.confidence} confidence
            </span>
            <p className="text-muted-foreground text-[11px] pt-1 border-t border-border/20 leading-relaxed">{a.rentAnalysis?.reasoning}</p>
            <p className="text-[10px] text-violet-400/80 italic">{a.rentAnalysis?.rentVsAlgorithm}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Strategy Recommendation ───────────────────────────────────────── */}
      <Card className={cn('border', strategyBg[best as keyof typeof strategyBg] || 'border-border/30')}>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className={cn('text-sm flex items-center gap-2', strategyColor[best as keyof typeof strategyColor])}>
            <BarChart3 className="w-4 h-4" />
            Best Strategy: {best === 'flip' ? '🔥 Flip' : best === 'rental' ? '🏠 Rental' : best === 'brrrr' ? '🔄 BRRRR' : 'None'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="text-center p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <p className="text-muted-foreground text-[10px]">Flip Profit</p>
              <p className={cn('font-bold text-sm', (a.strategyRecommendation?.flipProfit||0) >= 50000 ? 'text-emerald-400' : (a.strategyRecommendation?.flipProfit||0) >= 0 ? 'text-yellow-400' : 'text-red-400')}>
                {fc(a.strategyRecommendation?.flipProfit)}
              </p>
              {a.strategyRecommendation?.flipROI != null && (
                <p className="text-[10px] text-muted-foreground">{a.strategyRecommendation.flipROI.toFixed(1)}% ROI</p>
              )}
            </div>
            <div className="text-center p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              <p className="text-muted-foreground text-[10px]">Rental CF/mo</p>
              <p className={cn('font-bold text-sm', (a.strategyRecommendation?.rentalCashflow||0) >= 250 ? 'text-emerald-400' : (a.strategyRecommendation?.rentalCashflow||0) >= 0 ? 'text-yellow-400' : 'text-red-400')}>
                {fc(a.strategyRecommendation?.rentalCashflow)}/mo
              </p>
              {a.strategyRecommendation?.rentalCapRate != null && (
                <p className="text-[10px] text-muted-foreground">{a.strategyRecommendation.rentalCapRate.toFixed(1)}% cap</p>
              )}
            </div>
            <div className="text-center p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <p className="text-muted-foreground text-[10px]">BRRRR In Deal</p>
              <p className={cn('font-bold text-sm', (a.strategyRecommendation?.brrrrMoneyLeft||999999) <= 30000 ? 'text-emerald-400' : (a.strategyRecommendation?.brrrrMoneyLeft||999999) <= 60000 ? 'text-yellow-400' : 'text-red-400')}>
                {fc(a.strategyRecommendation?.brrrrMoneyLeft)}
              </p>
            </div>
            <div className="text-center p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <p className="text-muted-foreground text-[10px]">BRRRR CF/mo</p>
              <p className={cn('font-bold text-sm', (a.strategyRecommendation?.brrrrCashflow||0) >= 250 ? 'text-emerald-400' : (a.strategyRecommendation?.brrrrCashflow||0) >= 0 ? 'text-yellow-400' : 'text-red-400')}>
                {fc(a.strategyRecommendation?.brrrrCashflow)}/mo
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{a.strategyRecommendation?.reasoning}</p>
        </CardContent>
      </Card>

      {/* ── Market Context + Exit Risks ───────────────────────────────────── */}
      {(a.marketContext || a.neighborhoodNotes || a.exitRisks) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(a.marketContext || a.neighborhoodNotes) && (
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2 text-blue-400">
                  <BarChart3 className="w-4 h-4" /> Market & Neighborhood
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2 text-xs text-muted-foreground">
                {a.marketContext    && <p className="leading-relaxed">{a.marketContext}</p>}
                {a.neighborhoodNotes && <p className="leading-relaxed italic border-l-2 border-blue-500/30 pl-2">{a.neighborhoodNotes}</p>}
              </CardContent>
            </Card>
          )}
          {a.exitRisks && (
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
                  <ShieldCheck className="w-4 h-4" /> Exit Risks
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 text-xs text-muted-foreground">
                <p className="leading-relaxed">{a.exitRisks}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Red Flags + Positives ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(a.redFlags?.length ?? 0) > 0 && (
          <Card className="border-red-500/20 bg-red-500/5">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" /> Red Flags ({a.redFlags.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ul className="space-y-1.5">
                {a.redFlags.map((f: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-red-400 mt-0.5 shrink-0">⚠</span>{f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {(a.positives?.length ?? 0) > 0 && (
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
                <ThumbsUp className="w-4 h-4" /> Positives ({a.positives.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ul className="space-y-1.5">
                {a.positives.map((p: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>{p}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Sold Comps table ──────────────────────────────────────────────── */}
      {(a.soldCompsData?.length ?? 0) > 0 && (
        <Collapsible open={compsOpen} onOpenChange={setCompsOpen}>
          <Card className="border-border/40">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 pt-3 px-4 cursor-pointer select-none">
                <CardTitle className="text-sm flex items-center justify-between text-muted-foreground hover:text-foreground transition-colors">
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Sold Comps Used ({a.soldCompsData.length})
                  </span>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const avgDom = a.soldCompsData
                        ?.filter((c: any) => (c.daysOnMarket ?? c.days_on_market) != null)
                        .reduce((sum: number, c: any, _: number, arr: any[]) => sum + (c.daysOnMarket ?? c.days_on_market) / arr.length, 0);
                      return avgDom && avgDom > 0 ? (
                        <span className="text-xs text-muted-foreground">Avg DOM: {Math.round(avgDom)} days</span>
                      ) : null;
                    })()}
                    {compsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </CardTitle>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">≤ 0.5 mi</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">Last 6 months</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">±30% sqft</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">No highway barriers</span>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="px-4 pb-4">
                <div className="space-y-1">
                  {a.soldCompsData.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/20 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        {c.zillowUrl ? (
                          <a href={c.zillowUrl} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 transition-colors shrink-0">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : <span className="w-3 h-3 shrink-0" />}
                        <span className="text-muted-foreground truncate">{c.address}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[11px]">
                        <span className="font-semibold text-emerald-400">${(c.price/1000).toFixed(0)}k</span>
                        <span className="text-muted-foreground">{c.beds}bd/{c.baths}ba</span>
                        <span className="text-muted-foreground">{c.sqft?.toLocaleString()}sf</span>
                        <span className="text-violet-400">${c.pricePerSqft}/sf</span>
                        {c.soldDate && <span className="text-muted-foreground/60">{c.soldDate}</span>}
                        {(c.daysOnMarket ?? c.days_on_market) != null && <span className="text-muted-foreground/60">{c.daysOnMarket ?? c.days_on_market}d</span>}
                        {c.similarity != null && <span className="text-violet-400/70">{Math.round(c.similarity * 100)}%</span>}
                        {c.similarityScore != null && c.similarity == null && <span className="text-violet-400/70">{c.similarityScore}/10</span>}
                        {c.distance != null && <span className="text-muted-foreground/60">{c.distance.toFixed(2)}mi</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {(a.activeCompsData?.length ?? 0) > 0 && (
                  <>
                    <p className="text-[10px] text-muted-foreground/60 mt-3 mb-1 uppercase tracking-wider">Active Listings (competition)</p>
                    <div className="space-y-1">
                      {a.activeCompsData.map((c: any, i: number) => (
                        <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/10 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            {c.zillowUrl ? (
                              <a href={c.zillowUrl} target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 transition-colors shrink-0">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : <span className="w-3 h-3 shrink-0" />}
                            <span className="text-muted-foreground truncate">{c.address}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-[11px]">
                            <span className="font-semibold text-blue-400">${(c.price/1000).toFixed(0)}k</span>
                            <span className="text-muted-foreground">{c.beds}bd/{c.baths}ba</span>
                            <span className="text-muted-foreground">{c.sqft?.toLocaleString()}sf</span>
                            <span className="text-violet-400">${c.pricePerSqft}/sf</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
