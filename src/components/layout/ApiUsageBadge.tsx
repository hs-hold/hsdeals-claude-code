import { useApiUsageToday } from '@/hooks/useApiUsageToday';
import { cn } from '@/lib/utils';

const DEALBEAST_DAILY_LIMIT = 70;

// Small footer indicator for daily DealBeast usage. Notification-only: turns
// amber as we approach the limit and red once exceeded, but never blocks the
// user from analyzing more deals.
export function ApiUsageBadge() {
  const count = useApiUsageToday('dealbeast');

  if (count == null) return null;

  const overLimit = count >= DEALBEAST_DAILY_LIMIT;
  const nearLimit = !overLimit && count >= DEALBEAST_DAILY_LIMIT - 10;

  return (
    <div
      className={cn(
        'px-2 py-1 text-xs flex items-center justify-between gap-2',
        overLimit && 'text-red-500 font-medium',
        nearLimit && 'text-amber-500',
        !overLimit && !nearLimit && 'text-muted-foreground',
      )}
      title={overLimit ? 'Daily DealBeast budget exceeded' : 'DealBeast calls today'}
    >
      <span>DealBeast today</span>
      <span>
        {count}/{DEALBEAST_DAILY_LIMIT}
      </span>
    </div>
  );
}
