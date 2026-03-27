import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Investor {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  strategies: string[];
  profit_split_percent: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvestorInput {
  name: string;
  email: string;
  phone?: string;
  strategies?: string[];
  profit_split_percent?: number;
  notes?: string;
}

export function useInvestors() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvestors = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('investors')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Map database fields to our interface
      const mapped = (data || []).map(inv => ({
        ...inv,
        strategies: inv.strategies || [],
        profit_split_percent: Number(inv.profit_split_percent) || 50,
      }));
      
      setInvestors(mapped);
      setError(null);
    } catch (err) {
      console.error('Error fetching investors:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch investors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvestors();
  }, [fetchInvestors]);

  const addInvestor = useCallback(async (input: InvestorInput) => {
    const { data, error } = await supabase
      .from('investors')
      .insert({
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        strategies: input.strategies || [],
        profit_split_percent: input.profit_split_percent ?? 50,
        notes: input.notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    await fetchInvestors();
    return data;
  }, [fetchInvestors]);

  const updateInvestor = useCallback(async (id: string, input: Partial<InvestorInput>) => {
    const { error } = await supabase
      .from('investors')
      .update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.strategies !== undefined && { strategies: input.strategies }),
        ...(input.profit_split_percent !== undefined && { profit_split_percent: input.profit_split_percent }),
        ...(input.notes !== undefined && { notes: input.notes }),
      })
      .eq('id', id);

    if (error) throw error;
    await fetchInvestors();
  }, [fetchInvestors]);

  const deleteInvestor = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('investors')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await fetchInvestors();
  }, [fetchInvestors]);

  const getInvestor = useCallback((id: string) => {
    return investors.find(inv => inv.id === id);
  }, [investors]);

  return {
    investors,
    loading,
    error,
    addInvestor,
    updateInvestor,
    deleteInvestor,
    getInvestor,
    refetch: fetchInvestors,
  };
}
