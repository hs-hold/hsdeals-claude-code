import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LoggedError, clearErrorLog, loadErrorLog } from '@/utils/errorLog';

export default function ErrorLogPage() {
  const [entries, setEntries] = useState<LoggedError[]>(() => loadErrorLog());

  useEffect(() => {
    const refresh = () => setEntries(loadErrorLog());
    window.addEventListener('errorlog:change', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('errorlog:change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Error Log</h1>
          <p className="text-sm text-muted-foreground">
            Captures errors and unhandled promise rejections from this browser. Stored locally — clears on browser data wipe.
          </p>
        </div>
        <Button variant="outline" onClick={() => { clearErrorLog(); setEntries([]); }} disabled={entries.length === 0}>
          Clear log
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center">No errors logged.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <details key={e.id} className="rounded-xl border border-border bg-card p-3">
              <summary className="cursor-pointer flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{e.message}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {new Date(e.at).toLocaleString()} · {e.source}
                </span>
              </summary>
              <div className="mt-3 space-y-2 text-xs">
                <p className="text-muted-foreground break-all">URL: {e.url}</p>
                {e.stack && <pre className="bg-muted/30 p-2 rounded overflow-auto max-h-60">{e.stack}</pre>}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
