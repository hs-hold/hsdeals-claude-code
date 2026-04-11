-- Add is_off_market flag to deals table
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS is_off_market boolean NOT NULL DEFAULT false;

-- Backfill: all existing email-sourced deals are off-market
UPDATE public.deals SET is_off_market = true WHERE source = 'email';

CREATE INDEX IF NOT EXISTS idx_deals_is_off_market ON public.deals(is_off_market);
