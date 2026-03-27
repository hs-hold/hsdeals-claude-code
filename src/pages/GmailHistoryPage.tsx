import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Mail, RefreshCw, CheckCircle, XCircle, AlertCircle, Clock, ArrowUpRight } from 'lucide-react';
import { formatIL as format } from '@/utils/dateFormat';

interface SyncDetail {
  address: string;
  action: 'created' | 'skipped_duplicate' | 'skipped_portal' | 'skipped_over_budget' | 'updated_existing' | 'no_address' | 'error';
  dealId?: string;
  senderEmail?: string;
  senderName?: string;
  subject?: string;
  reason?: string;
  existingDealId?: string;
}

interface SyncHistory {
  id: string;
  synced_at: string;
  total_emails_scanned: number;
  deals_created: number;
  deals_skipped_duplicate: number;
  deals_skipped_portal: number;
  skipped_addresses: string[];
  portal_emails: string[];
  errors: string[];
  details: SyncDetail[];
}

const actionConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  created: { label: 'Created', color: 'bg-green-500/20 text-green-400', icon: CheckCircle },
  skipped_duplicate: { label: 'Duplicate', color: 'bg-yellow-500/20 text-yellow-400', icon: AlertCircle },
  skipped_portal: { label: 'Portal', color: 'bg-blue-500/20 text-blue-400', icon: XCircle },
  skipped_over_budget: { label: 'Over Budget', color: 'bg-red-500/20 text-red-400', icon: XCircle },
  updated_existing: { label: 'Updated', color: 'bg-purple-500/20 text-purple-400', icon: RefreshCw },
  no_address: { label: 'No Address', color: 'bg-muted text-muted-foreground', icon: XCircle },
  error: { label: 'Error', color: 'bg-destructive/20 text-destructive', icon: AlertCircle },
};

export default function GmailHistoryPage() {
  const [history, setHistory] = useState<SyncHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('sync_history')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching sync history:', error);
    } else {
      // Cast details from Json to SyncDetail[]
      const typedData = (data || []).map(item => ({
        ...item,
        details: (item.details as unknown as SyncDetail[]) || [],
      }));
      setHistory(typedData);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Mail className="h-8 w-8 text-primary" />
            Gmail Sync History
          </h1>
          <p className="text-muted-foreground">
            View all email sync operations and their results
          </p>
        </div>
        <Button variant="outline" onClick={fetchHistory}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {history.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {history.reduce((acc, h) => acc + h.deals_created, 0)}
              </div>
              <p className="text-sm text-muted-foreground">Total Deals Created</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {history.reduce((acc, h) => acc + h.total_emails_scanned, 0)}
              </div>
              <p className="text-sm text-muted-foreground">Emails Scanned</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {history.reduce((acc, h) => acc + h.deals_skipped_duplicate, 0)}
              </div>
              <p className="text-sm text-muted-foreground">Duplicates Skipped</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {history.reduce((acc, h) => acc + h.deals_skipped_portal, 0)}
              </div>
              <p className="text-sm text-muted-foreground">Portal Emails Skipped</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History List */}
      {history.length === 0 ? (
        <Card className="bg-card/50">
          <CardContent className="py-12 text-center">
            <Mail className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No sync history yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Connect Gmail and sync emails to see history here
            </p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-4">
          {history.map((sync) => (
            <AccordionItem
              key={sync.id}
              value={sync.id}
              className="border rounded-xl bg-card/50 overflow-hidden"
            >
              <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/30">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span className="font-medium">
                        {format(new Date(sync.synced_at), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                      {sync.deals_created} created
                    </Badge>
                    {sync.deals_skipped_duplicate > 0 && (
                      <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">
                        {sync.deals_skipped_duplicate} duplicates
                      </Badge>
                    )}
                    {sync.deals_skipped_portal > 0 && (
                      <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
                        {sync.deals_skipped_portal} portal
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {sync.total_emails_scanned} emails scanned
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                {sync.details && sync.details.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Sender</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead className="w-[80px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sync.details.map((detail, idx) => {
                        const config = actionConfig[detail.action] || { label: detail.action, color: 'bg-muted text-muted-foreground', icon: AlertCircle };
                        const Icon = config.icon;
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              <Badge className={config.color}>
                                <Icon className="w-3 h-3 mr-1" />
                                {config.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {detail.address || '-'}
                              {detail.reason && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {detail.reason}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm">{detail.senderName || '-'}</p>
                                <p className="text-xs text-muted-foreground">
                                  {detail.senderEmail}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {detail.subject || '-'}
                            </TableCell>
                            <TableCell>
                              {(detail.dealId || detail.existingDealId) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  className="h-8 w-8 p-0"
                                >
                                  <Link to={`/deals/${detail.dealId || detail.existingDealId}`}>
                                    <ArrowUpRight className="w-4 h-4" />
                                  </Link>
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No details available</p>
                )}

                {sync.errors && sync.errors.length > 0 && (
                  <div className="mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm font-medium text-destructive mb-2">Errors:</p>
                    <ul className="text-sm text-destructive/80 space-y-1">
                      {sync.errors.map((err, idx) => (
                        <li key={idx}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
