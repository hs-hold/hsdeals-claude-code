import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInvestorDeals } from '@/hooks/useInvestorDeals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, Eye, MapPin, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InvestorDealsPanelProps {
  investorId: string;
  investorName: string;
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  analyzing: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  qualified: 'bg-green-500/10 text-green-500 border-green-500/20',
  offer_sent: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  negotiating: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  closed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  not_relevant: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

export function InvestorDealsPanel({ investorId, investorName }: InvestorDealsPanelProps) {
  const navigate = useNavigate();
  const { deals, loading, fetchDealsForInvestor } = useInvestorDeals();

  useEffect(() => {
    fetchDealsForInvestor(investorId);
  }, [investorId, fetchDealsForInvestor]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Home className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No deals assigned to this investor</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-sm text-muted-foreground">
          Assigned Deals ({deals.length})
        </h4>
      </div>
      
      {deals.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{item.deal.address_street}</p>
              <p className="text-xs text-muted-foreground">{item.deal.address_city}</p>
            </div>
            <Badge 
              variant="outline" 
              className={cn("text-xs shrink-0", STATUS_COLORS[item.deal.status] || '')}
            >
              {item.deal.status}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-xs text-muted-foreground text-right mr-2">
              <span>Pref: {item.preferred_return_percent}%</span>
              <span className="mx-1">|</span>
              <span>Split: {item.profit_split_percent || 50}%</span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/deals/${item.deal_id}`)}
              className="h-8"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Details
            </Button>
            
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate(`/investor/deals/${item.deal_id}`)}
              className="h-8"
            >
              <Eye className="w-3 h-3 mr-1" />
              Investor View
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
