
CREATE TABLE public.api_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.api_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  address text,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast queries
CREATE INDEX idx_api_activity_log_job_id ON public.api_activity_log(job_id);
CREATE INDEX idx_api_activity_log_created_at ON public.api_activity_log(created_at DESC);

-- RLS
ALTER TABLE public.api_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api_activity_log"
  ON public.api_activity_log
  FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.api_activity_log;
