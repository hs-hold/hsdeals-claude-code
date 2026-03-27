import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Trash2, Pause, Play, CheckCircle2, XCircle, Copy, TrendingDown, Filter, Loader2, Wifi, StopCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatIL as format } from '@/utils/dateFormat';

interface ActivityEvent {
  id: string;
  job_id: string | null;
  event_type: string;
  address: string | null;
  message: string;
  metadata: Record<string, any>;
  created_at: string;
}

interface JobInfo {
  id: string;
  status: string;
  zipcode: string;
  created_at: string;
  completed_at: string | null;
  total_properties: number | null;
  processed_count: number | null;
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  job_created: { icon: Wifi, color: 'text-blue-500', label: 'Job Created' },
  analyzing: { icon: Loader2, color: 'text-amber-500', label: 'Analyzing' },
  completed: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Completed' },
  good_deal: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Good Deal' },
  filtered_out: { icon: Filter, color: 'text-muted-foreground', label: 'Filtered Out' },
  duplicate: { icon: Copy, color: 'text-muted-foreground', label: 'Duplicate' },
  price_drop: { icon: TrendingDown, color: 'text-orange-500', label: 'Price Drop' },
  error: { icon: XCircle, color: 'text-destructive', label: 'Error' },
  webhook_sent: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Webhook Sent' },
  job_completed: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Job Done' },
};

export default function ApiActivityPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const prevJobCountRef = useRef(0);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const fetchJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from('api_jobs')
      .select('id, status, zipcode, created_at, completed_at, total_properties, processed_count')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      const jobList = data as unknown as JobInfo[];
      setJobs(jobList);

      // Auto-select new job when it appears
      if (jobList.length > prevJobCountRef.current && prevJobCountRef.current > 0) {
        setSelectedJobId(jobList[0].id);
      }
      prevJobCountRef.current = jobList.length;
    }
  }, []);

  const fetchEvents = useCallback(async (silent = false, jobId?: string | null) => {
    if (!silent) setLoading(true);

    let query = supabase
      .from('api_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (jobId) {
      query = query.eq('job_id', jobId);
    }

    const { data, error } = await query;

    if (!error && data) {
      setEvents(data as unknown as ActivityEvent[]);
    }

    if (!silent) setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    void fetchJobs();
    void fetchEvents(false, selectedJobId);
  }, []);

  // Refetch events when selected job changes
  useEffect(() => {
    void fetchEvents(false, selectedJobId);
  }, [selectedJobId, fetchEvents]);

  // Polling
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      void Promise.all([fetchEvents(true, selectedJobId), fetchJobs()]);
    }, 5000);
    return () => clearInterval(interval);
  }, [paused, fetchEvents, fetchJobs, selectedJobId]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('api-activity-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'api_activity_log' },
        (payload) => {
          if (!pausedRef.current) {
            const newEvent = payload.new as unknown as ActivityEvent;

            // When a new job_created event arrives, clear the feed and show only the new job
            if (newEvent.event_type === 'job_created') {
              if (newEvent.job_id) {
                // Real job — auto-select it (clears via effect)
                setSelectedJobId(newEvent.job_id);
                setEvents([newEvent]);
              } else {
                // Cached response (no job) — clear and show it
                setSelectedJobId(null);
                setEvents([newEvent]);
              }
              return;
            }

            // Only add if matches selected job or no filter
            if (!selectedJobId || newEvent.job_id === selectedJobId) {
              setEvents((prev) => [newEvent, ...prev].slice(0, 500));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'api_jobs' },
        () => {
          void fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchJobs, selectedJobId]);

  const activeJobIds = useMemo(
    () => new Set(jobs.filter((job) => job.status === 'processing').map((job) => job.id)),
    [jobs]
  );

  const hasActiveJobs = activeJobIds.size > 0;

  // Find the latest "analyzing" event per active job
  const latestAnalyzingIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      if (event.event_type === 'analyzing' && event.job_id && activeJobIds.has(event.job_id) && !map.has(event.job_id)) {
        map.set(event.job_id, event.id);
      }
    }
    return new Set(map.values());
  }, [events, activeJobIds]);

  const visibleEvents = useMemo(
    () => events.filter((event) => event.event_type !== 'analyzing' || !event.job_id || activeJobIds.has(event.job_id)),
    [events, activeJobIds]
  );

  const handleClear = async () => {
    let query = supabase.from('api_activity_log').delete();
    if (selectedJobId) {
      query = query.eq('job_id', selectedJobId);
    } else {
      query = query.neq('id', '00000000-0000-0000-0000-000000000000');
    }
    const { error } = await query;
    if (error) {
      toast.error('Failed to clear activity log');
    } else {
      setEvents([]);
      toast.success('Activity log cleared');
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      const jobsToStop = selectedJobId
        ? [{ id: selectedJobId }]
        : (await supabase.from('api_jobs').select('id').eq('status', 'processing')).data || [];

      if (!jobsToStop.length) {
        toast.error('No active jobs to stop');
        return;
      }

      for (const job of jobsToStop) {
        await supabase.from('api_jobs').update({ status: 'cancelled' }).eq('id', job.id);
      }

      await Promise.all([fetchJobs(), fetchEvents(true, selectedJobId)]);
      toast.success(`Stopped ${jobsToStop.length} job${jobsToStop.length > 1 ? 's' : ''}.`);
    } catch (e) {
      toast.error('Failed to stop jobs');
    } finally {
      setStopping(false);
    }
  };

  const getEventConfig = (type: string) => EVENT_CONFIG[type] || { icon: Activity, color: 'text-muted-foreground', label: type };

  // Navigate between jobs
  const currentJobIndex = selectedJobId ? jobs.findIndex(j => j.id === selectedJobId) : -1;
  const canGoPrev = currentJobIndex > 0;
  const canGoNext = currentJobIndex < jobs.length - 1 && currentJobIndex >= 0;

  const selectedJob = selectedJobId ? jobs.find(j => j.id === selectedJobId) : null;

  const stats = {
    total: visibleEvents.length,
    good: visibleEvents.filter((e) => e.event_type === 'good_deal').length,
    filtered: visibleEvents.filter((e) => e.event_type === 'filtered_out').length,
    errors: visibleEvents.filter((e) => e.event_type === 'error').length,
    active: activeJobIds.size,
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">API Activity</h1>
            <p className="text-sm text-muted-foreground">Real-time API processing feed</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveJobs && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStop}
              disabled={stopping}
              className="gap-1.5"
            >
              {stopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
              Stop Analysis
            </Button>
          )}
          <Button
            variant={paused ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPaused(!paused)}
            className="gap-1.5"
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5 text-destructive hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* Job selector */}
      {jobs.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!canGoNext}
            onClick={() => canGoNext && setSelectedJobId(jobs[currentJobIndex + 1].id)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <Select
            value={selectedJobId || 'all'}
            onValueChange={(v) => setSelectedJobId(v === 'all' ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {jobs.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  <span className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      job.status === 'processing' ? 'bg-amber-500 animate-pulse' :
                      job.status === 'completed' ? 'bg-emerald-500' :
                      job.status === 'cancelled' ? 'bg-muted-foreground' :
                      job.status === 'failed' ? 'bg-destructive' : 'bg-muted-foreground'
                    }`} />
                    ZIP {job.zipcode} — {format(new Date(job.created_at), 'MMM d, HH:mm')}
                    {job.total_properties ? ` (${job.total_properties})` : ''}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!canGoPrev}
            onClick={() => canGoPrev && setSelectedJobId(jobs[currentJobIndex - 1].id)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Selected job info badge */}
      {selectedJob && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs gap-1">
            {selectedJob.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
            ZIP {selectedJob.zipcode} — {selectedJob.status}
            {selectedJob.processed_count != null && selectedJob.total_properties
              ? ` (${selectedJob.processed_count}/${selectedJob.total_properties})`
              : ''}
          </Badge>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Total Events</div>
          <div className="text-xl font-bold">{stats.total}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-emerald-600">Good Deals</div>
          <div className="text-xl font-bold text-emerald-600">{stats.good}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Filtered Out</div>
          <div className="text-xl font-bold">{stats.filtered}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-destructive">Errors</div>
          <div className="text-xl font-bold text-destructive">{stats.errors}</div>
        </Card>
      </div>

      {/* Activity feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${paused ? 'bg-muted-foreground' : 'bg-emerald-500 animate-pulse'}`} />
            {paused ? 'Feed Paused' : 'Live Feed'}
            {stats.active > 0 && !paused && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> {stats.active} active job{stats.active > 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[550px]" ref={scrollRef}>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : visibleEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Activity className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">No activity yet</p>
                <p className="text-xs mt-1">Events will appear here when you send API requests</p>
              </div>
            ) : (
              <div className="space-y-1">
                {visibleEvents.map((event) => {
                  const isSpinning = event.event_type === 'analyzing' && latestAnalyzingIds.has(event.id);
                  const isFinishedAnalyzing = event.event_type === 'analyzing' && !isSpinning;

                  const config = isFinishedAnalyzing
                    ? { icon: CheckCircle2, color: 'text-sky-500', label: 'Analysis Done' }
                    : getEventConfig(event.event_type);
                  const Icon = config.icon;

                  const displayMessage = isFinishedAnalyzing
                    ? event.message.replace(/^Analyzing\s+\d+\/\d+\.*/i, 'Analysis complete')
                    : event.message;

                  return (
                    <div
                      key={event.id}
                      className={`flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors ${
                        event.event_type === 'good_deal' ? 'bg-emerald-500/5' : 
                        event.event_type === 'error' ? 'bg-destructive/5' :
                        event.event_type === 'price_drop' ? 'bg-orange-500/5' : ''
                      }`}
                    >
                      <div className={`mt-0.5 ${config.color}`}>
                        <Icon className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{displayMessage}</span>
                        </div>
                        {event.address && (
                          <button
                            onClick={() => {
                              const dealId = event.metadata?.deal_id;
                              if (dealId) navigate(`/deals/${dealId}`);
                            }}
                            className={`text-xs text-muted-foreground truncate block mt-0.5 ${event.metadata?.deal_id ? 'hover:text-primary cursor-pointer underline-offset-2 hover:underline' : 'cursor-default'}`}
                          >
                            {event.address}
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                        {format(new Date(event.created_at), 'HH:mm:ss')}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
