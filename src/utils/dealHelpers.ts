import { Deal } from '@/types/deal';

/**
 * Check if a deal has been analyzed (has meaningful API data).
 * A deal is considered analyzed if:
 *   - It has financial values (arv/purchasePrice/rent > 0), OR
 *   - It has any rawResponse (was sent through the Partners/DealBeast API), OR
 *   - It has an aiSummary or grade (analysis was returned even if numbers are missing)
 */
export function isDealAnalyzed(deal: Deal): boolean {
  const apiData = deal.apiData;
  if (!apiData) return false;
  if (Object.keys(apiData).length === 0) return false;

  // Financial values present
  if (apiData.arv !== null && apiData.arv > 0) return true;
  if (apiData.purchasePrice !== null && apiData.purchasePrice > 0) return true;
  if (apiData.rent !== null && apiData.rent > 0) return true;

  // API was called and returned a response (even if numeric fields are 0/null)
  if (apiData.rawResponse && typeof apiData.rawResponse === 'object' &&
      Object.keys(apiData.rawResponse).length > 0) return true;

  // Grade or AI summary present
  if (apiData.grade) return true;
  if (apiData.aiSummary) return true;

  return false;
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
