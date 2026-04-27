-- Ensure optional columns exist before creating the view
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS scout_ai_data JSONB;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS email_extracted_data JSONB;

-- View for list queries — strips rawResponse from api_data (can be 50-200KB per deal)
CREATE OR REPLACE VIEW deals_list AS
SELECT
  id, address_full, address_street, address_city, address_state, address_zip,
  status, source, created_at, updated_at, analyzed_at, created_by,
  rejection_reason, notes, email_subject, email_date, email_id, gmail_message_id,
  (api_data - 'rawResponse') AS api_data,
  financials,
  overrides,
  scout_ai_data,
  email_extracted_data
FROM deals;

GRANT SELECT ON deals_list TO anon, authenticated;
