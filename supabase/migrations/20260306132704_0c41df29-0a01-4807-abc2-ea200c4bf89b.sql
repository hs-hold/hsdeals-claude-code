
-- Add 'agent' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent';

-- Add created_by column to deals table to track who created each deal
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS created_by uuid;
