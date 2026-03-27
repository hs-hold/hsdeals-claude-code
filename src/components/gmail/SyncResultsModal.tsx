import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, XCircle, AlertCircle, RefreshCw, ArrowUpRight, Mail } from 'lucide-react';

interface SyncDetail {
  address: string;
  action: 'created' | 'skipped_duplicate' | 'skipped_portal' | 'skipped_over_budget' | 'skipped_wrong_state' | 'updated_existing' | 'no_address' | 'error';
  dealId?: string;
  senderEmail?: string;
  senderName?: string;
  subject?: string;
  reason?: string;
  existingDealId?: string;
}

interface SyncResultsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: {
    processed: number;
    skippedDuplicate: number;
    skippedPortal: number;
    totalScanned: number;
    syncDetails: SyncDetail[];
    deals: any[];
  } | null;
}

const actionConfig: Record<string, { label: string; color: string; icon: any }> = {
  created: { label: 'Created', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle },
  skipped_duplicate: { label: 'Duplicate', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: AlertCircle },
  skipped_portal: { label: 'Portal', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: XCircle },
  skipped_over_budget: { label: 'Over Budget', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
  skipped_wrong_state: { label: 'Wrong State', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: XCircle },
  updated_existing: { label: 'Updated', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: RefreshCw },
  no_address: { label: 'No Address', color: 'bg-muted text-muted-foreground border-border', icon: XCircle },
  error: { label: 'Error', color: 'bg-destructive/20 text-destructive border-destructive/30', icon: AlertCircle },
};

export function SyncResultsModal({ open, onOpenChange, results }: SyncResultsModalProps) {
  if (!results) return null;

  const { processed, skippedDuplicate, skippedPortal, totalScanned, syncDetails } = results;

  // Group details by action
  const created = syncDetails.filter(d => d.action === 'created');
  const updated = syncDetails.filter(d => d.action === 'updated_existing');
  const duplicates = syncDetails.filter(d => d.action === 'skipped_duplicate');
  const portals = syncDetails.filter(d => d.action === 'skipped_portal');
  const noAddress = syncDetails.filter(d => d.action === 'no_address');
  const overBudget = syncDetails.filter(d => d.action === 'skipped_over_budget');
  const wrongState = syncDetails.filter(d => d.action === 'skipped_wrong_state');
  const errors = syncDetails.filter(d => d.action === 'error');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Sync Results
          </DialogTitle>
          <DialogDescription>
            Scanned {totalScanned} emails
          </DialogDescription>
        </DialogHeader>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2 py-2">
          <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            {processed} Created
          </Badge>
          {updated.length > 0 && (
            <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <RefreshCw className="w-3 h-3 mr-1" />
              {updated.length} Updated
            </Badge>
          )}
          {skippedDuplicate > 0 && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              <AlertCircle className="w-3 h-3 mr-1" />
              {skippedDuplicate} Duplicates
            </Badge>
          )}
          {skippedPortal > 0 && (
            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <XCircle className="w-3 h-3 mr-1" />
              {skippedPortal} Portal Emails
            </Badge>
          )}
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {/* Created deals */}
            {created.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-green-400 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  New Deals Created ({created.length})
                </h4>
                <div className="space-y-2">
                  {created.map((detail, idx) => (
                    <SyncDetailRow key={idx} detail={detail} />
                  ))}
                </div>
              </div>
            )}

            {/* Updated deals */}
            {updated.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-purple-400 mb-2 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Deals Updated ({updated.length})
                </h4>
                <div className="space-y-2">
                  {updated.map((detail, idx) => (
                    <SyncDetailRow key={idx} detail={detail} />
                  ))}
                </div>
              </div>
            )}

            {/* Duplicates */}
            {duplicates.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-yellow-400 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Skipped - Duplicates ({duplicates.length})
                </h4>
                <div className="space-y-2">
                  {duplicates.map((detail, idx) => (
                    <SyncDetailRow key={idx} detail={detail} />
                  ))}
                </div>
              </div>
            )}

            {/* Portal emails */}
            {portals.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-blue-400 mb-2 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Skipped - Portal Emails ({portals.length})
                </h4>
                <div className="space-y-2">
                  {portals.map((detail, idx) => (
                    <SyncDetailRow key={idx} detail={detail} showSubject />
                  ))}
                </div>
              </div>
            )}

            {/* Over budget */}
            {overBudget.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-red-400 mb-2 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Skipped - Over $300K ({overBudget.length})
                </h4>
                <div className="space-y-2">
                  {overBudget.map((detail, idx) => (
                    <SyncDetailRow key={idx} detail={detail} />
                  ))}
                </div>
              </div>
            )}

            {/* Wrong state */}
            {wrongState.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-orange-400 mb-2 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Skipped - Wrong State ({wrongState.length})
                </h4>
                <div className="space-y-2">
                  {wrongState.map((detail, idx) => (
                    <SyncDetailRow key={idx} detail={detail} />
                  ))}
                </div>
              </div>
            )}

            {/* No address found */}
            {noAddress.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Skipped - No Address Found ({noAddress.length})
                </h4>
                <div className="space-y-2">
                  {noAddress.map((detail, idx) => (
                    <SyncDetailRow key={idx} detail={detail} showSubject />
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {errors.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-destructive mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Errors ({errors.length})
                </h4>
                <div className="space-y-2">
                  {errors.map((detail, idx) => (
                    <SyncDetailRow key={idx} detail={detail} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {syncDetails.length === 0 && (
              <div className="text-center py-8">
                <Mail className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No emails processed</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" asChild>
            <Link to="/gmail-history">View Full History</Link>
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SyncDetailRow({ detail, showSubject = false }: { detail: SyncDetail; showSubject?: boolean }) {
  const config = actionConfig[detail.action];
  
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">
            {detail.address || (showSubject ? detail.subject : 'Unknown')}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          {detail.senderName && <span>{detail.senderName}</span>}
          {detail.senderEmail && <span>({detail.senderEmail})</span>}
        </div>
        {detail.reason && (
          <p className="text-xs text-muted-foreground/70 mt-1">{detail.reason}</p>
        )}
      </div>
      {(detail.dealId || detail.existingDealId) && (
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-8 w-8 p-0 shrink-0"
        >
          <Link to={`/deals/${detail.dealId || detail.existingDealId}`}>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}
