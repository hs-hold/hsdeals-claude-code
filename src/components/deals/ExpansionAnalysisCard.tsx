import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Maximize2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent } from '@/utils/financialCalculations';
import { DealApiData } from '@/types/deal';

interface ExpansionAnalysisCardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  apiData: DealApiData;
  arv: number;
  rehabCost: number;
  purchasePrice: number;
  rehabMonths: number;
  monthlyHoldingCost: number;
  flipNetProfit: number;
  loanDefaults: {
    closingCostsPercent: number;
    contingencyPercent: number;
    agentCommissionPercent: number;
  };
  localOverrides: Record<string, string>;
  orderIndex: number;
}

const EXPANSION_SQFT = 300;
const EXPANSION_REHAB_EXTRA = 50000;
const EXPANSION_MONTHS_EXTRA = 6;

export function ExpansionAnalysisCard({
  isOpen,
  onOpenChange,
  apiData,
  arv,
  rehabCost,
  purchasePrice,
  rehabMonths,
  monthlyHoldingCost,
  flipNetProfit,
  loanDefaults,
  localOverrides,
  orderIndex,
}: ExpansionAnalysisCardProps) {
  const sqft = apiData.sqft ?? 0;
  const beds = apiData.bedrooms ?? 0;
  const baths = apiData.bathrooms ?? 0;

  // Only show for 3bd/1ba properties under 1100 sqft
  const showExpansion = sqft > 0 && sqft < 1100 && beds === 3 && baths === 1;
  if (!showExpansion) return null;

  const expandedSqft = sqft + EXPANSION_SQFT;
  const expandedRehabCost = rehabCost + EXPANSION_REHAB_EXTRA;
  const expandedRehabMonths = rehabMonths + EXPANSION_MONTHS_EXTRA;

  // Estimate expanded ARV from sale comps matching 3/2 layout
  const saleComps = apiData.saleComps || [];
  const comps3_2 = saleComps.filter(c => c.bedrooms === 3 && c.bathrooms === 2);
  let expandedArv = arv;
  let arvSource = '';

  if (comps3_2.length > 0) {
    const avgPricePerSqft = comps3_2.reduce((sum, c) => sum + (c.salePrice / (c.sqft || 1)), 0) / comps3_2.length;
    expandedArv = Math.round(avgPricePerSqft * expandedSqft);
    arvSource = `Based on ${comps3_2.length} sale comp(s) with 3bd/2ba layout at avg $${Math.round(avgPricePerSqft)}/sqft × ${expandedSqft.toLocaleString()} sqft`;
  } else if (saleComps.length > 0) {
    const avgPricePerSqft = saleComps.reduce((sum, c) => sum + (c.salePrice / (c.sqft || 1)), 0) / saleComps.length;
    expandedArv = Math.round(avgPricePerSqft * expandedSqft);
    arvSource = `No 3/2 comps found. Using avg of all ${saleComps.length} comp(s) at $${Math.round(avgPricePerSqft)}/sqft × ${expandedSqft.toLocaleString()} sqft`;
  } else {
    const pricePerSqft = arv > 0 && sqft > 0 ? arv / sqft : 0;
    expandedArv = Math.round(arv + (pricePerSqft * EXPANSION_SQFT));
    arvSource = `No comps available. Estimated proportionally at $${Math.round(pricePerSqft)}/sqft for added ${EXPANSION_SQFT} sqft`;
  }

  // Recalculate flip numbers with expansion
  const contingencyPercentVal = localOverrides.contingencyPercent
    ? parseFloat(localOverrides.contingencyPercent) / 100
    : loanDefaults.contingencyPercent / 100;
  const agentPercentVal = localOverrides.agentCommissionPercent
    ? parseFloat(localOverrides.agentCommissionPercent) / 100
    : loanDefaults.agentCommissionPercent / 100;
  const closingPercent = localOverrides.closingCostsPercent
    ? parseFloat(localOverrides.closingCostsPercent) / 100
    : loanDefaults.closingCostsPercent / 100;
  const closingCostsBuyCalc = localOverrides.closingCostsDollar
    ? parseFloat(localOverrides.closingCostsDollar)
    : purchasePrice * closingPercent;
  const notaryFeesCalc = localOverrides.notaryFees ? parseFloat(localOverrides.notaryFees) : 500;
  const titleFeesCalc = localOverrides.titleFees ? parseFloat(localOverrides.titleFees) : 500;

  const expContingency = expandedRehabCost * contingencyPercentVal;
  const expHoldingCosts = monthlyHoldingCost * expandedRehabMonths;
  const expTotalInvestment = purchasePrice + closingCostsBuyCalc + expandedRehabCost + expContingency + expHoldingCosts;
  const expSaleCosts = expandedArv * agentPercentVal + notaryFeesCalc + titleFeesCalc;
  const expNetProfit = expandedArv - expTotalInvestment - expSaleCosts;
  const expRoi = expTotalInvestment > 0 ? expNetProfit / expTotalInvestment : 0;

  const profitDiff = expNetProfit - flipNetProfit;

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <Card className="border border-blue-500/30 bg-card/50" style={{ order: orderIndex }}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-blue-400" />
                <span className="text-blue-400">Expansion Analysis</span>
                {!isOpen && (
                  <div className="flex items-center gap-3 ml-2 text-xs">
                    <span className="text-muted-foreground">Profit:</span>
                    <span className={cn("font-bold", expNetProfit >= 30000 ? "text-emerald-400" : expNetProfit >= 0 ? "text-amber-400" : "text-red-400")}>
                      {formatCurrency(expNetProfit)}
                    </span>
                    <span className="text-muted-foreground">vs Flip:</span>
                    <span className={cn("font-bold", profitDiff >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {profitDiff >= 0 ? '+' : ''}{formatCurrency(profitDiff)}
                    </span>
                  </div>
                )}
              </div>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-3 pt-0">
            <div className="space-y-3 text-xs">
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                This property is <span className="text-foreground font-medium">{sqft.toLocaleString()} sqft</span> with a <span className="text-foreground font-medium">3bd/1ba</span> layout.
                The renovation plan includes expanding the home by <span className="text-blue-400 font-medium">{EXPANSION_SQFT} sqft</span> (to {expandedSqft.toLocaleString()} sqft)
                and adding a second bathroom to create a <span className="text-blue-400 font-medium">3bd/2ba</span> layout.
                This adds <span className="text-amber-400 font-medium">{formatCurrency(EXPANSION_REHAB_EXTRA)}</span> to rehab and
                <span className="text-amber-400 font-medium"> {EXPANSION_MONTHS_EXTRA} months</span> to the timeline,
                but significantly increases the ARV by targeting a more desirable layout.
              </p>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-blue-500/20">
                <div className="flex flex-col p-2 rounded bg-background/50">
                  <span className="text-[10px] text-muted-foreground">New Size</span>
                  <span className="font-bold text-blue-400">{expandedSqft.toLocaleString()} sqft</span>
                  <span className="text-[9px] text-muted-foreground">+{EXPANSION_SQFT} sqft</span>
                </div>
                <div className="flex flex-col p-2 rounded bg-background/50">
                  <span className="text-[10px] text-muted-foreground">New Rehab Cost</span>
                  <span className="font-bold text-amber-400">{formatCurrency(expandedRehabCost)}</span>
                  <span className="text-[9px] text-muted-foreground">+{formatCurrency(EXPANSION_REHAB_EXTRA)}</span>
                </div>
                <div className="flex flex-col p-2 rounded bg-background/50">
                  <span className="text-[10px] text-muted-foreground">New Timeline</span>
                  <span className="font-bold text-amber-400">{expandedRehabMonths} months</span>
                  <span className="text-[9px] text-muted-foreground">+{EXPANSION_MONTHS_EXTRA} months</span>
                </div>
                <div className="flex flex-col p-2 rounded bg-background/50">
                  <span className="text-[10px] text-muted-foreground">Expanded ARV (3/2)</span>
                  <span className="font-bold text-emerald-400">{formatCurrency(expandedArv)}</span>
                  <span className="text-[9px] text-muted-foreground">vs {formatCurrency(arv)} original</span>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground italic">
                ARV Source: {arvSource}
              </p>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-blue-500/20">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Investment</span>
                  <span className="font-medium">{formatCurrency(expTotalInvestment)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Holding ({expandedRehabMonths}mo)</span>
                  <span className="font-medium">{formatCurrency(expHoldingCosts)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Net Profit</span>
                  <span className={cn("font-bold text-lg", expNetProfit >= 30000 ? "text-emerald-400" : expNetProfit >= 0 ? "text-amber-400" : "text-red-400")}>
                    {formatCurrency(expNetProfit)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold">ROI</span>
                  <span className={cn("font-bold text-lg", expRoi >= 0.20 ? "text-emerald-400" : expRoi >= 0 ? "text-amber-400" : "text-red-400")}>
                    {formatPercent(expRoi)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-blue-500/20">
                <span className="text-muted-foreground">vs Standard Flip:</span>
                <span className={cn("font-bold", profitDiff >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {profitDiff >= 0 ? '+' : ''}{formatCurrency(profitDiff)}
                </span>
                <span className="text-muted-foreground text-[10px]">profit difference</span>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
