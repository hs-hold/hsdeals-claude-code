import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  TrendingUp, TrendingDown, Minus, Loader2, RefreshCw,
  MapPin, Home, Clock, DollarSign, GraduationCap, ShieldCheck,
  Briefcase, Star, AlertTriangle, CheckCircle2, Globe
} from 'lucide-react';
import { useZipMarketData, ZipMarketData } from '@/hooks/useZipMarketData';
import { cn } from '@/lib/utils';

interface ZipMarketCardProps {
  zipCode: string | null | undefined;
  city?: string;
  state?: string;
}

const TEMPERATURE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  hot:     { label: 'HOT',     color: 'text-red-400',    bg: 'bg-red-500/15 border-red-500/40',    icon: <TrendingUp className="w-4 h-4" /> },
  warm:    { label: 'WARM',    color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/40', icon: <TrendingUp className="w-4 h-4" /> },
  neutral: { label: 'NEUTRAL', color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/40', icon: <Minus className="w-4 h-4" /> },
  cool:    { label: 'COOL',    color: 'text-blue-400',   bg: 'bg-blue-500/15 border-blue-500/40',  icon: <TrendingDown className="w-4 h-4" /> },
  cold:    { label: 'COLD',    color: 'text-slate-400',  bg: 'bg-slate-500/15 border-slate-500/40', icon: <TrendingDown className="w-4 h-4" /> },
};

function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-6 text-right">{score.toFixed(1)}</span>
    </div>
  );
}

function MetricRow({ label, value, icon }: { label: string; value: string | number | null | undefined; icon?: React.ReactNode }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function MarketDataDisplay({ data, onRefresh, isRefreshing }: { data: ZipMarketData; onRefresh: () => void; isRefreshing: boolean }) {
  const temp = TEMPERATURE_CONFIG[data.marketTemperature] || TEMPERATURE_CONFIG.neutral;
  const researchedDate = new Date(data.researchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Temperature + Score */}
      <div className={cn('flex items-center justify-between p-3 rounded-lg border', temp.bg)}>
        <div className="flex items-center gap-2">
          <span className={cn('text-lg font-black tracking-wider', temp.color)}>
            {temp.icon}
          </span>
          <div>
            <div className={cn('text-lg font-black tracking-wider', temp.color)}>{temp.label} MARKET</div>
            <div className="text-xs text-muted-foreground">ZIP {data.zipCode} · {data.city}, {data.state}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground mb-1">Investor Score</div>
          <div className="w-24">
            <ScoreBar score={data.investorScore} />
          </div>
        </div>
      </div>

      {/* Two-column metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Market Prices</p>
          <MetricRow
            label="Median Price"
            value={data.medianHomePrice ? `$${data.medianHomePrice.toLocaleString()}` : null}
            icon={<Home className="w-3.5 h-3.5" />}
          />
          <MetricRow label="Price Trend" value={data.medianHomePriceTrend} icon={<TrendingUp className="w-3.5 h-3.5" />} />
          <MetricRow label="5-yr Appreciation" value={data.appreciation5yr} icon={<TrendingUp className="w-3.5 h-3.5" />} />
          <MetricRow label="Avg Days on Market" value={data.avgDaysOnMarket ? `${data.avgDaysOnMarket} days` : null} icon={<Clock className="w-3.5 h-3.5" />} />
          <MetricRow label="Active Listings" value={data.listingsCount} icon={<MapPin className="w-3.5 h-3.5" />} />
          <MetricRow label="Price/Rent Ratio" value={data.priceToRentRatio} icon={<DollarSign className="w-3.5 h-3.5" />} />
        </div>

        <div className="space-y-0.5 mt-4 sm:mt-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Rentals & Demographics</p>
          <MetricRow
            label="Avg Rent"
            value={data.avgRent ? `$${data.avgRent.toLocaleString()}/mo` : null}
            icon={<DollarSign className="w-3.5 h-3.5" />}
          />
          <MetricRow label="Rent Trend" value={data.rentTrend} icon={<TrendingUp className="w-3.5 h-3.5" />} />
          <MetricRow label="Vacancy Rate" value={data.vacancyRate} icon={<Home className="w-3.5 h-3.5" />} />
          <MetricRow
            label="Median Income"
            value={data.medianHouseholdIncome ? `$${data.medianHouseholdIncome.toLocaleString()}` : null}
            icon={<Briefcase className="w-3.5 h-3.5" />}
          />
          <MetricRow label="Unemployment" value={data.unemploymentRate} icon={<Briefcase className="w-3.5 h-3.5" />} />
          <MetricRow label="Population Trend" value={data.populationTrend} icon={<TrendingUp className="w-3.5 h-3.5" />} />
        </div>
      </div>

      <Separator />

      {/* Ratings row */}
      <div className="grid grid-cols-3 gap-3">
        {data.schoolRating !== null && (
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <GraduationCap className="w-4 h-4 mx-auto mb-1 text-blue-400" />
            <div className="text-xs text-muted-foreground">Schools</div>
            <ScoreBar score={data.schoolRating} />
          </div>
        )}
        {data.crimeLevel && (
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <ShieldCheck className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
            <div className="text-xs text-muted-foreground">Crime</div>
            <div className="text-xs font-semibold capitalize mt-1">{data.crimeLevel}</div>
          </div>
        )}
        {data.economicStrength && (
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <Briefcase className="w-4 h-4 mx-auto mb-1 text-yellow-400" />
            <div className="text-xs text-muted-foreground">Economy</div>
            <div className="text-xs font-semibold capitalize mt-1">{data.economicStrength}</div>
          </div>
        )}
      </div>

      {/* Key Insights */}
      {data.keyInsights?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Investor Insights</p>
          {data.keyInsights.map((insight, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <span>{insight}</span>
            </div>
          ))}
        </div>
      )}

      {/* Risks */}
      {data.risks?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Risks to Watch</p>
          {data.risks.map((risk, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
              <span>{risk}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <div className="flex items-center gap-1">
          <Globe className="w-3 h-3" />
          <span>Sources: {data.sources?.join(', ') || 'Web research'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Researched {researchedDate}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ZipMarketCard({ zipCode, city, state }: ZipMarketCardProps) {
  const { data, isLoading, error, fetchMarketData } = useZipMarketData(zipCode);
  const [hasFetched, setHasFetched] = useState(false);

  const cleanZip = zipCode?.trim().substring(0, 5);
  if (!cleanZip || cleanZip.length < 5) return null;

  const handleFetch = async (forceRefresh = false) => {
    setHasFetched(true);
    await fetchMarketData(forceRefresh);
  };

  return (
    <Card className="border border-indigo-500/30 bg-card/50">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-400" />
            <span>Market Intelligence</span>
            <Badge variant="outline" className="text-xs border-indigo-500/40 text-indigo-400">
              ZIP {cleanZip}
            </Badge>
          </div>
          {data && (
            <Star className="w-4 h-4 text-indigo-400 fill-indigo-400/30" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {data ? (
          <MarketDataDisplay
            data={data}
            onRefresh={() => handleFetch(true)}
            isRefreshing={isLoading}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Researching market data for {city || cleanZip}...</span>
          </div>
        ) : error ? (
          <div className="py-4 space-y-3">
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={() => handleFetch(false)}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Try Again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6">
            <Globe className="w-8 h-8 text-indigo-400/50" />
            <p className="text-sm text-muted-foreground text-center">
              Real-time market intelligence for ZIP {cleanZip}
              {city && ` (${city}${state ? `, ${state}` : ''})`}
            </p>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Powered by AI web search — median prices, DOM, rentals, demographics, school ratings, and investor insights.
            </p>
            <Button
              onClick={() => handleFetch(false)}
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Researching...</>
              ) : (
                <><Globe className="w-4 h-4 mr-2" />Research This Market</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
