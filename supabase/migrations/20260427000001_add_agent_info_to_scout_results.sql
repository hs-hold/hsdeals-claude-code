ALTER TABLE public.scout_results
  ADD COLUMN IF NOT EXISTS agent_name  text,
  ADD COLUMN IF NOT EXISTS agent_email text,
  ADD COLUMN IF NOT EXISTS agent_phone text,
  ADD COLUMN IF NOT EXISTS broker_name text;
