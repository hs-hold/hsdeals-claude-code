import { FINANCIAL_CONFIG } from '@/config/financial';
import type { DealApiData } from '@/types/deal';
import type { LoanDefaults } from '@/context/SettingsContext';

/**
 * Build the per-field default display strings used by override inputs on
 * the deal detail page. Empty input → fall back to one of these strings
 * (so the input shows "what the value would be if you didn't override").
 */
export function buildFieldDisplayDefaults(
  apiData: DealApiData | undefined,
  loanDefaults: LoanDefaults
): Record<string, string> {
  if (!apiData) return {};
  const baseArv = apiData.arv ?? 0;
  const baseRehab = apiData.rehabCost ?? 0;
  const baseRent = apiData.rent ?? 0;
  const basePurchase = apiData.purchasePrice ?? 0;
  return {
    purchasePrice: Math.round(basePurchase).toString(),
    arv: Math.round(baseArv).toString(),
    rehabCost: Math.round(baseRehab).toString(),
    rent: Math.round(baseRent).toString(),
    targetBedrooms: (apiData.bedrooms ?? 0).toString(),
    targetBathrooms: (apiData.bathrooms ?? 0).toString(),
    downPaymentPercent: loanDefaults.downPaymentPercent.toString(),
    interestRate: loanDefaults.interestRate.toString(),
    loanTermYears: loanDefaults.loanTermYears.toString(),
    holdingMonths: loanDefaults.holdingMonths.toString(),
    closingCostsPercent: loanDefaults.closingCostsPercent.toString(),
    contingencyPercent: loanDefaults.contingencyPercent.toString(),
    agentCommissionPercent: loanDefaults.agentCommissionPercent.toString(),
    propertyManagementPercent: loanDefaults.propertyManagementPercent.toString(),
    maintenanceVacancyPercent: loanDefaults.maintenanceVacancyPercent.toString(),
    capexPercent: loanDefaults.capexPercent.toString(),
    hmlLtvPurchasePercent: loanDefaults.hmlLtvPurchasePercent.toString(),
    hmlLtvRehabPercent: loanDefaults.hmlLtvRehabPercent.toString(),
    hmlPointsPercent: loanDefaults.hmlPointsPercent.toString(),
    hmlInterestRate: loanDefaults.hmlInterestRate.toString(),
    hmlProcessingFee: loanDefaults.hmlProcessingFee.toString(),
    hmlAppraisalCost: '',
    hmlUnderwritingFee: '',
    hmlOtherFees: '',
    hmlAnnualInsurance: '',
    refiLtvPercent: loanDefaults.refiLtvPercent.toString(),
    refiClosingPercent: loanDefaults.refiClosingPercent.toString(),
    propertyTaxMonthly: Math.round((apiData.propertyTax ?? 0) / 12).toString(),
    insuranceMonthly: Math.round((apiData.insurance ?? 1200) / 12).toString(),
    stateTaxMonthly: '0',
    hoaMonthly: '0',
    utilitiesMonthly: '300',
    notaryFees: FINANCIAL_CONFIG.notaryFeePerSigning.toString(),
    cashNotaryFee: '400',
    titleFees: FINANCIAL_CONFIG.titleFees.toString(),
    hmlLoanType: 'ltc',
    brrrrPhase1Type: 'hml',
  };
}
