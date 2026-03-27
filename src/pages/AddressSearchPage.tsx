import { useSearchParams } from 'react-router-dom';
import { PropertyAnalyzer } from '@/components/deals/PropertyAnalyzer';

export default function AddressSearchPage() {
  const [searchParams] = useSearchParams();
  const prefilledAddress = searchParams.get('address') || '';

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Search by Address</h1>
        <p className="text-muted-foreground">Enter a property address to analyze</p>
      </div>
      <PropertyAnalyzer initialAddress={prefilledAddress} />
    </div>
  );
}
