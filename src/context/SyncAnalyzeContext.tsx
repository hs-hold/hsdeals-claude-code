import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useDeals } from '@/context/DealsContext';
import { useGmailSync } from '@/hooks/useGmailSync';
import { toast } from 'sonner';

interface AnalyzedDealInfo {
  id: string;
  address: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  error?: string;
}

interface SyncAnalyzeState {
  isRunning: boolean;
  phase: 'idle' | 'syncing' | 'analyzing' | 'done';
  syncResult: any | null;
  analyzedDeals: AnalyzedDealInfo[];
  currentIndex: number;
  totalToAnalyze: number;
}

interface SyncAnalyzeContextType extends SyncAnalyzeState {
  startSyncAndAnalyze: (accessToken: string) => Promise<void>;
  startScanAllAndAnalyze: (accessToken: string) => Promise<void>;
  startAnalyzeUnanalyzed: () => Promise<void>;
  startAnalyzeList: (dealIds: { id: string; address: string }[]) => Promise<void>;
  reset: () => void;
}

const SyncAnalyzeContext = createContext<SyncAnalyzeContextType | undefined>(undefined);

const initialState: SyncAnalyzeState = {
  isRunning: false,
  phase: 'idle',
  syncResult: null,
  analyzedDeals: [],
  currentIndex: 0,
  totalToAnalyze: 0,
};

export function SyncAnalyzeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SyncAnalyzeState>(initialState);
  const { analyzeDeal, refetch } = useDeals();
  const { sync } = useGmailSync();
  const abortRef = useRef(false);
  const isRunningRef = useRef(false);

  // Keep refs to latest functions so the async loop always uses current versions
  const analyzeDealRef = useRef(analyzeDeal);
  const syncRef = useRef(sync);
  const refetchRef = useRef(refetch);

  useEffect(() => { analyzeDealRef.current = analyzeDeal; }, [analyzeDeal]);
  useEffect(() => { syncRef.current = sync; }, [sync]);
  useEffect(() => { refetchRef.current = refetch; }, [refetch]);

  const runSyncAndAnalyze = useCallback(async (accessToken: string, options: { sinceDays?: number; markAllRead: boolean; includeRead: boolean }) => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    abortRef.current = false;

    setState({
      isRunning: true,
      phase: 'syncing',
      syncResult: null,
      analyzedDeals: [],
      currentIndex: 0,
      totalToAnalyze: 0,
    });

    try {
      const result = await syncRef.current(accessToken, {
        maxResults: 50,
        sinceDays: options.sinceDays,
        markAllRead: options.markAllRead,
        includeRead: options.includeRead,
      });

      if (!result?.success) {
        setState(prev => ({ ...prev, isRunning: false, phase: 'done' }));
        isRunningRef.current = false;
        return;
      }

      setState(prev => ({ ...prev, syncResult: result }));

      // Refetch deals so newly created/updated deals are in local state
      await refetchRef.current();

      // Collect deals to analyze: newly created + updated with better price
      const dealsToAnalyze = result.syncDetails
        .filter((d: any) => (d.action === 'created' || d.action === 'updated_existing') && (d.dealId || d.existingDealId))
        .map((d: any) => ({
          id: d.dealId || d.existingDealId!,
          address: d.address || 'Unknown',
          status: 'pending' as const,
        }));

      // Deduplicate by deal ID
      const uniqueDeals = dealsToAnalyze.filter((d: any, i: number, arr: any[]) => 
        arr.findIndex((x: any) => x.id === d.id) === i
      );

      if (uniqueDeals.length === 0) {
        setState(prev => ({ ...prev, isRunning: false, phase: 'done' }));
        isRunningRef.current = false;
        if (result.olderMarkedRead > 0) {
          toast.info(`${result.olderMarkedRead} older emails marked as read`);
        }
        toast.success('Sync complete — no new deals to analyze');
        return;
      }

      setState(prev => ({
        ...prev,
        phase: 'analyzing',
        analyzedDeals: uniqueDeals,
        totalToAnalyze: uniqueDeals.length,
      }));

      for (let i = 0; i < uniqueDeals.length; i++) {
        if (abortRef.current) break;

        setState(prev => ({
          ...prev,
          currentIndex: i,
          analyzedDeals: prev.analyzedDeals.map((d, idx) =>
            idx === i ? { ...d, status: 'analyzing' } : d
          ),
        }));

        try {
          await analyzeDealRef.current(uniqueDeals[i].id);
          setState(prev => ({
            ...prev,
            analyzedDeals: prev.analyzedDeals.map((d, idx) =>
              idx === i ? { ...d, status: 'done' } : d
            ),
          }));
        } catch (err) {
          setState(prev => ({
            ...prev,
            analyzedDeals: prev.analyzedDeals.map((d, idx) =>
              idx === i ? { ...d, status: 'error', error: err instanceof Error ? err.message : 'Failed' } : d
            ),
          }));
        }
      }

      await refetchRef.current();

      setState(prev => ({ ...prev, isRunning: false, phase: 'done' }));
      isRunningRef.current = false;
      const doneCount = uniqueDeals.length;
      toast.success(`Analyzed ${doneCount} deals! Check Hot Deals for top picks.`);

      if (result.olderMarkedRead > 0) {
        toast.info(`${result.olderMarkedRead} older emails marked as read`);
      }
    } catch (err) {
      console.error('Sync & analyze error:', err);
      toast.error('Failed to sync and analyze');
      setState(prev => ({ ...prev, isRunning: false, phase: 'done' }));
      isRunningRef.current = false;
    }
  }, []);

  // Button 1: Last 7 days unread only, mark older as read
  const startSyncAndAnalyze = useCallback(async (accessToken: string) => {
    await runSyncAndAnalyze(accessToken, { sinceDays: 7, markAllRead: true, includeRead: false });
  }, [runSyncAndAnalyze]);

  // Button 2: Last 50 emails including read
  const startScanAllAndAnalyze = useCallback(async (accessToken: string) => {
    await runSyncAndAnalyze(accessToken, { markAllRead: false, includeRead: true });
  }, [runSyncAndAnalyze]);

  // Button 3: Analyze deals that have no API analysis data yet (status=new, no grade/aiSummary)
  const startAnalyzeUnanalyzed = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    abortRef.current = false;

    const MAX_PRICE = 300000;

    // Get current deals from context
    await refetchRef.current();

    // We need to read deals from DB directly to get fresh data
    const { data: dbDeals, error } = await import('@/integrations/supabase/client').then(m => 
      m.supabase.from('deals').select('id, address_full, api_data, overrides, status').order('created_at', { ascending: false })
    );

    if (error || !dbDeals) {
      toast.error('Failed to fetch deals');
      isRunningRef.current = false;
      return;
    }

    // Filter: deals without analysis (no grade and no aiSummary) and within budget
    const unanalyzed = dbDeals.filter((d: any) => {
      const apiData = d.api_data || {};
      const hasAnalysis = apiData.grade || apiData.aiSummary;
      if (hasAnalysis) return false;

      const price = d.overrides?.purchasePrice ?? apiData.purchasePrice ?? 0;
      if (price > MAX_PRICE && price > 0) return false;

      return true;
    }).map((d: any) => ({
      id: d.id,
      address: d.address_full || 'Unknown',
      status: 'pending' as const,
    }));

    if (unanalyzed.length === 0) {
      toast.info('No unanalyzed deals found within budget');
      isRunningRef.current = false;
      return;
    }

    setState({
      isRunning: true,
      phase: 'analyzing',
      syncResult: null,
      analyzedDeals: unanalyzed,
      currentIndex: 0,
      totalToAnalyze: unanalyzed.length,
    });

    for (let i = 0; i < unanalyzed.length; i++) {
      if (abortRef.current) break;

      setState(prev => ({
        ...prev,
        currentIndex: i,
        analyzedDeals: prev.analyzedDeals.map((d, idx) =>
          idx === i ? { ...d, status: 'analyzing' } : d
        ),
      }));

      try {
        await analyzeDealRef.current(unanalyzed[i].id);
        setState(prev => ({
          ...prev,
          analyzedDeals: prev.analyzedDeals.map((d, idx) =>
            idx === i ? { ...d, status: 'done' } : d
          ),
        }));
      } catch (err) {
        setState(prev => ({
          ...prev,
          analyzedDeals: prev.analyzedDeals.map((d, idx) =>
            idx === i ? { ...d, status: 'error', error: err instanceof Error ? err.message : 'Failed' } : d
          ),
        }));
      }
    }

    await refetchRef.current();
    setState(prev => ({ ...prev, isRunning: false, phase: 'done' }));
    isRunningRef.current = false;
    toast.success(`Analyzed ${unanalyzed.length} deals!`);
  }, []);

  // Analyze a specific list of deal IDs (e.g. from email search results)
  const startAnalyzeList = useCallback(async (dealsList: { id: string; address: string }[]) => {
    if (isRunningRef.current || dealsList.length === 0) return;
    isRunningRef.current = true;
    abortRef.current = false;

    const items = dealsList.map(d => ({
      id: d.id,
      address: d.address,
      status: 'pending' as const,
    }));

    setState({
      isRunning: true,
      phase: 'analyzing',
      syncResult: null,
      analyzedDeals: items,
      currentIndex: 0,
      totalToAnalyze: items.length,
    });

    for (let i = 0; i < items.length; i++) {
      if (abortRef.current) break;

      setState(prev => ({
        ...prev,
        currentIndex: i,
        analyzedDeals: prev.analyzedDeals.map((d, idx) =>
          idx === i ? { ...d, status: 'analyzing' } : d
        ),
      }));

      try {
        await analyzeDealRef.current(items[i].id);
        setState(prev => ({
          ...prev,
          analyzedDeals: prev.analyzedDeals.map((d, idx) =>
            idx === i ? { ...d, status: 'done' } : d
          ),
        }));
      } catch (err) {
        setState(prev => ({
          ...prev,
          analyzedDeals: prev.analyzedDeals.map((d, idx) =>
            idx === i ? { ...d, status: 'error', error: err instanceof Error ? err.message : 'Failed' } : d
          ),
        }));
      }
    }

    await refetchRef.current();
    setState(prev => ({ ...prev, isRunning: false, phase: 'done' }));
    isRunningRef.current = false;
    toast.success(`Analyzed ${items.length} deals!`);
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    setState(initialState);
  }, []);

  return (
    <SyncAnalyzeContext.Provider value={{ ...state, startSyncAndAnalyze, startScanAllAndAnalyze, startAnalyzeUnanalyzed, startAnalyzeList, reset }}>
      {children}
    </SyncAnalyzeContext.Provider>
  );
}

export function useSyncAnalyze() {
  const context = useContext(SyncAnalyzeContext);
  if (!context) {
    throw new Error('useSyncAnalyze must be used within a SyncAnalyzeProvider');
  }
  return context;
}
