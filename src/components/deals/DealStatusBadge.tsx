import { DealStatus, DEAL_STATUS_CONFIG } from '@/types/deal';
import { Badge } from '@/components/ui/badge';

const statusToVariant: Record<DealStatus, 'new' | 'analysis' | 'qualified' | 'offer' | 'contract' | 'closed' | 'notRelevant'> = {
  new: 'new',
  under_analysis: 'analysis',
  qualified: 'qualified',
  offer_sent: 'offer',
  under_contract: 'contract',
  closed: 'closed',
  not_relevant: 'notRelevant',
  filtered_out: 'notRelevant',
};

interface DealStatusBadgeProps {
  status: DealStatus;
  className?: string;
}

export function DealStatusBadge({ status, className }: DealStatusBadgeProps) {
  const config = DEAL_STATUS_CONFIG[status];
  
  return (
    <Badge variant={statusToVariant[status]} className={className}>
      {config.label}
    </Badge>
  );
}
