import { useSearchParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PropertyAnalyzer } from '@/components/deals/PropertyAnalyzer';
import { MarketSearch } from '@/components/deals/MarketSearch';
import { MapPin, Search, ScanLine } from 'lucide-react';

export default function AnalyzePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const prefilledAddress = searchParams.get('address') || '';

  const defaultTab = 'address';

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analyze Property</h1>
          <p className="text-muted-foreground">Enter an address or search for properties in the market</p>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="address" className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            By Address
          </TabsTrigger>
          <TabsTrigger value="market" className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Market Search
          </TabsTrigger>
          <TabsTrigger value="scan" className="flex items-center gap-2" onClick={() => navigate('/analyze/market-scan')}>
            <ScanLine className="w-4 h-4" />
            Market Scan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="address">
          <PropertyAnalyzer initialAddress={prefilledAddress} />
        </TabsContent>

        <TabsContent value="market">
          <MarketSearch />
        </TabsContent>

        <TabsContent value="scan">
          {/* Navigates away via the tab trigger click */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
