import type {
  CompPrecisionComp,
  ComparisonToSubject,
  SaleComp,
} from '@/types/deal';

const COMPARISON_ADJUSTMENTS: Record<ComparisonToSubject, number> = {
  much_inferior: 0.10,
  slightly_inferior: 0.05,
  similar: 0,
  slightly_superior: -0.05,
  much_superior: -0.10,
};

export function filterCompsBySqft(comps: SaleComp[], subjectSqft: number): SaleComp[] {
  const min = subjectSqft * 0.8;
  const max = subjectSqft * 1.2;
  return comps.filter(c => !c.sqft || (c.sqft >= min && c.sqft <= max));
}

export function autoImportComps(
  saleComps: SaleComp[],
  dealId: string,
  subjectSqft: number | null,
  existingIds: Set<string>
): CompPrecisionComp[] {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

  const recentlySold = saleComps.filter(c => c.saleDate && new Date(c.saleDate) >= sixMonthsAgo);
  const filtered = subjectSqft ? filterCompsBySqft(recentlySold, subjectSqft) : recentlySold;

  return filtered
    .filter(c => !existingIds.has(c.address))
    .map(c => ({
      id: crypto.randomUUID(),
      dealId,
      source: 'auto' as const,
      importedFrom: 'more_info_recently_sold' as const,
      verificationStatus: 'needs_review' as const,
      isIncludedInArv: false,
      category: 'high_market' as const,
      address: c.address,
      status: 'sold' as const,
      price: c.salePrice,
      soldDate: c.saleDate,
      livingAreaSqft: c.sqft || undefined,
      bedrooms: c.bedrooms || undefined,
      bathrooms: c.bathrooms || undefined,
      distanceMiles: c.distance || undefined,
      similarityScore: c.similarityScore || undefined,
      rawPayload: c,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
}

export function computeAdjustedPrice(comp: CompPrecisionComp): number {
  const adj = comp.comparisonToSubject ? COMPARISON_ADJUSTMENTS[comp.comparisonToSubject] : 0;
  return Math.round(comp.price * (1 + adj));
}

export function computeSimilarityScore(
  comp: CompPrecisionComp,
  subjectSqft?: number | null,
  subjectBeds?: number | null
): number {
  let score = comp.similarityScore ?? 50;

  if (subjectSqft && comp.livingAreaSqft) {
    const diff = Math.abs(comp.livingAreaSqft - subjectSqft) / subjectSqft;
    const sqftScore = Math.max(0, 1 - diff * 2) * 100;
    score = score * 0.6 + sqftScore * 0.4;
  }

  if (subjectBeds && comp.bedrooms === subjectBeds) score = Math.min(100, score + 5);

  return Math.round(score);
}

export function isCompIncludedInArv(comp: CompPrecisionComp): boolean {
  return (
    comp.isIncludedInArv &&
    comp.verificationStatus === 'verified'
  );
}

export function calculateWeightedArv(
  comps: CompPrecisionComp[],
  subjectSqft?: number | null,
  subjectBeds?: number | null
): number | null {
  const valid = comps.filter(isCompIncludedInArv);
  if (valid.length === 0) return null;

  const scored = valid.map(c => ({
    adjustedPrice: computeAdjustedPrice(c),
    weight: computeSimilarityScore(c, subjectSqft, subjectBeds),
  }));

  const totalWeight = scored.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) {
    return Math.round(scored.reduce((s, c) => s + c.adjustedPrice, 0) / scored.length);
  }

  return Math.round(scored.reduce((s, c) => s + c.adjustedPrice * c.weight, 0) / totalWeight);
}

export function makeBlanKComp(dealId: string): CompPrecisionComp {
  return {
    id: crypto.randomUUID(),
    dealId,
    source: 'manual',
    importedFrom: 'manual',
    verificationStatus: 'verified',
    isIncludedInArv: true,
    category: 'high_market',
    address: '',
    status: 'sold',
    price: 0,
    createdByUser: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
