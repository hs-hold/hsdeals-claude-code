import { useMemo } from 'react';
import { useDeals } from '@/context/DealsContext';
import { DealsTable } from '@/components/deals/DealsTable';
import { getAnalyzedDeals } from '@/utils/dealHelpers';

export default function DealsListPage() {
  const { deals } = useDeals();

  // Filter to show only analyzed deals (excludes not_relevant and closed in DealsTable)
  const analyzedDeals = useMemo(() => getAnalyzedDeals(deals), [deals]);

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analyzed Deals</h1>
          <p className="text-muted-foreground">
            Deals that have been analyzed • Review and manage your pipeline
          </p>
        </div>
      </div>

      {/* Deals Table - hide Analyze button since these are already analyzed */}
      <DealsTable 
        deals={analyzedDeals} 
        excludeStatuses={['not_relevant', 'closed']} 
        showAnalyzeButton={false}
      />
    </div>
  );
}
