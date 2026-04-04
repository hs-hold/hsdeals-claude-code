import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { useSettings } from '@/context/SettingsContext';
import { useSyncAnalyze } from '@/context/SyncAnalyzeContext';
import { MetricCard } from '@/components/deals/MetricCard';
import { DealStatusBadge } from '@/components/deals/DealStatusBadge';
import { GmailConnect } from '@/components/gmail/GmailConnect';
import { formatCurrency, formatPercent, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Mail } from 'lucide-react';
import { 
  Building2, 
  TrendingUp, 
  DollarSign, 
  Target,
  ArrowRight,
  Hammer,
  Home,
  RotateCcw,
  Zap,
  Loader2,
  CheckCircle2,
  Inbox,
  Clock,
} from 'lucide-react';
import { getUnanalyzedDeals } from '@/utils/dealHelpers';
import { formatIL as formatDate } from '@/utils/dateFormat';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { DEAL_STATUS_CONFIG, DealStatus, Deal } from '@/types/deal';
import { FINANCIAL_CONFIG } from '@/config/financial';
import { useGmailAuth } from '@/hooks/useGmailAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

// Calculate strategy-specific scores for dashboard display
function calculateDealScores(deal: Deal, loanDefaults: any) {
  const financials = deal.financials;
  const apiData = deal.apiData;
  if (!financials || !apiData) return null;

  const purchasePrice = deal.overrides?.purchasePrice ?? apiData.purchasePrice ?? 0;
  const arv = deal.overrides?.arv ?? apiData.arv ?? 0;
  const rehabCost = deal.overrides?.rehabCost ?? apiData.rehabCost ?? 0;
  const rent = deal.overrides?.rent ?? apiData.rent ?? 0;

  // Flip ROI calculation
  const flipClosingCosts = purchasePrice * 0.02;
  const holdingMonths = loanDefaults?.holdingMonths ?? 4;
  const propertyTaxMonthly = (apiData.propertyTax ?? 0) / 12;
  const insuranceMonthly = getEffectiveMonthlyInsurance(apiData.insurance);
  const utilitiesMonthly = 300;
  const holdingCostsMonthly = propertyTaxMonthly + insuranceMonthly + utilitiesMonthly;
  const totalHoldingCosts = holdingCostsMonthly * holdingMonths;
  const agentCommission = arv * 0.06;
  const notaryFees = 500;
  const totalInvestment = purchasePrice + rehabCost + flipClosingCosts + totalHoldingCosts;
  const netProfit = arv - totalInvestment - agentCommission - notaryFees;
  const flipRoi = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;

  // Rental Cap Rate calculation (basis: purchase + rehab)
  const monthlyExpenses = financials.monthlyExpenses ?? 0;
  const yearlyNoi = (rent - monthlyExpenses) * 12;
  const basis = purchasePrice + rehabCost;
  const capRate = basis > 0 ? (yearlyNoi / basis) * 100 : 0;
  const monthlyCashflow = financials.monthlyCashflow ?? 0;

  // BRRRR calculation
  const hmlLtvPurchase = (loanDefaults?.hmlLtvPurchasePercent ?? 90) / 100;
  const hmlLtvRehab = (loanDefaults?.hmlLtvRehabPercent ?? 100) / 100;
  const refiLtv = (loanDefaults?.refiLtvPercent ?? 75) / 100;
  const refiClosingPercent = (loanDefaults?.refiClosingPercent ?? 3) / 100;

  const hmlLoanPurchase = purchasePrice * hmlLtvPurchase;
  const hmlLoanRehab = rehabCost * hmlLtvRehab;
  const hmlTotalLoan = hmlLoanPurchase + hmlLoanRehab;
  
  const downPaymentPurchase = purchasePrice - hmlLoanPurchase;
  const downPaymentRehab = rehabCost - hmlLoanRehab;
  const brrrrClosingCosts = purchasePrice * 0.02;
  const hmlPoints = hmlTotalLoan * 0.02;
  const hmlProcessingFee = 1500;
  const hmlInterest = hmlTotalLoan * (0.12 / 12) * holdingMonths;
  
  const totalCashInvested = downPaymentPurchase + downPaymentRehab + brrrrClosingCosts + hmlPoints + hmlProcessingFee + totalHoldingCosts + hmlInterest;
  
  const refiLoanAmount = arv * refiLtv;
  const refiClosingCosts = refiLoanAmount * refiClosingPercent;
  const cashOut = refiLoanAmount - hmlTotalLoan - refiClosingCosts;
  const cashLeftInDeal = totalCashInvested - Math.max(0, cashOut);

  // BRRRR monthly cashflow post-refi
  const refiInterestRate = (loanDefaults?.interestRate ?? 7.5) / 100;
  const monthlyRate = refiInterestRate / 12;
  const refiMortgage = refiLoanAmount > 0 
    ? refiLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, 360)) / (Math.pow(1 + monthlyRate, 360) - 1)
    : 0;
  const brrrrCashflow = rent - monthlyExpenses - refiMortgage;
  const brrrrEquity = arv - refiLoanAmount - cashLeftInDeal;

  // Calculate BRRRR score
  let moneyScore = 0;
  const isDisqualified = cashLeftInDeal > 50000;
  if (!isDisqualified) {
    const effectiveMoney = brrrrCashflow <= 0 ? 30000 : cashLeftInDeal;
    if (effectiveMoney <= 0) moneyScore = 10;
    else if (effectiveMoney <= 10000) moneyScore = 9;
    else if (effectiveMoney <= 20000) moneyScore = 8;
    else if (effectiveMoney <= 30000) moneyScore = 7;
    else if (effectiveMoney <= 40000) moneyScore = 5;
    else moneyScore = 4;
  }

  let cashflowScore = cashLeftInDeal > 0 ? 6 : (
    brrrrCashflow >= 300 ? 10 : brrrrCashflow >= 200 ? 7 : brrrrCashflow >= 100 ? 5 : 3
  );

  let equityScore = brrrrEquity >= 100000 ? 10 : brrrrEquity >= 45000 ? 7 : brrrrEquity >= 20000 ? 4 : 2;

  const minScore = Math.min(moneyScore, cashflowScore, equityScore);
  const avgScore = Math.round((moneyScore + cashflowScore + equityScore) / 3);
  const brrrrScore = minScore === 0 ? 0 : (minScore < 7 ? Math.min(avgScore, 6) : avgScore);

  return {
    flipRoi,
    netProfit,
    capRate,
    monthlyCashflow,
    brrrrScore,
    cashLeftInDeal,
    brrrrCashflow,
    brrrrEquity,
    isDisqualified,
  };
}

export default function Dashboard() {
  const { deals, isLoading, refetch } = useDeals();
  const { settings } = useSettings();
  const loanDefaults = settings.loanDefaults;
  const { isConnected, tokens } = useGmailAuth();
  const { isRunning, phase, analyzedDeals, totalToAnalyze, startSyncAndAnalyze, startScanAllAndAnalyze, startAnalyzeUnanalyzed } = useSyncAnalyze();
  const { isAgent } = useUserRole();
  const navigate = useNavigate();

  const handleSyncAndAnalyze = async () => {
    if (!tokens?.access_token) {
      toast.error('Please connect Gmail first');
      return;
    }
    navigate('/sync-progress');
    startSyncAndAnalyze(tokens.access_token);
  };

  const handleScanAllAndAnalyze = async () => {
    if (!tokens?.access_token) {
      toast.error('Please connect Gmail first');
      return;
    }
    navigate('/sync-progress');
    startScanAllAndAnalyze(tokens.access_token);
  };

  const handleAnalyzeUnanalyzed = async () => {
    navigate('/sync-progress');
    startAnalyzeUnanalyzed();
  };

  const doneCount = analyzedDeals.filter(d => d.status === 'done' || d.status === 'error').length;

  const stats = useMemo(() => {
    const NON_BUYABLE = ['not_relevant', 'filtered_out', 'closed', 'under_contract', 'pending_other'];
    const activeDeals = deals.filter(d => !NON_BUYABLE.includes(d.status));
    const qualifiedDeals = deals.filter(d => d.status === 'qualified');
    const thisMonth = deals.filter(d => {
      const created = new Date(d.createdAt);
      const now = new Date();
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    });
    
    const avgYield = qualifiedDeals.length > 0
      ? qualifiedDeals.reduce((sum, d) => sum + (d.financials?.cashOnCashReturn ?? 0), 0) / qualifiedDeals.length
      : 0;
    
    const avgCashflow = qualifiedDeals.length > 0
      ? qualifiedDeals.reduce((sum, d) => sum + (d.financials?.monthlyCashflow ?? 0), 0) / qualifiedDeals.length
      : 0;
    
    const statusCounts: Record<string, number> = {};
    deals.forEach(d => {
      statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
    });
    
    const sourceCounts: Record<string, number> = {};
    deals.forEach(d => {
      sourceCounts[d.source] = (sourceCounts[d.source] || 0) + 1;
    });
    
    return {
      totalDeals: activeDeals.length,
      qualifiedCount: qualifiedDeals.length,
      newThisMonth: thisMonth.length,
      avgYield,
      avgCashflow,
      statusCounts,
      sourceCounts,
    };
  }, [deals]);

  // Calculate top deals for each strategy
  const { topFlipDeals, topRentalDeals, topBrrrrDeals } = useMemo(() => {
    const NON_BUYABLE_TOP = ['not_relevant', 'filtered_out', 'closed', 'under_contract', 'pending_other'];
    const activeDeals = deals.filter(d => !NON_BUYABLE_TOP.includes(d.status));
    
    const dealsWithScores = activeDeals.map(deal => ({
      deal,
      scores: calculateDealScores(deal, loanDefaults),
    })).filter(d => d.scores !== null);

    // Top Flip by ROI
    const topFlip = [...dealsWithScores]
      .filter(d => d.scores!.flipRoi > 0)
      .sort((a, b) => b.scores!.flipRoi - a.scores!.flipRoi)
      .slice(0, 5);

    // Top Rental by Cap Rate
    const topRental = [...dealsWithScores]
      .filter(d => d.scores!.capRate > 0)
      .sort((a, b) => b.scores!.capRate - a.scores!.capRate)
      .slice(0, 5);

    // Top BRRRR by score (non-disqualified first, then by score)
    const topBrrrr = [...dealsWithScores]
      .filter(d => !d.scores!.isDisqualified && d.scores!.brrrrScore > 0)
      .sort((a, b) => b.scores!.brrrrScore - a.scores!.brrrrScore)
      .slice(0, 5);

    return {
      topFlipDeals: topFlip,
      topRentalDeals: topRental,
      topBrrrrDeals: topBrrrr,
    };
  }, [deals, loanDefaults]);

  const statusChartData = Object.entries(stats.statusCounts)
    .filter(([status]) => status !== 'not_relevant')
    .map(([status, count]) => ({
      name: DEAL_STATUS_CONFIG[status as DealStatus].label,
      value: count,
    }));

  const CHART_COLORS = ['hsl(174, 72%, 46%)', 'hsl(38, 92%, 50%)', 'hsl(142, 71%, 45%)', 'hsl(262, 83%, 58%)', 'hsl(0, 72%, 51%)', 'hsl(217, 33%, 45%)'];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-sm md:text-base text-muted-foreground">Overview of your real estate deals</p>
        </div>
        <div className="flex gap-2 w-fit">
          {!isAgent && isConnected && (
            <>
              <Button
                onClick={isRunning ? () => navigate('/sync-progress') : handleSyncAndAnalyze}
                disabled={isRunning}
                className="bg-orange-500 hover:bg-orange-600 text-white"
                size="sm"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {totalToAnalyze > 0
                      ? `${doneCount}/${totalToAnalyze}`
                      : 'Syncing...'}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Sync New
                  </>
                )}
              </Button>
              <Button
                onClick={() => navigate('/analyze/email')}
                variant="outline"
                size="sm"
                className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
              >
                <Mail className="w-4 h-4 mr-2" />
                Email Scanner
              </Button>
              <Button
                onClick={isRunning ? () => navigate('/sync-progress') : handleAnalyzeUnanalyzed}
                disabled={isRunning}
                variant="outline"
                size="sm"
                className="border-green-500/50 text-green-400 hover:bg-green-500/10"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    In Progress
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4 mr-2" />
                    Analyze New
                  </>
                )}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/deals">
              <Building2 className="w-4 h-4 mr-2" />
              View All Deals
            </Link>
          </Button>
        </div>
      </div>

      {/* Analyze progress bar - clickable to go to progress page */}
      {isRunning && totalToAnalyze > 0 && (
        <Link to="/sync-progress" className="block space-y-1 cursor-pointer">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Analyzing deals...</span>
            <span>{doneCount}/{totalToAnalyze}</span>
          </div>
          <Progress value={(doneCount / totalToAnalyze) * 100} className="h-2" />
        </Link>
      )}

      {/* Gmail Connect */}
      {!isAgent && <GmailConnect onSyncComplete={refetch} />}

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Active Deals"
          value={stats.totalDeals}
          subValue={`${stats.newThisMonth} new this month`}
          icon={<Building2 className="w-5 h-5" />}
          trend="neutral"
        />
        <MetricCard
          label="Qualified Deals"
          value={stats.qualifiedCount}
          subValue="Ready for offers"
          icon={<Target className="w-5 h-5" />}
          trend="positive"
        />
        <MetricCard
          label="Avg CoC Return"
          value={formatPercent(stats.avgYield)}
          subValue="Qualified deals"
          icon={<TrendingUp className="w-5 h-5" />}
          trend={stats.avgYield >= 0.08 ? 'positive' : 'neutral'}
        />
        <MetricCard
          label="Avg Cashflow"
          value={formatCurrency(stats.avgCashflow)}
          subValue="Per month"
          icon={<DollarSign className="w-5 h-5" />}
          trend={stats.avgCashflow >= 200 ? 'positive' : 'neutral'}
        />
      </div>

      {/* Pending Analysis Section */}
      {(() => {
        const unanalyzed = getUnanalyzedDeals(deals).sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        if (unanalyzed.length === 0) return null;
        return (
          <Card className="border-yellow-500/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm md:text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400">Pending Analysis</span>
                <span className="text-xs text-muted-foreground font-normal">({unanalyzed.length})</span>
              </CardTitle>
              <Button variant="ghost" size="sm" asChild className="h-6 md:h-7 px-2">
                <Link to="/new-deals" className="text-xs">
                  View all <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-0.5 md:space-y-1">
                {unanalyzed.slice(0, 8).map((deal) => (
                  <Link
                    key={deal.id}
                    to={`/deals/${deal.id}`}
                    className="flex items-center gap-2 p-1.5 md:p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <Inbox className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs md:text-sm font-medium truncate group-hover:text-yellow-400 transition-colors">
                        {deal.address.street}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {deal.address.city}, {deal.address.state} {deal.address.zip}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <DealStatusBadge status={deal.status} />
                    </div>
                    <span className="text-[10px] md:text-xs text-muted-foreground shrink-0">
                      {formatDate(new Date(deal.createdAt), 'MMM d')}
                    </span>
                  </Link>
                ))}
                {unanalyzed.length > 8 && (
                  <Link to="/new-deals" className="block text-center text-xs text-yellow-400 hover:underline py-1">
                    +{unanalyzed.length - 8} more pending...
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Top Deals by Strategy - responsive grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {/* Top Flip Deals */}
        <Card className="border-orange-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 md:px-6">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <Hammer className="w-4 h-4 text-orange-400" />
              <span className="text-orange-400">Top Flip</span>
            </CardTitle>
            <Button variant="ghost" size="sm" asChild className="h-6 md:h-7 px-2">
              <Link to="/deals" className="text-xs">
                View all <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6">
            <div className="space-y-0.5 md:space-y-1">
              {topFlipDeals.map(({ deal, scores }, index) => (
                <Link
                  key={deal.id}
                  to={`/deals/${deal.id}`}
                  className="flex items-center gap-2 p-1.5 md:p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <span className="text-base md:text-lg font-bold text-muted-foreground w-4 md:w-5">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-medium truncate group-hover:text-orange-400 transition-colors">
                      {deal.address.street}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <DealStatusBadge status={deal.status} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs md:text-sm font-semibold text-orange-400">
                      {scores!.flipRoi.toFixed(1)}%
                    </p>
                    <p className="text-[9px] md:text-[10px] text-muted-foreground">
                      {formatCurrency(scores!.netProfit)}
                    </p>
                  </div>
                </Link>
              ))}
              {topFlipDeals.length === 0 && (
                <p className="text-center text-muted-foreground py-4 text-xs md:text-sm">No flip deals</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Rental Deals */}
        <Card className="border-cyan-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 md:px-6">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <Home className="w-4 h-4 text-cyan-400" />
              <span className="text-cyan-400">Top Rental</span>
            </CardTitle>
            <Button variant="ghost" size="sm" asChild className="h-6 md:h-7 px-2">
              <Link to="/deals" className="text-xs">
                View all <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6">
            <div className="space-y-0.5 md:space-y-1">
              {topRentalDeals.map(({ deal, scores }, index) => (
                <Link
                  key={deal.id}
                  to={`/deals/${deal.id}`}
                  className="flex items-center gap-2 p-1.5 md:p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <span className="text-base md:text-lg font-bold text-muted-foreground w-4 md:w-5">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-medium truncate group-hover:text-cyan-400 transition-colors">
                      {deal.address.street}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <DealStatusBadge status={deal.status} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs md:text-sm font-semibold text-cyan-400">
                      {scores!.capRate.toFixed(1)}%
                    </p>
                    <p className="text-[9px] md:text-[10px] text-muted-foreground">
                      {formatCurrency(scores!.monthlyCashflow)}/mo
                    </p>
                  </div>
                </Link>
              ))}
              {topRentalDeals.length === 0 && (
                <p className="text-center text-muted-foreground py-4 text-xs md:text-sm">No rental deals</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top BRRRR Deals */}
        <Card className="border-purple-500/30 md:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 md:px-6">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-purple-400" />
              <span className="text-purple-400">Top BRRRR</span>
            </CardTitle>
            <Button variant="ghost" size="sm" asChild className="h-6 md:h-7 px-2">
              <Link to="/deals" className="text-xs">
                View all <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6">
            <div className="space-y-0.5 md:space-y-1">
              {topBrrrrDeals.map(({ deal, scores }, index) => (
                <Link
                  key={deal.id}
                  to={`/deals/${deal.id}`}
                  className="flex items-center gap-2 p-1.5 md:p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <span className="text-base md:text-lg font-bold text-muted-foreground w-4 md:w-5">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-medium truncate group-hover:text-purple-400 transition-colors">
                      {deal.address.street}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <DealStatusBadge status={deal.status} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs md:text-sm font-semibold text-purple-400">
                      {scores!.brrrrScore}/10
                    </p>
                    <p className="text-[9px] md:text-[10px] text-muted-foreground">
                      {formatCurrency(scores!.cashLeftInDeal)} left
                    </p>
                  </div>
                </Link>
              ))}
              {topBrrrrDeals.length === 0 && (
                <p className="text-center text-muted-foreground py-4 text-xs md:text-sm">No BRRRR deals</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Deals by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(222 47% 8%)', 
                      border: '1px solid hsl(217 33% 17%)',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {statusChartData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2 text-sm">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className="text-muted-foreground">{entry.name}</span>
                  <span className="font-medium ml-auto">{entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Source Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Deals by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={Object.entries(stats.sourceCounts).map(([source, count]) => ({ source, count }))}>
                  <XAxis dataKey="source" stroke="hsl(215 20% 55%)" fontSize={12} />
                  <YAxis stroke="hsl(215 20% 55%)" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(222 47% 8%)', 
                      border: '1px solid hsl(217 33% 17%)',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(174, 72%, 46%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
