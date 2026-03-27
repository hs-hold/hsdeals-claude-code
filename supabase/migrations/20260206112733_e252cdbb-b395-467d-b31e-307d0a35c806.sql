-- Add preferred return percent to deal_investors
ALTER TABLE public.deal_investors
ADD COLUMN preferred_return_percent numeric DEFAULT 15.00;

-- Add comment explaining the waterfall structure
COMMENT ON COLUMN public.deal_investors.preferred_return_percent IS 'Investor gets this % return first, then admin catches up to same %, then 50/50 split';