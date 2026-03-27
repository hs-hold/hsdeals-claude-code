import { Deal } from '@/types/deal';

/**
 * Check if a deal has been analyzed (has meaningful API data)
 * A deal is considered analyzed if it has ARV or purchasePrice from API
 */
export function isDealAnalyzed(deal: Deal): boolean {
  const apiData = deal.apiData;
  if (!apiData) return false;
  
  // Check for meaningful analysis data - ARV or purchasePrice indicates analysis was done
  const hasArv = apiData.arv !== null && apiData.arv > 0;
  const hasPurchasePrice = apiData.purchasePrice !== null && apiData.purchasePrice > 0;
  const hasRent = apiData.rent !== null && apiData.rent > 0;
  
  // A deal is analyzed if it has at least ARV or purchasePrice
  return hasArv || hasPurchasePrice || hasRent;
}

/**
 * Filter deals that haven't been analyzed yet
 */
export function getUnanalyzedDeals(deals: Deal[]): Deal[] {
  return deals.filter(deal => !isDealAnalyzed(deal));
}

/**
 * Filter deals that have been analyzed
 */
export function getAnalyzedDeals(deals: Deal[]): Deal[] {
  return deals.filter(deal => isDealAnalyzed(deal));
}
