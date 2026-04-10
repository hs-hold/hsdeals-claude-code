import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  DollarSign, 
  Calculator, 
  Home, 
  Clock, 
  ChevronDown,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { DealApiData, DealFinancials } from '@/types/deal';

interface WhatIfAnalysisProps {
  purchasePrice: number;
  arv: number;
  rehabCost: number;
  rent: number;
  interestRate: number;
  holdingMonths: number;
  liveFinancials: DealFinancials | null;
  apiData: DealApiData;
  localOverrides: Record<string, string>;
  loanDefaults: {
    flipClosingCostsPercent: number;
    contingencyPercent: number;
    agentCommissionPercent: number;
    rentalDownPaymentPercent: number;
    rentalLoanTermYears: number;
    propertyManagementPercent: number;
    maintenanceVacancyPercent: number;
    holdingMonths: number;
    rentalInterestRate: number;
  };
  totalHoldingCosts: number;
}

export function WhatIfAnalysis({
  purchasePrice,
  arv,
  rehabCost,
  rent,
  interestRate,
  holdingMonths,
  liveFinancials,
  apiData,
  localOverrides,
  loanDefaults,
  totalHoldingCosts,
}: WhatIfAnalysisProps) {
  const [isSensitivityOpen, setIsSensitivityOpen] = useState(false);
  // Guard initial values against NaN (can happen when deal data loads async)
  const safeN = (v: number) => (isFinite(v) && v != null) ? v : 0;
  const [whatIfPurchasePrice, setWhatIfPurchasePrice] = useState(() => safeN(purchasePrice));
  const [whatIfArv, setWhatIfArv] = useState(() => safeN(arv));
  const [whatIfRehabCost, setWhatIfRehabCost] = useState(() => safeN(rehabCost));
  const [whatIfInterestRate, setWhatIfInterestRate] = useState(() => safeN(interestRate));
  const [whatIfRent, setWhatIfRent] = useState(() => safeN(rent));
  const [whatIfHoldingMonths, setWhatIfHoldingMonths] = useState(() => safeN(holdingMonths) || 6);

  // Sync state when props change from NaN → valid (e.g. after data loads)
  useEffect(() => { if (isFinite(purchasePrice) && !isFinite(whatIfPurchasePrice)) setWhatIfPurchasePrice(purchasePrice); }, [purchasePrice]);
  useEffect(() => { if (isFinite(arv) && !isFinite(whatIfArv)) setWhatIfArv(arv); }, [arv]);
  useEffect(() => { if (isFinite(rehabCost) && !isFinite(whatIfRehabCost)) setWhatIfRehabCost(rehabCost); }, [rehabCost]);
  useEffect(() => { if (isFinite(rent) && !isFinite(whatIfRent)) setWhatIfRent(rent); }, [rent]);
  useEffect(() => { if (isFinite(interestRate) && !isFinite(whatIfInterestRate)) setWhatIfInterestRate(interestRate); }, [interestRate]);

  // Calculate flip profit with what-if values
  const calcWhatIfFlipProfit = () => {
    const closingPercent = localOverrides.closingCostsPercent 
      ? parseFloat(localOverrides.closingCostsPercent) / 100 
      : loanDefaults.flipClosingCostsPercent / 100;
    const contingencyPercent = localOverrides.contingencyPercent 
      ? parseFloat(localOverrides.contingencyPercent) / 100 
      : loanDefaults.contingencyPercent / 100;
    const agentPercent = localOverrides.agentCommissionPercent 
      ? parseFloat(localOverrides.agentCommissionPercent) / 100 
      : loanDefaults.agentCommissionPercent / 100;
    const pp  = safeN(whatIfPurchasePrice);
    const av  = safeN(whatIfArv);
    const reh = safeN(whatIfRehabCost);
    const hm  = safeN(whatIfHoldingMonths) || 6;

    const closingCosts = localOverrides.closingCostsDollar
      ? parseFloat(localOverrides.closingCostsDollar)
      : pp * closingPercent;

    // Holding costs with what-if months
    const propertyTaxMonthly = localOverrides.propertyTaxMonthly
      ? parseFloat(localOverrides.propertyTaxMonthly)
      : (apiData.propertyTax ?? 0) / 12;
    const insuranceMonthly = localOverrides.insuranceMonthly
      ? parseFloat(localOverrides.insuranceMonthly)
      : getEffectiveMonthlyInsurance(apiData.insurance);
    const utilitiesMonthly = localOverrides.utilitiesMonthly
      ? parseFloat(localOverrides.utilitiesMonthly)
      : 300;
    const monthlyHolding = propertyTaxMonthly + insuranceMonthly + utilitiesMonthly;
    const whatIfHoldingCosts = monthlyHolding * hm;

    const contingency = reh * contingencyPercent;
    const totalInvestment = pp + closingCosts + reh + contingency + whatIfHoldingCosts;
    const agentCommission = av * agentPercent;
    const notaryFee = localOverrides.notaryFees ? parseFloat(localOverrides.notaryFees) : 500;
    const titleFee = localOverrides.titleFees ? parseFloat(localOverrides.titleFees) : 500;
    const netProfit = av - totalInvestment - agentCommission - (notaryFee * 2) - titleFee;
    const roi = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;
    return { netProfit, roi, totalInvestment };
  };

  // Calculate rental cashflow with what-if values
  const calcWhatIfRental = () => {
    const downPaymentPercent = localOverrides.downPaymentPercent 
      ? parseFloat(localOverrides.downPaymentPercent) / 100 
      : loanDefaults.rentalDownPaymentPercent / 100;
    const loanAmount = whatIfPurchasePrice * (1 - downPaymentPercent);
    const monthlyRate = whatIfInterestRate / 100 / 12;
    const numPayments = (localOverrides.loanTermYears ? parseFloat(localOverrides.loanTermYears) : loanDefaults.rentalLoanTermYears) * 12;
    const monthlyMortgage = loanAmount > 0 && monthlyRate > 0
      ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
      : 0;
    
    // Expenses
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
    
    const propMgmt = whatIfRent * propMgmtPercent;
    const maintenanceVacancy = whatIfRent * maintenanceVacancyPercent;
    const monthlyExpenses = propertyTaxMonthly + insuranceMonthly + propMgmt + maintenanceVacancy + monthlyMortgage;
    const monthlyCashflow = whatIfRent - monthlyExpenses;
    
    const downPayment = whatIfPurchasePrice * downPaymentPercent;
    const closingCosts = liveFinancials?.closingCosts ?? 0;
    const totalCashIn = downPayment + closingCosts + whatIfRehabCost;
    const annualCashflow = monthlyCashflow * 12;
    const cashOnCash = totalCashIn > 0 ? (annualCashflow / totalCashIn) * 100 : 0;
    
    return { monthlyCashflow, cashOnCash };
  };

  const flipResults = calcWhatIfFlipProfit();
  const rentalResults = calcWhatIfRental();

  // Base case (original values) for comparison
  const baseFlipProfit = (() => {
    const closingPercent = localOverrides.closingCostsPercent 
      ? parseFloat(localOverrides.closingCostsPercent) / 100 
      : loanDefaults.flipClosingCostsPercent / 100;
    const contingencyPercent = localOverrides.contingencyPercent 
      ? parseFloat(localOverrides.contingencyPercent) / 100 
      : loanDefaults.contingencyPercent / 100;
    const agentPercent = localOverrides.agentCommissionPercent 
      ? parseFloat(localOverrides.agentCommissionPercent) / 100 
      : loanDefaults.agentCommissionPercent / 100;
    const closingCosts = localOverrides.closingCostsDollar 
      ? parseFloat(localOverrides.closingCostsDollar)
      : purchasePrice * closingPercent;
    const contingency = rehabCost * contingencyPercent;
    const totalInvestment = purchasePrice + closingCosts + rehabCost + contingency + totalHoldingCosts;
    const agentCommission = arv * agentPercent;
    const baseNotaryFee = localOverrides.notaryFees ? parseFloat(localOverrides.notaryFees) : 500;
    const baseTitleFee = localOverrides.titleFees ? parseFloat(localOverrides.titleFees) : 500;
    return arv - totalInvestment - agentCommission - (baseNotaryFee * 2) - baseTitleFee;
  })();
  const baseRentalCashflow = liveFinancials?.monthlyCashflow ?? 0;

  // Check if values have changed from base
  const hasChanges = whatIfPurchasePrice !== purchasePrice || 
                     whatIfArv !== arv || 
                     whatIfRehabCost !== rehabCost || 
                     whatIfRent !== rent ||
                     whatIfInterestRate !== interestRate ||
                     whatIfHoldingMonths !== holdingMonths;

  const resetToBase = () => {
    setWhatIfPurchasePrice(purchasePrice);
    setWhatIfArv(arv);
    setWhatIfRehabCost(rehabCost);
    setWhatIfRent(rent);
    setWhatIfInterestRate(interestRate);
    setWhatIfHoldingMonths(holdingMonths);
  };

  return (
    <Collapsible open={isSensitivityOpen} onOpenChange={setIsSensitivityOpen}>
      <Card className="border border-muted">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-2 md:py-3 px-2 md:px-4">
            <CardTitle className="flex items-center justify-between text-xs md:text-sm gap-1">
              <div className="flex items-center gap-1.5 md:gap-2">
                <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary shrink-0" />
                <span className="whitespace-nowrap">What-If Analysis</span>
                <Badge variant="outline" className="text-[9px] md:text-[10px] px-1 md:px-1.5 hidden sm:inline-flex">Interactive</Badge>
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                <span className="text-[10px] md:text-xs text-muted-foreground hidden sm:inline">Adjust sliders to see impact</span>
                <ChevronDown className={cn(
                  "w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground transition-transform shrink-0",
                  isSensitivityOpen && "rotate-180"
                )} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4 md:space-y-6 px-2 md:px-4">
            {/* Sliders Section */}
            <div className="space-y-4">
              {/* Purchase Price Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <DollarSign className="w-3 h-3 text-muted-foreground" />
                    Purchase Price
                  </Label>
                  <div className="flex items-center gap-1">
                    {whatIfPurchasePrice !== purchasePrice && (
                      <button onClick={() => setWhatIfPurchasePrice(purchasePrice)} className="text-amber-400 hover:text-amber-300 p-0.5" title="Reset to original"><RotateCcw className="w-3 h-3" /></button>
                    )}
                    <input
                      type="number"
                      value={whatIfPurchasePrice}
                      onChange={(e) => setWhatIfPurchasePrice(Number(e.target.value) || 0)}
                      className={cn(
                        "w-28 text-right text-sm font-semibold bg-transparent border border-muted rounded px-1.5 py-0.5 focus:outline-none focus:border-primary",
                        whatIfPurchasePrice !== purchasePrice ? "text-amber-400" : "text-foreground"
                      )}
                    />
                  </div>
                </div>
                <input
                  type="range"
                  min={Math.max(0, purchasePrice * 0.7)}
                  max={purchasePrice * 1.3}
                  step={1000}
                  value={whatIfPurchasePrice}
                  onChange={(e) => setWhatIfPurchasePrice(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>-30%</span>
                  <span className="text-primary">Base: {formatCurrency(purchasePrice)}</span>
                  <span>+30%</span>
                </div>
              </div>

              {/* ARV Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    ARV (After Repair Value)
                  </Label>
                  <div className="flex items-center gap-1">
                    {whatIfArv !== arv && (
                      <button onClick={() => setWhatIfArv(arv)} className="text-amber-400 hover:text-amber-300 p-0.5" title="Reset to original"><RotateCcw className="w-3 h-3" /></button>
                    )}
                    <input
                      type="number"
                      value={whatIfArv}
                      onChange={(e) => setWhatIfArv(Number(e.target.value) || 0)}
                      className={cn(
                        "w-28 text-right text-sm font-semibold bg-transparent border border-muted rounded px-1.5 py-0.5 focus:outline-none focus:border-primary",
                        whatIfArv !== arv ? "text-amber-400" : "text-emerald-400"
                      )}
                    />
                  </div>
                </div>
                <input
                  type="range"
                  min={Math.max(0, arv * 0.7)}
                  max={arv * 1.3}
                  step={5000}
                  value={whatIfArv}
                  onChange={(e) => setWhatIfArv(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>-30%</span>
                  <span className="text-emerald-400">Base: {formatCurrency(arv)}</span>
                  <span>+30%</span>
                </div>
              </div>

              {/* Rehab Cost Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Calculator className="w-3 h-3 text-orange-400" />
                    Rehab Cost
                  </Label>
                  <div className="flex items-center gap-1">
                    {whatIfRehabCost !== rehabCost && (
                      <button onClick={() => setWhatIfRehabCost(rehabCost)} className="text-amber-400 hover:text-amber-300 p-0.5" title="Reset to original"><RotateCcw className="w-3 h-3" /></button>
                    )}
                    <input
                      type="number"
                      value={whatIfRehabCost}
                      onChange={(e) => setWhatIfRehabCost(Number(e.target.value) || 0)}
                      className={cn(
                        "w-28 text-right text-sm font-semibold bg-transparent border border-muted rounded px-1.5 py-0.5 focus:outline-none focus:border-primary",
                        whatIfRehabCost !== rehabCost ? "text-amber-400" : "text-orange-400"
                      )}
                    />
                  </div>
                </div>
                <input
                  type="range"
                  min={Math.max(0, rehabCost * 0.5)}
                  max={rehabCost * 2}
                  step={1000}
                  value={whatIfRehabCost}
                  onChange={(e) => setWhatIfRehabCost(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>-50%</span>
                  <span className="text-orange-400">Base: {formatCurrency(rehabCost)}</span>
                  <span>+100%</span>
                </div>
              </div>

              {/* Rent Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Home className="w-3 h-3 text-cyan-400" />
                    Monthly Rent
                  </Label>
                  <div className="flex items-center gap-1">
                    {whatIfRent !== rent && (
                      <button onClick={() => setWhatIfRent(rent)} className="text-amber-400 hover:text-amber-300 p-0.5" title="Reset to original"><RotateCcw className="w-3 h-3" /></button>
                    )}
                    <input
                      type="number"
                      value={whatIfRent}
                      onChange={(e) => setWhatIfRent(Number(e.target.value) || 0)}
                      className={cn(
                        "w-24 text-right text-sm font-semibold bg-transparent border border-muted rounded px-1.5 py-0.5 focus:outline-none focus:border-primary",
                        whatIfRent !== rent ? "text-amber-400" : "text-cyan-400"
                      )}
                    />
                    <span className="text-xs text-muted-foreground">/mo</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={Math.max(0, rent * 0.7)}
                  max={rent * 1.5}
                  step={50}
                  value={whatIfRent}
                  onChange={(e) => setWhatIfRent(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>-30%</span>
                  <span className="text-cyan-400">Base: {formatCurrency(rent)}/mo</span>
                  <span>+50%</span>
                </div>
              </div>

              {/* Interest Rate Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-purple-400" />
                    Interest Rate
                  </Label>
                  <div className="flex items-center gap-1">
                    {whatIfInterestRate !== interestRate && (
                      <button onClick={() => setWhatIfInterestRate(interestRate)} className="text-amber-400 hover:text-amber-300 p-0.5" title="Reset to original"><RotateCcw className="w-3 h-3" /></button>
                    )}
                    <input
                      type="number"
                      step={0.25}
                      value={whatIfInterestRate}
                      onChange={(e) => setWhatIfInterestRate(Number(e.target.value) || 0)}
                      className={cn(
                        "w-20 text-right text-sm font-semibold bg-transparent border border-muted rounded px-1.5 py-0.5 focus:outline-none focus:border-primary",
                        whatIfInterestRate !== interestRate ? "text-amber-400" : "text-purple-400"
                      )}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={3}
                  max={12}
                  step={0.25}
                  value={whatIfInterestRate}
                  onChange={(e) => setWhatIfInterestRate(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>3%</span>
                  <span className="text-purple-400">Base: {interestRate.toFixed(1)}%</span>
                  <span>12%</span>
                </div>
              </div>

              {/* Holding Period Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-amber-400" />
                    Holding Period (Flip)
                  </Label>
                  <div className="flex items-center gap-1">
                    {whatIfHoldingMonths !== holdingMonths && (
                      <button onClick={() => setWhatIfHoldingMonths(holdingMonths)} className="text-amber-400 hover:text-amber-300 p-0.5" title="Reset to original"><RotateCcw className="w-3 h-3" /></button>
                    )}
                    <input
                      type="number"
                      step={1}
                      min={1}
                      value={whatIfHoldingMonths}
                      onChange={(e) => setWhatIfHoldingMonths(Number(e.target.value) || 1)}
                      className={cn(
                        "w-16 text-right text-sm font-semibold bg-transparent border border-muted rounded px-1.5 py-0.5 focus:outline-none focus:border-primary",
                        whatIfHoldingMonths !== holdingMonths ? "text-amber-400" : "text-foreground"
                      )}
                    />
                    <span className="text-xs text-muted-foreground">mo</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={2}
                  max={18}
                  step={1}
                  value={whatIfHoldingMonths}
                  onChange={(e) => setWhatIfHoldingMonths(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>2 mo</span>
                  <span className="text-amber-400">Base: {holdingMonths} mo</span>
                  <span>18 mo</span>
                </div>
              </div>
            </div>

            {/* Reset Button */}
            {hasChanges && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetToBase}
                className="w-full text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-2" />
                Reset to Base Case
              </Button>
            )}

            {/* Results Display */}
            <div className="grid grid-cols-2 gap-4">
              {/* Flip Results */}
              <div className="p-4 rounded-lg border border-orange-500/30 bg-orange-500/5 space-y-3">
                <h4 className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5" />
                  Flip Result
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Net Profit</span>
                    <div className="text-right">
                      <span className={cn(
                        "font-bold",
                        flipResults.netProfit >= 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {formatCurrency(flipResults.netProfit)}
                      </span>
                      {hasChanges && (
                        <p className={cn(
                          "text-[10px]",
                          flipResults.netProfit - baseFlipProfit > 0 ? "text-emerald-400" : flipResults.netProfit - baseFlipProfit < 0 ? "text-red-400" : "text-muted-foreground"
                        )}>
                          {flipResults.netProfit - baseFlipProfit > 0 ? '+' : ''}{formatCurrency(flipResults.netProfit - baseFlipProfit)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">ROI</span>
                    <span className={cn(
                      "font-bold text-sm",
                      flipResults.roi >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {flipResults.roi.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Rental Results */}
              <div className="p-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5 space-y-3">
                <h4 className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
                  <Home className="w-3.5 h-3.5" />
                  Rental Result
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Cashflow/mo</span>
                    <div className="text-right">
                      <span className={cn(
                        "font-bold",
                        rentalResults.monthlyCashflow >= 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {formatCurrency(rentalResults.monthlyCashflow)}
                      </span>
                      {hasChanges && (
                        <p className={cn(
                          "text-[10px]",
                          rentalResults.monthlyCashflow - baseRentalCashflow > 0 ? "text-emerald-400" : rentalResults.monthlyCashflow - baseRentalCashflow < 0 ? "text-red-400" : "text-muted-foreground"
                        )}>
                          {rentalResults.monthlyCashflow - baseRentalCashflow > 0 ? '+' : ''}{formatCurrency(rentalResults.monthlyCashflow - baseRentalCashflow)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Cash-on-Cash</span>
                    <span className={cn(
                      "font-bold text-sm",
                      rentalResults.cashOnCash >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {rentalResults.cashOnCash.toFixed(1)}%
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
