
-- Add deal_type column to store the type of deal (e.g., Fix & Flip, SubTo, BRRRR, etc.)
ALTER TABLE public.deals ADD COLUMN deal_type text DEFAULT NULL;

-- Add email_extracted_data jsonb column to store all AI-extracted info from the email
ALTER TABLE public.deals ADD COLUMN email_extracted_data jsonb DEFAULT NULL;
