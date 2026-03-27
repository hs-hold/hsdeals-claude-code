import { useDeals } from '@/context/DealsContext';
import { DealsTable } from '@/components/deals/DealsTable';

export default function ClosedDealsPage() {
  const { deals } = useDeals();
  const closedDeals = deals.filter(d => d.status === 'closed');

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Closed Deals</h1>
          <p className="text-muted-foreground">
            Deals you've successfully closed
          </p>
        </div>
      </div>

      {/* Closed Deals Table */}
      {closedDeals.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No closed deals yet</p>
          <p className="text-sm mt-1">Deals you mark as closed will appear here</p>
        </div>
      ) : (
        <DealsTable deals={closedDeals} excludeStatuses={[]} showCloseAction={false} />
      )}
    </div>
  );
}
