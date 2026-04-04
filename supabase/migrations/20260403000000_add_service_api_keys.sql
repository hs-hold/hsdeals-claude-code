-- Table for storing third-party API keys used by the app
CREATE TABLE IF NOT EXISTS public.service_api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name  text UNIQUE NOT NULL,
  display_name  text NOT NULL,
  api_key       text,
  description   text,
  updated_at    timestamptz DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id)
);

-- Seed the predefined services (no key values yet)
INSERT INTO public.service_api_keys (service_name, display_name, description) VALUES
  ('dealbeast',  'DealBeast',          'Analyzes deals from DealBeast''s wholesale property database (main site)'),
  ('rapidapi',   'RapidAPI',           'Fetches sold comps, active listings & property details for Scout AI analysis'),
  ('anthropic',  'Anthropic (Claude)', 'Powers AI-driven deal analysis and scoring in Scout')
ON CONFLICT (service_name) DO NOTHING;

-- RLS: only authenticated admins can read/write
ALTER TABLE public.service_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on service_api_keys"
  ON public.service_api_keys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.set_service_api_key_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_api_keys_updated
  BEFORE UPDATE ON public.service_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_service_api_key_updated();
