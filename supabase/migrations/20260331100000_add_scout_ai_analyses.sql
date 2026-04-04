CREATE TABLE public.scout_ai_analyses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_result_id uuid UNIQUE REFERENCES public.scout_results(id) ON DELETE CASCADE,
  zpid          text NOT NULL,
  analysis      jsonb NOT NULL,
  comps_used    integer DEFAULT 0,
  tokens_used   integer DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scout_ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scout_ai_analyses"
  ON public.scout_ai_analyses FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.scout_results sr
    JOIN public.scout_searches ss ON ss.id = sr.search_id
    WHERE sr.id = scout_ai_analyses.scout_result_id AND ss.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.scout_results sr
    JOIN public.scout_searches ss ON ss.id = sr.search_id
    WHERE sr.id = scout_ai_analyses.scout_result_id AND ss.user_id = auth.uid()
  ));

CREATE INDEX scout_ai_analyses_result_id ON public.scout_ai_analyses(scout_result_id);
CREATE INDEX scout_ai_analyses_zpid ON public.scout_ai_analyses(zpid);
