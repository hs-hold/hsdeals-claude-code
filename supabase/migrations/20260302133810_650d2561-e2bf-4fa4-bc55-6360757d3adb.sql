
CREATE TABLE public.api_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zipcode text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  callback_url text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb,
  total_properties integer DEFAULT 0,
  processed_count integer DEFAULT 0,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

CREATE INDEX idx_api_jobs_status ON public.api_jobs(status);

ALTER TABLE public.api_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api_jobs" ON public.api_jobs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
