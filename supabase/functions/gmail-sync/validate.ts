// supabase/functions/gmail-sync/validate.ts

import type { ExtractionResult, ExtractedProperty, ExtractedField, CONFIDENCE_SCORE } from './types.ts';
import { CONFIDENCE_SCORE as CONF_SCORE } from './types.ts';

export interface ValidatedProperty {
  property: ExtractedProperty;
  issues: Array<{ field: string; reason: string }>;
  overallConfidence: number;
  rehabFloorApplied?: number;
}

const CURRENT_YEAR = new Date().getFullYear();

const RANGE_CHECKS: Record<string, { min: number; max: number }> = {
  asking_price: { min: 10_000, max: 5_000_000 },
  arv:          { min: 10_000, max: 10_000_000 },
  beds:         { min: 1,      max: 20 },
  baths:        { min: 0.5,    max: 20 },
  sqft:         { min: 200,    max: 50_000 },
  year_built:   { min: 1800,   max: CURRENT_YEAR },
};

const REHAB_FLOOR: Record<string, number> = {
  email: 80_000,
  api:   60_000,
};

// Field weights for overall confidence calculation
const FIELD_WEIGHTS: Record<string, number> = {
  address_full:    3,
  asking_price:    3,
  beds:            1.5,
  baths:           1.5,
  sqft:            1,
  arv:             1,
  repair_estimate: 1,
};

function getFieldScore(field: ExtractedField<any>): number {
  if (field.value === null) return 0;
  return CONF_SCORE[field.confidence] ?? 0;
}

export function validateAndEnrich(
  result: ExtractionResult,
  source: string,
): ValidatedProperty[] {
  const validated: ValidatedProperty[] = [];

  for (const property of result.properties) {
    const issues: Array<{ field: string; reason: string }> = [];

    // Check all non-null fields have evidence
    for (const [key, fieldVal] of Object.entries(property)) {
      const field = fieldVal as ExtractedField<any>;
      if (field && field.value !== null && !field.evidence) {
        issues.push({ field: key, reason: 'non-null value missing evidence' });
      }
    }

    // Range checks — null out invalid values and add issue
    for (const [fieldName, range] of Object.entries(RANGE_CHECKS)) {
      const field = (property as any)[fieldName] as ExtractedField<number>;
      if (field && field.value !== null) {
        if (field.value < range.min || field.value > range.max) {
          issues.push({
            field: fieldName,
            reason: `value ${field.value} out of range [${range.min}, ${range.max}]`,
          });
          field.value = null;
          field.evidence = null;
        }
      }
    }

    // Flag if arv < asking_price (don't null out)
    const arv = property.arv.value;
    const askingPrice = property.asking_price.value;
    if (arv !== null && askingPrice !== null && arv < askingPrice) {
      issues.push({
        field: 'arv',
        reason: `arv (${arv}) < asking_price (${askingPrice})`,
      });
    }

    // Apply rehab floor
    const floor = REHAB_FLOOR[source] ?? REHAB_FLOOR['email'];
    let rehabFloorApplied: number | undefined;
    const rehabField = property.repair_estimate;
    if (rehabField.value === null || rehabField.value < floor) {
      const extracted = rehabField.value;
      rehabField.value = floor;
      rehabField.confidence = 'low';
      rehabField.evidence = extracted !== null
        ? `min floor applied (extracted: ${extracted})`
        : 'min floor applied (not found)';
      rehabField.source = 'body';
      rehabFloorApplied = floor;
    }

    // Compute overall confidence
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [fieldName, weight] of Object.entries(FIELD_WEIGHTS)) {
      const field = (property as any)[fieldName] as ExtractedField<any>;
      const score = field ? getFieldScore(field) : 0;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    let overallConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Hard cap: no address → min(confidence, 0.30)
    const hasAddress =
      property.address_full.value !== null ||
      (property.street.value !== null && property.city.value !== null && property.state.value !== null);

    if (!hasAddress) {
      overallConfidence = Math.min(overallConfidence, 0.30);
    }

    // Hard cap: no asking_price → min(confidence, 0.45)
    if (property.asking_price.value === null) {
      overallConfidence = Math.min(overallConfidence, 0.45);
    }

    // Round to 2 decimal places
    overallConfidence = Math.round(overallConfidence * 100) / 100;

    validated.push({
      property,
      issues,
      overallConfidence,
      rehabFloorApplied,
    });
  }

  return validated;
}
