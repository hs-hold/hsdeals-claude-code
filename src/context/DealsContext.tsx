import React, { createContext, useContext } from 'react';
import { Deal, DealStatus, DealOverrides } from '@/types/deal';
import { useDealsFromDB } from '@/hooks/useDealsFromDB';

interface DealsContextType {
  deals: Deal[];
  isLoading: boolean;
  getDeal: (id: string) => Deal | undefined;
  updateDealStatus: (id: string, status: DealStatus, rejectionReason?: string) => void;
  updateDealOverrides: (id: string, overrides: Partial<DealOverrides>) => void;
  updateDealNotes: (id: string, notes: string) => void;
  analyzeDeal: (id: string) => Promise<any>;
  refreshDealFromApi: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
  toggleDealLock: (id: string) => Promise<void>;
  recalculateAllDealsFinancials: () => Promise<void>;
}

const DealsContext = createContext<DealsContextType | undefined>(undefined);

export function DealsProvider({ children }: { children: React.ReactNode }) {
  const {
    deals,
    isLoading,
    getDeal,
    updateDealStatus,
    updateDealOverrides,
    updateDealNotes,
    analyzeDeal,
    refreshDealFromApi,
    refetch,
    toggleDealLock,
    recalculateAllDealsFinancials,
  } = useDealsFromDB();

  return (
    <DealsContext.Provider value={{
      deals,
      isLoading,
      getDeal,
      updateDealStatus,
      updateDealOverrides,
      updateDealNotes,
      analyzeDeal,
      refreshDealFromApi,
      refetch,
      toggleDealLock,
      recalculateAllDealsFinancials,
    }}>
      {children}
    </DealsContext.Provider>
  );
}

export function useDeals() {
  const context = useContext(DealsContext);
  if (!context) {
    throw new Error('useDeals must be used within a DealsProvider');
  }
  return context;
}
