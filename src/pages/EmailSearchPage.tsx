import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useGmailAuth } from '@/hooks/useGmailAuth';
import { useGmailSync } from '@/hooks/useGmailSync';
import { useUserState } from '@/hooks/useUserState';
import { useDeals } from '@/context/DealsContext';
import { useSyncAnalyze } from '@/context/SyncAnalyzeContext';
import { SyncResultsModal } from '@/components/gmail/SyncResultsModal';
import { isDealAnalyzed } from '@/utils/dealHelpers';
import {
  Mail, MailOpen, Loader2, CheckCircle, CheckCircle2, XCircle,
  Inbox, Clock, MailSearch, Zap, ArrowRight, MapPin,
} from 'lucide-react';

interface SyncMode {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  options: {
    maxResults?: number;
    sinceDays?: number;
    includeRead?: boolean;
    markAllRead?: boolean;
  };
}

const syncModes: SyncMode[] = [
  {
    key: 'unread',
    label: 'Unread Emails',
    description: 'Scan all unread emails in your inbox',
    icon: <Mail className="w-8 h-8" />,
    options: { maxResults: 50, includeRead: false, markAllRead: false },
  },
  {
    key: 'last10',
    label: 'Last 10 Emails',
    description: 'Scan the 10 most recent, including read',
    icon: <MailOpen className="w-8 h-8" />,
    options: { maxResults: 10, includeRead: true, markAllRead: false },
  },
  {
    key: 'last50',
    label: 'Last 50 Emails',
    description: 'Deep scan of 50 recent emails, including read',
    icon: <MailSearch className="w-8 h-8" />,
    options: { maxResults: 50, includeRead: true, markAllRead: false },
  },
];

export default function EmailSearchPage() {
  const { isConnected, isLoading: isAuthLoading, tokens, connect } = useGmailAuth();
  const { isSyncing, lastSyncResult, sync } = useGmailSync();
  const { selectedState, stateName } = useUserState();
  const { deals } = useDeals();
  const {
    isRunning: isAnalyzing, phase, analyzedDeals, totalToAnalyze,
    startAnalyzeList,
  } = useSyncAnalyze();
  const [activeMode, setActiveMode] = useState<string | null>(null);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [lastSyncDealIds, setLastSyncDealIds] = useState<string[]>([]);

  const handleSync = async (mode: SyncMode) => {
    if (!tokens?.access_token) return;
    setActiveMode(mode.key);
    const result = await sync(tokens.access_token, { ...mode.options, targetState: selectedState && selectedState !== 'ALL' ? selectedState : undefined });
    if (result?.success) {
      // Collect deal IDs from sync results
      const newDealIds = result.syncDetails
        ?.filter((d: any) => (d.action === 'created' || d.action === 'updated_existing') && (d.dealId || d.existingDealId))
        .map((d: any) => d.dealId || d.existingDealId) || [];
      setLastSyncDealIds(newDealIds);
      setShowResultsModal(true);
    }
    setActiveMode(null);
  };

  // Build list of ALL synced items with their status
  const allSyncItems = useMemo(() => {
    if (!lastSyncResult?.syncDetails) return [];
    return lastSyncResult.syncDetails
      .filter((d: any) => d.address)
      .map((d: any) => {
        const dealId = d.dealId || d.existingDealId;
        const deal = dealId ? deals.find(dl => dl.id === dealId) : null;
        const analyzed = deal ? isDealAnalyzed(deal) : false;
        return {
          id: dealId || null,
          address: d.address || 'Unknown',
          action: d.action as string,
          analyzed,
          dealType: deal?.dealType || null,
          reason: d.reason || null,
        };
      });
  }, [lastSyncResult, deals]);

  // Only actionable deals (created/updated) for analysis
  const syncedDealsInfo = allSyncItems.filter(d => 
    (d.action === 'created' || d.action === 'updated_existing') && d.id
  );

  const unanalyzedFromSync = syncedDealsInfo.filter(d => !d.analyzed);

  const handleAnalyzeAll = () => {
    if (unanalyzedFromSync.length === 0) return;
    startAnalyzeList(unanalyzedFromSync.map(d => ({ id: d.id, address: d.address })));
  };

  // Analysis progress
  const analysisDoneCount = analyzedDeals.filter(d => d.status === 'done').length;
  const analysisErrorCount = analyzedDeals.filter(d => d.status === 'error').length;
  const analysisProgress = totalToAnalyze > 0
    ? ((analysisDoneCount + analysisErrorCount) / totalToAnalyze) * 100
    : 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Email Search</h1>
        <p className="text-muted-foreground">Scan your Gmail inbox for real estate deals</p>
      </div>

      {/* Not connected */}
      {!isConnected ? (
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Mail className="w-16 h-16 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium mb-2">Connect Gmail to get started</p>
            <p className="text-sm text-muted-foreground mb-6">
              We'll scan your inbox for property deals and extract all relevant details
            </p>
            <Button onClick={connect} disabled={isAuthLoading} size="lg">
              {isAuthLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Connect Gmail
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
           <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-500 font-medium">Gmail Connected</span>
            </div>
            {selectedState ? (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{stateName}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive font-medium">בחר סטייט בסיידבר</span>
              </div>
            )}
          </div>

          {/* Sync mode cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {syncModes.map((mode) => {
              const isActive = isSyncing && activeMode === mode.key;
              return (
                <Card
                  key={mode.key}
                  className={`border-border/50 bg-card/50 backdrop-blur transition-all hover:border-primary/30 ${
                    isActive ? 'border-primary/50 ring-1 ring-primary/20' : ''
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="text-primary">{mode.icon}</div>
                      {mode.key === 'last50' && (
                        <Badge variant="outline" className="text-xs">Deep Scan</Badge>
                      )}
                    </div>
                    <CardTitle className="text-lg">{mode.label}</CardTitle>
                    <CardDescription>{mode.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={() => handleSync(mode)}
                      disabled={isSyncing || isAnalyzing}
                      className="w-full"
                      variant={mode.key === 'unread' ? 'default' : 'outline'}
                    >
                      {isActive ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Scanning...
                        </>
                      ) : (
                        <>
                          <Inbox className="h-4 w-4 mr-2" />
                          Start Scan
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Sync results + Analyze button */}
          {allSyncItems.length > 0 && !isSyncing && (
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Inbox className="w-4 h-4 text-muted-foreground" />
                    Scan Results — {allSyncItems.length} addresses found
                  </CardTitle>
                  {unanalyzedFromSync.length > 0 && !isAnalyzing && (
                    <Button onClick={handleAnalyzeAll} size="sm">
                      <Zap className="w-4 h-4 mr-2" />
                      Analyze {unanalyzedFromSync.length} New
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {allSyncItems.map((item, idx) => {
                    const analyzeItem = item.id ? analyzedDeals.find(a => a.id === item.id) : null;
                    const isNewDeal = item.action === 'created' || item.action === 'updated_existing';
                    const isDuplicate = item.action === 'skipped_duplicate';
                    const isPortal = item.action === 'skipped_portal';
                    const isOverBudget = item.action === 'skipped_over_budget';
                    const isWrongState = item.action === 'skipped_wrong_state';
                    return (
                      <div
                        key={item.id || `sync-${idx}`}
                        className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                          isNewDeal ? 'hover:bg-muted/50' : 'opacity-60'
                        }`}
                      >
                        {/* Status icon */}
                        <div className="w-5 shrink-0">
                          {analyzeItem?.status === 'analyzing' ? (
                            <Loader2 className="w-4 h-4 text-primary animate-spin" />
                          ) : analyzeItem?.status === 'done' || item.analyzed ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : analyzeItem?.status === 'error' ? (
                            <XCircle className="w-4 h-4 text-destructive" />
                          ) : isDuplicate || isPortal || isOverBudget || isWrongState ? (
                            <XCircle className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <Clock className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>

                        {/* Address */}
                        <div className="flex-1 min-w-0">
                          {item.id ? (
                            <Link
                              to={`/deals/${item.id}`}
                              className="text-sm font-medium hover:text-primary transition-colors truncate block"
                            >
                              {item.address}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium truncate block">
                              {item.address}
                            </span>
                          )}
                          {analyzeItem?.status === 'error' && (
                            <p className="text-xs text-destructive truncate">{analyzeItem.error}</p>
                          )}
                        </div>

                        {/* Action badges */}
                        {isDuplicate && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            כבר קיים
                          </Badge>
                        )}
                        {isPortal && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            פורטל
                          </Badge>
                        )}
                        {isOverBudget && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            מעל תקציב
                          </Badge>
                        )}
                        {isWrongState && (
                          <Badge variant="outline" className="text-xs shrink-0 text-orange-400 border-orange-400/30">
                            <MapPin className="w-3 h-3 mr-1" />
                            סטייט לא מתאים
                          </Badge>
                        )}
                        {item.dealType && isNewDeal && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {item.dealType}
                          </Badge>
                        )}
                        {item.analyzed && !analyzeItem && isNewDeal && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            Already Analyzed
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Analysis progress (persistent across pages) */}
          {isAnalyzing && phase === 'analyzing' && (
            <Card className="border-primary/30 bg-card/50 backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Analyzing Properties...
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {analysisDoneCount + analysisErrorCount} of {totalToAnalyze} complete
                  </span>
                  <span className="font-medium">{Math.round(analysisProgress)}%</span>
                </div>
                <Progress value={analysisProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Analysis continues in background — you can navigate away safely
                </p>
              </CardContent>
            </Card>
          )}

          {/* Quick link to sync progress */}
          {isAnalyzing && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/sync-progress">
                View Full Progress <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          )}

          {/* Last sync summary when no deals */}
          {lastSyncResult && allSyncItems.length === 0 && !isSyncing && (
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="py-8 text-center">
                <Mail className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Scanned {lastSyncResult.totalScanned} emails — no new deals found
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="px-0 mt-2 h-auto"
                  onClick={() => setShowResultsModal(true)}
                >
                  View scan details →
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <SyncResultsModal
        open={showResultsModal}
        onOpenChange={setShowResultsModal}
        results={lastSyncResult}
      />
    </div>
  );
}
