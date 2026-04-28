import type { DealOverrides } from '@/types/deal';

/**
 * Convert the string-based localOverrides state used by DealDetailPage
 * into the numeric DealOverrides shape consumed by calculateFinancials.
 *
 * Empty/zero strings become null (so calculateFinancials falls back to defaults).
 * `hmlLoanType` and `brrrrPhase1Type` are kept as strings, defaulting to null
 * when set to their respective default values.
 */
export type NumericOverrides = DealOverrides & {
  closingCostsSalePercent: number | null;
  closingCostsSaleDollar: number | null;
  cashNotaryFee: number | null;
};

export function localOverridesToNumeric(
  localOverrides: Record<string, string>
): NumericOverrides {
  const num = (key: string): number | null =>
    localOverrides[key] ? parseFloat(localOverrides[key]) : null;

  return {
    arv: num('arv'),
    rent: num('rent'),
    rehabCost: num('rehabCost'),
    purchasePrice: num('purchasePrice'),
    downPaymentPercent: num('downPaymentPercent'),
    interestRate: num('interestRate'),
    loanTermYears: num('loanTermYears'),
    targetBedrooms: num('targetBedrooms'),
    targetBathrooms: num('targetBathrooms'),
    holdingMonths: num('holdingMonths'),
    propertyTaxMonthly: num('propertyTaxMonthly'),
    insuranceMonthly: num('insuranceMonthly'),
    rentalInsuranceMonthly: num('rentalInsuranceMonthly'),
    stateTaxMonthly: num('stateTaxMonthly'),
    hoaMonthly: num('hoaMonthly'),
    utilitiesMonthly: num('utilitiesMonthly'),
    propertyManagementPercent: num('propertyManagementPercent'),
    maintenanceVacancyPercent: num('maintenanceVacancyPercent'),
    closingCostsPercent: num('closingCostsPercent'),
    closingCostsDollar: num('closingCostsDollar'),
    closingCostsSalePercent: num('closingCostsSalePercent'),
    closingCostsSaleDollar: num('closingCostsSaleDollar'),
    contingencyPercent: num('contingencyPercent'),
    agentCommissionPercent: num('agentCommissionPercent'),
    notaryFees: num('notaryFees'),
    cashNotaryFee: num('cashNotaryFee'),
    titleFees: num('titleFees'),
    hmlLoanType:
      localOverrides.hmlLoanType && localOverrides.hmlLoanType !== 'ltc'
        ? localOverrides.hmlLoanType
        : null,
    brrrrPhase1Type:
      localOverrides.brrrrPhase1Type && localOverrides.brrrrPhase1Type !== 'hml'
        ? localOverrides.brrrrPhase1Type
        : null,
    hmlLtvPurchasePercent: num('hmlLtvPurchasePercent'),
    hmlLtvRehabPercent: num('hmlLtvRehabPercent'),
    hmlPointsPercent: num('hmlPointsPercent'),
    hmlInterestRate: num('hmlInterestRate'),
    hmlProcessingFee: num('hmlProcessingFee'),
    hmlAppraisalCost: num('hmlAppraisalCost'),
    hmlUnderwritingFee: num('hmlUnderwritingFee'),
    hmlOtherFees: num('hmlOtherFees'),
    hmlAnnualInsurance: num('hmlAnnualInsurance'),
    refiLenderName: localOverrides.refiLenderName || null,
    refiLtvPercent: num('refiLtvPercent'),
    refiInterestRate: num('refiInterestRate'),
    refiAppraisalCost: num('refiAppraisalCost'),
    refiUnderwritingFee: num('refiUnderwritingFee'),
    refiPointsPercent: num('refiPointsPercent'),
    refiOtherFees: num('refiOtherFees'),
    refiClosingPercent: num('refiClosingPercent'),
    capexPercent: num('capexPercent'),
    lotSizeSqft: num('lotSizeSqft'),
    holdingOtherMonthly: num('holdingOtherMonthly'),
    inventoryMonths: num('inventoryMonths'),
    rentalAppraisalCost: num('rentalAppraisalCost'),
    rentalUnderwritingFee: num('rentalUnderwritingFee'),
    rentalPointsPercent: num('rentalPointsPercent'),
    rentalOtherFees: num('rentalOtherFees'),
  };
}
