import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Home, ChevronDown, FileDown, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { DealApiData, DealFinancials, Deal } from '@/types/deal';
import { generateDealPDF } from '@/utils/pdfExport';

interface RentalAnalysisCardProps {
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
    downPaymentPercent: number;
    interestRate: number;
    loanTermYears: number;
    propertyManagementPercent: number;
    maintenanceVacancyPercent: number;
  };
  onOverrideChange: (field: string, value: string) => void;
  onResetOverride: (field: string) => void;
  rentalMonthlyCashflow: number;
  rentalCapRate: number;
  orderIndex: number;
}

export function RentalAnalysisCard({
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
  rentalMonthlyCashflow,
  rentalCapRate,
  orderIndex,
}: RentalAnalysisCardProps) {
  // Expenses calculations
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
    : getEffectiveMonthlyInsurance(apiData.insurance);
  
  const managementMonthly = rent * propMgmtPercent;
  const reservesMonthly = rent * maintenanceVacancyPercent;
  const totalOperatingExpenses = propertyTaxMonthly + insuranceMonthly + managementMonthly + reservesMonthly;
  
  // Cash deal calculations
  const cashNoi = (rent - totalOperatingExpenses) * 12;
  const cashTotalInvestment = purchasePrice + rehabCost;
  const cashCapRate = cashTotalInvestment > 0 ? (cashNoi / cashTotalInvestment) * 100 : 0;
  const cashMonthlyCashflow = rent - totalOperatingExpenses;
  
  // Financing calculations
  const downPaymentPercent = localOverrides.downPaymentPercent 
    ? parseFloat(localOverrides.downPaymentPercent) / 100 
    : loanDefaults.downPaymentPercent / 100;
  const interestRate = localOverrides.interestRate 
    ? parseFloat(localOverrides.interestRate) / 100 
    : loanDefaults.interestRate / 100;
  const loanTermYears = localOverrides.loanTermYears 
    ? parseFloat(localOverrides.loanTermYears) 
    : loanDefaults.loanTermYears;
  
  const downPayment = purchasePrice * downPaymentPercent;
  const loanAmount = purchasePrice * (1 - downPaymentPercent);
  const monthlyRate = interestRate / 12;
  const numPayments = loanTermYears * 12;
  const financeMortgage = loanAmount > 0 && monthlyRate > 0
    ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : 0;
  
  const notaryFee = 500; // 1 loan signing
  const financeCashRequired = downPayment + rehabCost + notaryFee;
  const financeCashflowMonthly = rent - totalOperatingExpenses - financeMortgage;
  const financeCoCReturn = financeCashRequired > 0 ? ((financeCashflowMonthly * 12) / financeCashRequired) * 100 : 0;

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <Card className="border border-cyan-500/30 bg-card/50" style={{ order: orderIndex }}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-2 md:p-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="text-xs md:text-sm flex items-center gap-1.5 md:gap-2">
              <Home className="w-3 h-3 md:w-4 md:h-4 text-cyan-400 shrink-0" />
              <span className="text-cyan-400 font-medium shrink-0">Rental</span>
              {!isOpen && (
                <>
                  <span className="text-muted-foreground text-[9px] md:text-[10px]">CF:</span>
                  <span className={cn("font-bold text-[10px] md:text-xs", rentalMonthlyCashflow >= 200 ? "text-emerald-400" : rentalMonthlyCashflow >= 0 ? "text-amber-400" : "text-red-400")}>
                    {formatCurrency(rentalMonthlyCashflow)}/mo
                  </span>
                  <span className="text-muted-foreground text-[9px] md:text-[10px]">Cap:</span>
                  <span className={cn("font-bold text-[10px] md:text-xs", rentalCapRate >= 8 ? "text-emerald-400" : rentalCapRate >= 6 ? "text-amber-400" : "text-red-400")}>
                    {rentalCapRate.toFixed(1)}%
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
                    }, 'rental');
                  }}
                  className="h-5 w-5 md:h-6 md:w-6 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
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
            <div className="space-y-3 md:space-y-4 text-[11px] md:text-xs">
              {/* Income & Expenses */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left - Cash Deal Analysis */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">
                    Cash Deal Analysis
                  </h4>
                  
                  {/* Income */}
                  <div className="flex justify-between items-center p-2 rounded bg-cyan-500/10">
                    <span className="font-medium text-cyan-400">Monthly Rent</span>
                    <span className="font-bold text-cyan-400">{formatCurrency(rent)}</span>
                  </div>
                  
                  {/* Fixed Expenses */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="flex items-center justify-between p-1.5 rounded bg-muted/30">
                      <span className="text-muted-foreground text-[11px]">Property Tax</span>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground text-[10px]">$</span>
                        <Input 
                          type="text" 
                          inputMode="numeric" 
                          value={localOverrides.propertyTaxMonthly || Math.round(propertyTaxMonthly).toString()} 
                          onChange={(e) => onOverrideChange('propertyTaxMonthly', e.target.value)} 
                          className={cn("w-14 h-5 text-[11px] text-right px-1", localOverrides.propertyTaxMonthly && "border-accent/50 bg-accent/5")} 
                        />
                        {localOverrides.propertyTaxMonthly && (
                          <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => onResetOverride('propertyTaxMonthly')} title="Reset">
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
                          value={localOverrides.insuranceMonthly || Math.round(insuranceMonthly).toString()} 
                          onChange={(e) => onOverrideChange('insuranceMonthly', e.target.value)} 
                          className={cn("w-14 h-5 text-[11px] text-right px-1", localOverrides.insuranceMonthly && "border-accent/50 bg-accent/5")} 
                        />
                        {localOverrides.insuranceMonthly && (
                          <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => onResetOverride('insuranceMonthly')} title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Percentage-Based Expenses */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col p-1.5 rounded bg-muted/30">
                      <span className="text-muted-foreground text-[10px] mb-1">Reserves</span>
                      <div className="flex items-center gap-1">
                        <Input 
                          type="text" 
                          inputMode="numeric" 
                          value={localOverrides.maintenanceVacancyPercent || loanDefaults.maintenanceVacancyPercent.toString()} 
                          onChange={(e) => onOverrideChange('maintenanceVacancyPercent', e.target.value)} 
                          className={cn("w-10 h-5 text-[11px] text-right px-1", localOverrides.maintenanceVacancyPercent && "border-accent/50 bg-accent/5")} 
                        />
                        <span className="text-muted-foreground text-[10px]">%</span>
                        {localOverrides.maintenanceVacancyPercent && (
                          <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => onResetOverride('maintenanceVacancyPercent')} title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        )}
                      </div>
                      <span className="text-foreground font-medium text-[11px] mt-0.5">{formatCurrency(reservesMonthly)}</span>
                    </div>
                    <div className="flex flex-col p-1.5 rounded bg-muted/30">
                      <span className="text-muted-foreground text-[10px] mb-1">Management</span>
                      <div className="flex items-center gap-1">
                        <Input 
                          type="text" 
                          inputMode="numeric" 
                          value={localOverrides.propertyManagementPercent || loanDefaults.propertyManagementPercent.toString()} 
                          onChange={(e) => onOverrideChange('propertyManagementPercent', e.target.value)} 
                          className={cn("w-10 h-5 text-[11px] text-right px-1", localOverrides.propertyManagementPercent && "border-accent/50 bg-accent/5")} 
                        />
                        <span className="text-muted-foreground text-[10px]">%</span>
                        {localOverrides.propertyManagementPercent && (
                          <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => onResetOverride('propertyManagementPercent')} title="Reset">
                            <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        )}
                      </div>
                      <span className="text-foreground font-medium text-[11px] mt-0.5">{formatCurrency(managementMonthly)}</span>
                    </div>
                  </div>
                  
                  {/* Results */}
                  <div className="space-y-1 pt-2 border-t border-border">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Investment</span>
                      <span className="font-medium">{formatCurrency(cashTotalInvestment)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Monthly Cashflow</span>
                      <span className={cn("font-bold", cashMonthlyCashflow >= 200 ? "text-emerald-400" : cashMonthlyCashflow >= 0 ? "text-amber-400" : "text-red-400")}>
                        {formatCurrency(cashMonthlyCashflow)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-border">
                      <span className="font-semibold">Cap Rate</span>
                      <span className={cn("font-bold text-lg", cashCapRate >= 8 ? "text-emerald-400" : cashCapRate >= 6 ? "text-amber-400" : "text-red-400")}>
                        {cashCapRate.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right - Financing Section */}
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 space-y-1">
                  <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                    🏦 With Financing
                  </h4>
                  <div className="flex flex-wrap gap-2 pb-1 border-b border-cyan-500/30">
                    <div className="flex items-center gap-0.5">
                      <span className="text-muted-foreground text-[10px]">Down</span>
                      <Input type="text" inputMode="numeric" value={localOverrides.downPaymentPercent || loanDefaults.downPaymentPercent.toString()} onChange={(e) => onOverrideChange('downPaymentPercent', e.target.value)} className={cn("w-8 h-4 text-[11px] text-right px-0.5", localOverrides.downPaymentPercent && "border-accent/50 bg-accent/5")} />
                      <span className="text-muted-foreground text-[10px]">%</span>
                      {localOverrides.downPaymentPercent && (
                        <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => onResetOverride('downPaymentPercent')} title="Reset">
                          <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <span className="text-muted-foreground text-[10px]">Rate</span>
                      <Input type="text" inputMode="decimal" value={localOverrides.interestRate || loanDefaults.interestRate.toString()} onChange={(e) => onOverrideChange('interestRate', e.target.value)} className={cn("w-8 h-4 text-[11px] text-right px-0.5", localOverrides.interestRate && "border-accent/50 bg-accent/5")} />
                      <span className="text-muted-foreground text-[10px]">%</span>
                      {localOverrides.interestRate && (
                        <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => onResetOverride('interestRate')} title="Reset">
                          <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <span className="text-muted-foreground text-[10px]">Term</span>
                      <Input type="text" inputMode="numeric" value={localOverrides.loanTermYears || loanDefaults.loanTermYears.toString()} onChange={(e) => onOverrideChange('loanTermYears', e.target.value)} className={cn("w-7 h-4 text-[11px] text-right px-0.5", localOverrides.loanTermYears && "border-accent/50 bg-accent/5")} />
                      <span className="text-muted-foreground text-[10px]">yrs</span>
                      {localOverrides.loanTermYears && (
                        <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-destructive/20" onClick={() => onResetOverride('loanTermYears')} title="Reset">
                          <RotateCcw className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Loan Amount</span>
                      <span className="font-medium">{formatCurrency(loanAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Mortgage (P&I)</span>
                      <span className="font-medium">{formatCurrency(financeMortgage)}/mo</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Notary</span>
                      <span className="font-medium">{formatCurrency(notaryFee)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Cash Required</span>
                      <span className="font-bold text-amber-400">{formatCurrency(financeCashRequired)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Monthly Cashflow</span>
                      <span className={cn("font-bold", financeCashflowMonthly >= 200 ? "text-emerald-400" : financeCashflowMonthly >= 0 ? "text-amber-400" : "text-red-400")}>
                        {formatCurrency(financeCashflowMonthly)}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-cyan-500/30">
                    <span className="font-semibold">Cash-on-Cash Return</span>
                    <span className={cn("font-bold text-lg", financeCoCReturn >= 10 ? "text-emerald-400" : financeCoCReturn >= 6 ? "text-amber-400" : "text-red-400")}>
                      {financeCoCReturn.toFixed(2)}%
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
