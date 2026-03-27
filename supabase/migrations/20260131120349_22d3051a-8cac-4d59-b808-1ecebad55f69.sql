-- Add sender columns to deals table
ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS sender_name TEXT,
ADD COLUMN IF NOT EXISTS sender_email TEXT,
ADD COLUMN IF NOT EXISTS email_snippet TEXT;

-- Create sync_history table to track each sync operation
CREATE TABLE public.sync_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_emails_scanned INTEGER NOT NULL DEFAULT 0,
  deals_created INTEGER NOT NULL DEFAULT 0,
  deals_skipped_duplicate INTEGER NOT NULL DEFAULT 0,
  deals_skipped_portal INTEGER NOT NULL DEFAULT 0,
  skipped_addresses TEXT[] DEFAULT '{}',
  portal_emails TEXT[] DEFAULT '{}',
  errors TEXT[] DEFAULT '{}',
  details JSONB DEFAULT '[]'
);

-- Enable RLS on sync_history
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users
CREATE POLICY "Authenticated users can manage sync_history"
ON public.sync_history
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);