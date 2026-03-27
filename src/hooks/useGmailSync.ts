import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

interface SyncResult {
  success: boolean;
  processed: number;
  deals: any[];
  skippedDuplicate: number;
  skippedPortal: number;
  totalScanned: number;
  olderMarkedRead: number;
  syncDetails: SyncDetail[];
  syncHistoryId?: string;
  errors?: string[];
  message?: string;
}
interface SyncOptions {
  maxResults?: number;
  sinceDays?: number;
  markAllRead?: boolean;
  includeRead?: boolean;
  targetState?: string;
}

export function useGmailSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const { toast } = useToast();

  const sync = useCallback(async (accessToken: string, options?: SyncOptions): Promise<SyncResult | null> => {
    const { maxResults = 50, sinceDays, markAllRead = false, includeRead = false, targetState } = options || {};
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-sync', {
        body: { access_token: accessToken, max_results: maxResults, since_days: sinceDays, mark_all_read: markAllRead, include_read: includeRead, target_state: targetState }
      });

      if (error) throw error;
      
      // Ensure all expected fields exist with defaults
      const result: SyncResult = {
        success: data.success ?? false,
        processed: data.processed ?? 0,
        deals: data.deals ?? [],
        skippedDuplicate: data.skippedDuplicate ?? 0,
        skippedPortal: data.skippedPortal ?? 0,
        totalScanned: data.totalScanned ?? 0,
        olderMarkedRead: data.olderMarkedRead ?? 0,
        syncDetails: data.syncDetails ?? [],
        syncHistoryId: data.syncHistoryId,
        errors: data.errors,
        message: data.message,
      };

      setLastSyncResult(result);

      if (result.success) {
        const parts = [];
        if (result.processed > 0) {
          parts.push(`${result.processed} new deal${result.processed > 1 ? 's' : ''} created`);
        }
        if (result.skippedDuplicate > 0) {
          parts.push(`${result.skippedDuplicate} duplicate${result.skippedDuplicate > 1 ? 's' : ''} skipped`);
        }
        if (result.skippedPortal > 0) {
          parts.push(`${result.skippedPortal} portal email${result.skippedPortal > 1 ? 's' : ''} skipped`);
        }

        if (parts.length > 0) {
          toast({
            title: "Sync Complete",
            description: parts.join(', '),
          });
        } else if (result.message) {
          toast({
            title: "Sync Complete",
            description: result.message,
          });
        } else if (result.totalScanned === 0) {
          toast({
            title: "Sync Complete",
            description: "No unread emails found",
          });
        } else {
          toast({
            title: "Sync Complete",
            description: `Scanned ${result.totalScanned} emails, no new deals found`,
          });
        }

        if (result.errors?.length) {
          console.warn('Sync errors:', result.errors);
        }
      } else {
        throw new Error(data.error || 'Sync failed');
      }

      return result;
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync emails",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [toast]);

  return {
    isSyncing,
    lastSyncResult,
    sync,
  };
}
