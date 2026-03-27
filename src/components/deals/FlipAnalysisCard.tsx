import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrendingUp, ChevronDown, FileDown, RotateCcw, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { DealApiData, DealFinancials, Deal } from '@/types/deal';
import { generateDealPDF } from '@/utils/pdfExport';

interface FlipAnalysisCardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  purchasePrice: number;
  arv: number;
  rehabCost: number;
  rent: number;
  liveFinancials: DealFinancials | null;
  apiData: DealApiData;
  localOverrides: Record<string, string>;
  loanDefaults: {
    closingCostsPercent: number;
    contingencyPercent: number;
    agentCommissionPercent: number;
    holdingMonths: number;
    hmlLtvPurchasePercent: number;
    hmlLtvRehabPercent: number;
    hmlPointsPercent: number;
    hmlInterestRate: number;
    hmlProcessingFee: number;
  };
  onOverrideChange: (field: string, value: string) => void;
  onResetOverride: (field: string) => void;
  flipNetProfit: number;
  flipRoi: number;
  totalHoldingCosts: number;
  monthlyHoldingCost: number;
  rehabMonths: number;
  orderIndex: number;
}

export function FlipAnalysisCard({
  isOpen,
  onOpenChange,
  deal,
  purchasePrice,
  arv,
  rehabCost,
  rent,
  liveFinancials,
  apiData,
  localOverrides,
  loanDefaults,
  onOverrideChange,
  onResetOverride,
  flipNetProfit,
  flipRoi,
  totalHoldingCosts,
  monthlyHoldingCost,
  rehabMonths,
  orderIndex,
}: FlipAnalysisCardProps) {
  // Flip deal assumptions from overrides or loanDefaults
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
  
  const closingCostsBuyCalc = localOverrides.closingCostsDollar 
    ? parseFloat(localOverrides.closingCostsDollar)
    : purchasePrice * closingPercent;
  
  // Sale closing costs - separate from buy closing costs
  const closingSalePercent = localOverrides.closingCostsSalePercent 
    ? parseFloat(localOverrides.closingCostsSalePercent) / 100 
    : loanDefaults.closingCostsPercent / 100;
  const closingCostsSaleCalc = localOverrides.closingCostsSaleDollar
    ? parseFloat(localOverrides.closingCostsSaleDollar)
    : arv * closingSalePercent;
  
  const rehabContingencyCalc = rehabCost * contingencyPercentVal;
  const agentCommissionCalc = arv * agentPercentVal;
  const totalSaleCostsWithLoan = agentCommissionCalc + notaryFeesCalc + titleFeesCalc + closingCostsSaleCalc;
  const cashNotaryFee = localOverrides.cashNotaryFee 
    ? parseFloat(localOverrides.cashNotaryFee) 
    : 400;
  const totalSaleCostsCash = agentCommissionCalc + titleFeesCalc + closingCostsSaleCalc + cashNotaryFee;
  
  // CASH DEAL calculations
  const cashTotalInvestment = purchasePrice + closingCostsBuyCalc + rehabCost + rehabContingencyCalc + totalHoldingCosts;
  const cashNetProfit = arv - cashTotalInvestment - totalSaleCostsCash;
  const cashRoi = cashTotalInvestment > 0 ? cashNetProfit / cashTotalInvestment : 0;
  
  // HML financing assumptions
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
  
  const hmlLoanPurchase = purchasePrice * hmlLtvPurchase;
  const hmlLoanRehab = rehabCost * hmlLtvRehab;
  const hmlTotalLoan = hmlLoanPurchase + hmlLoanRehab;
  const hmlPoints = hmlTotalLoan * hmlPointsPercentVal;
  const hmlMonthlyInterest = hmlTotalLoan * (hmlInterestRateVal / 12);
  const hmlTotalInterest = hmlMonthlyInterest * rehabMonths;
  const hmlAllFees = hmlProcessingFeeVal + hmlAppraisalCostVal + hmlUnderwritingFeeVal + hmlOtherFeesVal;
  const hmlTotalLoanCost = hmlPoints + hmlAllFees + hmlTotalInterest;
  
  const hmlDownPaymentPurchase = purchasePrice - hmlLoanPurchase;
  const hmlDownPaymentRehab = rehabCost - hmlLoanRehab;
  const hmlTotalInvestment = purchasePrice + rehabCost + rehabContingencyCalc + closingCostsBuyCalc + totalHoldingCosts + hmlTotalLoanCost;
  const hmlCashToClose = hmlTotalInvestment - hmlTotalLoan;
  const hmlCashOutOfPocket = hmlCashToClose;
  const hmlNetProfit = arv - hmlTotalInvestment - totalSaleCostsWithLoan;
  const hmlRoi = hmlCashOutOfPocket > 0 ? hmlNetProfit / hmlCashOutOfPocket : 0;

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <Card className="border border-orange-500/30 bg-card/50" style={{ order: orderIndex }}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-2 md:p-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="text-xs md:text-sm flex items-center gap-1.5 md:gap-2">
              <TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-orange-400 shrink-0" />
              <span className="text-orange-400 font-medium shrink-0">Flip</span>
              {!isOpen && (
                <>
                  <span className="text-muted-foreground text-[9px] md:text-[10px]">Profit:</span>
                  <span className={cn("font-bold text-[10px] md:text-xs", flipNetProfit >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {formatCurrency(flipNetProfit)}
                  </span>
                  <span className="text-muted-foreground text-[9px] md:text-[10px]">ROI:</span>
                  <span className={cn("font-bold text-[10px] md:text-xs", flipRoi >= 15 ? "text-emerald-400" : flipRoi >= 10 ? "text-amber-400" : "text-red-400")}>
                    {flipRoi.toFixed(1)}%
                  </span>
                </>
              )}
              <div className="flex items-center gap-0.5 ml-auto shrink-0">
                <Button 
                  variant="ghost" 
                  size="icon"
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
                  className="h-5 w-5 md:h-6 md:w-6 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                >
                  <FileDown className="w-3 h-3" />
                </Button>
                <ChevronDown className={cn("w-3 h-3 md:w-4 md:h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-2 md:p-3 pt-0 md:pt-0">
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
                          <button onClick={() => { onResetOverride('closingCostsPercent'); onResetOverride('closingCostsDollar'); }} className="p-0.5 rounded hover:bg-muted" title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                          </button>
                        )}
                        <span className="text-muted-foreground">(</span>
                        <Input type="text" inputMode="numeric" value={localOverrides.closingCostsPercent || loanDefaults.closingCostsPercent.toString()} onChange={(e) => { onOverrideChange('closingCostsPercent', e.target.value); if (e.target.value) onOverrideChange('closingCostsDollar', ''); }} className={cn("w-7 h-5 text-xs text-center px-0.5", localOverrides.closingCostsPercent && "border-accent/50 bg-accent/5")} />
                        <span className="text-muted-foreground">%</span>
                        <span className="text-muted-foreground mx-0.5">|</span>
                        <span className="text-muted-foreground">$</span>
                        <Input type="text" inputMode="numeric" value={localOverrides.closingCostsDollar || ''} placeholder="—" onChange={(e) => { onOverrideChange('closingCostsDollar', e.target.value); if (e.target.value) onOverrideChange('closingCostsPercent', ''); }} className={cn("w-12 h-5 text-xs text-right px-0.5", localOverrides.closingCostsDollar && "border-accent/50 bg-accent/5")} />
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
                          <button onClick={() => onResetOverride('contingencyPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                          </button>
                        )}
                        <Input type="text" inputMode="numeric" value={localOverrides.contingencyPercent || loanDefaults.contingencyPercent.toString()} onChange={(e) => onOverrideChange('contingencyPercent', e.target.value)} className={cn("w-8 h-5 text-xs text-center px-0.5", localOverrides.contingencyPercent && "border-accent/50 bg-accent/5")} />
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
                      <button onClick={() => onResetOverride('holdingMonths')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                        <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                      </button>
                    )}
                    <Input type="text" inputMode="numeric" value={localOverrides.holdingMonths || loanDefaults.holdingMonths.toString()} onChange={(e) => onOverrideChange('holdingMonths', e.target.value)} className={cn("w-6 h-4 text-[10px] text-center px-0.5", localOverrides.holdingMonths && "border-accent/50 bg-accent/5")} />
                    <span className="text-[10px] font-normal text-muted-foreground">mo)</span>
                  </h4>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Property Tax</span>
                      <div className="flex items-center gap-0.5">
                        {localOverrides.propertyTaxMonthly && (
                          <button onClick={() => onResetOverride('propertyTaxMonthly')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                          </button>
                        )}
                        <span className="text-muted-foreground text-[10px]">$</span>
                        <Input type="text" inputMode="numeric" value={localOverrides.propertyTaxMonthly || Math.round((apiData.propertyTax ?? 0) / 12).toString()} onChange={(e) => onOverrideChange('propertyTaxMonthly', e.target.value)} className={cn("w-10 h-5 text-xs text-right px-0.5", localOverrides.propertyTaxMonthly && "border-accent/50 bg-accent/5")} />
                        <span className="text-muted-foreground text-[10px]">/mo</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Insurance</span>
                      <div className="flex items-center gap-0.5">
                        {localOverrides.insuranceMonthly && (
                          <button onClick={() => onResetOverride('insuranceMonthly')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                          </button>
                        )}
                        <span className="text-muted-foreground text-[10px]">$</span>
                        <Input type="text" inputMode="numeric" value={localOverrides.insuranceMonthly || getEffectiveMonthlyInsurance(apiData.insurance).toString()} onChange={(e) => onOverrideChange('insuranceMonthly', e.target.value)} className={cn("w-10 h-5 text-xs text-right px-0.5", localOverrides.insuranceMonthly && "border-accent/50 bg-accent/5")} />
                        <span className="text-muted-foreground text-[10px]">/mo</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Utilities</span>
                      <div className="flex items-center gap-0.5">
                        {localOverrides.utilitiesMonthly && (
                          <button onClick={() => onResetOverride('utilitiesMonthly')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                          </button>
                        )}
                        <span className="text-muted-foreground text-[10px]">$</span>
                        <Input type="text" inputMode="numeric" value={localOverrides.utilitiesMonthly || '300'} onChange={(e) => onOverrideChange('utilitiesMonthly', e.target.value)} className={cn("w-10 h-5 text-xs text-right px-0.5", localOverrides.utilitiesMonthly && "border-accent/50 bg-accent/5")} />
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
                        <Input type="text" inputMode="numeric" value={localOverrides.agentCommissionPercent || loanDefaults.agentCommissionPercent.toString()} onChange={(e) => onOverrideChange('agentCommissionPercent', e.target.value)} className={cn("w-8 h-5 text-xs text-center px-0.5", localOverrides.agentCommissionPercent && "border-accent/50 bg-accent/5")} />
                        <span className="text-muted-foreground">%)</span>
                      </div>
                      <span className="font-medium">{formatCurrency(agentCommissionCalc)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-0.5">
                        <span className="text-muted-foreground">Closing Sale</span>
                        {(localOverrides.closingCostsSalePercent || localOverrides.closingCostsSaleDollar) && (
                          <button onClick={() => { onResetOverride('closingCostsSalePercent'); onResetOverride('closingCostsSaleDollar'); }} className="p-0.5 rounded hover:bg-muted" title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                          </button>
                        )}
                        <span className="text-muted-foreground">(</span>
                        <Input type="text" inputMode="numeric" value={localOverrides.closingCostsSalePercent || loanDefaults.closingCostsPercent.toString()} onChange={(e) => { onOverrideChange('closingCostsSalePercent', e.target.value); if (e.target.value) onOverrideChange('closingCostsSaleDollar', ''); }} className={cn("w-7 h-5 text-xs text-center px-0.5", localOverrides.closingCostsSalePercent && "border-accent/50 bg-accent/5")} />
                        <span className="text-muted-foreground">%</span>
                        <span className="text-muted-foreground mx-0.5">|</span>
                        <span className="text-muted-foreground">$</span>
                        <Input type="text" inputMode="numeric" value={localOverrides.closingCostsSaleDollar || ''} placeholder="—" onChange={(e) => { onOverrideChange('closingCostsSaleDollar', e.target.value); if (e.target.value) onOverrideChange('closingCostsSalePercent', ''); }} className={cn("w-12 h-5 text-xs text-right px-0.5", localOverrides.closingCostsSaleDollar && "border-accent/50 bg-accent/5")} />
                        <span className="text-muted-foreground">)</span>
                      </div>
                      <span className="font-medium">{formatCurrency(closingCostsSaleCalc)}</span>
                    </div>
                    <div className="flex justify-between items-center" data-testid="title-fees-row">
                      <span className="text-muted-foreground">Title</span>
                      <div className="flex items-center gap-1">
                        {localOverrides.titleFees && (
                          <button onClick={() => onResetOverride('titleFees')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                          </button>
                        )}
                        <span className="text-muted-foreground text-[10px]">$</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={localOverrides.titleFees || '500'}
                          onChange={(e) => onOverrideChange('titleFees', e.target.value)}
                          className={cn(
                            "w-16 h-5 text-xs text-right px-1",
                            localOverrides.titleFees ? "border-accent/50 bg-accent/5" : ""
                          )}
                        />
                      </div>
                    </div>
                    {/* Notary fee for cash deals */}
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Notary</span>
                      <div className="flex items-center gap-1">
                        {localOverrides.cashNotaryFee && (
                          <button onClick={() => onResetOverride('cashNotaryFee')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                          </button>
                        )}
                        <span className="text-muted-foreground text-[10px]">$</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={localOverrides.cashNotaryFee || '400'}
                          onChange={(e) => onOverrideChange('cashNotaryFee', e.target.value)}
                          className={cn(
                            "w-16 h-5 text-xs text-right px-1",
                            localOverrides.cashNotaryFee ? "border-accent/50 bg-accent/5" : ""
                          )}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-border">
                      <span className="font-semibold">Total Investment</span>
                      <span className="font-bold">{formatCurrency(cashTotalInvestment)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Net Profit</span>
                      <span className={cn("font-bold text-lg", cashNetProfit >= 30000 ? "text-emerald-400" : cashNetProfit >= 0 ? "text-amber-400" : "text-red-400")}>
                        {formatCurrency(cashNetProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-border">
                      <span className="font-semibold">ROI</span>
                      <span className={cn("font-bold text-xl", cashRoi >= 0.20 ? "text-emerald-400" : cashRoi >= 0 ? "text-amber-400" : "text-red-400")}>
                        {formatPercent(cashRoi)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* HML Financing Section - Collapsible */}
              <Collapsible>
                <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 text-xs">
                  <CollapsibleTrigger asChild>
                    <div className="group p-3 cursor-pointer hover:bg-orange-500/5 transition-colors flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                        With Hard Money Loan
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
                          <span className="text-[10px] text-muted-foreground">Purchase LTV</span>
                          <Input type="text" inputMode="numeric" value={localOverrides.hmlLtvPurchasePercent || loanDefaults.hmlLtvPurchasePercent.toString()} onChange={(e) => onOverrideChange('hmlLtvPurchasePercent', e.target.value)} className={cn("w-14 h-5 text-xs text-center mt-0.5", localOverrides.hmlLtvPurchasePercent && "border-accent/50 bg-accent/5")} />
                        </div>
                        <div className="flex flex-col p-2 rounded bg-background/50">
                          <span className="text-[10px] text-muted-foreground">Rehab LTV</span>
                          <Input type="text" inputMode="numeric" value={localOverrides.hmlLtvRehabPercent || loanDefaults.hmlLtvRehabPercent.toString()} onChange={(e) => onOverrideChange('hmlLtvRehabPercent', e.target.value)} className={cn("w-14 h-5 text-xs text-center mt-0.5", localOverrides.hmlLtvRehabPercent && "border-accent/50 bg-accent/5")} />
                        </div>
                        <div className="flex flex-col p-2 rounded bg-background/50">
                          <span className="text-[10px] text-muted-foreground">Points %</span>
                          <Input type="text" inputMode="numeric" value={localOverrides.hmlPointsPercent || loanDefaults.hmlPointsPercent.toString()} onChange={(e) => onOverrideChange('hmlPointsPercent', e.target.value)} className={cn("w-14 h-5 text-xs text-center mt-0.5", localOverrides.hmlPointsPercent && "border-accent/50 bg-accent/5")} />
                        </div>
                        <div className="flex flex-col p-2 rounded bg-background/50">
                          <span className="text-[10px] text-muted-foreground">Interest Rate</span>
                          <Input type="text" inputMode="numeric" value={localOverrides.hmlInterestRate || loanDefaults.hmlInterestRate.toString()} onChange={(e) => onOverrideChange('hmlInterestRate', e.target.value)} className={cn("w-14 h-5 text-xs text-center mt-0.5", localOverrides.hmlInterestRate && "border-accent/50 bg-accent/5")} />
                        </div>
                      </div>

                      {/* Detailed HML Breakdown */}
                      <div className="space-y-1 pt-2 border-t border-orange-500/20">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Loan on Purchase ({(hmlLtvPurchase * 100).toFixed(0)}%)</span>
                          <span className="font-medium">{formatCurrency(hmlLoanPurchase)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Loan on Rehab ({(hmlLtvRehab * 100).toFixed(0)}%)</span>
                          <span className="font-medium">{formatCurrency(hmlLoanRehab)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-orange-500/10">
                          <span className="font-semibold text-orange-300">Total HML Loan</span>
                          <span className="font-bold text-orange-300">{formatCurrency(hmlTotalLoan)}</span>
                        </div>
                        {hmlTotalLoan > arv * 0.75 && (
                          <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-0.5">
                            ⚠️ Exceeds 75% ARV ({formatCurrency(arv * 0.75)})
                          </div>
                        )}
                      </div>

                      {/* Loan Costs Detail */}
                      <div className="space-y-1 pt-2 border-t border-orange-500/20" data-section="loan-costs-v2">
                        <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Loan Costs</h5>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Points ({(hmlPointsPercentVal * 100).toFixed(1)}%)</span>
                          <span className="font-medium">{formatCurrency(hmlPoints)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Monthly Payment</span>
                          <span className="font-medium text-orange-300">{formatCurrency(hmlMonthlyInterest)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Total Interest ({rehabMonths}mo)</span>
                          <span className="font-medium">{formatCurrency(hmlTotalInterest)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground">Processing Fee</span>
                            {localOverrides.hmlProcessingFee && (
                              <button onClick={() => onResetOverride('hmlProcessingFee')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground text-[10px]">$</span>
                            <Input type="text" inputMode="numeric" value={localOverrides.hmlProcessingFee || loanDefaults.hmlProcessingFee.toString()} onChange={(e) => onOverrideChange('hmlProcessingFee', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.hmlProcessingFee && "border-accent/50 bg-accent/5")} />
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground">Appraisal (BPO)</span>
                            {localOverrides.hmlAppraisalCost && (
                              <button onClick={() => onResetOverride('hmlAppraisalCost')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground text-[10px]">$</span>
                            <Input type="text" inputMode="numeric" value={localOverrides.hmlAppraisalCost || '700'} onChange={(e) => onOverrideChange('hmlAppraisalCost', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.hmlAppraisalCost && "border-accent/50 bg-accent/5")} />
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground">Underwriting Fee</span>
                            {localOverrides.hmlUnderwritingFee && (
                              <button onClick={() => onResetOverride('hmlUnderwritingFee')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground text-[10px]">$</span>
                            <Input type="text" inputMode="numeric" value={localOverrides.hmlUnderwritingFee || '0'} onChange={(e) => onOverrideChange('hmlUnderwritingFee', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.hmlUnderwritingFee && "border-accent/50 bg-accent/5")} />
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground">Other Fees (misc)</span>
                            {localOverrides.hmlOtherFees && (
                              <button onClick={() => onResetOverride('hmlOtherFees')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground text-[10px]">$</span>
                            <Input type="text" inputMode="numeric" value={localOverrides.hmlOtherFees || '0'} onChange={(e) => onOverrideChange('hmlOtherFees', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.hmlOtherFees && "border-accent/50 bg-accent/5")} />
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground">Notary</span>
                            {localOverrides.notaryFees && (
                              <button onClick={() => onResetOverride('notaryFees')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground text-[10px]">$</span>
                            <Input type="text" inputMode="numeric" value={localOverrides.notaryFees || '500'} onChange={(e) => onOverrideChange('notaryFees', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.notaryFees && "border-accent/50 bg-accent/5")} />
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground">Title Fees</span>
                            {localOverrides.titleFees && (
                              <button onClick={() => onResetOverride('titleFees')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground text-[10px]">$</span>
                            <Input type="text" inputMode="numeric" value={localOverrides.titleFees || '500'} onChange={(e) => onOverrideChange('titleFees', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.titleFees && "border-accent/50 bg-accent/5")} />
                          </div>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-orange-500/10">
                          <span className="font-semibold">Total Fees (excl. interest)</span>
                          <span className="font-bold">{formatCurrency(hmlPoints + hmlAllFees + (notaryFeesCalc * 2) + titleFeesCalc)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-orange-300">Total Payoff to HML</span>
                          <span className="font-bold text-orange-300">{formatCurrency(hmlTotalLoan + hmlTotalInterest)}</span>
                        </div>
                      </div>

                      {/* Down Payment / Cash Required */}
                      <div className="space-y-1 pt-2 border-t border-orange-500/20">
                        <h5 className="text-[10px] font-semibold text-muted-foreground uppercase">Cash Required</h5>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Down (Purchase)</span>
                          <span className="font-medium">{formatCurrency(hmlDownPaymentPurchase)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Down (Rehab)</span>
                          <span className="font-medium">{formatCurrency(hmlDownPaymentRehab)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Closing Costs</span>
                          <span className="font-medium">{formatCurrency(closingCostsBuyCalc)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-orange-500/10">
                          <span className="font-semibold text-cyan-300">Cash to Close</span>
                          <span className="font-bold text-cyan-300">{formatCurrency(hmlCashToClose)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Contingency</span>
                          <span className="font-medium">{formatCurrency(rehabContingencyCalc)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Holding ({rehabMonths}mo)</span>
                          <span className="font-medium">{formatCurrency(totalHoldingCosts)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">HML Interest ({rehabMonths}mo)</span>
                          <span className="font-medium">{formatCurrency(hmlTotalInterest)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Points + Fees</span>
                          <span className="font-medium">{formatCurrency(hmlPoints + hmlAllFees)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-orange-500/10">
                          <span className="font-semibold text-cyan-400">Cash to Close</span>
                          <span className="font-bold text-cyan-400">{formatCurrency(hmlCashOutOfPocket)}</span>
                        </div>
                      </div>

                      {/* Sale Costs */}
                      <div className="space-y-1 pt-2 border-t border-orange-500/20">
                        <h5 className="text-[10px] font-semibold text-muted-foreground uppercase">Sale Costs</h5>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground">Closing on Sale</span>
                            {(localOverrides.closingCostsSalePercent || localOverrides.closingCostsSaleDollar) && (
                              <button onClick={() => { onResetOverride('closingCostsSalePercent'); onResetOverride('closingCostsSaleDollar'); }} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>
                            )}
                            <span className="text-muted-foreground">(</span>
                            <Input type="text" inputMode="numeric" value={localOverrides.closingCostsSalePercent || loanDefaults.closingCostsPercent.toString()} onChange={(e) => { onOverrideChange('closingCostsSalePercent', e.target.value); if (e.target.value) onOverrideChange('closingCostsSaleDollar', ''); }} className={cn("w-7 h-5 text-xs text-center px-0.5", localOverrides.closingCostsSalePercent && "border-accent/50 bg-accent/5")} />
                            <span className="text-muted-foreground">%</span>
                            <span className="text-muted-foreground mx-0.5">|</span>
                            <span className="text-muted-foreground">$</span>
                            <Input type="text" inputMode="numeric" value={localOverrides.closingCostsSaleDollar || ''} placeholder="—" onChange={(e) => { onOverrideChange('closingCostsSaleDollar', e.target.value); if (e.target.value) onOverrideChange('closingCostsSalePercent', ''); }} className={cn("w-12 h-5 text-xs text-right px-0.5", localOverrides.closingCostsSaleDollar && "border-accent/50 bg-accent/5")} />
                            <span className="text-muted-foreground">)</span>
                          </div>
                          <span className="font-medium">{formatCurrency(closingCostsSaleCalc)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Agent + Notary</span>
                          <span className="font-medium">{formatCurrency(agentCommissionCalc + notaryFeesCalc)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Title</span>
                          <span className="font-medium">{formatCurrency(titleFeesCalc)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-orange-500/10">
                          <span className="font-semibold">Total Sale Costs</span>
                          <span className="font-bold">{formatCurrency(totalSaleCostsWithLoan)}</span>
                        </div>
                      </div>

                      {/* Bottom line */}
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-orange-500/20">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">Net Profit</span>
                          <span className={cn("font-bold text-lg", hmlNetProfit >= 30000 ? "text-emerald-400" : hmlNetProfit >= 0 ? "text-amber-400" : "text-red-400")}>
                            {formatCurrency(hmlNetProfit)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">ROI (Cash)</span>
                          <span className={cn("font-bold text-xl", hmlRoi >= 0.25 ? "text-emerald-400" : hmlRoi >= 0 ? "text-amber-400" : "text-red-400")}>
                            {formatPercent(hmlRoi)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>

            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
