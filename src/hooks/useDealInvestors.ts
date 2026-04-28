import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DealInvestor {
  id: string;
  deal_id: string;
  investor_id: string;
  profit_split_percent: number | null;
  preferred_return_percent: number | null;
  visible_strategies: string[];
  notes: string | null;
  investor_notes: string | null;
  created_at: string;
  investor?: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    profit_split_percent: number;
  };
}

export interface AssignInvestorInput {
  deal_id: string;
  investor_id: string;
  profit_split_percent?: number;
  preferred_return_percent?: number;
  visible_strategies?: string[];
  notes?: string;
}

export function useDealInvestors(dealId?: string) {
  const [dealInvestors, setDealInvestors] = useState<DealInvestor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDealInvestors = useCallback(async () => {
    if (!dealId) {
      setDealInvestors([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('deal_investors')
        .select(`
          *,
          investor:investors(id, name, email, phone, profit_split_percent)
        `)
        .eq('deal_id', dealId);

      if (error) throw error;
      
      const mapped = (data || []).map(di => ({
        ...di,
        profit_split_percent: di.profit_split_percent ? Number(di.profit_split_percent) : null,
        preferred_return_percent: di.preferred_return_percent ? Number(di.preferred_return_percent) : 15,
        visible_strategies: di.visible_strategies || [],
        investor_notes: di.investor_notes || null,
        investor: di.investor ? {
          ...di.investor,
          profit_split_percent: Number(di.investor.profit_split_percent),
        } : undefined,
      }));
      
      setDealInvestors(mapped);
    } catch (err) {
      console.error('Error fetching deal investors:', err);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchDealInvestors();
  }, [fetchDealInvestors]);

  const assignInvestor = useCallback(async (input: AssignInvestorInput) => {
    const { data, error } = await supabase
      .from('deal_investors')
      .insert({
        deal_id: input.deal_id,
        investor_id: input.investor_id,
        profit_split_percent: input.profit_split_percent ?? null,
        preferred_return_percent: input.preferred_return_percent ?? 15,
        visible_strategies: input.visible_strategies || ['flip', 'rental', 'brrrr'],
        notes: input.notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    await fetchDealInvestors();
    return data;
  }, [fetchDealInvestors]);

  const updateDealInvestor = useCallback(async (
    id: string, 
    updates: Partial<Pick<DealInvestor, 'profit_split_percent' | 'preferred_return_percent' | 'visible_strategies' | 'notes'>>
  ) => {
    const { error } = await supabase
      .from('deal_investors')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    await fetchDealInvestors();
  }, [fetchDealInvestors]);

  const removeInvestor = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('deal_investors')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await fetchDealInvestors();
  }, [fetchDealInvestors]);

  const updateInvestorNotes = useCallback(async (id: string, investorNotes: string) => {
    const { error } = await supabase
      .from('deal_investors')
      .update({ investor_notes: investorNotes })
      .eq('id', id);

    if (error) throw error;
    await fetchDealInvestors();
  }, [fetchDealInvestors]);

  return {
    dealInvestors,
    loading,
    assignInvestor,
    updateDealInvestor,
    removeInvestor,
    updateInvestorNotes,
    refetch: fetchDealInvestors,
  };
}
