import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ZipMarketData {
  zipCode: string;
  city: string;
  state: string;
  marketTemperature: 'hot' | 'warm' | 'neutral' | 'cool' | 'cold';
  marketTemperatureScore: number;
  medianHomePrice: number | null;
  medianHomePriceTrend: string | null;
  avgDaysOnMarket: number | null;
  listingsCount: number | null;
  avgRent: number | null;
  rentTrend: string | null;
  vacancyRate: string | null;
  medianHouseholdIncome: number | null;
  unemploymentRate: string | null;
  populationTrend: string | null;
  schoolRating: number | null;
  crimeLevel: string | null;
  economicStrength: string | null;
  investorScore: number;
  priceToRentRatio: number | null;
  appreciation5yr: string | null;
  keyInsights: string[];
  risks: string[];
  sources: string[];
  researchedAt: string;
}

export function useZipMarketData(zipCode: string | null | undefined) {
  const [data, setData] = useState<ZipMarketData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanZip = zipCode?.trim().substring(0, 5);

  // Load from cache on mount
  useEffect(() => {
    if (!cleanZip || cleanZip.length < 5) return;

    (async () => {
      const { data: cached } = await supabase
        .from('zip_market_data')
        .select('market_data')
        .eq('zip_code', cleanZip)
        .single();

      if (cached?.market_data) {
        setData(cached.market_data as ZipMarketData);
      }
    })();
  }, [cleanZip]);

  const fetchMarketData = async (forceRefresh = false) => {
    if (!cleanZip || cleanZip.length < 5) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('zip-market-research', {
        body: { zip_code: cleanZip, force_refresh: forceRefresh },
      });

      if (fnError) throw new Error(fnError.message);
      if (!result?.success) throw new Error(result?.error || 'Research failed');

      setData(result.data as ZipMarketData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch market data');
    } finally {
      setIsLoading(false);
    }
  };

  return { data, isLoading, error, fetchMarketData };
}
