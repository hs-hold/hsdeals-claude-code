/**
 * DealAgeFilter – reusable age-range filter buttons for deal listing pages.
 *
 * Default behaviour (month):
 *  - Always show unanalyzed deals regardless of age
 *  - Hide analyzed deals that haven't been updated for > 30 days
 */

export type AgeFilterType = 'week' | 'month' | 'all' | 'old';

const OPTIONS: { value: AgeFilterType; label: string }[] = [
  { value: 'week',  label: 'Last week'  },
  { value: 'month', label: 'Last month' },
  { value: 'all',   label: 'All deals'  },
  { value: 'old',   label: 'Show old'   },
];

interface DealAgeFilterProps {
  value: AgeFilterType;
  onChange: (v: AgeFilterType) => void;
  className?: string;
}

export function DealAgeFilter({ value, onChange, className }: DealAgeFilterProps) {
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={[
            'px-2.5 py-1 rounded text-xs font-medium transition-colors border',
            value === opt.value
              ? 'bg-primary text-primary-foreground border-primary'
              : opt.value === 'old'
              ? 'border-border/40 text-muted-foreground/60 hover:text-muted-foreground hover:border-border/60'
              : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Filter helpers ──────────────────────────────────────────────────────────

const WEEK_MS  = 7  * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Apply the age filter to an array of deals (main deals table).
 *
 * @param dateField  Which date to compare (default: 'updatedAt').
 *                   Pass 'createdAt' for pages showing unanalyzed deals.
 * @param strict     When true, always apply the cutoff without the
 *                   "never hide unanalyzed" exception.
 *                   Use for unanalyzed-deals pages where all items lack analyzedAt.
 */
export function applyDealAgeFilter<
  T extends { updatedAt?: string; createdAt?: string; analyzedAt?: string | null }
>(
  items: T[],
  filter: AgeFilterType,
  options: { dateField?: keyof T; strict?: boolean } = {},
): T[] {
  const { dateField = 'updatedAt' as keyof T, strict = false } = options;
  if (filter === 'all') return items;

  const now = Date.now();

  const getRef = (d: T) =>
    ((d[dateField] ?? d.updatedAt ?? d.createdAt ?? '') as string);

  if (filter === 'old') {
    return items.filter(d => {
      const old = new Date(getRef(d)).getTime() < now - MONTH_MS;
      // In strict mode (unanalyzed page), just filter by age
      return strict ? old : (old && !!d.analyzedAt);
    });
  }

  const cutoffMs = now - (filter === 'week' ? WEEK_MS : MONTH_MS);

  if (filter === 'month' && !strict) {
    // Default: within the last month OR never analyzed (don't hide unprocessed work)
    return items.filter(d => {
      const recent = new Date(getRef(d)).getTime() >= cutoffMs;
      return recent || !d.analyzedAt;
    });
  }

  // week filter  OR  strict month
  return items.filter(d => new Date(getRef(d)).getTime() >= cutoffMs);
}

/**
 * Apply the age filter to scout AI deals (which use analyzedAt as their primary date).
 */
export function applyScoutAgeFilter<T extends { analyzedAt?: string }>(
  items: T[],
  filter: AgeFilterType,
): T[] {
  if (filter === 'all') return items;

  const now      = Date.now();
  const cutoffMs = now - (filter === 'week' ? WEEK_MS : MONTH_MS);

  if (filter === 'old') {
    return items.filter(d => {
      const ref = d.analyzedAt ?? '';
      return ref && new Date(ref).getTime() < now - MONTH_MS;
    });
  }

  return items.filter(d => {
    const ref = d.analyzedAt ?? '';
    return !ref || new Date(ref).getTime() >= cutoffMs;
  });
}
