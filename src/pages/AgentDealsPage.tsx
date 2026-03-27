import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { formatCurrency, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DealStatusBadge } from '@/components/deals/DealStatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Deal } from '@/types/deal';
import { 
  CheckCircle2, AlertTriangle, XCircle, Building2, 
  DollarSign, TrendingUp, Target, ArrowDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_PRICE = 300000;

interface FlipResult {
  score: number;
  flipRoi: number;
  netProfit: number;
  purchasePrice: number;
  arv: number;
  rehabCost: number;
  totalInvestment: number;
  mao: number | null;
  priceDiffPercent: number | null;
}

function calculateFlipScoreWithMAO(deal: Deal, loanDefaults: any): FlipResult | null {
  const financials = deal.financials;
  const apiData = deal.apiData;
  if (!financials || !apiData) return null;

  const purchasePrice = deal.overrides?.purchasePrice ?? apiData.purchasePrice ?? 0;
  if (purchasePrice <= 0) return null;

  const arv = deal.overrides?.arv ?? apiData.arv ?? 0;
  const rehabCost = deal.overrides?.rehabCost ?? apiData.rehabCost ?? 0;
  if (arv <= 0) return null;

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

  let score = 0;
  if (flipRoi >= 25) score = 10;
  else if (flipRoi >= 20) score = 9;
  else if (flipRoi >= 18) score = 8;
  else if (flipRoi >= 16) score = 7;
  else if (flipRoi >= 15) score = 6;
  else if (flipRoi >= 13) score = 5;
  else if (flipRoi >= 11) score = 4;
  else if (flipRoi >= 9) score = 3;
  else if (flipRoi >= 8) score = 2;
  else score = 1;

  // Calculate MAO for ROI = 18%
  // P = (arv*0.94 - 500 - 1.18*(rehabCost + holdingCosts)) / 1.2036
  const fixedCosts = rehabCost + totalHoldingCosts;
  const mao = (arv * 0.94 - 500 - 1.18 * fixedCosts) / 1.2036;
  const priceDiffPercent = purchasePrice > 0 ? ((purchasePrice - mao) / purchasePrice) * 100 : null;

  return { 
    score, flipRoi, netProfit, purchasePrice, arv, rehabCost, totalInvestment,
    mao: mao > 0 ? mao : null,
    priceDiffPercent,
  };
}

interface DealCardProps {
  deal: Deal;
  result: FlipResult;
  showMao?: boolean;
}

function DealCard({ deal, result, showMao }: DealCardProps) {
  return (
    <Link to={`/deals/${deal.id}`}>
      <Card className="hover:border-primary/50 transition-all cursor-pointer group">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                  {deal.address.street}
                </p>
                <DealStatusBadge status={deal.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {deal.address.city}, {deal.address.state} {deal.address.zip}
              </p>
            </div>
            <Badge variant={result.score >= 8 ? 'default' : 'secondary'} className="shrink-0">
              Score: {result.score}/10
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Purchase</p>
              <p className="text-sm font-medium">{formatCurrency(result.purchasePrice)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">ARV</p>
              <p className="text-sm font-medium">{formatCurrency(result.arv)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Net Profit</p>
              <p className={cn("text-sm font-medium", result.netProfit > 0 ? "text-success" : "text-destructive")}>
                {formatCurrency(result.netProfit)}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">ROI</p>
              <p className={cn("text-sm font-medium", result.flipRoi >= 18 ? "text-success" : "text-amber-500")}>
                {result.flipRoi.toFixed(1)}%
              </p>
            </div>
          </div>

          {showMao && result.mao && result.priceDiffPercent !== null && (
            <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-500">MAO (Maximum Allowable Offer)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-amber-400">{formatCurrency(result.mao)}</span>
                <div className="flex items-center gap-1 text-sm">
                  <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-muted-foreground">
                    {result.priceDiffPercent.toFixed(1)}% below asking
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AgentDealsPage() {
  const { deals, isLoading } = useDeals();
  const { user } = useAuth();
  const { settings } = useSettings();
  const loanDefaults = settings.loanDefaults;

  const categorized = useMemo(() => {
    const agentDeals = deals.filter(d => d.status !== 'not_relevant');

    const withScores = agentDeals
      .map(deal => {
        const result = calculateFlipScoreWithMAO(deal, loanDefaults);
        return result ? { deal, result } : null;
      })
      .filter(Boolean) as { deal: Deal; result: FlipResult }[];

    const good = withScores
      .filter(d => d.result.score >= 8)
      .sort((a, b) => b.result.score - a.result.score || b.result.flipRoi - a.result.flipRoi);

    const potential = withScores
      .filter(d => d.result.score < 8 && d.result.mao && d.result.priceDiffPercent !== null && d.result.priceDiffPercent < 8 && d.result.priceDiffPercent > 0)
      .sort((a, b) => (a.result.priceDiffPercent ?? 100) - (b.result.priceDiffPercent ?? 100));

    const rest = withScores
      .filter(d => d.result.score < 8 && !potential.some(p => p.deal.id === d.deal.id))
      .sort((a, b) => b.result.score - a.result.score);

    return { good, potential, rest, all: withScores };
  }, [deals, loanDefaults]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">My Deals</h1>
        <p className="text-muted-foreground">
          Deals you've analyzed • {categorized.all.length} total
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-success" />
            <div>
              <p className="text-2xl font-bold">{categorized.good.length}</p>
              <p className="text-sm text-muted-foreground">Good Deals</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{categorized.potential.length}</p>
              <p className="text-sm text-muted-foreground">Potential (MAO)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-muted-foreground/30 bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="w-8 h-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{categorized.rest.length}</p>
              <p className="text-sm text-muted-foreground">Not Good Enough</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="good">
        <TabsList>
          <TabsTrigger value="good" className="gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Good Deals ({categorized.good.length})
          </TabsTrigger>
          <TabsTrigger value="potential" className="gap-1.5">
            <Target className="w-4 h-4" />
            Potential - MAO ({categorized.potential.length})
          </TabsTrigger>
          <TabsTrigger value="rest" className="gap-1.5">
            All Others ({categorized.rest.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="good" className="space-y-3 mt-4">
          {categorized.good.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No good deals yet (Flip Score ≥ 8 required)</p>
          ) : (
            categorized.good.map(({ deal, result }) => (
              <DealCard key={deal.id} deal={deal} result={result} />
            ))
          )}
        </TabsContent>

        <TabsContent value="potential" className="space-y-3 mt-4">
          {categorized.potential.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No potential deals (needs &lt;8% price reduction)</p>
          ) : (
            <>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-200">
                <Target className="w-4 h-4 inline mr-1.5" />
                These deals could be profitable with a small price negotiation (&lt;8% below asking price). 
                The <strong>MAO</strong> shows the maximum offer price for an 18% ROI.
              </div>
              {categorized.potential.map(({ deal, result }) => (
                <DealCard key={deal.id} deal={deal} result={result} showMao />
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="rest" className="space-y-3 mt-4">
          {categorized.rest.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No other deals</p>
          ) : (
            categorized.rest.map(({ deal, result }) => (
              <DealCard key={deal.id} deal={deal} result={result} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
