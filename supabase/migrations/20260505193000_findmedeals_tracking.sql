-- FindMeDeals tracking columns on deals.
-- These mark deals already triaged by an autonomous FindMeDeals run so the
-- pre-filter can skip them on subsequent runs.
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS findmedeals_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS findmedeals_run_id TEXT,
  ADD COLUMN IF NOT EXISTS findmedeals_verdict TEXT
    CHECK (findmedeals_verdict IS NULL OR findmedeals_verdict IN ('passed','needs_review','rejected'));

CREATE INDEX IF NOT EXISTS deals_findmedeals_processed_at_idx
  ON public.deals (findmedeals_processed_at)
  WHERE findmedeals_processed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS deals_findmedeals_run_id_idx
  ON public.deals (findmedeals_run_id)
  WHERE findmedeals_run_id IS NOT NULL;
