import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGmailAuth } from '@/hooks/useGmailAuth';
import { useGmailSync } from '@/hooks/useGmailSync';
import { SyncResultsModal } from './SyncResultsModal';
import { Mail, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface GmailConnectProps {
  onSyncComplete?: () => void;
}

export function GmailConnect({ onSyncComplete }: GmailConnectProps) {
  const { isConnected, isLoading: isAuthLoading, tokens, connect, disconnect } = useGmailAuth();
  const { isSyncing, lastSyncResult, sync } = useGmailSync();
  const [showResultsModal, setShowResultsModal] = useState(false);

  const handleSync = async () => {
    if (tokens?.access_token) {
      const result = await sync(tokens.access_token, { maxResults: 50 });
      if (result?.success) {
        setShowResultsModal(true);
        if (onSyncComplete) {
          onSyncComplete();
        }
      }
    }
  };

  return (
    <>
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Gmail Integration
          </CardTitle>
          <CardDescription>
            Connect your Gmail to automatically import property deals from emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm text-green-500 font-medium">Connected</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Not connected</span>
              </>
            )}
          </div>

          <div className="flex gap-2">
            {!isConnected ? (
              <Button onClick={connect} disabled={isAuthLoading}>
                {isAuthLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Connect Gmail
              </Button>
            ) : (
              <>
                <Button onClick={handleSync} disabled={isSyncing}>
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync Emails
                </Button>
                <Button variant="outline" onClick={disconnect}>
                  Disconnect
                </Button>
              </>
            )}
          </div>

          {isConnected && (
            <p className="text-xs text-muted-foreground">
              Syncs all unread emails • Skips Zillow, Redfin, and other portals • Detects duplicates
            </p>
          )}
        </CardContent>
      </Card>

      <SyncResultsModal
        open={showResultsModal}
        onOpenChange={setShowResultsModal}
        results={lastSyncResult}
      />
    </>
  );
}
