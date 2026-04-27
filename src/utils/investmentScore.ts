// BRRRR Investment Decision Score
// Scores a BRRRR deal on 3 parameters (1–10 each), final = weighted average.
// Score >= buyThreshold → Buy, else Pass.

export interface InvestmentScoreSettings {
  buyThreshold: number;      // default 7.0
  cashFlowWeight: number;    // relative weight (1–100), default 33
  equityWeight: number;      // relative weight (1–100), default 33
  locationWeight: number;    // relative weight (1–100), default 34
}

export const DEFAULT_INVESTMENT_SCORE_SETTINGS: InvestmentScoreSettings = {
  buyThreshold: 7,
  cashFlowWeight: 33,
  equityWeight: 33,
  locationWeight: 34,
};

export interface InvestmentScoreResult {
  cashFlowScore: number;
  monthlyCashFlowScore: number;
  annualReturnScore: number;
  equityScore: number;
  locationScore: number;
  schoolScore: number;
  inventoryScore: number | null;
  finalScore: number;
  decision: 'Buy' | 'Pass';
  isFullBrrrr: boolean;      // cash left in deal ≤ 0 — infinite CoC return
  missingFields: string[];   // fields missing but not fatal (partial score)
  // source values
  monthlyCashflow: number;
  annualReturnPct: number;
  trueEquity: number;
  schoolTotal: number;
  inventoryMonths: number | null;
}

export interface InvestmentScoreParams {
  monthlyCashflow: number | null;
  cashLeftInDeal: number | null;       // used for CoC return denominator
  arv: number;
  purchasePrice: number;
  rehabCost: number;
  schoolTotal: number | null;          // apiData.schoolScore (cumulative up to 30)
  inventoryMonths: number | null;      // manual override, may be null
}

// ─── Linear interpolation from lookup table ──────────────────────────────────

type Table = readonly [number, number][];

function scoreFromTable(value: number, table: Table): number {
  if (value <= table[0][0]) return table[0][1];
  if (value >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (value >= x0 && value <= x1) {
      return y0 + (y1 - y0) * ((value - x0) / (x1 - x0));
    }
  }
  return table[table.length - 1][1];
}

// ─── Score tables ─────────────────────────────────────────────────────────────

const MONTHLY_CF_TABLE: Table = [
  [110, 1], [130, 2], [150, 3], [170, 4], [190, 5],
  [210, 6], [230, 7], [250, 8], [325, 9], [400, 10],
];

const ANNUAL_RETURN_TABLE: Table = [
  [4, 1], [5, 2], [6, 3], [7, 4], [7.5, 5],
  [8, 6], [9, 7], [10, 8], [11, 9], [12, 10],
];

const EQUITY_TABLE: Table = [
  [2000, 1], [6000, 2], [10000, 3], [14000, 4], [18000, 5],
  [22000, 6], [26000, 7], [30000, 8], [40000, 9], [50000, 10],
];

const SCHOOL_TABLE: Table = [
  [0, 1], [1.4, 2], [2.9, 3], [4.3, 4], [5.7, 5],
  [7.1, 6], [8.6, 7], [10, 8], [12.5, 9], [15, 10],
];

// Inventory: lower months = higher score (table sorted ascending by months)
const INVENTORY_TABLE: Table = [
  [2, 10], [3, 9], [4, 8], [4.7, 7], [5.4, 6],
  [6.1, 5], [6.9, 4], [7.6, 3], [8.3, 2], [9, 1],
];

// ─── Individual score functions ───────────────────────────────────────────────

export function calculateMonthlyCashFlowScore(monthly: number): number {
  return scoreFromTable(monthly, MONTHLY_CF_TABLE);
}

export function calculateAnnualReturnScore(pct: number): number {
  return scoreFromTable(pct, ANNUAL_RETURN_TABLE);
}

export function calculateCashFlowScore(monthly: number, annualReturnPct: number): number {
  return (calculateMonthlyCashFlowScore(monthly) + calculateAnnualReturnScore(annualReturnPct)) / 2;
}

export function calculateTrueEquityScore(equity: number): number {
  return scoreFromTable(equity, EQUITY_TABLE);
}

export function calculateSchoolScore(schoolTotal: number): number {
  return scoreFromTable(schoolTotal, SCHOOL_TABLE);
}

export function calculateInventoryScore(months: number): number {
  // Inventory table is NOT monotonically ascending in score, handle specially
  // lower months = higher score, so flip: use descending table
  if (months <= 2) return 10;
  if (months >= 9) return 1;
  return scoreFromTable(months, INVENTORY_TABLE);
}

export function calculateLocationScore(params: {
  schoolTotal: number | null;
  inventoryMonths: number | null;
}): { score: number; schoolScore: number; inventoryScore: number | null } {
  const { schoolTotal, inventoryMonths } = params;
  const schoolScore = schoolTotal != null ? calculateSchoolScore(schoolTotal) : 5; // neutral default
  if (inventoryMonths == null) {
    return { score: schoolScore, schoolScore, inventoryScore: null };
  }
  const inventoryScore = calculateInventoryScore(inventoryMonths);
  const score = schoolScore * 0.6 + inventoryScore * 0.4;
  return { score, schoolScore, inventoryScore };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function calculateInvestmentScore(
  params: InvestmentScoreParams,
  settings: InvestmentScoreSettings = DEFAULT_INVESTMENT_SCORE_SETTINGS,
): InvestmentScoreResult | null {
  const { monthlyCashflow, cashLeftInDeal, arv, purchasePrice, rehabCost, schoolTotal, inventoryMonths } = params;

  if (monthlyCashflow == null || !arv || !purchasePrice) return null;

  // Annual return on invested cash (CoC)
  const annualCashflow = monthlyCashflow * 12;
  const annualReturnPct =
    cashLeftInDeal != null && cashLeftInDeal > 0
      ? (annualCashflow / cashLeftInDeal) * 100
      : cashLeftInDeal != null && cashLeftInDeal <= 0
        ? 999 // full BRRRR — infinite return, cap to max score
        : 0;

  const monthlyCashFlowScore = calculateMonthlyCashFlowScore(monthlyCashflow);
  const isFullBrrrr = cashLeftInDeal != null && cashLeftInDeal <= 0;
  const annualReturnScore = isFullBrrrr ? 10 : calculateAnnualReturnScore(Math.min(annualReturnPct, 12));
  const cashFlowScore = (monthlyCashFlowScore + annualReturnScore) / 2;

  const trueEquity = arv - purchasePrice - rehabCost;
  const equityScore = calculateTrueEquityScore(trueEquity);

  const location = calculateLocationScore({ schoolTotal, inventoryMonths });
  const locationScore = location.score;

  const wCF = settings.cashFlowWeight;
  const wEQ = settings.equityWeight;
  const wLO = settings.locationWeight;
  const totalWeight = wCF + wEQ + wLO || 1;
  const finalScore = (cashFlowScore * wCF + equityScore * wEQ + locationScore * wLO) / totalWeight;

  const missingFields: string[] = [];
  if (schoolTotal == null) missingFields.push('School score');
  if (inventoryMonths == null) missingFields.push('Inventory months');

  return {
    cashFlowScore,
    monthlyCashFlowScore,
    annualReturnScore,
    equityScore,
    locationScore,
    schoolScore: location.schoolScore,
    inventoryScore: location.inventoryScore,
    finalScore,
    decision: finalScore >= settings.buyThreshold ? 'Buy' : 'Pass',
    isFullBrrrr,
    missingFields,
    monthlyCashflow,
    annualReturnPct: Math.min(annualReturnPct, 999),
    trueEquity,
    schoolTotal: schoolTotal ?? 0,
    inventoryMonths: inventoryMonths ?? null,
  };
}
