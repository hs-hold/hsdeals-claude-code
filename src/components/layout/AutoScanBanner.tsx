import { useEffect, useState } from 'react';
import { Mail, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGmailAuth } from '@/hooks/useGmailAuth';
import { useSyncAnalyze } from '@/context/SyncAnalyzeContext';

// Show the banner once per browser session (not once per day)
const SESSION_KEY = 'auto_scan_offered';

export function AutoScanBanner() {
  const { isConnected, getValidToken } = useGmailAuth();
  const { isRunning, phase, startSyncAndAnalyze } = useSyncAnalyze();
  const [visible, setVisible] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // Only show if Gmail connected, not already running, and not yet offered this session
    if (!isConnected) return;
    if (isRunning) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Small delay so the page has time to render before showing the banner
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, [isConnected, isRunning]);

  // Hide banner once the scan actually starts
  useEffect(() => {
    if (phase === 'syncing' || phase === 'analyzing') {
      setVisible(false);
    }
  }, [phase]);

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(false);
  };

  const handleScan = async () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setStarting(true);
    const token = await getValidToken();
    if (!token) {
      setStarting(false);
      setVisible(false);
      return;
    }
    setVisible(false);
    setStarting(false);
    // Fire and forget — GlobalScanProgress will show progress
    startSyncAndAnalyze(token);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-background/95 backdrop-blur px-4 py-3 shadow-lg">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">New emails to scan</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Scan and analyze for new deals?</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 text-xs px-3" onClick={handleScan} disabled={starting}>
              {starting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Scan now
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs px-3" onClick={dismiss}>
              Later
            </Button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
