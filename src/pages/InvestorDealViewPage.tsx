import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { useSettings } from '@/context/SettingsContext';
import { useDealInvestors } from '@/hooks/useDealInvestors';
import { formatCurrency, formatPercent, calculateFinancials } from '@/utils/financialCalculations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  TrendingUp,
  Home,
  RefreshCw,
  DollarSign,
  Percent,
  MapPin,
  Building2,
  Calendar,
  Save,
  Loader2,
  MessageSquare,
  Star,
  Banknote,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { InvestorWhatIf } from '@/components/investors/InvestorWhatIf';
import { InvestorMoreInfo } from '@/components/investors/InvestorMoreInfo';

const STRATEGY_CONFIG = {
  flip: { label: 'Flip', icon: TrendingUp, color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30' },
  rental: { label: 'Rental', icon: Home, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30' },
  brrrr: { label: 'BRRRR', icon: RefreshCw, color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' },
};

export default function InvestorDealViewPage() {
  const { id } = useParams();
  const { getDeal, isLoading } = useDeals();
  const { settings } = useSettings();
  const loanDefaults = settings.loanDefaults;
  
  const deal = getDeal(id || '');
  const { dealInvestors, updateInvestorNotes } = useDealInvestors(id);
  
  // Find the current user's investor record for this deal
  // In a real app, we'd match against auth.uid(), but for now we take the first one
  const myDealInvestor = dealInvestors[0];
  
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');
  const [investorNote, setInvestorNote] = useState(myDealInvestor?.investor_notes || '');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Calculate financials
  const apiData = deal?.apiData;
  const overrides = deal?.overrides;
  const financials = useMemo(() => {
    if (!apiData || !overrides || Object.keys(apiData).length === 0) return null;
    return calculateFinancials(apiData, overrides, loanDefaults);
  }, [apiData, overrides, loanDefaults]);

  // Get visible strategies and profit settings for this investor
  const visibleStrategies = myDealInvestor?.visible_strategies || ['flip', 'rental', 'brrrr'];
  const profitSplitPercent = myDealInvestor?.profit_split_percent ?? 50;
  const preferredReturnPercent = (myDealInvestor as any)?.preferred_return_percent ?? 15;

  // Calculate strategy-specific metrics
  const strategyMetrics = useMemo(() => {
    if (!financials || !apiData || !overrides) return null;

    const purchasePrice = overrides.purchasePrice ?? apiData.purchasePrice ?? 0;
    const arv = financials.arv;
    const rehabCost = financials.rehabCost;
    const holdingMonths = overrides.holdingMonths ?? loanDefaults?.holdingMonths ?? 6;

    // Holding costs
    const propertyTaxMonthly = (apiData.propertyTax ?? 0) / 12;
    const insuranceMonthly = (apiData.insurance ?? 0) / 12;
    const utilitiesMonthly = 300;
    const monthlyHolding = propertyTaxMonthly + insuranceMonthly + utilitiesMonthly;
    const totalHoldingCosts = monthlyHolding * holdingMonths;

    // Flip calculations
    const closingPercent = (loanDefaults?.closingCostsPercent ?? 2) / 100;
    const contingencyPercent = (loanDefaults?.contingencyPercent ?? 12) / 100;
    const agentPercent = (loanDefaults?.agentCommissionPercent ?? 5) / 100;
    
    const closingCosts = purchasePrice * closingPercent;
    const contingency = rehabCost * contingencyPercent;
    const agentCommission = arv * agentPercent;
    const sellingCosts = agentCommission + 500 * 2 + 500; // Agent + notary (2 signings) + title
    
    // Cash deal
    const cashTotalInvestment = purchasePrice + closingCosts + rehabCost + contingency + totalHoldingCosts;
    const cashNetProfit = arv - cashTotalInvestment - sellingCosts;
    const cashRoi = cashTotalInvestment > 0 ? (cashNetProfit / cashTotalInvestment) * 100 : 0;

    // HML financing
    const hmlLtvPurchase = (loanDefaults?.hmlLtvPurchasePercent ?? 90) / 100;
    const hmlLtvRehab = (loanDefaults?.hmlLtvRehabPercent ?? 100) / 100;
    const hmlPointsPercent = (loanDefaults?.hmlPointsPercent ?? 2) / 100;
    const hmlInterestRate = (loanDefaults?.hmlInterestRate ?? 12) / 100;
    const hmlProcessingFee = loanDefaults?.hmlProcessingFee ?? 1000;

    const hmlLoanPurchase = purchasePrice * hmlLtvPurchase;
    const hmlLoanRehab = rehabCost * hmlLtvRehab;
    const hmlTotalLoan = hmlLoanPurchase + hmlLoanRehab;
    const hmlPoints = hmlTotalLoan * hmlPointsPercent;
    const hmlMonthlyInterest = hmlTotalLoan * (hmlInterestRate / 12);
    const hmlTotalInterest = hmlMonthlyInterest * holdingMonths;
    
    const hmlDownPayment = (purchasePrice - hmlLoanPurchase) + (rehabCost - hmlLoanRehab);
    const hmlCashRequired = hmlDownPayment + closingCosts + hmlPoints + hmlProcessingFee + contingency + totalHoldingCosts + hmlTotalInterest;
    const hmlTotalCost = cashTotalInvestment + hmlPoints + hmlProcessingFee + hmlTotalInterest;
    const hmlNetProfit = arv - hmlTotalCost - sellingCosts;
    const hmlRoi = hmlCashRequired > 0 ? (hmlNetProfit / hmlCashRequired) * 100 : 0;

    return {
      flip: {
        cash: { investment: cashTotalInvestment, profit: cashNetProfit, roi: cashRoi },
        financed: { cashRequired: hmlCashRequired, profit: hmlNetProfit, roi: hmlRoi },
      },
      rental: {
        monthlyNOI: financials.monthlyNOI,
        monthlyCashflow: financials.monthlyCashflow,
        capRate: financials.capRate * 100,
        cashOnCash: financials.cashOnCashReturn * 100,
        cashRequired: financials.totalCashRequired,
      },
      brrrr: {
        // Simplified BRRRR calc
        refiLtv: 0.75,
        refiLoan: arv * 0.75,
        cashLeftInDeal: Math.max(0, cashTotalInvestment - (arv * 0.75)),
        monthlyCashflow: financials.monthlyCashflow,
        equity: arv - (arv * 0.75),
      },
    };
  }, [financials, apiData, overrides, loanDefaults]);

  // Determine best strategy
  const bestStrategy = useMemo(() => {
    if (!strategyMetrics) return null;
    
    let best = { strategy: 'flip', score: 0 };
    
    if (visibleStrategies.includes('flip') && strategyMetrics.flip.financed.roi > 15) {
      best = { strategy: 'flip', score: Math.min(10, strategyMetrics.flip.financed.roi / 3) };
    }
    if (visibleStrategies.includes('rental') && strategyMetrics.rental.capRate > 8) {
      const rentalScore = Math.min(10, strategyMetrics.rental.capRate);
      if (rentalScore > best.score) best = { strategy: 'rental', score: rentalScore };
    }
    if (visibleStrategies.includes('brrrr') && strategyMetrics.brrrr.cashLeftInDeal < 20000 && strategyMetrics.brrrr.monthlyCashflow > 0) {
      const brrrrScore = 8;
      if (brrrrScore > best.score) best = { strategy: 'brrrr', score: brrrrScore };
    }
    
    return best.score >= 7 ? best : null;
  }, [strategyMetrics, visibleStrategies]);

  // Set initial selected strategy
  useState(() => {
    if (bestStrategy && !selectedStrategy) {
      setSelectedStrategy(bestStrategy.strategy);
    } else if (visibleStrategies.length > 0 && !selectedStrategy) {
      setSelectedStrategy(visibleStrategies[0]);
    }
  });

  const handleSaveNote = async () => {
    if (!myDealInvestor) return;
    setIsSavingNote(true);
    try {
      await updateInvestorNotes(myDealInvestor.id, investorNote);
      toast.success('Note saved');
    } catch (err) {
      toast.error('Failed to save note');
    } finally {
      setIsSavingNote(false);
    }
  };

  /**
   * Waterfall profit distribution:
   * 1. Investor gets Preferred Return (e.g., 15%) on their investment first
   * 2. Admin catches up to the same percentage
   * 3. Remaining profit splits according to profit_split_percent (e.g., 50/50)
   */
  const calculateWaterfallDistribution = (totalProfit: number, investorInvestment: number) => {
    const prefReturnAmount = investorInvestment * (preferredReturnPercent / 100);
    
    if (totalProfit <= 0) {
      // Loss scenario - split losses according to profit split
      return {
        investorShare: totalProfit * (profitSplitPercent / 100),
        adminShare: totalProfit * ((100 - profitSplitPercent) / 100),
        prefReturn: 0,
        catchUp: 0,
        surplus: 0,
      };
    }

    // Step 1: Preferred return to investor
    const investorPref = Math.min(totalProfit, prefReturnAmount);
    let remaining = totalProfit - investorPref;

    // Step 2: Admin catch-up (same amount as investor pref)
    const adminCatchUp = Math.min(remaining, investorPref);
    remaining = remaining - adminCatchUp;

    // Step 3: Split remaining surplus
    const investorSurplus = remaining * (profitSplitPercent / 100);
    const adminSurplus = remaining * ((100 - profitSplitPercent) / 100);

    return {
      investorShare: investorPref + investorSurplus,
      adminShare: adminCatchUp + adminSurplus,
      prefReturn: investorPref,
      catchUp: adminCatchUp,
      surplus: remaining,
    };
  };

  // Legacy simple calculation for display
  const calculateInvestorShare = (totalProfit: number, investorInvestment: number = 0) => {
    if (investorInvestment > 0) {
      return calculateWaterfallDistribution(totalProfit, investorInvestment).investorShare;
    }
    // Fallback to simple split if no investment info
    return totalProfit * (profitSplitPercent / 100);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-2xl font-bold mb-2">Deal Not Found</h2>
        <p className="text-muted-foreground">You don't have access to this deal.</p>
      </div>
    );
  }

  const strategyConfig = selectedStrategy ? STRATEGY_CONFIG[selectedStrategy as keyof typeof STRATEGY_CONFIG] : null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        {apiData.imgSrc && (
          <img 
            src={apiData.imgSrc} 
            alt="Property" 
            className="w-24 h-24 rounded-lg object-cover shrink-0"
          />
        )}
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold">{deal.address.street}</h1>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1">
            <MapPin className="w-4 h-4" />
            <span>{deal.address.city}, {deal.address.state}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {apiData.bedrooms && (
              <Badge variant="outline">{apiData.bedrooms} bd</Badge>
            )}
            {apiData.bathrooms && (
              <Badge variant="outline">{apiData.bathrooms} ba</Badge>
            )}
            {apiData.sqft && (
              <Badge variant="outline">{apiData.sqft.toLocaleString()} sqft</Badge>
            )}
            {apiData.yearBuilt && (
              <Badge variant="outline">Built {apiData.yearBuilt}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Best Strategy Highlight */}
      {bestStrategy && (
        <Card className={cn("border-2", STRATEGY_CONFIG[bestStrategy.strategy as keyof typeof STRATEGY_CONFIG].borderColor)}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", STRATEGY_CONFIG[bestStrategy.strategy as keyof typeof STRATEGY_CONFIG].bgColor)}>
                <Star className={cn("w-5 h-5", STRATEGY_CONFIG[bestStrategy.strategy as keyof typeof STRATEGY_CONFIG].color)} />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Recommended Strategy</div>
                <div className="text-lg font-bold">
                  {STRATEGY_CONFIG[bestStrategy.strategy as keyof typeof STRATEGY_CONFIG].label}
                  <Badge className="ml-2" variant="secondary">{bestStrategy.score.toFixed(1)}/10</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strategy Tabs */}
      <Tabs value={selectedStrategy || visibleStrategies[0]} onValueChange={setSelectedStrategy}>
        <TabsList className="w-full justify-start">
          {visibleStrategies.map(strategy => {
            const config = STRATEGY_CONFIG[strategy as keyof typeof STRATEGY_CONFIG];
            return (
              <TabsTrigger key={strategy} value={strategy} className="flex items-center gap-2">
                <config.icon className={cn("w-4 h-4", config.color)} />
                {config.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Flip Tab */}
        <TabsContent value="flip" className="space-y-4 mt-4">
          {strategyMetrics && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Cash Deal */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-400" />
                    Cash Deal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Total Investment</span>
                    <span className="font-medium">{formatCurrency(strategyMetrics.flip.cash.investment)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Net Profit</span>
                    <span className={cn("font-bold", strategyMetrics.flip.cash.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {formatCurrency(strategyMetrics.flip.cash.profit)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">ROI</span>
                    <span className="font-medium">{strategyMetrics.flip.cash.roi.toFixed(1)}%</span>
                  </div>
                  <Separator />
                  <div className="bg-primary/10 -mx-4 px-4 py-2 rounded-b-lg space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400" />
                        Your Share (Pref {preferredReturnPercent}% + Split {profitSplitPercent}%)
                      </span>
                      <span className={cn("font-bold text-lg", calculateInvestorShare(strategyMetrics.flip.cash.profit, strategyMetrics.flip.cash.investment) >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {formatCurrency(calculateInvestorShare(strategyMetrics.flip.cash.profit, strategyMetrics.flip.cash.investment))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Financed Deal */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    With HML Financing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Cash Required</span>
                    <span className="font-medium">{formatCurrency(strategyMetrics.flip.financed.cashRequired)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Net Profit</span>
                    <span className={cn("font-bold", strategyMetrics.flip.financed.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {formatCurrency(strategyMetrics.flip.financed.profit)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">ROI (Cash)</span>
                    <span className="font-medium">{strategyMetrics.flip.financed.roi.toFixed(1)}%</span>
                  </div>
                  <Separator />
                  <div className="bg-primary/10 -mx-4 px-4 py-2 rounded-b-lg space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400" />
                        Your Share (Pref {preferredReturnPercent}% + Split {profitSplitPercent}%)
                      </span>
                      <span className={cn("font-bold text-lg", calculateInvestorShare(strategyMetrics.flip.financed.profit, strategyMetrics.flip.financed.cashRequired) >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {formatCurrency(calculateInvestorShare(strategyMetrics.flip.financed.profit, strategyMetrics.flip.financed.cashRequired))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Rental Tab */}
        <TabsContent value="rental" className="space-y-4 mt-4">
          {strategyMetrics && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Home className="w-4 h-4 text-cyan-400" />
                  Long-Term Rental Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-muted-foreground text-sm">Monthly Cashflow</div>
                    <div className={cn("text-xl font-bold", strategyMetrics.rental.monthlyCashflow >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {formatCurrency(strategyMetrics.rental.monthlyCashflow)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Cap Rate</div>
                    <div className="text-xl font-bold">{strategyMetrics.rental.capRate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Cash on Cash</div>
                    <div className="text-xl font-bold">{strategyMetrics.rental.cashOnCash.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Cash Required</div>
                    <div className="text-xl font-bold">{formatCurrency(strategyMetrics.rental.cashRequired)}</div>
                  </div>
                </div>
                <Separator />
                <div className="bg-primary/10 -mx-4 px-4 py-3 rounded-b-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Percent className="w-3 h-3" />
                      Your Monthly Share ({profitSplitPercent}%)
                    </span>
                    <span className={cn("font-bold text-lg", calculateInvestorShare(strategyMetrics.rental.monthlyCashflow) >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {formatCurrency(calculateInvestorShare(strategyMetrics.rental.monthlyCashflow))}/mo
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Rental cashflow splits {profitSplitPercent}/{100 - profitSplitPercent} monthly
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* BRRRR Tab */}
        <TabsContent value="brrrr" className="space-y-4 mt-4">
          {strategyMetrics && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-purple-400" />
                  BRRRR Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-muted-foreground text-sm">Cash Left in Deal</div>
                    <div className={cn("text-xl font-bold", strategyMetrics.brrrr.cashLeftInDeal < 20000 ? "text-emerald-400" : "text-amber-400")}>
                      {formatCurrency(strategyMetrics.brrrr.cashLeftInDeal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Monthly Cashflow</div>
                    <div className={cn("text-xl font-bold", strategyMetrics.brrrr.monthlyCashflow >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {formatCurrency(strategyMetrics.brrrr.monthlyCashflow)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Equity Created</div>
                    <div className="text-xl font-bold text-emerald-400">
                      {formatCurrency(strategyMetrics.brrrr.equity)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Refi Loan (75% ARV)</div>
                    <div className="text-xl font-bold">{formatCurrency(strategyMetrics.brrrr.refiLoan)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* What-If Analysis - Simplified for investors */}
      {strategyMetrics && (
        <InvestorWhatIf
          purchasePrice={overrides?.purchasePrice ?? apiData?.purchasePrice ?? 0}
          arv={financials?.arv ?? 0}
          rehabCost={financials?.rehabCost ?? 0}
          rent={financials?.monthlyGrossRent ?? 0}
          visibleStrategies={visibleStrategies}
          baseFlipProfit={strategyMetrics.flip.cash.profit}
          baseRentalCashflow={strategyMetrics.rental.monthlyCashflow}
          profitSplitPercent={profitSplitPercent}
          preferredReturnPercent={preferredReturnPercent}
        />
      )}

      {/* Investor Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Your Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={investorNote}
            onChange={(e) => setInvestorNote(e.target.value)}
            placeholder="Add your notes about this deal..."
            rows={3}
          />
          <Button 
            onClick={handleSaveNote} 
            disabled={isSavingNote}
            size="sm"
          >
            {isSavingNote ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Note
          </Button>
        </CardContent>
      </Card>

      {/* More Info Section */}
      <InvestorMoreInfo
        apiData={apiData}
        address={deal.address}
        purchasePrice={overrides?.purchasePrice ?? apiData?.purchasePrice ?? 0}
        arv={financials?.arv ?? 0}
        rehabCost={financials?.rehabCost ?? 0}
        rent={financials?.monthlyGrossRent ?? 0}
        lotSizeSqftOverride={overrides?.lotSizeSqft ?? null}
      />
    </div>
  );
}
