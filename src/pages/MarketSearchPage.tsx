import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MarketSearch } from '@/components/deals/MarketSearch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Zap, Loader2, Search } from 'lucide-react';

const QUICK_SEARCH_FILTERS = {
  homeType: 'SingleFamily',
  listType: 'for-sale',
  minPrice: 80000,
  maxPrice: 250000,
  minBeds: 2,
  maxBeds: 4,
  minBaths: 1,
  minSqft: 1150,
  maxSqft: 2300,
};

export default function MarketSearchPage() {
  const navigate = useNavigate();
  const [zipCode, setZipCode] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);

  const handleQuickSearch = async () => {
    const trimmed = zipCode.trim();
    if (!trimmed) {
      toast.error('Please enter a ZIP code');
      return;
    }

    setQuickLoading(true);
    try {
      const filters = { ...QUICK_SEARCH_FILTERS, location: trimmed };
      const { data, error } = await supabase.functions.invoke('zillow-search', {
        body: filters,
      });

      if (error) {
        toast.error('Search service is currently unavailable. Please try again later.');
        return;
      }

      if (data?.success) {
        if (data.properties?.length === 0) {
          toast.warning('No properties found. If this keeps happening for multiple ZIP codes, check your RapidAPI subscription for zillow-com1.');
        } else {
          toast.success(`Found ${data.properties?.length} properties`);
          navigate('/market-search-results', {
            state: {
              results: data.properties,
              totalResults: data.totalResultCount,
              rawResponse: data,
              searchFilters: filters,
            },
          });
        }
      } else {
        toast.error(data?.error || 'Search failed');
      }
    } catch (err) {
      console.error('Quick search error:', err);
      toast.error('Failed to connect to search service');
    } finally {
      setQuickLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Market Search</h1>
        <p className="text-muted-foreground">Search for properties in the market</p>
      </div>

      {/* Quick ZIP Search */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="w-5 h-5 text-primary" />
            Quick Search by ZIP Code
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter a ZIP code to instantly search with preset filters (Single Family, $80K-$250K, 2-4 beds, 1+ bath, 1,150-2,300 sqft)
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1 max-w-xs">
              <Input
                placeholder="Enter ZIP code (e.g., 30032)"
                value={zipCode}
                onChange={e => setZipCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleQuickSearch()}
              />
            </div>
            <Button onClick={handleQuickSearch} disabled={quickLoading} size="lg">
              {quickLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Full Search */}
      <MarketSearch />
    </div>
  );
}
