-- Add deal management fields to scout_results
ALTER TABLE public.scout_results
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'hot', 'watching', 'skip')),
  ADD COLUMN IF NOT EXISTS arv_override  integer,
  ADD COLUMN IF NOT EXISTS rehab_override integer,
  ADD COLUMN IF NOT EXISTS rent_override  integer,
  ADD COLUMN IF NOT EXISTS notes         text;

CREATE INDEX IF NOT EXISTS scout_results_status ON public.scout_results(status);
