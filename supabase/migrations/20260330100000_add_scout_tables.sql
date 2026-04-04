CREATE TABLE public.scout_searches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  zip          text NOT NULL,
  max_price    integer NOT NULL DEFAULT 300000,
  result_count integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scout_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scout_searches"
  ON public.scout_searches FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.scout_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id      uuid REFERENCES public.scout_searches(id) ON DELETE CASCADE NOT NULL,
  zpid           text NOT NULL,
  address        text NOT NULL,
  price          integer,
  arv            integer,
  rehab          integer,
  spread         integer,
  cap_rate       numeric(5,2),
  score          integer,
  grade          text,
  rent           integer,
  sqft           integer,
  beds           numeric(3,1),
  baths          numeric(3,1),
  days_on_market integer,
  img_src        text,
  detail_url     text
);

ALTER TABLE public.scout_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scout_results"
  ON public.scout_results FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.scout_searches s
    WHERE s.id = scout_results.search_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.scout_searches s
    WHERE s.id = scout_results.search_id AND s.user_id = auth.uid()
  ));

CREATE INDEX scout_searches_user_created ON public.scout_searches(user_id, created_at DESC);
CREATE INDEX scout_results_search_id ON public.scout_results(search_id);
