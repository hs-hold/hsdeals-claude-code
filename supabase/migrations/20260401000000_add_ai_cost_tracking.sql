-- Add cost tracking to scout_ai_analyses
ALTER TABLE public.scout_ai_analyses
  ADD COLUMN IF NOT EXISTS cost_usd   numeric(10,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model      text,
  ADD COLUMN IF NOT EXISTS input_tokens  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens integer DEFAULT 0;
