import { useState, useMemo } from 'react';
import { Wrench, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ── Rehab rates ($/sqft) — tweak these to change underwriting assumptions ──
const REHAB_RATES = {
  cosmetic_partial: 25,
  cosmetic_full: 40,
  full_rehab: 105,
} as const;

const BIG_TICKET_COST = 15_000;

type RehabLevel = keyof typeof REHAB_RATES;

const LEVEL_LABELS: Record<RehabLevel, string> = {
  cosmetic_partial: 'Cosmetic Partial',
  cosmetic_full: 'Cosmetic Full',
  full_rehab: 'Full Rehab',
};

interface RehabEstimatorProps {
  sqft: number | null;
  onApply: (value: number) => void;
}

export function RehabEstimator({ sqft, onApply }: RehabEstimatorProps) {
  const [level, setLevel] = useState<RehabLevel>('cosmetic_full');
  const [bigTickets, setBigTickets] = useState(0);
  const [sqftOverride, setSqftOverride] = useState('');

  const effectiveSqft = sqftOverride ? parseInt(sqftOverride) || 0 : (sqft ?? 0);
  const rate = REHAB_RATES[level];
  const calculated = useMemo(
    () => effectiveSqft * rate + bigTickets * BIG_TICKET_COST,
    [effectiveSqft, rate, bigTickets]
  );

  const formatNum = (n: number) => n.toLocaleString();

  return (
    <div className="col-span-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Rehab Estimator</span>
      </div>

      {/* Level selector */}
      <div className="flex gap-1">
        {(Object.keys(REHAB_RATES) as RehabLevel[]).map(l => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={cn(
              'flex-1 text-[10px] py-1 px-1 rounded border transition-colors leading-tight text-center',
              level === l
                ? 'border-amber-500/60 bg-amber-500/20 text-amber-300 font-semibold'
                : 'border-border/50 text-muted-foreground hover:border-amber-500/30 hover:text-amber-400/70'
            )}
          >
            {LEVEL_LABELS[l].split(' ').map((w, i) => <span key={i} className="block">{w}</span>)}
            <span className="text-[9px] opacity-70">${REHAB_RATES[l]}/sqft</span>
          </button>
        ))}
      </div>

      {/* Big Tickets stepper */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Big Tickets <span className="opacity-60">(+$15K ea)</span></span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setBigTickets(b => Math.max(0, b - 1))}
            disabled={bigTickets === 0}
            className="w-5 h-5 rounded flex items-center justify-center border border-border/50 text-muted-foreground hover:border-amber-500/40 hover:text-amber-400 disabled:opacity-30"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
          <span className="text-xs font-semibold w-4 text-center">{bigTickets}</span>
          <button
            onClick={() => setBigTickets(b => Math.min(10, b + 1))}
            disabled={bigTickets === 10}
            className="w-5 h-5 rounded flex items-center justify-center border border-border/50 text-muted-foreground hover:border-amber-500/40 hover:text-amber-400 disabled:opacity-30"
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* Sqft input (shown when sqft is missing) */}
      {(sqft == null || sqft === 0) && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Sqft:</span>
          <Input
            type="number"
            value={sqftOverride}
            onChange={e => setSqftOverride(e.target.value)}
            placeholder="Enter sqft"
            className="h-5 text-[10px] px-1.5 w-20 border-amber-500/30"
          />
        </div>
      )}

      {/* Formula line */}
      <div className="text-[10px] text-muted-foreground/70 leading-snug">
        {formatNum(effectiveSqft)} sqft × ${rate}
        {bigTickets > 0 && ` + ${bigTickets} × $15,000`}
      </div>

      {/* Total + Apply */}
      <div className="flex items-center justify-between mt-auto pt-1 border-t border-amber-500/15">
        <span className="text-base font-bold text-amber-300">
          ${formatNum(calculated)}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] px-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
          onClick={() => onApply(calculated)}
          disabled={calculated === 0}
        >
          Apply to Rehab
        </Button>
      </div>
    </div>
  );
}
