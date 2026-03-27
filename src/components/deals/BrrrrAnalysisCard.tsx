import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrendingUp, ChevronDown, FileDown, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/financialCalculations';
import { DealApiData, DealFinancials, Deal } from '@/types/deal';
import { generateDealPDF } from '@/utils/pdfExport';

interface BrrrrAnalysisCardProps {
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
    holdingMonths: number;
    hmlLtvPurchasePercent: number;
    hmlLtvRehabPercent: number;
    hmlPointsPercent: number;
    hmlInterestRate: number;
    hmlProcessingFee: number;
    refiLtvPercent: number;
    refiClosingPercent: number;
    interestRate: number;
    propertyManagementPercent: number;
    maintenanceVacancyPercent: number;
  };
  onOverrideChange: (field: string, value: string) => void;
  onResetOverride: (field: string) => void;
  brrrrCashLeftInDeal: number;
  brrrrMonthlyCashflow: number;
  brrrrEquity: number;
  totalHoldingCosts: number;
  rehabMonths: number;
  orderIndex: number;
}

export function BrrrrAnalysisCard({
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
  brrrrCashLeftInDeal,
  brrrrMonthlyCashflow,
  brrrrEquity,
  totalHoldingCosts,
  rehabMonths,
  orderIndex,
}: BrrrrAnalysisCardProps) {
  const [refiFeesOpen, setRefiFeesOpen] = useState(false);
  // HML financing
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
  
  // Refi parameters
  const refiLtv = localOverrides.refiLtvPercent 
    ? parseFloat(localOverrides.refiLtvPercent) / 100 
    : loanDefaults.refiLtvPercent / 100;
  const refiClosingPercent = localOverrides.refiClosingPercent 
    ? parseFloat(localOverrides.refiClosingPercent) / 100 
    : loanDefaults.refiClosingPercent / 100;
  const refiInterestRate = localOverrides.refiInterestRate
    ? parseFloat(localOverrides.refiInterestRate) / 100
    : loanDefaults.interestRate / 100;
  const refiAppraisalCost = localOverrides.refiAppraisalCost
    ? parseFloat(localOverrides.refiAppraisalCost)
    : 1150; // default $1,150 (same as rental)
  const refiUnderwritingFee = localOverrides.refiUnderwritingFee
    ? parseFloat(localOverrides.refiUnderwritingFee)
    : 750; // default $750 (same as rental)
  const refiPointsPercent = localOverrides.refiPointsPercent
    ? parseFloat(localOverrides.refiPointsPercent) / 100
    : 0.01; // default 1% (same as rental)
  const refiOtherFees = localOverrides.refiOtherFees
    ? parseFloat(localOverrides.refiOtherFees)
    : 3500; // default $3,500 (same as rental)
  const refiLenderName = localOverrides.refiLenderName || '';
  
  // Closing costs
  const closingPercent = localOverrides.closingCostsPercent 
    ? parseFloat(localOverrides.closingCostsPercent) / 100 
    : loanDefaults.closingCostsPercent / 100;
  const closingCostsBuy = localOverrides.closingCostsDollar 
    ? parseFloat(localOverrides.closingCostsDollar)
    : purchasePrice * closingPercent;
  
  // HML calculations
  const hmlLoanPurchase = purchasePrice * hmlLtvPurchase;
  const hmlLoanRehab = rehabCost * hmlLtvRehab;
  const hmlTotalLoan = hmlLoanPurchase + hmlLoanRehab;
  const hmlPoints = hmlTotalLoan * hmlPointsPercentVal;
  const hmlMonthlyInterest = hmlTotalLoan * (hmlInterestRateVal / 12);
  const hmlTotalInterest = hmlMonthlyInterest * rehabMonths;
  const hmlTotalLoanCost = hmlPoints + hmlProcessingFeeVal + hmlTotalInterest;
  
  // Cash invested
  const notaryFee = 500; // per signing
  const downPaymentPurchase = purchasePrice - hmlLoanPurchase;
  const downPaymentRehab = rehabCost - hmlLoanRehab;
  const totalCashInvested = (purchasePrice + rehabCost + closingCostsBuy + hmlPoints + hmlProcessingFeeVal + notaryFee + totalHoldingCosts + hmlTotalInterest);
  const cashToClose = totalCashInvested - hmlTotalLoan;
  
  // Refi calculations
  const refiLoanAmount = arv * refiLtv;
  const refiClosingCosts = refiLoanAmount * refiClosingPercent;
  const refiPoints = refiLoanAmount * refiPointsPercent;
  // Loan Fees & Escrow subtotal (Appraisal, Underwriting, Points, Other)
  const refiLoanFees = refiAppraisalCost + refiUnderwritingFee + refiPoints + refiOtherFees;
  // Loan Closing Costs subtotal (Title/Closing % + Notary)
  const refiLoanClosingCosts = refiClosingCosts + notaryFee;
  // Total Refi Costs
  const refiTotalLegalFees = refiLoanFees + refiLoanClosingCosts;
  const hmlTotalPayoff = hmlTotalLoan + hmlTotalInterest;
  const cashToBorrower = refiLoanAmount - refiTotalLegalFees;
  const cashAfterHml = cashToBorrower - hmlTotalPayoff;
  const cashLeftInDeal = Math.max(0, cashToClose - Math.max(0, cashAfterHml));
  
  // Rental phase
  const propMgmtPercent = localOverrides.propertyManagementPercent 
    ? parseFloat(localOverrides.propertyManagementPercent) / 100 
    : loanDefaults.propertyManagementPercent / 100;
  const maintenanceVacancyPercent = localOverrides.maintenanceVacancyPercent 
    ? parseFloat(localOverrides.maintenanceVacancyPercent) / 100 
    : loanDefaults.maintenanceVacancyPercent / 100;
  
  const propertyTaxMonthly = localOverrides.propertyTaxMonthly 
    ? parseFloat(localOverrides.propertyTaxMonthly) 
    : (apiData.propertyTax ?? 0) / 12;
  const insuranceMonthly = localOverrides.insuranceMonthly 
    ? parseFloat(localOverrides.insuranceMonthly) 
    : (apiData.insurance ?? 0) / 12;
  
  const managementMonthly = rent * propMgmtPercent;
  const reservesMonthly = rent * maintenanceVacancyPercent;
  const totalOperatingExpenses = propertyTaxMonthly + insuranceMonthly + managementMonthly + reservesMonthly;
  
  // Refi mortgage
  const monthlyRate = refiInterestRate / 12;
  const numPayments = 360; // 30 years
  const refiMortgage = refiLoanAmount > 0 && monthlyRate > 0
    ? refiLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : 0;
  
  const grossMonthlyRent = rent;
  const brrrrCashflowMonthly = grossMonthlyRent - totalOperatingExpenses - refiMortgage;
  const brrrrCashflowAnnual = brrrrCashflowMonthly * 12;
  const equityAfterRefi = arv - refiLoanAmount - cashLeftInDeal;
  const brrrrCoCReturn = cashLeftInDeal > 0 ? (brrrrCashflowAnnual / cashLeftInDeal) * 100 : (brrrrCashflowMonthly > 0 ? 999 : 0);

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <Card className="border border-purple-500/30 bg-card/50" style={{ order: orderIndex }}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-2 md:p-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="text-xs md:text-sm flex items-center gap-1.5 md:gap-2">
              <TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-purple-400 shrink-0" />
              <span className="text-purple-400 font-medium shrink-0">BRRRR</span>
              {!isOpen && (
                <>
                  <span className="text-muted-foreground text-[9px] md:text-[10px]">Money:</span>
                  <span className={cn("font-bold text-[10px] md:text-xs", brrrrCashLeftInDeal <= 0 ? "text-emerald-400" : brrrrCashLeftInDeal <= 20000 ? "text-amber-400" : "text-cyan-400")}>
                    {formatCurrency(Math.max(0, brrrrCashLeftInDeal))}
                  </span>
                  <span className="text-muted-foreground text-[9px] md:text-[10px]">CF:</span>
                  <span className={cn("font-bold text-[10px] md:text-xs", brrrrMonthlyCashflow >= 200 ? "text-emerald-400" : brrrrMonthlyCashflow >= 0 ? "text-amber-400" : "text-red-400")}>
                    {formatCurrency(brrrrMonthlyCashflow)}/mo
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
                    }, 'brrrr');
                  }}
                  className="h-5 w-5 md:h-6 md:w-6 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 text-[11px] md:text-xs">
              {/* Column 1 - Buy & Rehab Phase */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider border-b border-orange-500/30 pb-1">
                  Phase 1: Buy & Rehab (HML)
                </h4>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Purchase</span>
                    <span className="font-medium">{formatCurrency(purchasePrice)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">HML ({Math.round(hmlLtvPurchase * 100)}%)</span>
                    <span className="font-medium text-emerald-400">-{formatCurrency(hmlLoanPurchase)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Rehab</span>
                    <span className="font-medium text-amber-400">{formatCurrency(rehabCost)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">HML ({Math.round(hmlLtvRehab * 100)}%)</span>
                    <span className="font-medium text-emerald-400">-{formatCurrency(hmlLoanRehab)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Closing</span>
                    <span className="font-medium">{formatCurrency(closingCostsBuy)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">HML Points</span>
                    <span className="font-medium">{formatCurrency(hmlPoints)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">HML Processing</span>
                    <span className="font-medium">{formatCurrency(hmlProcessingFeeVal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">HML Interest ({rehabMonths}mo)</span>
                    <span className="font-medium">{formatCurrency(hmlTotalInterest)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Notary (HML signing)</span>
                    <span className="font-medium">{formatCurrency(notaryFee)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Holding Costs</span>
                    <span className="font-medium">{formatCurrency(totalHoldingCosts)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-orange-500/30">
                    <span className="font-semibold">Cash to Close</span>
                    <span className="font-bold">{formatCurrency(cashToClose)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total Cash Invested</span>
                    <span className="font-bold text-amber-400">{formatCurrency(totalCashInvested)}</span>
                  </div>
                </div>
              </div>

              {/* Column 2 - Refinance Phase */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider border-b border-purple-500/30 pb-1">
                  Phase 2: Refinance
                </h4>
                <div className="space-y-1">
                  {/* Lender Name */}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Lender</span>
                    <div className="flex items-center gap-0.5">
                      {localOverrides.refiLenderName && (
                        <button onClick={() => onResetOverride('refiLenderName')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                          <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                        </button>
                      )}
                      <Input type="text" value={localOverrides.refiLenderName || ''} onChange={(e) => onOverrideChange('refiLenderName', e.target.value)} placeholder="Lender name" className={cn("w-24 h-5 text-xs px-1", localOverrides.refiLenderName && "border-accent/50 bg-accent/5")} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">ARV</span>
                    <span className="font-medium text-emerald-400">{formatCurrency(arv)}</span>
                  </div>
                  {/* Leverage % LTV */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-0.5">
                      <span className="text-muted-foreground">LTV (</span>
                      {localOverrides.refiLtvPercent && (
                        <button onClick={() => onResetOverride('refiLtvPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                          <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                        </button>
                      )}
                      <Input type="text" inputMode="numeric" value={localOverrides.refiLtvPercent || loanDefaults.refiLtvPercent.toString()} onChange={(e) => onOverrideChange('refiLtvPercent', e.target.value)} className={cn("w-8 h-5 text-xs text-center px-0.5", localOverrides.refiLtvPercent && "border-accent/50 bg-accent/5")} />
                      <span className="text-muted-foreground">%)</span>
                    </div>
                    <span className="font-medium">{formatCurrency(refiLoanAmount)}</span>
                  </div>
                  {/* Annual Interest Rate */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-0.5">
                      <span className="text-muted-foreground">Rate (</span>
                      {localOverrides.refiInterestRate && (
                        <button onClick={() => onResetOverride('refiInterestRate')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                          <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                        </button>
                      )}
                      <Input type="text" inputMode="numeric" value={localOverrides.refiInterestRate || loanDefaults.interestRate.toString()} onChange={(e) => onOverrideChange('refiInterestRate', e.target.value)} className={cn("w-10 h-5 text-xs text-center px-0.5", localOverrides.refiInterestRate && "border-accent/50 bg-accent/5")} />
                      <span className="text-muted-foreground">%)</span>
                    </div>
                    <span className="font-medium text-muted-foreground">Fixed</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Pay Off HML</span>
                    <span className="font-medium text-red-400">-{formatCurrency(hmlTotalLoan)}</span>
                  </div>
                  {/* Refi Costs - collapsible with two sub-groups */}
                  <Collapsible>
                    <CollapsibleTrigger className="flex justify-between items-center w-full hover:bg-muted/30 rounded px-0.5 -mx-0.5 cursor-pointer">
                      <span className="text-muted-foreground flex items-center gap-1">
                        Refi Costs <ChevronDown className="w-2.5 h-2.5 transition-transform group-data-[state=open]:rotate-180" />
                      </span>
                      <span className="font-medium text-red-400">-{formatCurrency(refiTotalLegalFees)}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-2 mt-1 space-y-0.5 border-l border-purple-500/20 pl-2">
                        {/* Loan Fees & Escrow - Manual toggle */}
                        <div
                          className="flex justify-between items-center w-full hover:bg-muted/30 rounded px-0.5 -mx-0.5 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setRefiFeesOpen(!refiFeesOpen); }}
                        >
                          <span className="text-muted-foreground flex items-center gap-1">
                            Loan Fees & Escrow <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", refiFeesOpen && "rotate-180")} />
                          </span>
                          <span className="font-medium">{formatCurrency(refiLoanFees)}</span>
                        </div>
                        {refiFeesOpen && (
                          <div className="ml-2 mt-1 space-y-0.5 border-l border-purple-500/10 pl-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">Appraisal</span>
                                {localOverrides.refiAppraisalCost && (
                                  <button onClick={() => onResetOverride('refiAppraisalCost')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">$</span>
                                <Input type="text" inputMode="numeric" value={localOverrides.refiAppraisalCost || '1150'} onChange={(e) => onOverrideChange('refiAppraisalCost', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.refiAppraisalCost && "border-accent/50 bg-accent/5")} />
                              </div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">Underwriting</span>
                                {localOverrides.refiUnderwritingFee && (
                                  <button onClick={() => onResetOverride('refiUnderwritingFee')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">$</span>
                                <Input type="text" inputMode="numeric" value={localOverrides.refiUnderwritingFee || '750'} onChange={(e) => onOverrideChange('refiUnderwritingFee', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.refiUnderwritingFee && "border-accent/50 bg-accent/5")} />
                              </div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">Points (</span>
                                {localOverrides.refiPointsPercent && (
                                  <button onClick={() => onResetOverride('refiPointsPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                                <Input type="text" inputMode="decimal" value={localOverrides.refiPointsPercent || '1'} onChange={(e) => onOverrideChange('refiPointsPercent', e.target.value)} className={cn("w-10 h-5 text-xs text-center px-0.5", localOverrides.refiPointsPercent && "border-accent/50 bg-accent/5")} />
                                <span className="text-muted-foreground">%)</span>
                              </div>
                              <span className="font-medium">{formatCurrency(refiPoints)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">Other Fees</span>
                                {localOverrides.refiOtherFees && (
                                  <button onClick={() => onResetOverride('refiOtherFees')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                    <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5">
                                <span className="text-muted-foreground">$</span>
                                <Input type="text" inputMode="numeric" value={localOverrides.refiOtherFees || '3500'} onChange={(e) => onOverrideChange('refiOtherFees', e.target.value)} className={cn("w-14 h-5 text-xs text-right px-0.5", localOverrides.refiOtherFees && "border-accent/50 bg-accent/5")} />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Loan Closing Costs */}
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-0.5">
                            <span className="text-muted-foreground">Title (</span>
                            {localOverrides.refiClosingPercent && (
                              <button onClick={() => onResetOverride('refiClosingPercent')} className="p-0.5 rounded hover:bg-muted" title="Reset">
                                <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>
                            )}
                            <Input type="text" inputMode="numeric" value={localOverrides.refiClosingPercent || loanDefaults.refiClosingPercent.toString()} onChange={(e) => onOverrideChange('refiClosingPercent', e.target.value)} className={cn("w-6 h-5 text-xs text-center px-0.5", localOverrides.refiClosingPercent && "border-accent/50 bg-accent/5")} />
                            <span className="text-muted-foreground">%)</span>
                          </div>
                          <span className="font-medium">{formatCurrency(refiClosingCosts)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Notary</span>
                          <span className="font-medium">{formatCurrency(notaryFee)}</span>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Cash to Borrower */}
                  <div className="flex justify-between items-center pt-1 border-t border-purple-500/30">
                    <span className="font-semibold">Cash to Borrower</span>
                    <span className="font-bold text-emerald-400">{formatCurrency(cashToBorrower)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Pay Off to HML</span>
                    <span className="font-medium text-red-400">-{formatCurrency(hmlTotalPayoff)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Cash After Paying HML</span>
                    <span className={cn("font-medium", cashAfterHml >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {cashAfterHml >= 0 ? formatCurrency(cashAfterHml) : `-${formatCurrency(Math.abs(cashAfterHml))}`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 mt-1 border-t border-purple-500/30">
                    <span className="font-semibold">💰 Money in the Deal</span>
                    <span className={cn("font-bold text-lg", cashLeftInDeal <= 0 ? "text-emerald-400" : cashLeftInDeal <= 20000 ? "text-amber-400" : "text-cyan-400")}>
                      {formatCurrency(Math.max(0, cashLeftInDeal))}
                    </span>
                  </div>
                  {cashLeftInDeal <= 0 && (
                    <div className="text-center text-emerald-400 text-[10px] font-semibold mt-1 p-1 bg-emerald-500/10 rounded">
                      ✨ Full Cash Out! All money recovered!
                    </div>
                  )}
                </div>
              </div>

              {/* Column 3 - Rental Phase (Post-Refi) */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider border-b border-cyan-500/30 pb-1">
                  Phase 3: Rent & Repeat
                </h4>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Gross Rent</span>
                    <span className="font-medium text-cyan-400">{formatCurrency(grossMonthlyRent)}/mo</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Operating Expenses</span>
                    <span className="font-medium text-red-400">-{formatCurrency(totalOperatingExpenses)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Refi Mortgage</span>
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
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Equity Position</span>
                    <span className="font-bold text-emerald-400">{formatCurrency(equityAfterRefi)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 mt-2 border-t border-cyan-500/30">
                    <span className="font-semibold">Cash-on-Cash</span>
                    <span className={cn("font-bold text-xl", 
                      cashLeftInDeal <= 0 ? "text-emerald-400" : 
                      brrrrCoCReturn >= 20 ? "text-emerald-400" : 
                      brrrrCoCReturn >= 10 ? "text-amber-400" : "text-red-400"
                    )}>
                      {cashLeftInDeal <= 0 ? "∞" : `${brrrrCoCReturn.toFixed(1)}%`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
