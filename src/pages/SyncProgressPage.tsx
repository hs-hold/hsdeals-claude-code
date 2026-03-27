import { Link } from 'react-router-dom';
import { useSyncAnalyze } from '@/context/SyncAnalyzeContext';
import { useDeals } from '@/context/DealsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DealStatusBadge } from '@/components/deals/DealStatusBadge';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Mail,
} from 'lucide-react';

export default function SyncProgressPage() {
  const {
    isRunning,
    phase,
    syncResult,
    analyzedDeals,
    currentIndex,
    totalToAnalyze,
  } = useSyncAnalyze();
  const { getDeal } = useDeals();

  const doneCount = analyzedDeals.filter(d => d.status === 'done').length;
  const errorCount = analyzedDeals.filter(d => d.status === 'error').length;
  const progressPercent = totalToAnalyze > 0
    ? ((doneCount + errorCount) / totalToAnalyze) * 100
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Zap className="w-7 h-7 text-orange-400" />
          Sync & Analyze
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {phase === 'syncing' && 'Syncing emails from the last 7 days...'}
          {phase === 'analyzing' && `Analyzing properties ${doneCount + errorCount + 1} of ${totalToAnalyze}...`}
          {phase === 'done' && 'Sync & Analyze complete!'}
          {phase === 'idle' && 'No sync in progress. Start from the Dashboard.'}
        </p>
      </div>

      {/* Sync Summary */}
      {syncResult && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Sync Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Scanned</p>
                <p className="text-lg font-bold">{syncResult.totalScanned}</p>
              </div>
              <div>
                <p className="text-muted-foreground">New Deals</p>
                <p className="text-lg font-bold text-green-400">{syncResult.processed}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Duplicates</p>
                <p className="text-lg font-bold text-yellow-400">{syncResult.skippedDuplicate}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Portal Skipped</p>
                <p className="text-lg font-bold text-muted-foreground">{syncResult.skippedPortal}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis Progress */}
      {totalToAnalyze > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {phase === 'done'
                ? `Completed: ${doneCount} analyzed, ${errorCount} failed`
                : `Analyzing deals...`}
            </span>
            <span className="font-medium">{doneCount + errorCount}/{totalToAnalyze}</span>
          </div>
          <Progress value={progressPercent} className="h-3" />
        </div>
      )}

      {/* Deals List */}
      {analyzedDeals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Analyzed Properties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {analyzedDeals.map((item, index) => {
                const deal = getDeal(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    {/* Status icon */}
                    <div className="w-5 shrink-0">
                      {item.status === 'done' && (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      )}
                      {item.status === 'analyzing' && (
                        <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                      )}
                      {item.status === 'pending' && (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                      {item.status === 'error' && (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>

                    {/* Address */}
                    <div className="flex-1 min-w-0">
                      {item.status === 'done' && deal ? (
                        <Link
                          to={`/deals/${item.id}`}
                          className="text-sm font-medium hover:text-orange-400 transition-colors truncate block"
                        >
                          {item.address}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium truncate">{item.address}</p>
                      )}
                      {item.status === 'error' && (
                        <p className="text-xs text-red-400 truncate">{item.error}</p>
                      )}
                    </div>

                    {/* Deal status badge */}
                    {item.status === 'done' && deal && (
                      <DealStatusBadge status={deal.status} />
                    )}

                    {/* Index */}
                    <span className="text-xs text-muted-foreground shrink-0">
                      #{index + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {phase === 'idle' && (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No sync in progress. Go to the Dashboard and click "Sync & Analyze" to start.
            </p>
            <Button variant="outline" className="mt-4" asChild>
              <Link to="/">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
