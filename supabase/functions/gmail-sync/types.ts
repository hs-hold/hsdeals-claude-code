// supabase/functions/gmail-sync/types.ts

export interface NormalizedEmail {
  messageId: string;
  threadId: string;
  subject: string;
  cleanSubject: string;
  senderEmail: string;
  senderName: string;
  date: string;
  cleanText: string;
  tables: string[];
  combinedContext: string;  // cleanSubject + "\n\n" + cleanText + tables, max 20,000 chars
  snippet: string;
  rawBodyLength: number;
}

export interface ExtractedField<T> {
  value: T | null;
  evidence: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'subject' | 'body' | 'table';
}

export const CONFIDENCE_SCORE: Record<'high' | 'medium' | 'low', number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.25,
};

export interface ExtractedProperty {
  address_full:    ExtractedField<string>;
  street:          ExtractedField<string>;
  city:            ExtractedField<string>;
  state:           ExtractedField<string>;
  zip:             ExtractedField<string>;
  asking_price:    ExtractedField<number>;
  arv:             ExtractedField<number>;
  rent:            ExtractedField<number>;
  repair_estimate: ExtractedField<number>;
  beds:            ExtractedField<number>;
  baths:           ExtractedField<number>;
  sqft:            ExtractedField<number>;
  lot_size:        ExtractedField<string>;
  year_built:      ExtractedField<number>;
  property_type:   ExtractedField<string>;
  occupancy:       ExtractedField<string>;
  condition:       ExtractedField<string>;
  access_notes:    ExtractedField<string>;
  contact_name:    ExtractedField<string>;
  contact_phone:   ExtractedField<string>;
  contact_email:   ExtractedField<string>;
  deal_notes:      ExtractedField<string>;
}

export interface ExtractionResult {
  email_type: 'deal' | 'non_deal' | 'follow_up' | 'unknown';
  properties: ExtractedProperty[];
}

export interface ExtractionAudit {
  messageId: string;
  rawResponse: string;
  promptTokensEstimate: number;
  stage: 'extract' | 'classify';
  createdAt: string;
}

export interface PrefilterResult {
  score: number;
  signals: string[];
  skip_reason?: string;
}

export type RouteDecision = 'auto_create' | 'review' | 'flagged' | 'skip';

export interface RouteResult {
  decision: RouteDecision;
  route_reason: string;
  overall_confidence: number;
}
