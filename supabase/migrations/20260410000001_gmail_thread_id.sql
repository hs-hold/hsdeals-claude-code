-- Add gmail_thread_id to deals for email thread detection and reply chat
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT;
CREATE INDEX IF NOT EXISTS deals_gmail_thread_id_idx ON public.deals(gmail_thread_id);
