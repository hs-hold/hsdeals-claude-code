import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  ClaudePick,
  ClaudePickInput,
  ClaudePickMarketStatus,
  ClaudePickPriority,
} from '@/types/claudePick';

// claude_picks isn't in the generated Supabase Database types yet — cast the
// client to bypass the typed-table check while keeping our own ClaudePick
// interface as the source of truth for callers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface ClaudePickRow {
  id: string;
  deal_id: string;
  market_status: ClaudePickMarketStatus;
  priority: ClaudePickPriority;
  market_note: string | null;
  analysis_note: string | null;
  checked_at: string;
  added_by: string;
  created_at: string;
  updated_at: string;
}

function rowToPick(row: ClaudePickRow): ClaudePick {
  return {
    id: row.id,
    dealId: row.deal_id,
    marketStatus: row.market_status,
    priority: row.priority,
    marketNote: row.market_note,
    analysisNote: row.analysis_note,
    checkedAt: row.checked_at,
    addedBy: row.added_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Loads all claude picks. Refetches whenever `version` increments — callers
// bump the version after mutations to force a reload.
export function useClaudePicks() {
  const [picks, setPicks] = useState<ClaudePick[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    sb.from('claude_picks')
      .select('*')
      .order('priority', { ascending: true })
      .order('checked_at', { ascending: false })
      .then(({ data, error: err }: { data: ClaudePickRow[] | null; error: { message: string } | null }) => {
        if (!alive) return;
        if (err) {
          setError(err.message);
          setPicks([]);
        } else {
          setError(null);
          setPicks((data ?? []).map(rowToPick));
        }
        setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [version]);

  const upsertPick = useCallback(async (input: ClaudePickInput) => {
    const payload: Record<string, unknown> = {
      deal_id: input.dealId,
      market_status: input.marketStatus ?? 'active',
      priority: input.priority ?? 'medium',
      market_note: input.marketNote ?? null,
      analysis_note: input.analysisNote ?? null,
      added_by: input.addedBy ?? 'manual',
    };
    const { error: err } = await sb
      .from('claude_picks')
      .upsert(payload, { onConflict: 'deal_id' });
    if (err) throw new Error(err.message);
    refresh();
  }, [refresh]);

  const removePick = useCallback(async (dealId: string) => {
    const { error: err } = await sb
      .from('claude_picks')
      .delete()
      .eq('deal_id', dealId);
    if (err) throw new Error(err.message);
    refresh();
  }, [refresh]);

  return { picks, isLoading, error, refresh, upsertPick, removePick };
}

// Lightweight helper for components that only need to know whether a deal is
// currently picked (e.g. the star toggle on DealDetailPage). Avoids forcing
// the full picks list through the consumer.
export function useIsClaudePick(dealId: string | undefined) {
  const [isPick, setIsPick] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    if (!dealId) {
      setIsPick(false);
      setIsLoading(false);
      return;
    }
    let alive = true;
    setIsLoading(true);
    sb.from('claude_picks')
      .select('id', { head: true, count: 'exact' })
      .eq('deal_id', dealId)
      .then(({ count, error: err }: { count: number | null; error: { message: string } | null }) => {
        if (!alive) return;
        if (err) {
          console.error('[useIsClaudePick] error:', err.message);
          setIsPick(false);
        } else {
          setIsPick((count ?? 0) > 0);
        }
        setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dealId, version]);

  const toggle = useCallback(async (input?: Omit<ClaudePickInput, 'dealId'>) => {
    if (!dealId) return;
    if (isPick) {
      const { error: err } = await sb.from('claude_picks').delete().eq('deal_id', dealId);
      if (err) throw new Error(err.message);
    } else {
      const payload: Record<string, unknown> = {
        deal_id: dealId,
        market_status: input?.marketStatus ?? 'active',
        priority: input?.priority ?? 'medium',
        market_note: input?.marketNote ?? null,
        analysis_note: input?.analysisNote ?? null,
        added_by: input?.addedBy ?? 'manual',
      };
      const { error: err } = await sb
        .from('claude_picks')
        .upsert(payload, { onConflict: 'deal_id' });
      if (err) throw new Error(err.message);
    }
    refresh();
  }, [dealId, isPick, refresh]);

  return { isPick, isLoading, toggle, refresh };
}
