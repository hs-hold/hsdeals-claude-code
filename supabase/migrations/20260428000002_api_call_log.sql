-- Append-only log of paid external API calls so the UI can warn the user
-- when daily usage exceeds budget thresholds (e.g. DealBeast 70/day).
CREATE TABLE IF NOT EXISTS public.api_call_log (
  id BIGSERIAL PRIMARY KEY,
  service TEXT NOT NULL,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_api_call_log_service_time
  ON public.api_call_log (service, called_at DESC);

-- Anyone authenticated can read aggregate counts; only service role inserts.
ALTER TABLE public.api_call_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_call_log_read" ON public.api_call_log;
CREATE POLICY "api_call_log_read" ON public.api_call_log
  FOR SELECT TO authenticated USING (true);
