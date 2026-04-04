import { useState, useCallback, useEffect, useRef } from 'react';
import ScoutDealDetail from './ScoutDealDetail';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Search, Home, TrendingUp, ExternalLink,
  ChevronDown, ChevronUp, History, Clock, MapPin, Inbox,
  Scan, Trophy, X, Zap, RefreshCw, Star, Settings2,
  Flame, Eye, SkipForward, Pencil, Check, AlertCircle,
  BarChart3, Repeat2, DollarSign, Layers, Globe, StickyNote,
  Bookmark, BookmarkCheck, Sparkles, Loader2,
} from 'lucide-react';
import {
  ScoutResult, ScoutSearch, DealStatus,
  loadHistory, saveSearch, loadResults, loadAllResults,
  updateResultStatus, updateResultOverrides,
} from '@/hooks/useScoutSearches';
import { cn } from '@/lib/utils';

// ─── Atlanta Metro ZIPs ───────────────────────────────────────────────────────
const ATLANTA_ZIPS = [
  '30310','30311','30315','30316','30318','30331','30336','30344','30349','30354',
  '30032','30034','30035','30058',
  '30083','30084','30087','30088',
  '30337',
  '30236','30238','30274','30296','30297',
  '30080','30082','30126',
  '30012','30013','30052',
  '30213','30228','30268',
];

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── BRRRR Settings ───────────────────────────────────────────────────────────
export interface BRRRSettings {
  mode: 'cash' | 'hml';
  refiLtv: number;
  refiClosingCostPct: number;
  hmlPurchaseLtv: number;
  hmlRehabCoverage: number;
  hmlRate: number;
  hmlPoints: number;
  hmlMonths: number;
  mortgageRate: number;
  mortgageYears: number;
}

const DEFAULT_BRRRR: BRRRSettings = {
  mode: 'cash', refiLtv: 0.75, refiClosingCostPct: 0.02,
  hmlPurchaseLtv: 0.90, hmlRehabCoverage: 1.0, hmlRate: 0.14,
  hmlPoints: 2, hmlMonths: 6, mortgageRate: 0.07, mortgageYears: 30,
};

function monthlyPI(principal: number, annualRate: number, years: number) {
  const r = annualRate / 12, n = years * 12;
  if (r === 0) return principal / n;
  return principal * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);
}

interface BRRRCalcFull {
  cashToClose: number; hmlTotal?: number; hmlLoanPurchase?: number;
  hmlLoanRehab?: number; hmlInterestCost?: number; hmlPointsCost?: number;
  refiLoanAmount: number; refiClosingCosts: number; cashToBorrower: number;
  payOffHml?: number; cashAfterPayingHml?: number; moneyInDeal: number;
  grossRent: number; operatingExpenses: number; mortgagePnI: number;
  monthlyCashFlow: number; annualCashFlow: number; cashOnCash: number;
  isGood: boolean;
}

function calcBRRRR(p: ScoutResult, s: BRRRSettings): BRRRCalcFull | null {
  const arv = p.arv_override ?? p.arv;
  if (!arv || !p.price) return null;
  const rehab = p.rehab_override ?? p.rehab ?? 0;
  const rent = p.rent_override ?? p.rent ?? 0;
  const refiLoanAmount = arv * s.refiLtv;
  const refiClosingCosts = refiLoanAmount * s.refiClosingCostPct;
  const cashToBorrower = refiLoanAmount - refiClosingCosts;
  const mortgagePnI = monthlyPI(refiLoanAmount, s.mortgageRate, s.mortgageYears);
  const grossRent = rent;
  const operatingExpenses = grossRent * 0.40;
  const monthlyNOI = grossRent - operatingExpenses;
  const monthlyCashFlow = monthlyNOI - mortgagePnI;
  const annualCashFlow = monthlyCashFlow * 12;

  if (s.mode === 'cash') {
    const cashToClose = p.price + rehab;
    const moneyInDeal = Math.max(0, cashToClose - cashToBorrower);
    const cashOnCash = moneyInDeal > 0 ? (annualCashFlow / moneyInDeal) * 100 : 0;
    return {
      cashToClose, refiLoanAmount, refiClosingCosts, cashToBorrower,
      moneyInDeal, grossRent, operatingExpenses, mortgagePnI,
      monthlyCashFlow, annualCashFlow, cashOnCash,
      isGood: monthlyCashFlow >= 250 && moneyInDeal <= 30000,
    };
  } else {
    const hmlLoanPurchase = p.price * s.hmlPurchaseLtv;
    const hmlLoanRehab = rehab * s.hmlRehabCoverage;
    const hmlTotal = hmlLoanPurchase + hmlLoanRehab;
    const hmlInterestCost = hmlTotal * (s.hmlRate / 12) * s.hmlMonths;
    const hmlPointsCost = hmlLoanPurchase * (s.hmlPoints / 100);
    const cashToClose = (p.price * (1-s.hmlPurchaseLtv)) + (rehab*(1-s.hmlRehabCoverage)) + hmlInterestCost + hmlPointsCost;
    const payOffHml = hmlTotal;
    const cashAfterPayingHml = cashToBorrower - payOffHml;
    const moneyInDeal = Math.max(0, cashToClose - cashAfterPayingHml);
    const cashOnCash = moneyInDeal > 0 ? (annualCashFlow / moneyInDeal) * 100 : 0;
    return {
      cashToClose, hmlTotal, hmlLoanPurchase, hmlLoanRehab,
      hmlInterestCost, hmlPointsCost, refiLoanAmount, refiClosingCosts,
      cashToBorrower, payOffHml, cashAfterPayingHml, moneyInDeal,
      grossRent, operatingExpenses, mortgagePnI, monthlyCashFlow,
      annualCashFlow, cashOnCash,
      isGood: monthlyCashFlow >= 250 && moneyInDeal <= 30000,
    };
  }
}

function calcFlip(p: ScoutResult) {
  const arv = p.arv_override ?? p.arv ?? 0;
  const price = p.price ?? 0;
  const rehab = p.rehab_override ?? p.rehab ?? 0;
  const closingCosts = arv * 0.07; // 7% of ARV (buy+sell costs)
  const holdingCosts = price * 0.02; // est 2% holding
  const grossProfit = arv - price - rehab - closingCosts - holdingCosts;
  const totalInvested = price + rehab + closingCosts * 0.5 + holdingCosts;
  const roi = totalInvested > 0 ? (grossProfit / totalInvested) * 100 : 0;
  return { arv, price, rehab, closingCosts, holdingCosts, grossProfit, roi };
}

function calcRental(p: ScoutResult, mortgageRate = 0.07, mortgageYears = 30, downPct = 0.20) {
  const price = p.price ?? 0;
  const rent = p.rent_override ?? p.rent ?? 0;
  const rehab = p.rehab_override ?? p.rehab ?? 0;
  const downPayment = price * downPct;
  const loanAmount = price - downPayment;
  const mortgagePnI = monthlyPI(loanAmount, mortgageRate, mortgageYears);
  const opEx = rent * 0.40;
  const cashFlow = rent - opEx - mortgagePnI;
  const noi = (rent - opEx) * 12;
  const capRate = price > 0 ? (noi / price) * 100 : 0;
  const cashInvested = downPayment + rehab;
  const coc = cashInvested > 0 ? (cashFlow * 12 / cashInvested) * 100 : 0;
  return { rent, opEx, mortgagePnI, cashFlow, noi, capRate, coc, downPayment, loanAmount, cashInvested };
}

// ─── Strategy helpers ────────────────────────────────────────────────────────
function isBRRRR(p: ScoutResult, s: BRRRSettings = DEFAULT_BRRRR): boolean {
  const r = calcBRRRR(p, s);
  return !!r?.isGood;
}
function isGoodFlip(p: ScoutResult): boolean {
  const flip = calcFlip(p);
  return flip.grossProfit >= 50000;
}
function isGoodRental(p: ScoutResult): boolean {
  return (p.cap_rate ?? 0) >= 10;
}

// ─── Formatting ──────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (!n) return '—';
  return n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`;
}
function fmtFull(n: number | null | undefined) {
  if (!n) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}
function pct(n: number) { return `${n.toFixed(1)}%`; }
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// ─── Colors / Config ─────────────────────────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  A: 'bg-green-500/20 text-green-400 border-green-500/40',
  B: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  C: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  D: 'bg-red-500/20 text-red-400 border-red-500/40',
};
const STATUS_CONFIG = {
  new:      { label: 'New',      color: 'text-muted-foreground',                         icon: null },
  hot:      { label: '🔥 Hot',   color: 'bg-red-500/20 text-red-400 border-red-500/40',   icon: Flame },
  watching: { label: '👁 Watch', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', icon: Eye },
  skip:     { label: '⏭ Skip',  color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40', icon: SkipForward },
};

// ─── BRRRR Panel ─────────────────────────────────────────────────────────────
function BRRRPanel({ p, settings }: { p: ScoutResult; settings: BRRRSettings }) {
  const r = calcBRRRR(p, settings);
  if (!r) return (
    <div className="text-xs text-muted-foreground p-2 text-center">
      Insufficient data for BRRRR analysis
    </div>
  );
  const arv = p.arv_override ?? p.arv ?? 0;
  return (
    <div className="text-xs space-y-3 pt-2 border-t border-border/30">
      <p className="font-semibold text-purple-400 text-[11px] uppercase tracking-wider">BRRRR Analysis ({settings.mode === 'cash' ? '💵 Cash' : '🏦 HML'})</p>
      <div className="grid grid-cols-3 gap-3">
        {/* Phase 1 */}
        <div className="space-y-1">
          <p className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider border-b border-orange-500/20 pb-0.5">Phase 1: Acquisition</p>
          <Row label="Cash to Close" value={fmtFull(r.cashToClose)} bold />
          {settings.mode === 'hml' && <>
            <Row label="HML Total" value={fmtFull(r.hmlTotal)} />
            <Row label="HML Loan (Purchase)" value={fmtFull(r.hmlLoanPurchase)} />
            <Row label="HML Loan (Rehab)" value={fmtFull(r.hmlLoanRehab)} />
            <Row label="Interest Cost" value={fmtFull(r.hmlInterestCost)} color="text-red-400" />
            <Row label="Points Cost" value={fmtFull(r.hmlPointsCost)} color="text-red-400" />
          </>}
        </div>
        {/* Phase 2 */}
        <div className="space-y-1">
          <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider border-b border-blue-500/20 pb-0.5">Phase 2: Refinance ({Math.round(settings.refiLtv*100)}% LTV)</p>
          <Row label="ARV" value={fmtFull(arv)} />
          <Row label="Refi Loan" value={fmtFull(r.refiLoanAmount)} />
          <Row label="Closing Costs" value={fmtFull(r.refiClosingCosts)} color="text-red-400" />
          <Row label="Cash to You" value={fmtFull(r.cashToBorrower)} color="text-green-400" />
          {settings.mode === 'hml' && r.payOffHml != null && <>
            <Row label="Pay Off HML" value={`-${fmtFull(r.payOffHml)}`} color="text-red-400" />
            <Row label="Cash After HML" value={fmtFull(r.cashAfterPayingHml)} color={r.cashAfterPayingHml! >= 0 ? 'text-green-400' : 'text-red-400'} />
          </>}
          <div className="pt-1 border-t border-border/20">
            <Row label="💰 Money in Deal" value={fmtFull(r.moneyInDeal)} bold color={r.moneyInDeal <= 0 ? 'text-emerald-400' : r.moneyInDeal < 30000 ? 'text-yellow-400' : 'text-foreground'} />
          </div>
        </div>
        {/* Phase 3 */}
        <div className="space-y-1">
          <p className="text-[10px] text-green-400 font-semibold uppercase tracking-wider border-b border-green-500/20 pb-0.5">Phase 3: Rental</p>
          <Row label="Gross Rent" value={`$${r.grossRent}/mo`} />
          <Row label="Operating Exp (40%)" value={`-$${Math.round(r.operatingExpenses)}/mo`} color="text-red-400" />
          <Row label="Mortgage P&I" value={`-$${Math.round(r.mortgagePnI)}/mo`} color="text-red-400" />
          <div className="pt-1 border-t border-border/20">
            <Row label="Monthly Cash Flow" value={`$${Math.round(r.monthlyCashFlow)}/mo`} bold
              color={r.monthlyCashFlow >= 200 ? 'text-green-400' : r.monthlyCashFlow >= 0 ? 'text-yellow-400' : 'text-red-400'} />
            <Row label="Annual Cash Flow" value={fmtFull(r.annualCashFlow)}
              color={r.annualCashFlow >= 0 ? 'text-green-400' : 'text-red-400'} />
            <Row label="CoC Return" value={pct(r.cashOnCash)}
              color={r.cashOnCash >= 10 ? 'text-green-400' : r.cashOnCash >= 5 ? 'text-yellow-400' : 'text-red-400'} />
          </div>
          <div className={cn('mt-1 pt-1 border-t border-border/20 text-center font-bold text-[11px]', r.isGood ? 'text-green-400' : 'text-muted-foreground')}>
            {r.isGood ? '✅ BRRRR Deal!' : (r.monthlyCashFlow > 0 && r.moneyInDeal <= 50000) ? '⚠️ Marginal' : '❌ Not BRRRR'}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color, bold, sub }: { label: string; value: string; color?: string; bold?: boolean; sub?: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-muted-foreground text-[10px]">{label}</span>
      <span className={cn('text-[11px]', bold && 'font-bold', color || 'text-foreground')}>{value}</span>
    </div>
  );
}

// ─── BRRRR Settings Panel ────────────────────────────────────────────────────
function BRRRSettingsPanel({ settings, onChange }: { settings: BRRRSettings; onChange: (s: BRRRSettings) => void }) {
  const set = (k: keyof BRRRSettings, v: any) => onChange({ ...settings, [k]: v });
  return (
    <Card className="border-purple-500/20 bg-purple-500/5">
      <CardContent className="p-3">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Mode:</span>
            {(['cash','hml'] as const).map(m => (
              <button key={m} onClick={() => set('mode',m)}
                className={cn('px-2 py-0.5 rounded border text-xs transition-all',
                  settings.mode === m ? 'bg-purple-500/30 text-purple-300 border-purple-500/40' : 'border-border/40 text-muted-foreground hover:text-foreground')}>
                {m === 'cash' ? '💵 Cash' : '🏦 HML'}
              </button>
            ))}
          </div>
          <SettingInput label="Refi LTV%" value={settings.refiLtv*100} onChange={v=>set('refiLtv',v/100)} step={5} min={50} max={80} />
          <SettingInput label="Mortgage%" value={settings.mortgageRate*100} onChange={v=>set('mortgageRate',v/100)} step={0.25} min={4} max={12} />
          {settings.mode === 'hml' && <>
            <SettingInput label="HML Rate%" value={settings.hmlRate*100} onChange={v=>set('hmlRate',v/100)} step={1} min={8} max={20} />
            <SettingInput label="HML Points" value={settings.hmlPoints} onChange={v=>set('hmlPoints',v)} step={0.5} min={0} max={5} />
            <SettingInput label="Hold Months" value={settings.hmlMonths} onChange={v=>set('hmlMonths',v)} step={1} min={1} max={24} />
          </>}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingInput({ label, value, onChange, step=1, min=0, max=100 }: any) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground text-[10px]">{label}</span>
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-14 h-6 text-xs bg-background border border-border/50 rounded px-1.5 text-center" />
    </div>
  );
}

// ─── Analysis Detail (Flip + Rental + BRRRR tabs) ────────────────────────────
type AnalysisTab = 'flip' | 'rental' | 'brrrr';

function AnalysisDetail({ p, brrrrSettings }: { p: ScoutResult; brrrrSettings: BRRRSettings }) {
  const [tab, setTab] = useState<AnalysisTab>('flip');
  const flip = calcFlip(p);
  const rental = calcRental(p);

  const tabs: { key: AnalysisTab; label: string; icon: any }[] = [
    { key: 'flip',   label: '🔥 Flip',   icon: Flame },
    { key: 'rental', label: '🏠 Rental', icon: Home },
    { key: 'brrrr',  label: '🔄 BRRRR',  icon: Repeat2 },
  ];

  return (
    <div className="space-y-3 pt-3 border-t border-border/30">
      <div className="flex gap-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('text-xs px-3 py-1 rounded-full border transition-all',
              tab === t.key
                ? t.key === 'flip'   ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                : t.key === 'rental' ? 'bg-green-500/20 text-green-400 border-green-500/40'
                :                       'bg-purple-500/20 text-purple-400 border-purple-500/40'
                : 'border-border/40 text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'flip' && (
        <div className="space-y-1.5 text-xs">
          <p className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider">Flip Analysis</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Row label="ARV (After Repair Value)" value={fmtFull(flip.arv)} />
            <Row label="Purchase Price" value={`-${fmtFull(flip.price)}`} color="text-red-400" />
            <Row label="Rehab Cost" value={`-${fmtFull(flip.rehab)}`} color="text-red-400" />
            <Row label="Closing Costs (est 7%)" value={`-${fmtFull(flip.closingCosts)}`} color="text-red-400" />
            <Row label="Holding Costs (est 2%)" value={`-${fmtFull(flip.holdingCosts)}`} color="text-red-400" />
            <Row label="Gross Profit" value={fmtFull(flip.grossProfit)} bold
              color={flip.grossProfit >= 30000 ? 'text-green-400' : flip.grossProfit >= 0 ? 'text-yellow-400' : 'text-red-400'} />
            <Row label="ROI" value={pct(flip.roi)}
              color={flip.roi >= 20 ? 'text-green-400' : flip.roi >= 10 ? 'text-yellow-400' : 'text-red-400'} />
          </div>
          <div className={cn('mt-2 p-2 rounded-lg text-center text-xs font-semibold',
            flip.grossProfit >= 30000 ? 'bg-green-500/10 text-green-400' :
            flip.grossProfit >= 10000 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400')}>
            {flip.grossProfit >= 30000 ? '✅ Strong flip' : flip.grossProfit >= 10000 ? '⚠️ Marginal flip' : '❌ Weak flip'}
            {' — '}Profit: {fmtFull(flip.grossProfit)} ({pct(flip.roi)} ROI)
          </div>
        </div>
      )}

      {tab === 'rental' && (
        <div className="space-y-1.5 text-xs">
          <p className="text-[10px] text-green-400 font-semibold uppercase tracking-wider">Rental Analysis (20% Down, 7% Rate, 30yr)</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Row label="Gross Monthly Rent" value={`$${rental.rent}/mo`} />
            <Row label="Operating Expenses (40%)" value={`-$${Math.round(rental.opEx)}/mo`} color="text-red-400" />
            <Row label="NOI" value={`$${Math.round(rental.rent - rental.opEx)}/mo`} />
            <Row label="Mortgage P&I" value={`-$${Math.round(rental.mortgagePnI)}/mo`} color="text-red-400" />
            <Row label="Monthly Cash Flow" value={`$${Math.round(rental.cashFlow)}/mo`} bold
              color={rental.cashFlow >= 200 ? 'text-green-400' : rental.cashFlow >= 0 ? 'text-yellow-400' : 'text-red-400'} />
            <Row label="Annual Cash Flow" value={fmtFull(rental.cashFlow * 12)}
              color={rental.cashFlow >= 0 ? 'text-green-400' : 'text-red-400'} />
            <Row label="Cap Rate" value={pct(rental.capRate)}
              color={rental.capRate >= 8 ? 'text-green-400' : rental.capRate >= 5 ? 'text-yellow-400' : 'text-red-400'} />
            <Row label="Cash on Cash Return" value={pct(rental.coc)}
              color={rental.coc >= 10 ? 'text-green-400' : rental.coc >= 5 ? 'text-yellow-400' : 'text-red-400'} />
            <Row label="Cash Invested" value={fmtFull(rental.cashInvested)} />
            <Row label="Down Payment (20%)" value={fmtFull(rental.downPayment)} />
          </div>
          <div className={cn('mt-2 p-2 rounded-lg text-center text-xs font-semibold',
            rental.capRate >= 8 ? 'bg-green-500/10 text-green-400' :
            rental.capRate >= 5 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400')}>
            {rental.capRate >= 8 ? '✅ Strong rental' : rental.capRate >= 5 ? '⚠️ Average rental' : '❌ Weak rental'}
            {' — '}Cap Rate: {pct(rental.capRate)}, CoC: {pct(rental.coc)}
          </div>
        </div>
      )}

      {tab === 'brrrr' && (
        <BRRRPanel p={p} settings={brrrrSettings} />
      )}
    </div>
  );
}

// ─── Inline Edit Bar ─────────────────────────────────────────────────────────
function EditBar({ p, onSave, onCancel }: {
  p: ScoutResult;
  onSave: (overrides: Partial<Pick<ScoutResult, 'arv_override'|'rehab_override'|'rent_override'|'notes'>>) => void;
  onCancel: () => void;
}) {
  const [arv,   setArv]   = useState(String((p.arv_override   ?? p.arv)   || ''));
  const [rehab, setRehab] = useState(String((p.rehab_override ?? p.rehab) || ''));
  const [rent,  setRent]  = useState(String((p.rent_override  ?? p.rent)  || ''));
  const [notes, setNotes] = useState(p.notes || '');

  const save = () => {
    onSave({
      arv_override:   arv   ? parseInt(arv)   : null,
      rehab_override: rehab ? parseInt(rehab) : null,
      rent_override:  rent  ? parseInt(rent)  : null,
      notes: notes || null,
    });
  };

  return (
    <div className="p-3 bg-muted/20 rounded-lg border border-border/40 space-y-2">
      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Edit Deal Parameters</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">ARV Override</p>
          <Input value={arv} onChange={e => setArv(e.target.value.replace(/\D/g,''))}
            placeholder={String(p.arv || '')} className="h-7 text-xs" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Rehab Override</p>
          <Input value={rehab} onChange={e => setRehab(e.target.value.replace(/\D/g,''))}
            placeholder={String(p.rehab || '')} className="h-7 text-xs" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Rent Override</p>
          <Input value={rent} onChange={e => setRent(e.target.value.replace(/\D/g,''))}
            placeholder={String(p.rent || '')} className="h-7 text-xs" />
        </div>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground mb-0.5">Notes</p>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Add notes about this deal..."
          className="text-xs h-16 resize-none" />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 text-xs">Cancel</Button>
        <Button size="sm" onClick={save} className="h-7 text-xs bg-blue-600 hover:bg-blue-700">
          <Check className="w-3 h-3 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}

// ─── Property Card ────────────────────────────────────────────────────────────
function PropertyCard({
  p, showZip, brrrrSettings, onStatusChange, onOverrideChange, onOpenDetail,
}: {
  p: ScoutResult & { zip?: string };
  showZip?: boolean;
  brrrrSettings: BRRRSettings;
  onStatusChange?: (id: string, status: DealStatus) => void;
  onOverrideChange?: (id: string, overrides: Partial<ScoutResult>) => void;
  onOpenDetail?: (p: ScoutResult & { zip?: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const status = p.status || 'new';
  const hasOverride = !!(p.arv_override || p.rehab_override || p.rent_override);

  const arv   = p.arv_override   ?? p.arv;
  const rehab = p.rehab_override ?? p.rehab;
  const rent  = p.rent_override  ?? p.rent;
  const spread = arv && p.price ? arv - p.price - (rehab ?? 0) : p.spread;
  const spreadPct = spread && p.price ? Math.round((spread / p.price) * 100) : null;

  const flip = calcFlip(p);
  const brrrrCalc = calcBRRRR(p, brrrrSettings);

  const handleStatus = (s: DealStatus) => {
    if (p.id && onStatusChange) onStatusChange(p.id, s);
  };

  const handleSaveOverrides = (overrides: Partial<ScoutResult>) => {
    if (p.id && onOverrideChange) onOverrideChange(p.id, overrides);
    setEditMode(false);
  };

  return (
    <Card className={cn('border transition-all duration-200', {
      'border-red-500/40 bg-red-500/3':    status === 'hot',
      'border-yellow-500/30 bg-yellow-500/3': status === 'watching',
      'border-zinc-500/20 opacity-60':     status === 'skip',
      'border-green-500/30 hover:border-green-500/50': status === 'new' && p.grade === 'A',
      'border-blue-500/20 hover:border-blue-500/40':   status === 'new' && p.grade === 'B',
      'border-border/40': status === 'new' && p.grade !== 'A' && p.grade !== 'B',
    })}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className={cn('text-sm font-bold px-2 py-0.5 rounded border', GRADE_COLORS[p.grade] || GRADE_COLORS.D)}>
                {p.grade}
              </span>
              <span className="text-xs text-muted-foreground">{p.score}/100</span>
              {showZip && p.zip && (
                <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded">
                  {p.zip}
                </span>
              )}
              {hasOverride && (
                <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded">
                  ✏️ Edited
                </span>
              )}
              {p.notes && (
                <span className="text-[10px] text-muted-foreground">📝</span>
              )}
            </div>
            <p className="font-semibold text-sm truncate">{p.address}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {p.img_src && (
              <img src={p.img_src} alt="" className="w-16 h-12 object-cover rounded opacity-80" />
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-muted/30 rounded px-2 py-1.5">
            <p className="text-[9px] text-muted-foreground uppercase">Price</p>
            <p className="font-semibold text-xs">{fmt(p.price)}</p>
          </div>
          <div className="bg-muted/30 rounded px-2 py-1.5">
            <p className="text-[9px] text-muted-foreground uppercase">ARV</p>
            <p className={cn('font-semibold text-xs', p.arv_override ? 'text-blue-400' : 'text-green-400')}>
              {fmt(arv)}{p.arv_override ? '*' : ''}
            </p>
          </div>
          <div className="bg-muted/30 rounded px-2 py-1.5">
            <p className="text-[9px] text-muted-foreground uppercase">Rehab</p>
            <p className={cn('font-semibold text-xs', p.rehab_override ? 'text-blue-400' : 'text-yellow-400')}>
              {fmt(rehab)}{p.rehab_override ? '*' : ''}
            </p>
          </div>
          <div className="bg-muted/30 rounded px-2 py-1.5">
            <p className="text-[9px] text-muted-foreground uppercase">Spread</p>
            <p className={cn('font-semibold text-xs', {
              'text-green-400': (spread ?? 0) > 50000,
              'text-yellow-400': (spread ?? 0) > 20000 && (spread ?? 0) <= 50000,
              'text-red-400': (spread ?? 0) <= 20000,
            })}>
              {fmt(spread)}{spreadPct ? ` (${spreadPct}%)` : ''}
            </p>
          </div>
        </div>

        {/* Key metrics row */}
        <div className="flex items-center justify-between text-xs border-t border-border/30 pt-2">
          <div className="flex items-center gap-3">
            <span className={cn('font-medium', (p.cap_rate ?? 0) >= 8 ? 'text-green-400' : (p.cap_rate ?? 0) >= 5 ? 'text-yellow-400' : 'text-muted-foreground')}>
              Cap {p.cap_rate ? `${p.cap_rate}%` : '—'}
            </span>
            <span className="text-muted-foreground">
              Rent {rent ? `$${rent.toLocaleString()}/mo` : '—'}
            </span>
            {brrrrCalc && (
              <span className={cn('text-[10px]', brrrrCalc.isGood ? 'text-purple-400' : 'text-muted-foreground/60')}>
                {brrrrCalc.isGood ? '🔄 BRRRR' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>{p.beds}bd · {p.baths}ba · {p.sqft?.toLocaleString()} sqft · {p.days_on_market}d</span>
          </div>
        </div>

        {/* Quick flip profit */}
        {flip.grossProfit > 0 && (
          <div className={cn('flex items-center justify-between text-[11px] px-2 py-1 rounded',
            flip.grossProfit >= 30000 ? 'bg-orange-500/10 text-orange-400' : 'bg-muted/20 text-muted-foreground')}>
            <span>Flip profit (est)</span>
            <span className="font-semibold">{fmtFull(flip.grossProfit)} ({pct(flip.roi)} ROI)</span>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          {/* Status buttons */}
          <div className="flex items-center gap-1">
            {([
              { s: 'hot' as DealStatus,      icon: Flame,       label: 'Hot',   cls: cn('hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/40', status==='hot' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'border-border/30 text-muted-foreground') },
              { s: 'watching' as DealStatus, icon: Eye,         label: 'Watch', cls: cn('hover:bg-yellow-500/20 hover:text-yellow-400 hover:border-yellow-500/40', status==='watching' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' : 'border-border/30 text-muted-foreground') },
              { s: 'skip' as DealStatus,     icon: SkipForward, label: 'Skip',  cls: cn('hover:bg-zinc-500/20 hover:text-zinc-400 hover:border-zinc-500/40', status==='skip' ? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' : 'border-border/30 text-muted-foreground') },
            ]).map(({ s, icon: Icon, label, cls }) => (
              <button key={s}
                onClick={() => handleStatus(status === s ? 'new' : s)}
                className={cn('flex items-center gap-0.5 text-[10px] px-2 py-1 rounded border transition-all', cls)}
                title={label}
              >
                <Icon className="w-3 h-3" /><span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            {p.id && (
              <button onClick={() => setEditMode(v => !v)}
                className={cn('flex items-center gap-0.5 text-[10px] px-2 py-1 rounded border transition-all',
                  editMode ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'border-border/30 text-muted-foreground hover:text-foreground hover:border-border')}>
                <Pencil className="w-3 h-3" /><span className="hidden sm:inline">Edit</span>
              </button>
            )}
            <button onClick={() => onOpenDetail?.(p)}
              className="flex items-center gap-0.5 text-[10px] px-2 py-1 rounded border border-purple-500/40 text-purple-400 hover:bg-purple-500/10 transition-all font-medium">
              <BarChart3 className="w-3 h-3" />
              <span>Full Analysis</span>
            </button>
            {p.detail_url && (
              <a href={p.detail_url?.startsWith('http') ? p.detail_url : `https://www.zillow.com${p.detail_url}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-[10px] px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-blue-400 transition-all">
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Notes preview */}
        {p.notes && !editMode && (
          <div className="text-[10px] text-muted-foreground bg-muted/20 rounded px-2 py-1 flex items-start gap-1">
            <StickyNote className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{p.notes}</span>
          </div>
        )}

        {/* Edit bar */}
        {editMode && (
          <EditBar p={p} onSave={handleSaveOverrides} onCancel={() => setEditMode(false)} />
        )}

      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type ViewTab = 'inbox' | 'hot' | 'watching' | 'skipped';
type StrategyFilter = 'all' | 'flip' | 'rental' | 'brrrr';

interface FilterPreset {
  id: string;
  name: string;
  gradeFilter: string;
  strategyFilter: StrategyFilter;
  sortBy: 'score' | 'spread' | 'profit' | 'caprate' | 'brrrr_money';
  minSpread: string;
  minCapRate: string;
  minProfit: string;
  minBeds: string;
  maxBeds: string;
  minBaths: string;
  minSqft: string;
  maxSqft: string;
  minPrice: string;
  maxPrice2: string;
  maxDom: string;
}

const PRESETS_KEY = 'scout_filter_presets_v1';

function loadPresets(): FilterPreset[] {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); }
  catch { return []; }
}

function savePresets(presets: FilterPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

const STRATEGY_CONFIG = {
  flip:   { label: 'Flip',   icon: '🔥' },
  rental: { label: 'Rental', icon: '🏠' },
  brrrr:  { label: 'BRRRR',  icon: '🔄' },
};

export default function ScoutPage() {
  const [zip, setZip] = useState('');
  const [maxPrice, setMaxPrice] = useState('300000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<ScoutSearch[]>([]);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Results
  const [singleResults, setSingleResults] = useState<ScoutResult[]>([]);
  const [allResults,    setAllResults]    = useState<ScoutResult[]>([]);
  const [allZipsMode,   setAllZipsMode]   = useState(false);
  const [allZipsLoading, setAllZipsLoading] = useState(false);

  // Tab / filters
  const [tab, setTab] = useState<ViewTab>('inbox');
  const [gradeFilter,    setGradeFilter]    = useState<string>('all');
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>('all');
  const [sortBy,         setSortBy]         = useState<'score' | 'spread' | 'profit' | 'caprate' | 'brrrr_money'>('score');
  const [minSpread,      setMinSpread]      = useState('');
  // Property filters
  const [minBeds,        setMinBeds]        = useState('');
  const [maxBeds,        setMaxBeds]        = useState('');
  const [minBaths,       setMinBaths]       = useState('');
  const [minSqft,        setMinSqft]        = useState('');
  const [maxSqft,        setMaxSqft]        = useState('');
  const [minPrice,       setMinPrice]       = useState('');
  const [maxPrice2,      setMaxPrice2]      = useState('');
  const [maxDom,         setMaxDom]         = useState('');
  const [minCapRate,     setMinCapRate]     = useState('');
  const [minProfit,      setMinProfit]      = useState('');
  const [showBrrrrSettings, setShowBrrrrSettings] = useState(false);

  // Bulk AI analysis
  const [bulkAnalyzing,  setBulkAnalyzing]  = useState(false);
  const [bulkDone,       setBulkDone]       = useState(0);
  const [bulkTotal,      setBulkTotal]      = useState(0);
  const [bulkErrors,     setBulkErrors]     = useState(0);

  // Filter presets
  const [filterPresets,    setFilterPresets]    = useState<FilterPreset[]>(loadPresets);
  const [presetNameInput,  setPresetNameInput]  = useState('');
  const [showPresetInput,  setShowPresetInput]  = useState(false);

  // BRRRR settings
  const [brrrrSettings, setBrrrrSettings] = useState<BRRRSettings>(DEFAULT_BRRRR);

  // Detail view
  const [selectedDeal, setSelectedDeal] = useState<(ScoutResult & { zip?: string }) | null>(null);

  // Scan All
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0, currentZip: '' });
  const [bestResults, setBestResults] = useState<(ScoutResult & { zip: string })[]>([]);

  useEffect(() => {
    loadHistory().then(h => { setHistory(h); setHistoryLoading(false); });
  }, []);

  // Merge results: singleResults + allResults, deduplicated
  const baseResults: ScoutResult[] = allZipsMode ? allResults : singleResults;

  // Update a result in local state
  const updateLocalResult = useCallback((id: string, patch: Partial<ScoutResult>) => {
    const apply = (arr: ScoutResult[]) =>
      arr.map(r => r.id === id ? { ...r, ...patch } : r);
    setSingleResults(apply);
    setAllResults(apply);
    setBestResults(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r) as any);
  }, []);

  const handleStatusChange = useCallback(async (id: string, status: DealStatus) => {
    updateLocalResult(id, { status });
    await updateResultStatus(id, status);
  }, [updateLocalResult]);

  const handleOverrideChange = useCallback(async (id: string, overrides: Partial<ScoutResult>) => {
    updateLocalResult(id, overrides);
    await updateResultOverrides(id, overrides as any);
  }, [updateLocalResult]);

  const selectSearch = useCallback(async (s: ScoutSearch) => {
    if (activeSearchId === s.id && !allZipsMode) return;
    setAllZipsMode(false);
    setActiveSearchId(s.id);
    setSingleResults([]);
    setGradeFilter('all');
    setStrategyFilter('all');
    const results = await loadResults(s.id);
    setSingleResults(results);
  }, [activeSearchId, allZipsMode]);

  const loadAllZips = async () => {
    setAllZipsLoading(true);
    setAllZipsMode(true);
    setActiveSearchId(null);
    const results = await loadAllResults();
    setAllResults(results);
    setAllZipsLoading(false);
    setTab('inbox');
  };

  const runSingleSearch = async (zipCode: string, price: number): Promise<ScoutResult[]> => {
    const { data, error: fnError } = await supabase.functions.invoke('scout-analyze-zip', {
      body: { zip: zipCode, maxPrice: price },
    });
    if (fnError || !data?.success) return [];
    return (data.results || []).map((r: any) => ({
      zpid: r.zpid,
      address: `${r.address?.street}, ${r.address?.city}, ${r.address?.state} ${r.address?.zipcode}`,
      price: r.price, arv: r.arv, rehab: r.rehab, spread: r.spread,
      cap_rate: r.capRate, score: r.score, grade: r.grade, rent: r.rent,
      sqft: r.sqft, beds: r.beds, baths: r.baths,
      days_on_market: r.daysOnMarket || 0,
      img_src: r.imgSrc || '', detail_url: r.detailUrl || '',
    }));
  };

  const runSearch = async () => {
    if (!zip.trim() || zip.length < 5) return;
    setLoading(true); setError(null);
    setSingleResults([]); setActiveSearchId(null);
    setAllZipsMode(false); setStrategyFilter('all');

    try {
      const results = await runSingleSearch(zip.trim(), parseInt(maxPrice) || 300000);
      if (results.length === 0) throw new Error('No results returned');
      setSingleResults(results);
      setGradeFilter('all');
      saveSearch(zip.trim(), parseInt(maxPrice)||300000, results).then(newId => {
        if (newId) {
          const newEntry: ScoutSearch = {
            id: newId, zip: zip.trim(),
            max_price: parseInt(maxPrice)||300000,
            result_count: results.length,
            created_at: new Date().toISOString(),
          };
          setHistory(prev => [newEntry, ...prev]);
          setActiveSearchId(newId);
          // patch results with the new id
          loadResults(newId).then(saved => setSingleResults(saved));
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setLoading(false); }
  };

  const scanAllAtlanta = async () => {
    const price = parseInt(maxPrice) || 300000;
    setScanning(true);
    (window as any).__scoutAbort = false;
    setAllZipsMode(false);
    setBestResults([]);
    setStrategyFilter('all');
    setScanProgress({ done: 0, total: ATLANTA_ZIPS.length, currentZip: '' });
    const allBest: (ScoutResult & { zip: string })[] = [];

    for (let i = 0; i < ATLANTA_ZIPS.length; i++) {
      if ((window as any).__scoutAbort) break;
      const z = ATLANTA_ZIPS[i];
      setScanProgress({ done: i, total: ATLANTA_ZIPS.length, currentZip: z });
      try {
        const results = await runSingleSearch(z, price);
        const good = results.filter(r => r.grade === 'A' || r.grade === 'B');
        if (results.length > 0) {
          saveSearch(z, price, results).then(newId => {
            if (newId) setHistory(prev => [{
              id: newId, zip: z, max_price: price,
              result_count: results.length,
              created_at: new Date().toISOString(),
            }, ...prev]);
          });
        }
        if (good.length > 0) {
          const withZip = good.map(r => ({ ...r, zip: z }));
          allBest.push(...withZip);
          setBestResults([...allBest].sort((a,b) => b.score - a.score));
        }
      } catch { /* skip */ }
      await sleep(600);
    }
    setScanProgress(p => ({ ...p, done: ATLANTA_ZIPS.length, currentZip: '' }));
    setScanning(false);
  };

  const abortScan = () => { (window as any).__scoutAbort = true; };

  // ─── Filter logic ────────────────────────────────────────────────────────
  const sourceResults: ScoutResult[] = scanning ? bestResults as any : baseResults;

  const tabFiltered = sourceResults.filter(p => {
    const s = p.status || 'new';
    if (tab === 'inbox')   return s === 'new';
    if (tab === 'hot')     return s === 'hot';
    if (tab === 'watching') return s === 'watching';
    if (tab === 'skipped') return s === 'skip';
    return true;
  });

  const filteredResults = tabFiltered.filter(p => {
    const arv   = p.arv_override   ?? p.arv ?? 0;
    const rehab = p.rehab_override ?? p.rehab ?? 0;
    const spread = arv > 0 ? arv - p.price - rehab : (p.spread ?? 0);
    if (gradeFilter !== 'all' && p.grade !== gradeFilter) return false;
    if (strategyFilter === 'flip'   && !isGoodFlip(p))              return false;
    if (strategyFilter === 'rental' && !isGoodRental(p))            return false;
    if (strategyFilter === 'brrrr'  && !isBRRRR(p, brrrrSettings))  return false;
    if (minSpread   && spread              < parseInt(minSpread))    return false;
    if (minCapRate  && (p.cap_rate ?? 0)  < parseFloat(minCapRate)) return false;
    if (minProfit) {
      const flip = calcFlip(p);
      if (flip.grossProfit < parseInt(minProfit)) return false;
    }
    // Property filters
    if (minBeds  && (p.beds  ?? 0) < parseFloat(minBeds))  return false;
    if (maxBeds  && (p.beds  ?? 0) > parseFloat(maxBeds))  return false;
    if (minBaths && (p.baths ?? 0) < parseFloat(minBaths)) return false;
    if (minSqft  && (p.sqft  ?? 0) < parseInt(minSqft))    return false;
    if (maxSqft  && (p.sqft  ?? 0) > parseInt(maxSqft))    return false;
    if (minPrice && p.price < parseInt(minPrice))           return false;
    if (maxPrice2 && p.price > parseInt(maxPrice2))         return false;
    if (maxDom   && (p.days_on_market ?? 0) > parseInt(maxDom)) return false;
    return true;
  });

  // ── Sort ──────────────────────────────────────────────────
  const sortedResults = [...filteredResults].sort((a, b) => {
    switch (sortBy) {
      case 'spread': {
        const sa = (a.arv_override ?? a.arv ?? 0) - a.price - (a.rehab_override ?? a.rehab ?? 0);
        const sb = (b.arv_override ?? b.arv ?? 0) - b.price - (b.rehab_override ?? b.rehab ?? 0);
        return sb - sa;
      }
      case 'profit': {
        const fa = calcFlip(a), fb = calcFlip(b);
        return fb.grossProfit - fa.grossProfit;
      }
      case 'caprate':
        return (b.cap_rate ?? 0) - (a.cap_rate ?? 0);
      case 'brrrr_money': {
        const ra = calcBRRRR(a, brrrrSettings), rb = calcBRRRR(b, brrrrSettings);
        return (ra?.moneyInDeal ?? 999999) - (rb?.moneyInDeal ?? 999999);
      }
      case 'score':
      default:
        return b.score - a.score;
    }
  });

  const gradeCounts: Record<string,number> = { A:0,B:0,C:0,D:0 };
  tabFiltered.forEach(r => { if (r.grade in gradeCounts) gradeCounts[r.grade]++; });

  const strategyCounts = {
    flip:   tabFiltered.filter(isGoodFlip).length,
    rental: tabFiltered.filter(isGoodRental).length,
    brrrr:  tabFiltered.filter(p => isBRRRR(p, brrrrSettings)).length,
  };

  const statusCounts = {
    inbox:    sourceResults.filter(p => (p.status||'new') === 'new').length,
    hot:      sourceResults.filter(p => p.status === 'hot').length,
    watching: sourceResults.filter(p => p.status === 'watching').length,
    skipped:  sourceResults.filter(p => p.status === 'skip').length,
  };

  const activeFilterCount = [
    gradeFilter !== 'all', strategyFilter !== 'all', !!minSpread, !!minCapRate, !!minProfit,
    !!minBeds, !!maxBeds, !!minBaths, !!minSqft, !!maxSqft, !!minPrice, !!maxPrice2, !!maxDom,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setGradeFilter('all'); setStrategyFilter('all');
    setMinSpread(''); setMinCapRate(''); setMinProfit('');
    setMinBeds(''); setMaxBeds(''); setMinBaths('');
    setMinSqft(''); setMaxSqft(''); setMinPrice(''); setMaxPrice2(''); setMaxDom('');
  };

  const savePreset = () => {
    const name = presetNameInput.trim() || `Preset ${filterPresets.length + 1}`;
    const preset: FilterPreset = {
      id: Date.now().toString(),
      name,
      gradeFilter, strategyFilter, sortBy,
      minSpread, minCapRate, minProfit,
      minBeds, maxBeds, minBaths,
      minSqft, maxSqft, minPrice, maxPrice2, maxDom,
    };
    const updated = [...filterPresets, preset];
    setFilterPresets(updated);
    savePresets(updated);
    setPresetNameInput('');
    setShowPresetInput(false);
  };

  const applyPreset = (p: FilterPreset) => {
    setGradeFilter(p.gradeFilter);
    setStrategyFilter(p.strategyFilter);
    setSortBy(p.sortBy);
    setMinSpread(p.minSpread);
    setMinCapRate(p.minCapRate);
    setMinProfit(p.minProfit);
    setMinBeds(p.minBeds);
    setMaxBeds(p.maxBeds);
    setMinBaths(p.minBaths);
    setMinSqft(p.minSqft);
    setMaxSqft(p.maxSqft);
    setMinPrice(p.minPrice);
    setMaxPrice2(p.maxPrice2);
    setMaxDom(p.maxDom);
    if (p.strategyFilter === 'brrrr') setShowBrrrrSettings(true);
  };

  const deletePreset = (id: string) => {
    const updated = filterPresets.filter(p => p.id !== id);
    setFilterPresets(updated);
    savePresets(updated);
  };

  const runBulkAnalysis = async (deals: ScoutResult[]) => {
    if (bulkAnalyzing || deals.length === 0) return;
    setBulkAnalyzing(true);
    setBulkDone(0);
    setBulkErrors(0);
    setBulkTotal(deals.length);

    for (const deal of deals) {
      try {
        const { data, error } = await supabase.functions.invoke('scout-ai-analyze', {
          body: {
            deal: {
              address:         deal.address,
              zip:             deal.zip,
              price:           deal.price,
              arv:             deal.arv_override ?? deal.arv,
              rehab:           deal.rehab_override ?? deal.rehab,
              rent:            deal.rent_override ?? deal.rent,
              beds:            deal.beds,
              baths:           deal.baths,
              sqft:            deal.sqft,
              zpid:            deal.zpid,
              days_on_market:  deal.days_on_market,
              score:           deal.score,
              grade:           deal.grade,
            }
          }
        });

        if (data?.success && deal.id) {
          await supabase.from('scout_ai_analyses').upsert({
            scout_result_id: deal.id,
            zpid:            deal.zpid,
            analysis:        data.analysis,
            comps_used:      data.compsUsed     || 0,
            tokens_used:     data.tokensUsed    || 0,
            cost_usd:        data.costUsd       || 0,
            model:           data.model         || null,
            input_tokens:    data.inputTokens   || 0,
            output_tokens:   data.outputTokens  || 0,
          }, { onConflict: 'scout_result_id' });
        } else {
          setBulkErrors(e => e + 1);
        }
      } catch {
        setBulkErrors(e => e + 1);
      }
      setBulkDone(d => d + 1);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 1200));
    }

    setBulkAnalyzing(false);
  };

  const hasResults = sourceResults.length > 0;

  // ── If a deal is selected, show full detail view ──────────
  if (selectedDeal) {
    return (
      <ScoutDealDetail
        deal={selectedDeal}
        onBack={() => setSelectedDeal(null)}
        onStatusChange={handleStatusChange}
        onOverrideChange={handleOverrideChange}
      />
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <div className="w-64 border-r border-border/50 flex flex-col bg-card/30 shrink-0">
        <div className="p-3 border-b border-border/50 space-y-2">
          <Input placeholder="ZIP code" value={zip}
            onChange={e => setZip(e.target.value.replace(/\D/g,'').slice(0,5))}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            className="h-8 text-sm" />
          <Input placeholder="Max price" value={maxPrice}
            onChange={e => setMaxPrice(e.target.value.replace(/\D/g,''))}
            className="h-8 text-sm" />
          <Button onClick={runSearch} disabled={loading || scanning || zip.length < 5}
            className="w-full h-8 text-sm bg-purple-600 hover:bg-purple-700">
            <Search className="w-3.5 h-3.5 mr-1.5" />
            {loading ? 'Analyzing...' : 'Analyze ZIP'}
          </Button>

          {/* All ZIPs button */}
          <Button onClick={loadAllZips} disabled={allZipsLoading}
            variant="outline"
            className={cn('w-full h-8 text-sm transition-all',
              allZipsMode ? 'border-purple-500/60 text-purple-400 bg-purple-500/10'
                          : 'border-purple-500/30 text-purple-400 hover:bg-purple-500/10')}>
            <Globe className="w-3.5 h-3.5 mr-1.5" />
            {allZipsLoading ? 'Loading...' : allZipsMode ? `All ZIPs (${allResults.length})` : 'All ZIPs'}
          </Button>

          {!scanning ? (
            <Button onClick={scanAllAtlanta} disabled={loading || scanning}
              variant="outline"
              className="w-full h-8 text-sm border-orange-500/40 text-orange-400 hover:bg-orange-500/10">
              <Scan className="w-3.5 h-3.5 mr-1.5" />
              Scan All Atlanta ({ATLANTA_ZIPS.length})
            </Button>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  ZIP {scanProgress.currentZip} ({scanProgress.done}/{scanProgress.total})
                </span>
                <button onClick={abortScan} className="text-red-400 hover:text-red-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <Progress value={(scanProgress.done / scanProgress.total) * 100} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground">
                {bestResults.length} Grade A/B found...
              </p>
            </div>
          )}
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3 h-3" /> History
          </div>
          {historyLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(3)].map((_,i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : history.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              <MapPin className="w-5 h-5 mx-auto mb-1 opacity-30" />No searches yet
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {history.map(s => (
                <button key={s.id} onClick={() => selectSearch(s)}
                  className={cn('w-full text-left p-2.5 rounded-lg transition-colors text-sm',
                    activeSearchId === s.id && !allZipsMode
                      ? 'bg-purple-500/20 border border-purple-500/30'
                      : 'hover:bg-muted/50 border border-transparent')}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">ZIP {s.zip}</span>
                    <span className="text-[10px] text-muted-foreground">{s.result_count}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {timeAgo(s.created_at)} · max ${(s.max_price/1000).toFixed(0)}K
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <Card className="border-red-500/30">
            <CardContent className="p-3 flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </CardContent>
          </Card>
        )}

        {/* ── Tab navigation ─────────────────────────────────── */}
        {hasResults && (
          <div className="flex items-center gap-1 border-b border-border/40 pb-3">
            {([
              { key: 'inbox',    label: 'Inbox',      count: statusCounts.inbox,    icon: Inbox,        cls: 'text-foreground border-purple-500' },
              { key: 'hot',      label: '🔥 Hot',     count: statusCounts.hot,      icon: Flame,        cls: 'text-red-400 border-red-500' },
              { key: 'watching', label: '👁 Watching', count: statusCounts.watching, icon: Eye,          cls: 'text-yellow-400 border-yellow-500' },
              { key: 'skipped',  label: '⏭ Skipped',  count: statusCounts.skipped,  icon: SkipForward,  cls: 'text-zinc-400 border-zinc-500' },
            ] as const).map(({ key, label, count, cls }) => (
              <button key={key} onClick={() => setTab(key as ViewTab)}
                className={cn('flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-t border-b-2 transition-all',
                  tab === key
                    ? cn('bg-muted/30', cls)
                    : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <span>{label}</span>
                <Badge className={cn('text-[10px] h-4 px-1',
                  tab === key ? 'bg-foreground/10' : 'bg-muted/40 text-muted-foreground')}>
                  {count}
                </Badge>
              </button>
            ))}

            {scanning && (
              <div className="ml-auto flex items-center gap-2 text-xs text-orange-400">
                <Scan className="w-3.5 h-3.5 animate-pulse" />
                Scanning ZIP {scanProgress.currentZip}...
              </div>
            )}
            {allZipsMode && !allZipsLoading && (
              <div className="ml-auto flex items-center gap-1 text-xs text-purple-400">
                <Globe className="w-3.5 h-3.5" />
                All ZIPs · {allResults.length} total deals
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_,i) => <Skeleton key={i} className="h-56" />)}
          </div>
        )}

        {/* ── Filters bar ──────────────────────────────────────── */}
        {!loading && hasResults && (
          <div className="space-y-2.5 p-3 bg-muted/10 rounded-lg border border-border/30">

            {/* Saved presets row */}
            {(filterPresets.length > 0 || showPresetInput) && (
              <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-border/30">
                <Bookmark className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                {filterPresets.map(p => (
                  <div key={p.id} className="flex items-center">
                    <button
                      onClick={() => applyPreset(p)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-l border border-r-0 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                    >
                      <BookmarkCheck className="w-3 h-3" />
                      {p.name}
                    </button>
                    <button
                      onClick={() => deletePreset(p.id)}
                      className="text-xs px-1.5 py-1 rounded-r border border-border/40 text-muted-foreground hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {/* Inline name input */}
                {showPresetInput && (
                  <div className="flex items-center gap-1">
                    <Input
                      autoFocus
                      value={presetNameInput}
                      onChange={e => setPresetNameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') { setShowPresetInput(false); setPresetNameInput(''); } }}
                      placeholder="Preset name..."
                      className="h-7 w-32 text-xs"
                    />
                    <button onClick={savePreset} className="h-7 px-2 text-xs rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { setShowPresetInput(false); setPresetNameInput(''); }}
                      className="h-7 px-2 text-xs rounded border border-border/40 text-muted-foreground hover:text-foreground transition-all">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Strategy tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium w-16">Strategy:</span>
              {([
                { key: 'all',    label: 'All',           count: tabFiltered.length },
                { key: 'flip',   label: '🔥 Flip',       count: strategyCounts.flip },
                { key: 'rental', label: '🏠 Rental',     count: strategyCounts.rental },
                { key: 'brrrr',  label: '🔄 BRRRR',      count: strategyCounts.brrrr },
              ] as const).map(({ key, label, count }) => (
                <button key={key} onClick={() => {
                    setStrategyFilter(key as StrategyFilter);
                    if (key === 'brrrr') setShowBrrrrSettings(true);
                    else setShowBrrrrSettings(false);
                  }}
                  className={cn('text-xs px-3 py-1 rounded-full border transition-all',
                    strategyFilter === key
                      ? key === 'flip'   ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                      : key === 'rental' ? 'bg-green-500/20 text-green-400 border-green-500/40'
                      : key === 'brrrr'  ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                      : 'bg-muted/60 text-foreground border-border'
                      : 'border-border/40 text-muted-foreground hover:text-foreground')}>
                  {label} ({count})
                </button>
              ))}
              <button onClick={() => setShowBrrrrSettings(v => !v)}
                className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all',
                  showBrrrrSettings ? 'bg-purple-500/20 text-purple-400 border-purple-500/40' : 'border-border/40 text-muted-foreground hover:text-foreground')}>
                <Settings2 className="w-3 h-3" />
                BRRRR: {brrrrSettings.mode === 'cash' ? '💵 Cash' : '🏦 HML'}
              </button>
            </div>

            {showBrrrrSettings && (
              <BRRRSettingsPanel settings={brrrrSettings} onChange={setBrrrrSettings} />
            )}

            {/* Grade + advanced filters */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium w-16">Grade:</span>
              {(['all','A','B','C','D'] as const).map(g => (
                (g === 'all' || gradeCounts[g] > 0) && (
                  <button key={g} onClick={() => setGradeFilter(g === 'all' ? 'all' : (gradeFilter === g ? 'all' : g))}
                    className={cn('text-xs px-3 py-1 rounded-full border transition-all',
                      gradeFilter === g || (g === 'all' && gradeFilter === 'all')
                        ? g === 'all' ? 'bg-muted/60 text-foreground border-border' : GRADE_COLORS[g]
                        : 'border-border/40 text-muted-foreground hover:text-foreground opacity-70')}>
                    {g === 'all' ? `All (${tabFiltered.length})` : `${g} (${gradeCounts[g]})`}
                  </button>
                )
              ))}
            </div>

            {/* Sort */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium w-16">Sort by:</span>
              {([
                { key: 'score',       label: '⭐ Score' },
                { key: 'spread',      label: '📊 Spread' },
                { key: 'profit',      label: '🔥 Flip Profit' },
                { key: 'caprate',     label: '🏠 Cap Rate' },
                { key: 'brrrr_money', label: '🔄 BRRRR Cash Left' },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setSortBy(key)}
                  className={cn('text-xs px-2.5 py-1 rounded-full border transition-all',
                    sortBy === key
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'border-border/40 text-muted-foreground hover:text-foreground')}>
                  {label}
                </button>
              ))}
            </div>

            {/* Deal filters */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium w-16">Deal:</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Min Spread $</span>
                <Input value={minSpread} onChange={e => setMinSpread(e.target.value.replace(/\D/g,''))}
                  placeholder="40000" className="h-7 w-24 text-xs" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Min Cap %</span>
                <Input value={minCapRate} onChange={e => setMinCapRate(e.target.value)}
                  placeholder="7" className="h-7 w-14 text-xs" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Min Profit $</span>
                <Input value={minProfit} onChange={e => setMinProfit(e.target.value.replace(/\D/g,''))}
                  placeholder="30000" className="h-7 w-24 text-xs" />
              </div>
            </div>

            {/* Property filters */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium w-16">Property:</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Beds</span>
                <Input value={minBeds} onChange={e => setMinBeds(e.target.value)}
                  placeholder="min" className="h-7 w-12 text-xs" />
                <span className="text-xs text-muted-foreground">–</span>
                <Input value={maxBeds} onChange={e => setMaxBeds(e.target.value)}
                  placeholder="max" className="h-7 w-12 text-xs" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Min Baths</span>
                <Input value={minBaths} onChange={e => setMinBaths(e.target.value)}
                  placeholder="1" className="h-7 w-12 text-xs" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Sqft</span>
                <Input value={minSqft} onChange={e => setMinSqft(e.target.value.replace(/\D/g,''))}
                  placeholder="min" className="h-7 w-16 text-xs" />
                <span className="text-xs text-muted-foreground">–</span>
                <Input value={maxSqft} onChange={e => setMaxSqft(e.target.value.replace(/\D/g,''))}
                  placeholder="max" className="h-7 w-16 text-xs" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Price $</span>
                <Input value={minPrice} onChange={e => setMinPrice(e.target.value.replace(/\D/g,''))}
                  placeholder="min" className="h-7 w-20 text-xs" />
                <span className="text-xs text-muted-foreground">–</span>
                <Input value={maxPrice2} onChange={e => setMaxPrice2(e.target.value.replace(/\D/g,''))}
                  placeholder="max" className="h-7 w-20 text-xs" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Max DOM</span>
                <Input value={maxDom} onChange={e => setMaxDom(e.target.value.replace(/\D/g,''))}
                  placeholder="90" className="h-7 w-14 text-xs" />
              </div>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/40 rounded-full px-2 py-1 transition-colors">
                  <X className="w-3 h-3" /> Reset all ({activeFilterCount})
                </button>
              )}
              {activeFilterCount > 0 && !showPresetInput && (
                <button
                  onClick={() => setShowPresetInput(true)}
                  className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary border border-primary/30 hover:border-primary/50 rounded-full px-2 py-1 transition-colors bg-primary/5 hover:bg-primary/10"
                >
                  <Bookmark className="w-3 h-3" /> Save Filter
                </button>
              )}
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{sortedResults.length}</span> of {tabFiltered.length} deals
              </p>

              {/* Bulk AI Analysis button */}
              {sortedResults.length > 0 && sortedResults.length <= 50 && (
                bulkAnalyzing ? (
                  <div className="flex items-center gap-2 text-xs text-violet-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing {bulkDone}/{bulkTotal}...</span>
                    <div className="w-24 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 transition-all" style={{ width: `${bulkTotal > 0 ? (bulkDone/bulkTotal)*100 : 0}%` }} />
                    </div>
                    {bulkErrors > 0 && <span className="text-red-400">{bulkErrors} errors</span>}
                  </div>
                ) : (
                  <button
                    onClick={() => runBulkAnalysis(sortedResults)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-all font-medium"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    🤖 Analyze All {sortedResults.length} Deals
                  </button>
                )
              )}
              {sortedResults.length > 50 && !bulkAnalyzing && (
                <p className="text-xs text-muted-foreground/60">Filter to ≤50 deals to enable bulk AI analysis</p>
              )}
            </div>
          </div>
        )}

        {/* ── Results grid ─────────────────────────────────────── */}
        {!loading && sortedResults.length > 0 && (
          <div className={cn('grid gap-4',
            strategyFilter === 'brrrr'
              ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3')}>
            {sortedResults.map(p => (
              <PropertyCard
                key={p.id || `${(p as any).zip}-${p.zpid}`}
                p={p as any}
                showZip={allZipsMode || scanning}
                brrrrSettings={brrrrSettings}
                onStatusChange={handleStatusChange}
                onOverrideChange={handleOverrideChange}
                onOpenDetail={setSelectedDeal}
              />
            ))}
          </div>
        )}

        {!loading && hasResults && sortedResults.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Zap className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-muted-foreground text-sm">
              {tab === 'inbox' && statusCounts.inbox === 0
                ? '✅ All deals reviewed!'
                : 'No properties match the current filters'}
            </p>
            <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 mt-2">
              <RefreshCw className="w-3 h-3" /> Reset filters
            </button>
          </div>
        )}

        {!loading && !hasResults && !error && !scanning && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Layers className="w-12 h-12 text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground font-medium">Enter a ZIP and click Analyze</p>
            <p className="text-muted-foreground/60 text-sm mt-1">
              Or click "All ZIPs" to see all saved deals · "Scan All Atlanta" to scan 30+ ZIPs
            </p>
          </div>
        )}

        {scanning && sourceResults.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Scan className="w-10 h-10 text-orange-400/50 mb-3 animate-pulse" />
            <p className="text-muted-foreground">Scanning ZIP {scanProgress.currentZip}...</p>
            <p className="text-muted-foreground/60 text-sm mt-1">{scanProgress.done}/{scanProgress.total} completed</p>
          </div>
        )}
      </div>
    </div>
  );
}
