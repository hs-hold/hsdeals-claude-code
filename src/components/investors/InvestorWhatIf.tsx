import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Lightbulb, 
  DollarSign, 
  TrendingUp, 
  Calculator, 
  Home, 
  ChevronDown,
  RotateCcw,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/financialCalculations';

interface InvestorWhatIfProps {
  purchasePrice: number;
  arv: number;
  rehabCost: number;
  rent: number;
  visibleStrategies: string[];
  // Simplified calculations - investor doesn't need all the detail
  baseFlipProfit: number;
  baseRentalCashflow: number;
  profitSplitPercent: number;
  preferredReturnPercent: number;
  onCalculate?: (whatIf: {
    purchasePrice: number;
    arv: number;
    rehabCost: number;
    rent: number;
  }) => { flipProfit: number; rentalCashflow: number };
}

export function InvestorWhatIf({
  purchasePrice,
  arv,
  rehabCost,
  rent,
  visibleStrategies,
  baseFlipProfit,
  baseRentalCashflow,
  profitSplitPercent,
  preferredReturnPercent,
}: InvestorWhatIfProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [whatIfPurchasePrice, setWhatIfPurchasePrice] = useState(purchasePrice);
  const [whatIfArv, setWhatIfArv] = useState(arv);
  const [whatIfRehabCost, setWhatIfRehabCost] = useState(rehabCost);
  const [whatIfRent, setWhatIfRent] = useState(rent);

  // Simplified calculations for investor
  const results = useMemo(() => {
    // Simplified flip profit calculation
    const totalInvestment = whatIfPurchasePrice + whatIfRehabCost * 1.12; // 12% contingency
    const sellingCosts = whatIfArv * 0.06; // ~6% selling costs
    const flipProfit = whatIfArv - totalInvestment - sellingCosts;

    // Simplified rental cashflow
    const monthlyExpenses = (whatIfPurchasePrice * 0.015 / 12) + // ~1.5% property tax/yr
                           (whatIfPurchasePrice * 0.005 / 12) + // ~0.5% insurance/yr
                           (whatIfRent * 0.08) + // 8% prop mgmt
                           (whatIfRent * 0.10); // 10% maintenance/vacancy
    const mortgagePayment = (whatIfPurchasePrice * 0.8) * 0.007; // Rough estimate: 80% LTV, ~8.4% rate
    const rentalCashflow = whatIfRent - monthlyExpenses - mortgagePayment;

    return { flipProfit, rentalCashflow };
  }, [whatIfPurchasePrice, whatIfArv, whatIfRehabCost, whatIfRent]);

  // Calculate investor's share using waterfall
  const calculateInvestorShare = (totalProfit: number, investment: number) => {
    const prefReturn = investment * (preferredReturnPercent / 100);
    if (totalProfit <= 0) return totalProfit * (profitSplitPercent / 100);
    
    const investorPref = Math.min(totalProfit, prefReturn);
    let remaining = totalProfit - investorPref;
    const adminCatchUp = Math.min(remaining, investorPref);
    remaining -= adminCatchUp;
    const investorSurplus = remaining * (profitSplitPercent / 100);
    
    return investorPref + investorSurplus;
  };

  const hasChanges = whatIfPurchasePrice !== purchasePrice || 
                     whatIfArv !== arv || 
                     whatIfRehabCost !== rehabCost || 
                     whatIfRent !== rent;

  const resetToBase = () => {
    setWhatIfPurchasePrice(purchasePrice);
    setWhatIfArv(arv);
    setWhatIfRehabCost(rehabCost);
    setWhatIfRent(rent);
  };

  const flipDiff = results.flipProfit - baseFlipProfit;
  const rentalDiff = results.rentalCashflow - baseRentalCashflow;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-primary/10 transition-colors py-3 px-4">
            <CardTitle className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span>Explore Scenarios</span>
                <Badge variant="outline" className="text-[10px] px-1.5 border-amber-400/30 text-amber-400">
                  Interactive
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  What if the numbers were different?
                </span>
                <ChevronDown className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform",
                  isOpen && "rotate-180"
                )} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-5 px-4 pb-5">
            <p className="text-sm text-muted-foreground">
              Adjust the sliders to see how different scenarios affect your potential returns.
            </p>

            {/* Sliders - Simplified set */}
            <div className="space-y-5">
              {/* Purchase Price */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    Purchase Price
                  </label>
                  <span className={cn(
                    "text-sm font-semibold tabular-nums",
                    whatIfPurchasePrice !== purchasePrice ? "text-amber-400" : ""
                  )}>
                    {formatCurrency(whatIfPurchasePrice)}
                  </span>
                </div>
                <input
                  type="range"
                  min={Math.max(10000, purchasePrice * 0.7)}
                  max={purchasePrice * 1.3}
                  step={5000}
                  value={whatIfPurchasePrice}
                  onChange={(e) => setWhatIfPurchasePrice(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Lower price</span>
                  <span className="text-primary">Current: {formatCurrency(purchasePrice)}</span>
                  <span>Higher price</span>
                </div>
              </div>

              {/* ARV */}
              {visibleStrategies.includes('flip') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      Sale Price (ARV)
                    </label>
                    <span className={cn(
                      "text-sm font-semibold tabular-nums",
                      whatIfArv !== arv ? "text-amber-400" : "text-emerald-400"
                    )}>
                      {formatCurrency(whatIfArv)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={Math.max(10000, arv * 0.7)}
                    max={arv * 1.3}
                    step={5000}
                    value={whatIfArv}
                    onChange={(e) => setWhatIfArv(Number(e.target.value))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Lower sale</span>
                    <span className="text-emerald-400">Current: {formatCurrency(arv)}</span>
                    <span>Higher sale</span>
                  </div>
                </div>
              )}

              {/* Rehab Cost */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-orange-400" />
                    Rehab Cost
                  </label>
                  <span className={cn(
                    "text-sm font-semibold tabular-nums",
                    whatIfRehabCost !== rehabCost ? "text-amber-400" : "text-orange-400"
                  )}>
                    {formatCurrency(whatIfRehabCost)}
                  </span>
                </div>
                <input
                  type="range"
                  min={Math.max(0, rehabCost * 0.5)}
                  max={rehabCost * 2}
                  step={2500}
                  value={whatIfRehabCost}
                  onChange={(e) => setWhatIfRehabCost(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Lower rehab</span>
                  <span className="text-orange-400">Current: {formatCurrency(rehabCost)}</span>
                  <span>Higher rehab</span>
                </div>
              </div>

              {/* Rent - only show if rental strategy is visible */}
              {visibleStrategies.includes('rental') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm flex items-center gap-2">
                      <Home className="w-4 h-4 text-cyan-400" />
                      Monthly Rent
                    </label>
                    <span className={cn(
                      "text-sm font-semibold tabular-nums",
                      whatIfRent !== rent ? "text-amber-400" : "text-cyan-400"
                    )}>
                      {formatCurrency(whatIfRent)}/mo
                    </span>
                  </div>
                  <input
                    type="range"
                    min={Math.max(500, rent * 0.7)}
                    max={rent * 1.4}
                    step={50}
                    value={whatIfRent}
                    onChange={(e) => setWhatIfRent(Number(e.target.value))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Lower rent</span>
                    <span className="text-cyan-400">Current: {formatCurrency(rent)}/mo</span>
                    <span>Higher rent</span>
                  </div>
                </div>
              )}
            </div>

            {/* Reset button */}
            {hasChanges && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetToBase}
                className="w-full"
              >
                <RotateCcw className="w-3 h-3 mr-2" />
                Reset to Current Deal
              </Button>
            )}

            <Separator />

            {/* Results - Simplified display */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                Estimated Impact on Your Returns
              </h4>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Flip Impact */}
                {visibleStrategies.includes('flip') && (
                  <Card className="bg-card">
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground mb-1">Flip Profit</div>
                      <div className="flex items-baseline gap-2">
                        <span className={cn(
                          "text-lg font-bold",
                          results.flipProfit >= 0 ? "text-emerald-400" : "text-red-400"
                        )}>
                          {formatCurrency(results.flipProfit)}
                        </span>
                        {hasChanges && flipDiff !== 0 && (
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[10px]",
                              flipDiff >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"
                            )}
                          >
                            {flipDiff >= 0 ? <ArrowUp className="w-2 h-2 mr-0.5" /> : <ArrowDown className="w-2 h-2 mr-0.5" />}
                            {formatCurrency(Math.abs(flipDiff))}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Your share: ~{formatCurrency(calculateInvestorShare(results.flipProfit, whatIfPurchasePrice + whatIfRehabCost))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Rental Impact */}
                {visibleStrategies.includes('rental') && (
                  <Card className="bg-card">
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground mb-1">Monthly Cashflow</div>
                      <div className="flex items-baseline gap-2">
                        <span className={cn(
                          "text-lg font-bold",
                          results.rentalCashflow >= 0 ? "text-emerald-400" : "text-red-400"
                        )}>
                          {formatCurrency(results.rentalCashflow)}/mo
                        </span>
                        {hasChanges && rentalDiff !== 0 && (
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[10px]",
                              rentalDiff >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"
                            )}
                          >
                            {rentalDiff >= 0 ? <ArrowUp className="w-2 h-2 mr-0.5" /> : <ArrowDown className="w-2 h-2 mr-0.5" />}
                            {formatCurrency(Math.abs(rentalDiff))}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Your share: ~{formatCurrency(results.rentalCashflow * (profitSplitPercent / 100))}/mo
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground text-center">
                These are simplified estimates. Actual results may vary based on deal specifics.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
