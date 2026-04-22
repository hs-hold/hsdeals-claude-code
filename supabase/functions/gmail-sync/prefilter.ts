// supabase/functions/gmail-sync/prefilter.ts

import type { NormalizedEmail, PrefilterResult } from './types.ts';

// Portal domains — emails from these get score 0
const PORTAL_DOMAINS = [
  'zillow.com',
  'redfin.com',
  'realtor.com',
  'trulia.com',
  'homes.com',
  'movoto.com',
  'coldwellbanker.com',
  'century21.com',
  'kw.com',
  'compass.com',
  'opendoor.com',
  'offerpad.com',
  'loopnet.com',
  'crexi.com',
  'costar.com',
  'apartments.com',
  'rent.com',
];

function isPortalDomain(senderEmail: string): boolean {
  return PORTAL_DOMAINS.some(domain => senderEmail.includes(domain));
}

/**
 * Rules-based prefilter — pure function, no DB calls.
 * Returns a score (0–10) and the signals that contributed to it.
 */
export function prefilter(
  email: NormalizedEmail,
  knownWholesalerEmails: Set<string>,
): PrefilterResult {
  const signals: string[] = [];
  let score = 0;

  // Portal domain → instant skip
  if (isPortalDomain(email.senderEmail)) {
    return {
      score: 0,
      signals: ['portal_domain'],
      skip_reason: 'portal_domain',
    };
  }

  const text = (email.combinedContext || '').toLowerCase();
  const subject = (email.cleanSubject || '').toLowerCase();
  const combined = subject + ' ' + text;

  // Known wholesaler
  if (knownWholesalerEmails.has(email.senderEmail.toLowerCase())) {
    score += 3;
    signals.push('known_wholesaler');
  }

  // Address-like pattern: 3–5 digit number followed by a street-type word
  const STREET_TYPES = /\b(?:street|st|avenue|ave|drive|dr|road|rd|lane|ln|court|ct|boulevard|blvd|way|place|pl|circle|cir|parkway|pkwy|highway|hwy|terrace|ter|trail|trl|loop|run|pass|pike|row|alley|point|pointe|ridge|glen|grove|park|path|view|walk|wood|commons|landing|crossing|creek|mill|spring|square)\b/i;
  if (/\b\d{3,5}\s+[a-zA-Z]/.test(combined) && STREET_TYPES.test(combined)) {
    score += 3;
    signals.push('address_pattern');
  }

  // ARV keyword
  if (/\barv\b/i.test(combined)) {
    score += 2;
    signals.push('arv_keyword');
  }

  // Asking/offer/purchase price keyword
  if (/\b(?:asking\s*price|purchase\s*price|offer\s*price|list(?:ing)?\s*price|price[:=\s]\s*\$?\d)/i.test(combined)) {
    score += 2;
    signals.push('price_keyword');
  }

  // Beds/baths pattern
  if (/\b\d+\s*(?:bed(?:room)?s?|br|ba|bath(?:room)?s?)\b/i.test(combined) || /\b\d+\/\d+\b/.test(combined)) {
    score += 2;
    signals.push('beds_baths_pattern');
  }

  // Off-market/wholesale/assignment/cash-buyer keywords
  if (/\b(?:off.?market|wholesal|assignment|cash.?buyer|cash\s*deal)\b/i.test(combined)) {
    score += 2;
    signals.push('wholesale_keyword');
  }

  // Rehab/repair/budget keyword
  if (/\b(?:rehab|repair(?:s)?|renovation|reno|budget|fix(?:er)?)\b/i.test(combined)) {
    score += 1;
    signals.push('rehab_keyword');
  }

  // Sqft/square feet
  if (/\b(?:sqft|sq\.?\s*ft|square\s*feet|square\s*foot)\b/i.test(combined)) {
    score += 1;
    signals.push('sqft_keyword');
  }

  // Vacant/occupied/tenant
  if (/\b(?:vacant|occupied|tenant|renter)\b/i.test(combined)) {
    score += 1;
    signals.push('occupancy_keyword');
  }

  // Deal-type keyword (flip, rental, brrrr)
  if (/\b(?:flip|rental|brrrr|buy\s*(?:and|&)\s*hold|investment\s*propert)\b/i.test(combined)) {
    score += 1;
    signals.push('deal_type_keyword');
  }

  // Negative signals
  if (/\b(?:unsubscribe|opt.?out)\b/i.test(combined)) {
    score -= 1;
    signals.push('unsubscribe_penalty');
  }

  if (/\b(?:account|password|verify|invoice|receipt|order\s*confirmation|payment\s*(?:received|processed))\b/i.test(combined)) {
    score -= 2;
    signals.push('notification_penalty');
  }

  if (/\b(?:calendar|meeting|zoom|webinar|conference|schedule|appointment\s+(?:reminder|request))\b/i.test(combined)) {
    score -= 2;
    signals.push('calendar_penalty');
  }

  // Clamp to [0, 10]
  score = Math.max(0, Math.min(10, score));

  const result: PrefilterResult = { score, signals };

  if (score < 3) {
    result.skip_reason = signals.length > 0
      ? `low_score:${signals.filter(s => s.endsWith('_penalty')).join(',') || 'no_deal_signals'}`
      : 'no_deal_signals';
  }

  return result;
}
