-- Table to cache AI-researched real estate market data per ZIP code
CREATE TABLE public.zip_market_data (
  zip_code text PRIMARY KEY,
  city text,
  state text,
  market_data jsonb NOT NULL DEFAULT '{}',
  researched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Allow authenticated users to read
ALTER TABLE public.zip_market_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read zip market data"
  ON public.zip_market_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert zip market data"
  ON public.zip_market_data FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update zip market data"
  ON public.zip_market_data FOR UPDATE
  TO authenticated
  USING (true);

-- Service role bypass (for edge functions)
CREATE POLICY "Service role can do everything"
  ON public.zip_market_data FOR ALL
  TO service_role
  USING (true);
