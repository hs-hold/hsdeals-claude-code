-- Add is_locked column to deals table for locking deal data
ALTER TABLE public.deals 
ADD COLUMN is_locked boolean NOT NULL DEFAULT false;