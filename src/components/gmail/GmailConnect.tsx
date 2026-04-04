import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGmailAuth } from '@/hooks/useGmailAuth';
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface GmailConnectProps {
  onSyncComplete?: () => void;
}

export function GmailConnect({ onSyncComplete: _onSyncComplete }: GmailConnectProps) {
  const { isConnected, isLoading: isAuthLoading, connect, disconnect } = useGmailAuth();
  const navigate = useNavigate();

  const handleSync = () => {
    navigate('/analyze/email');
  };

  return (
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
              <Button onClick={handleSync}>
                <Mail className="h-4 w-4 mr-2" />
                Open Email Scanner
              </Button>
              <Button variant="outline" onClick={disconnect}>
                Disconnect
              </Button>
            </>
          )}
        </div>

        {isConnected && (
          <p className="text-xs text-muted-foreground">
            Scan emails by count • Mark old as read • Select & analyze deals in bulk
          </p>
        )}
      </CardContent>
    </Card>
  );
}
