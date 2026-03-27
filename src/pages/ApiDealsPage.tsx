import { useMemo, useState, useEffect } from 'react';
import { formatIL as format, isToday, isAfter, subDays, startOfDay } from '@/utils/dateFormat';
import { useDeals } from '@/context/DealsContext';
import { useSettings } from '@/context/SettingsContext';
import { DealsTable } from '@/components/deals/DealsTable';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wifi, Star, List, FilterX, BookOpen, Calendar, Briefcase, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Deal } from '@/types/deal';
import { getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';

function calculateFlipMetrics(deal: Deal, loanDefaults: any) {
  const apiData = deal.apiData;
  if (!apiData) return null;

  const purchasePrice = deal.overrides?.purchasePrice ?? apiData.purchasePrice ?? 0;
  if (purchasePrice <= 0) return null;

  const arv = deal.overrides?.arv ?? apiData.arv ?? 0;
  if (arv <= 0) return null;

  const rehabCost = deal.overrides?.rehabCost ?? apiData.rehabCost ?? 0;
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

  return { flipRoi, netProfit };
}

const MIN_ROI = 16;
const MIN_NET_PROFIT = 45000;

type TimeFilter = 'today' | 'week' | 'all';

interface ApiJob {
  id: string;
  zipcode: string;
  status: string;
  created_at: string;
  total_properties: number | null;
  processed_count: number | null;
}

export default function ApiDealsPage() {
  const { deals, isLoading } = useDeals();
  const { settings } = useSettings();
  const loanDefaults = settings.loanDefaults;
  const navigate = useNavigate();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [jobFilter, setJobFilter] = useState<string>('all');
  const [jobs, setJobs] = useState<ApiJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  // Fetch API jobs for the job filter dropdown
  useEffect(() => {
    async function fetchJobs() {
      const { data } = await supabase
        .from('api_jobs')
        .select('id, zipcode, status, created_at, total_properties, processed_count')
        .order('created_at', { ascending: false })
        .limit(100);
      setJobs((data as ApiJob[]) || []);
      setJobsLoading(false);
    }
    fetchJobs();
  }, []);

  // All API source deals
  const apiDeals = useMemo(() => deals.filter((d) => d.source === 'api'), [deals]);

  // Apply time filter
  const timeFilteredDeals = useMemo(() => {
    if (timeFilter === 'all') return apiDeals;
    const now = new Date();
    if (timeFilter === 'today') {
      return apiDeals.filter(d => isToday(new Date(d.createdAt)));
    }
    // week
    const weekAgo = startOfDay(subDays(now, 7));
    return apiDeals.filter(d => isAfter(new Date(d.createdAt), weekAgo));
  }, [apiDeals, timeFilter]);

  // Apply job filter  
  const filteredDeals = useMemo(() => {
    if (jobFilter === 'all') return timeFilteredDeals;
    // For job filter we need to match by job_id from DB
    // Since Deal type doesn't have job_id, we'll match via raw deal data
    // We'll use a workaround: store job_id in the deal mapping
    return timeFilteredDeals.filter((d: any) => d._jobId === jobFilter);
  }, [timeFilteredDeals, jobFilter]);

  // Categorize deals
  const { goodDeals, allDeals, filteredOutDeals } = useMemo(() => {
    const good: Deal[] = [];
    const filteredOut: Deal[] = [];
    for (const deal of filteredDeals) {
      if (deal.status === 'filtered_out') {
        filteredOut.push(deal);
        continue;
      }
      const metrics = calculateFlipMetrics(deal, loanDefaults);
      if (metrics && metrics.flipRoi >= MIN_ROI && metrics.netProfit >= MIN_NET_PROFIT) {
        good.push(deal);
      }
    }
    return {
      goodDeals: good,
      allDeals: filteredDeals.filter(d => d.status !== 'filtered_out'),
      filteredOutDeals: filteredOut,
    };
  }, [filteredDeals, loanDefaults]);

  // Filter jobs for dropdown based on time filter
  const filteredJobs = useMemo(() => {
    if (timeFilter === 'all') return jobs;
    const now = new Date();
    if (timeFilter === 'today') {
      return jobs.filter(j => isToday(new Date(j.created_at)));
    }
    const weekAgo = startOfDay(subDays(now, 7));
    return jobs.filter(j => isAfter(new Date(j.created_at), weekAgo));
  }, [jobs, timeFilter]);

  // Summary stats
  const stats = useMemo(() => ({
    total: filteredDeals.length,
    good: goodDeals.length,
    active: filteredDeals.filter(d => d.status !== 'filtered_out').length,
    filtered: filteredOutDeals.length,
  }), [filteredDeals, goodDeals, filteredOutDeals]);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wifi className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">API Deals</h1>
            <p className="text-muted-foreground">
              Deals analyzed via external API access
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate('/api-docs')}>
          <BookOpen className="w-4 h-4" />
          API Docs
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Time filter */}
        <Select value={timeFilter} onValueChange={(v) => { setTimeFilter(v as TimeFilter); setJobFilter('all'); }}>
          <SelectTrigger className="w-[160px]">
            <Calendar className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>

        {/* Job filter */}
        <Select value={jobFilter} onValueChange={setJobFilter}>
          <SelectTrigger className="w-[260px]">
            <Briefcase className="w-4 h-4 mr-2" />
            <SelectValue placeholder="All Requests" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Requests</SelectItem>
            {filteredJobs.map((job) => (
              <SelectItem key={job.id} value={job.id}>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs">{job.zipcode}</span>
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(job.created_at), 'MM/dd HH:mm')}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {job.processed_count ?? 0}/{job.total_properties ?? 0}
                  </Badge>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Summary chips */}
        <div className="flex items-center gap-2 ml-auto text-sm">
          <Badge variant="secondary" className="gap-1">
            {stats.total} total
          </Badge>
          {stats.good > 0 && (
            <Badge className="bg-emerald-500/20 text-emerald-400 gap-1">
              <Star className="w-3 h-3" /> {stats.good} good
            </Badge>
          )}
          {stats.filtered > 0 && (
            <Badge variant="outline" className="text-muted-foreground gap-1">
              <FilterX className="w-3 h-3" /> {stats.filtered} filtered
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="good" className="space-y-4">
        <TabsList>
          <TabsTrigger value="good" className="gap-2">
            <Star className="w-4 h-4" />
            Good Deals
            <Badge variant="secondary" className="ml-1 text-xs">
              {goodDeals.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            <List className="w-4 h-4" />
            All Deals
            <Badge variant="outline" className="ml-1 text-xs">
              {allDeals.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="filtered" className="gap-2">
            <FilterX className="w-4 h-4" />
            Filtered Out
            <Badge variant="outline" className="ml-1 text-xs text-destructive">
              {filteredOutDeals.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="good">
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : goodDeals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No good deals found</p>
              <p className="text-sm">
                {timeFilter === 'today' 
                  ? 'No deals with ROI ≥16% and Net Profit ≥$45K today'
                  : `Deals with ROI ≥${MIN_ROI}% and Net Profit ≥$${(MIN_NET_PROFIT / 1000).toFixed(0)}K will appear here`}
              </p>
            </div>
          ) : (
            <DealsTable deals={goodDeals} />
          )}
        </TabsContent>

        <TabsContent value="all">
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : allDeals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <List className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No deals found</p>
              <p className="text-sm">
                {timeFilter === 'today' ? 'No API deals created today' : 'No API deals in this time range'}
              </p>
            </div>
          ) : (
            <DealsTable deals={allDeals} />
          )}
        </TabsContent>

        <TabsContent value="filtered">
          {filteredOutDeals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FilterX className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No filtered deals</p>
              <p className="text-sm">Properties that don't meet the flip score threshold will appear here</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                   <tr className="bg-muted/50 border-b border-border">
                     <th className="text-left p-3 font-medium text-muted-foreground">Address</th>
                     <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                     <th className="text-left p-3 font-medium text-muted-foreground">Price</th>
                     <th className="text-left p-3 font-medium text-muted-foreground">ARV</th>
                     <th className="text-left p-3 font-medium text-muted-foreground">Reason</th>
                   </tr>
                </thead>
                <tbody>
                  {filteredOutDeals.map((deal) => (
                    <tr
                      key={deal.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/deals/${deal.id}`)}
                    >
                       <td className="p-3 font-medium text-primary hover:underline">{deal.address.full}</td>
                       <td className="p-3 text-muted-foreground whitespace-nowrap">
                         {deal.createdAt ? format(new Date(deal.createdAt), 'MM/dd/yyyy') : '—'}
                       </td>
                       <td className="p-3 text-muted-foreground">
                         {deal.apiData?.purchasePrice ? `$${deal.apiData.purchasePrice.toLocaleString()}` : '—'}
                       </td>
                       <td className="p-3 text-muted-foreground">
                         {deal.apiData?.arv ? `$${deal.apiData.arv.toLocaleString()}` : '—'}
                       </td>
                       <td className="p-3 text-muted-foreground">{deal.rejectionReason || 'Below threshold'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
