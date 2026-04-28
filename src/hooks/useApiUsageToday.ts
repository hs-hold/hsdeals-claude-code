import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Returns the count of API calls made today (local-day boundary) for the
// given service. Refreshes on mount and on a 60-second interval. Used to
// show the user a daily-budget badge for paid services.
export function useApiUsageToday(service: string, refreshMs = 60_000) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const { count: c, error } = await supabase
        .from('api_call_log')
        .select('*', { count: 'exact', head: true })
        .eq('service', service)
        .gte('called_at', startOfToday.toISOString());
      if (!alive) return;
      if (error) {
        console.error('[useApiUsageToday] error:', error.message);
        return;
      }
      setCount(c ?? 0);
    }

    load();
    timer = setInterval(load, refreshMs);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [service, refreshMs]);

  return count;
}
