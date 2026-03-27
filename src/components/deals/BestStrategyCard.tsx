import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  Home, 
  Calculator,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/financialCalculations';
import { DealApiData, DealFinancials } from '@/types/deal';

interface BestStrategyCardProps {
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
    refiLtvPercent: number;
    interestRate: number;
  };
}

interface Strategy {
  id: 'flip' | 'rental' | 'brrrr';
  name: string;
  icon: React.ReactNode;
  color: string;
  primaryMetric: number;
  primaryLabel: string;
  primaryFormat: string;
  secondaryMetric: number;
  secondaryLabel: string;
  secondaryFormat: string;
  tertiaryLabel: string;
  score: number;
  isProfitable: boolean;
  netProfitWarning?: boolean;
  netProfitSuccess?: boolean;
  scoreBreakdown?: {
    moneyInDeal: { score: number; value: number };
    cashflow: { score: number; value: number };
    equity: { score: number; value: number };
    isMarginal: boolean;
    isDisqualified: boolean;
  };
}

export function BestStrategyCard({
  purchasePrice,
  arv,
  rehabCost,
  rent,
  liveFinancials,
  apiData,
  localOverrides,
  loanDefaults,
}: BestStrategyCardProps) {
  const strategyData = useMemo(() => {
    if (!liveFinancials || !apiData) return null;

    // Holding costs calculation
    const propertyTaxMonthly = localOverrides.propertyTaxMonthly 
      ? parseFloat(localOverrides.propertyTaxMonthly) 
      : (apiData?.propertyTax ?? 0) / 12;
    const insuranceMonthly = localOverrides.insuranceMonthly 
      ? parseFloat(localOverrides.insuranceMonthly) 
      : (apiData?.insurance ?? 0) / 12;
    const stateTaxMonthly = localOverrides.stateTaxMonthly ? parseFloat(localOverrides.stateTaxMonthly) : 0;
    const hoaMonthly = localOverrides.hoaMonthly ? parseFloat(localOverrides.hoaMonthly) : 0;
    const utilitiesMonthly = localOverrides.utilitiesMonthly ? parseFloat(localOverrides.utilitiesMonthly) : 300;
    const monthlyHoldingCost = propertyTaxMonthly + insuranceMonthly + stateTaxMonthly + hoaMonthly + utilitiesMonthly;
    const flipRehabMonths = localOverrides.holdingMonths 
      ? parseInt(localOverrides.holdingMonths) 
      : loanDefaults.holdingMonths;
    const totalHoldingCosts = monthlyHoldingCost * flipRehabMonths;

    // FLIP metrics (Cash deal)
    const flipClosingPercent = localOverrides.closingCostsPercent
      ? parseFloat(localOverrides.closingCostsPercent) / 100 
      : loanDefaults.closingCostsPercent / 100;
    const flipContingencyPercent = localOverrides.contingencyPercent 
      ? parseFloat(localOverrides.contingencyPercent) / 100 
      : loanDefaults.contingencyPercent / 100;
    const flipAgentPercent = localOverrides.agentCommissionPercent 
      ? parseFloat(localOverrides.agentCommissionPercent) / 100 
      : loanDefaults.agentCommissionPercent / 100;
    const flipClosingCostsBuy = localOverrides.closingCostsDollar 
      ? parseFloat(localOverrides.closingCostsDollar)
      : purchasePrice * flipClosingPercent;
    const flipRehabContingency = rehabCost * flipContingencyPercent;
    const flipTotalInvestment = purchasePrice + flipClosingCostsBuy + rehabCost + flipRehabContingency + totalHoldingCosts;
    const flipAgentCommission = arv * flipAgentPercent;
    const flipNetProfit = arv - flipTotalInvestment - flipAgentCommission - 1000;
    const flipRoi = flipTotalInvestment > 0 ? (flipNetProfit / flipTotalInvestment) * 100 : 0;

    // RENTAL metrics
    const rentalMonthlyCashflow = liveFinancials?.monthlyCashflow ?? 0;
    const rentalCashOnCash = (liveFinancials?.cashOnCashReturn ?? 0) * 100;
    const rentalTotalBasis = purchasePrice + rehabCost;
    const rentalAnnualNoi = liveFinancials?.yearlyNOI ?? 0;
    const rentalCapRate = rentalTotalBasis > 0 ? (rentalAnnualNoi / rentalTotalBasis) * 100 : 0;

    // BRRRR metrics
    const brrrrHmlLtvPurchase = localOverrides.hmlLtvPurchasePercent 
      ? parseFloat(localOverrides.hmlLtvPurchasePercent) / 100 
      : loanDefaults.hmlLtvPurchasePercent / 100;
    const brrrrHmlLtvRehab = localOverrides.hmlLtvRehabPercent 
      ? parseFloat(localOverrides.hmlLtvRehabPercent) / 100 
      : loanDefaults.hmlLtvRehabPercent / 100;
    const brrrrHmlPointsPercent = localOverrides.hmlPointsPercent 
      ? parseFloat(localOverrides.hmlPointsPercent) / 100 
      : loanDefaults.hmlPointsPercent / 100;
    const brrrrHmlInterestRate = localOverrides.hmlInterestRate 
      ? parseFloat(localOverrides.hmlInterestRate) / 100 
      : loanDefaults.hmlInterestRate / 100;
    const brrrrHmlProcessingFee = localOverrides.hmlProcessingFee 
      ? parseFloat(localOverrides.hmlProcessingFee) 
      : loanDefaults.hmlProcessingFee;
    const brrrrRefiLtv = localOverrides.refiLtvPercent 
      ? parseFloat(localOverrides.refiLtvPercent) / 100 
      : loanDefaults.refiLtvPercent / 100;

    const brrrrHmlLoanPurchase = purchasePrice * brrrrHmlLtvPurchase;
    const brrrrHmlLoanRehab = rehabCost * brrrrHmlLtvRehab;
    const brrrrHmlTotalLoan = brrrrHmlLoanPurchase + brrrrHmlLoanRehab;
    const brrrrHmlPoints = brrrrHmlTotalLoan * brrrrHmlPointsPercent;
    const brrrrHmlInterest = brrrrHmlTotalLoan * (brrrrHmlInterestRate / 12) * flipRehabMonths;
    const brrrrTotalCashIn = (purchasePrice - brrrrHmlLoanPurchase) + (rehabCost - brrrrHmlLoanRehab) + flipClosingCostsBuy + brrrrHmlPoints + brrrrHmlProcessingFee + brrrrHmlInterest + totalHoldingCosts;

    const brrrrRefiLoanAmount = arv * brrrrRefiLtv;
    const brrrrCashOut = brrrrRefiLoanAmount - brrrrHmlTotalLoan - (brrrrRefiLoanAmount * 0.02);
    const brrrrCashLeftInDeal = brrrrTotalCashIn - Math.max(0, brrrrCashOut);

    const brrrrMonthlyMortgage = brrrrRefiLoanAmount > 0 
      ? brrrrRefiLoanAmount * ((loanDefaults.interestRate / 100 / 12) * Math.pow(1 + (loanDefaults.interestRate / 100 / 12), 360)) / (Math.pow(1 + (loanDefaults.interestRate / 100 / 12), 360) - 1)
      : 0;
    const brrrrNoi = rent - (liveFinancials?.monthlyExpenses ?? 0);
    const brrrrMonthlyCashflow = brrrrNoi - brrrrMonthlyMortgage;
    const brrrrCocReturn = brrrrCashLeftInDeal > 0 ? ((brrrrMonthlyCashflow * 12) / brrrrCashLeftInDeal) * 100 : (brrrrMonthlyCashflow > 0 ? 999 : 0);

    // Calculate BRRRR scores for 3 parameters
    // First check: if actual money in deal > $50K, disqualify immediately (score 0)
    const isDisqualified = brrrrCashLeftInDeal > 50000;
    
    let moneyScore = 0;
    if (isDisqualified) {
      moneyScore = 0;
    } else {
      // If cashflow is not positive, penalize to $30K effective (score 7)
      const effectiveMoneyInDeal = brrrrMonthlyCashflow <= 0 ? 30000 : brrrrCashLeftInDeal;
      
      if (effectiveMoneyInDeal <= 0) moneyScore = 10;
      else if (effectiveMoneyInDeal <= 10000) moneyScore = 9;
      else if (effectiveMoneyInDeal <= 20000) moneyScore = 8;
      else if (effectiveMoneyInDeal <= 30000) moneyScore = 7;
      else if (effectiveMoneyInDeal <= 40000) moneyScore = 5;
      else if (effectiveMoneyInDeal <= 50000) moneyScore = 4;
    }

    // Cashflow score: only evaluate if no money left in deal, otherwise cap at 6
    let cashflowScore = 1;
    if (brrrrCashLeftInDeal > 0) {
      // If there's money left in the walls, cashflow score is always 6
      cashflowScore = 6;
    } else {
      // Full cashflow scoring only when no money left in deal
      if (brrrrMonthlyCashflow >= 300) cashflowScore = 10;
      else if (brrrrMonthlyCashflow >= 275) cashflowScore = 9;
      else if (brrrrMonthlyCashflow >= 250) cashflowScore = 8;
      else if (brrrrMonthlyCashflow >= 200) cashflowScore = 7;
      else if (brrrrMonthlyCashflow >= 150) cashflowScore = 6;
      else if (brrrrMonthlyCashflow >= 100) cashflowScore = 5;
      else if (brrrrMonthlyCashflow >= 50) cashflowScore = 4;
      else if (brrrrMonthlyCashflow >= 0) cashflowScore = 3;
      else cashflowScore = 2;
    }

    const brrrrEquity = arv - brrrrRefiLoanAmount - brrrrCashLeftInDeal;
    let equityScore = 1;
    if (brrrrEquity >= 100000) equityScore = 10;
    else if (brrrrEquity >= 80000) equityScore = 9;
    else if (brrrrEquity >= 60000) equityScore = 8;
    else if (brrrrEquity >= 45000) equityScore = 7;
    else if (brrrrEquity >= 35000) equityScore = 6;
    else if (brrrrEquity >= 30000) equityScore = 5;
    else if (brrrrEquity >= 20000) equityScore = 4;
    else if (brrrrEquity >= 10000) equityScore = 3;
    else equityScore = 2;

    const minScore = Math.min(moneyScore, cashflowScore, equityScore);
    const avgScore = Math.round((moneyScore + cashflowScore + equityScore) / 3);
    // If any score is 0, the strategy is disqualified (score 0). If any < 7, cap at 6.
    const finalBrrrrScore = minScore === 0 ? 0 : (minScore < 7 ? Math.min(avgScore, 6) : avgScore);

    // Create strategies array
    const strategies: Strategy[] = [
      {
        id: 'flip',
        name: 'Flip',
        icon: <TrendingUp className="w-4 h-4" />,
        color: 'orange',
        primaryMetric: flipNetProfit,
        primaryLabel: 'Net Profit',
        primaryFormat: formatCurrency(flipNetProfit),
        secondaryMetric: flipRoi,
        secondaryLabel: 'ROI',
        secondaryFormat: `${flipRoi.toFixed(1)}%`,
        tertiaryLabel: `${flipRehabMonths}mo hold`,
        netProfitWarning: flipNetProfit < 25000,
        netProfitSuccess: flipNetProfit >= 50000,
        score: (() => {
          if (flipRoi >= 25) return 10;
          if (flipRoi >= 20) return 9;
          if (flipRoi >= 18) return 8;
          if (flipRoi >= 17) return 7;
          if (flipRoi >= 15) return 6;
          if (flipRoi >= 13) return 5;
          if (flipRoi >= 11) return 4;
          if (flipRoi >= 10) return 3;
          if (flipRoi >= 8) return 2;
          return 1;
        })(),
        isProfitable: flipNetProfit > 0,
      },
      {
        id: 'rental',
        name: 'Rental',
        icon: <Home className="w-4 h-4" />,
        color: 'cyan',
        primaryMetric: rentalMonthlyCashflow,
        primaryLabel: 'Cashflow/mo',
        primaryFormat: formatCurrency(rentalMonthlyCashflow),
        secondaryMetric: rentalCashOnCash,
        secondaryLabel: 'CoC',
        secondaryFormat: `${rentalCashOnCash.toFixed(1)}%`,
        tertiaryLabel: `${rentalCapRate.toFixed(1)}% Cap`,
        score: (() => {
          if (rentalCapRate >= 15) return 10;
          if (rentalCapRate >= 12) return 9;
          if (rentalCapRate >= 9) return 8;
          if (rentalCapRate >= 8) return 7;
          if (rentalCapRate >= 7) return 6;
          if (rentalCapRate >= 6) return 5;
          if (rentalCapRate >= 5) return 3;
          if (rentalCapRate >= 3) return 2;
          return 1;
        })(),
        isProfitable: rentalMonthlyCashflow > 0,
      },
      {
        id: 'brrrr',
        name: 'BRRRR',
        icon: <RefreshCw className="w-4 h-4" />,
        color: 'purple',
        primaryMetric: brrrrCashLeftInDeal,
        primaryLabel: 'Money in Deal',
        primaryFormat: formatCurrency(brrrrCashLeftInDeal),
        secondaryMetric: brrrrCocReturn,
        secondaryLabel: 'CoC',
        secondaryFormat: brrrrCocReturn > 100 ? '∞' : `${brrrrCocReturn.toFixed(1)}%`,
        tertiaryLabel: `${formatCurrency(brrrrMonthlyCashflow)}/mo`,
        score: finalBrrrrScore,
        isProfitable: brrrrMonthlyCashflow > 0,
        scoreBreakdown: {
          moneyInDeal: { score: moneyScore, value: brrrrCashLeftInDeal },
          cashflow: { score: cashflowScore, value: brrrrMonthlyCashflow },
          equity: { score: equityScore, value: brrrrEquity },
          isMarginal: minScore < 7,
          isDisqualified: isDisqualified,
        },
      },
    ];

    const rankedStrategies = [...strategies].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.primaryMetric - a.primaryMetric;
    });

    const bestStrategy = rankedStrategies[0];
    const allBelowThreshold = strategies.every(s => s.score < 7);

    return { rankedStrategies, bestStrategy, allBelowThreshold };
  }, [purchasePrice, arv, rehabCost, rent, liveFinancials, apiData, localOverrides, loanDefaults]);

  if (!strategyData) return null;

  const { rankedStrategies, bestStrategy, allBelowThreshold } = strategyData;

  const colorMap: Record<string, string> = {
    orange: 'border-orange-500/50 bg-orange-500/10',
    cyan: 'border-cyan-500/50 bg-cyan-500/10',
    purple: 'border-purple-500/50 bg-purple-500/10',
    gray: 'border-muted-foreground/30 bg-muted/20',
  };
  const textColorMap: Record<string, string> = {
    orange: 'text-orange-400',
    cyan: 'text-cyan-400',
    purple: 'text-purple-400',
    gray: 'text-muted-foreground',
  };

  const getScoreColor = (s: number) => s >= 7 ? "text-green-500" : s >= 5 ? "text-yellow-500" : "text-red-500";

  return (
    <Card className={cn("border", allBelowThreshold ? colorMap.gray : colorMap[bestStrategy.color])}>
      <CardHeader className="pb-1 md:pb-2 pt-2 md:pt-3 px-2 md:px-4">
        <CardTitle className="text-xs md:text-sm flex items-center gap-1.5 md:gap-2">
          <Calculator className={cn("w-3.5 h-3.5 md:w-4 md:h-4", allBelowThreshold ? textColorMap.gray : textColorMap[bestStrategy.color])} />
          <span className={allBelowThreshold ? textColorMap.gray : textColorMap[bestStrategy.color]}>Best Strategy</span>
          {allBelowThreshold ? (
            <Badge variant="outline" className="ml-auto text-[9px] md:text-[10px] border-red-500/50 text-red-400 bg-red-500/10 px-1 md:px-1.5">
              No Good Strategy
            </Badge>
          ) : (
            <Badge variant="outline" className={cn("ml-auto text-[9px] md:text-[10px] px-1 md:px-1.5", textColorMap[bestStrategy.color], `border-${bestStrategy.color}-500/50`)}>
              {bestStrategy.name} Recommended
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 md:px-4 pb-2 md:pb-3 pt-0">
        <div className="space-y-1.5 md:space-y-2">
          {rankedStrategies.map((strategy, index) => (
            <div 
              key={strategy.id}
              className={cn(
                "flex items-center gap-2 md:gap-3 p-1.5 md:p-2 rounded-lg transition-all",
                index === 0 
                  ? cn("border", colorMap[strategy.color]) 
                  : "bg-muted/30 opacity-75"
              )}
            >
              {/* Rank number */}
              <div className={cn(
                "w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center text-[9px] md:text-[10px] font-bold shrink-0",
                index === 0 
                  ? cn("bg-gradient-to-br", strategy.color === 'orange' ? 'from-orange-500 to-amber-600' : strategy.color === 'cyan' ? 'from-cyan-500 to-blue-600' : 'from-purple-500 to-pink-600', "text-white")
                  : "bg-muted text-muted-foreground"
              )}>
                {index + 1}
              </div>
              
              {/* Icon and name */}
              <div className={cn("flex items-center gap-1 md:gap-1.5 shrink-0", index === 0 ? textColorMap[strategy.color] : "text-muted-foreground")}>
                <span className="[&>svg]:w-3 [&>svg]:h-3 md:[&>svg]:w-4 md:[&>svg]:h-4">{strategy.icon}</span>
                <span className="font-medium text-[10px] md:text-xs">{strategy.name}</span>
                {/* Score badge with tooltip for BRRRR */}
                {strategy.id === 'brrrr' && strategy.scoreBreakdown ? (
                  <HoverCard openDelay={100} closeDelay={50}>
                    <HoverCardTrigger asChild>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[9px] px-1.5 py-0 h-4 font-bold cursor-help",
                          strategy.score >= 7 
                            ? "border-green-500/50 text-green-400 bg-green-500/10" 
                            : strategy.score >= 5 
                              ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10"
                              : "border-red-500/50 text-red-400 bg-red-500/10"
                        )}
                      >
                        {strategy.score}/10
                      </Badge>
                    </HoverCardTrigger>
                    <HoverCardContent side="bottom" align="start" className="w-56 p-3 text-xs">
                      <div className="space-y-2">
                        <div className="font-semibold text-foreground">BRRRR Score Breakdown</div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Money In Deal</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-[10px]">{formatCurrency(strategy.scoreBreakdown.moneyInDeal.value)}</span>
                              <span className={cn("font-bold", getScoreColor(strategy.scoreBreakdown.moneyInDeal.score))}>{strategy.scoreBreakdown.moneyInDeal.score}/10</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Cashflow</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-[10px]">{formatCurrency(strategy.scoreBreakdown.cashflow.value)}/mo</span>
                              <span className={cn("font-bold", getScoreColor(strategy.scoreBreakdown.cashflow.score))}>{strategy.scoreBreakdown.cashflow.score}/10</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Equity</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-[10px]">{formatCurrency(strategy.scoreBreakdown.equity.value)}</span>
                              <span className={cn("font-bold", getScoreColor(strategy.scoreBreakdown.equity.score))}>{strategy.scoreBreakdown.equity.score}/10</span>
                            </div>
                          </div>
                        </div>
                        {strategy.scoreBreakdown.isDisqualified ? (
                          <div className="text-[10px] text-red-500 pt-1 border-t border-border font-medium">
                            ⚠️ Disqualified - Money in deal exceeds $50K
                          </div>
                        ) : strategy.scoreBreakdown.isMarginal && (
                          <div className="text-[10px] text-yellow-500 pt-1 border-t border-border">
                            ⚠️ Marginal deal - at least one parameter below 7
                          </div>
                        )}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                ) : (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[9px] px-1.5 py-0 h-4 font-bold",
                      strategy.score >= 7 
                        ? "border-green-500/50 text-green-400 bg-green-500/10" 
                        : strategy.score >= 5 
                          ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10"
                          : "border-red-500/50 text-red-400 bg-red-500/10"
                    )}
                  >
                    {strategy.score}/10
                  </Badge>
                )}
              </div>
              
              {/* Metrics */}
              <div className="flex-1 flex items-center justify-end gap-4 text-[11px]">
                <div className="text-right flex items-center gap-1">
                  <span className="text-muted-foreground">{strategy.primaryLabel}: </span>
                  <span className={cn("font-bold", strategy.isProfitable ? "text-emerald-400" : "text-red-400")}>
                    {strategy.primaryFormat}
                  </span>
                  {strategy.id === 'flip' && strategy.netProfitWarning && (
                    <AlertTriangle className="w-3 h-3 text-amber-400 ml-0.5" />
                  )}
                  {strategy.id === 'flip' && strategy.netProfitSuccess && (
                    <TrendingUp className="w-3 h-3 text-emerald-400 ml-0.5" />
                  )}
                </div>
                <div className="text-right hidden sm:block">
                  <span className="text-muted-foreground">{strategy.secondaryLabel}: </span>
                  <span className="font-medium text-foreground">{strategy.secondaryFormat}</span>
                </div>
                <span className="text-muted-foreground hidden md:block">{strategy.tertiaryLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
