-- Add investor_notes column to deal_investors table
ALTER TABLE public.deal_investors 
ADD COLUMN investor_notes TEXT;