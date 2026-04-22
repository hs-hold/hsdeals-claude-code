// supabase/functions/gmail-sync/route.ts

import type { RouteResult } from './types.ts';
import type { ValidatedProperty } from './validate.ts';

export function routeProperty(validated: ValidatedProperty): RouteResult {
  const { property: prop, issues, overallConfidence } = validated;

  // Check if address is present
  const hasAddressFull = prop.address_full.value !== null;
  const hasComponentAddress =
    prop.street.value !== null &&
    prop.city.value !== null &&
    prop.state.value !== null;
  const hasAddress = hasAddressFull || hasComponentAddress;

  // Rule 1: No address → flagged
  if (!hasAddress) {
    return {
      decision: 'flagged',
      route_reason: 'missing_address',
      overall_confidence: overallConfidence,
    };
  }

  // Rule 2: Critical validation issues on address/asking_price fields
  const criticalIssues = issues.filter(
    issue => issue.field === 'address_full' || issue.field === 'asking_price',
  );
  if (criticalIssues.length > 0) {
    const reasons = criticalIssues.map(i => `${i.field}:${i.reason}`).join(';');
    return {
      decision: 'review',
      route_reason: `validation_issue:${reasons}`,
      overall_confidence: overallConfidence,
    };
  }

  // Rule 3: No asking_price AND confidence < 0.75 → review
  if (prop.asking_price.value === null && overallConfidence < 0.75) {
    return {
      decision: 'review',
      route_reason: 'no_asking_price',
      overall_confidence: overallConfidence,
    };
  }

  // Rule 4: High confidence → auto_create
  if (overallConfidence >= 0.75) {
    return {
      decision: 'auto_create',
      route_reason: 'high_confidence',
      overall_confidence: overallConfidence,
    };
  }

  // Rule 5: Medium confidence → review
  if (overallConfidence >= 0.50) {
    return {
      decision: 'review',
      route_reason: 'medium_confidence',
      overall_confidence: overallConfidence,
    };
  }

  // Rule 6: Low confidence → flagged
  return {
    decision: 'flagged',
    route_reason: 'low_confidence',
    overall_confidence: overallConfidence,
  };
}
