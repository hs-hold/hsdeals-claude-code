-- Add 'pending_other' as a valid status value
-- PostgreSQL TEXT columns don't need enum changes, status is stored as TEXT
-- Just update the check constraint if one exists

DO $$
BEGIN
  -- Drop existing check constraint on status if any
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'deals' AND constraint_type = 'CHECK' AND constraint_name LIKE '%status%'
  ) THEN
    ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_status_check;
  END IF;
END $$;
