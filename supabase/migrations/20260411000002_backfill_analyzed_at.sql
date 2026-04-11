-- Backfill analyzed_at for deals created via analyzeAndCreateDeal (manual/scout)
-- that were inserted before we started setting analyzed_at.
-- Use created_at as a reasonable proxy — these deals were analyzed when created.

UPDATE public.deals
SET analyzed_at = created_at
WHERE analyzed_at IS NULL
  AND source IN ('manual', 'scout')
  AND created_at > '2026-04-10T00:00:00Z';
