import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface InvestorDealSummary {
  id: string;
  deal_id: string;
  profit_split_percent: number | null;
  preferred_return_percent: number | null;
  visible_strategies: string[];
  deal: {
    id: string;
    address_full: string;
    address_street: string;
    address_city: string;
    status: string;
    created_at: string;
  };
}

export function useInvestorDeals() {
  const [deals, setDeals] = useState<InvestorDealSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDealsForInvestor = useCallback(async (investorId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('deal_investors')
        .select(`
          id,
          deal_id,
          profit_split_percent,
          preferred_return_percent,
          visible_strategies,
          deal:deals(id, address_full, address_street, address_city, status, created_at)
        `)
        .eq('investor_id', investorId);

      if (error) throw error;

      const mapped = (data || []).map(di => ({
        ...di,
        profit_split_percent: di.profit_split_percent ? Number(di.profit_split_percent) : null,
        preferred_return_percent: di.preferred_return_percent ? Number(di.preferred_return_percent) : 15,
        visible_strategies: di.visible_strategies || [],
        deal: di.deal as InvestorDealSummary['deal'],
      }));

      setDeals(mapped);
      return mapped;
    } catch (err) {
      console.error('Error fetching investor deals:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    deals,
    loading,
    fetchDealsForInvestor,
  };
}
