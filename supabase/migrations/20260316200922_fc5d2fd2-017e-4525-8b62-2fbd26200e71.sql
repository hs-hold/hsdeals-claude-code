
ALTER TABLE public.deals ADD COLUMN job_id uuid REFERENCES public.api_jobs(id) ON DELETE SET NULL DEFAULT NULL;
CREATE INDEX idx_deals_job_id ON public.deals(job_id);
