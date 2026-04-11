import { X, Mail, Loader2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSyncAnalyze } from '@/context/SyncAnalyzeContext';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function GlobalScanProgress() {
  const { isRunning, phase, currentIndex, totalToAnalyze, analyzedDeals, stop, reset } = useSyncAnalyze();
  const [collapsed, setCollapsed] = useState(false);

  // Show while running or when just finished (phase=done with results)
  const show = isRunning || (phase === 'done' && analyzedDeals.length > 0);
  if (!show) return null;

  const doneCount = analyzedDeals.filter(d => d.status === 'done').length;
  const errorCount = analyzedDeals.filter(d => d.status === 'error').length;
  const progress = totalToAnalyze > 0 ? ((doneCount + errorCount) / totalToAnalyze) * 100 : 0;

  const phaseLabel =
    phase === 'syncing'   ? 'סורק מיילים...' :
    phase === 'analyzing' ? `מנתח עסקה ${currentIndex + 1} מתוך ${totalToAnalyze}...` :
    phase === 'done'      ? `הושלם — ${doneCount} עסקאות נותחו` :
    '';

  const currentAddress = phase === 'analyzing' && analyzedDeals[currentIndex]
    ? analyzedDeals[currentIndex].address
    : null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-xl border border-border bg-background/95 backdrop-blur shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
            {isRunning
              ? <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
              : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            }
          </div>
          <span className="flex-1 text-sm font-medium truncate">{phaseLabel}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCollapsed(c => !c)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {!isRunning && (
              <button
                onClick={reset}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {!collapsed && (
          <div className="px-4 py-3 space-y-3">
            {/* Progress bar (only during analyze phase) */}
            {phase === 'analyzing' && totalToAnalyze > 0 && (
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {currentAddress && (
                  <p className="text-[11px] text-muted-foreground truncate">{currentAddress}</p>
                )}
              </div>
            )}

            {/* Syncing spinner */}
            {phase === 'syncing' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>מחפש מיילים חדשים...</span>
              </div>
            )}

            {/* Done summary */}
            {phase === 'done' && analyzedDeals.length > 0 && (
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-400">{doneCount} הצליחו</span>
                {errorCount > 0 && <span className="text-destructive">{errorCount} נכשלו</span>}
              </div>
            )}

            {/* Stop button while running */}
            {isRunning && (
              <Button
                size="sm"
                variant="outline"
                className={cn("h-7 w-full text-xs border-destructive/40 text-destructive hover:bg-destructive/10")}
                onClick={stop}
              >
                עצור
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
