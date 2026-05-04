-- Create claude_picks table for AI-curated deal recommendations
CREATE TABLE IF NOT EXISTS public.claude_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  market_status TEXT NOT NULL CHECK (market_status IN ('active','pending','off-market')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  market_note TEXT,
  analysis_note TEXT,
  checked_at DATE NOT NULL DEFAULT CURRENT_DATE,
  added_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT claude_picks_deal_id_unique UNIQUE (deal_id)
);

CREATE INDEX IF NOT EXISTS idx_claude_picks_priority_status
  ON public.claude_picks(priority, market_status);

CREATE INDEX IF NOT EXISTS idx_claude_picks_checked_at
  ON public.claude_picks(checked_at DESC);

ALTER TABLE public.claude_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read claude_picks"
  ON public.claude_picks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert claude_picks"
  ON public.claude_picks FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update claude_picks"
  ON public.claude_picks FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete claude_picks"
  ON public.claude_picks FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.update_claude_picks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_claude_picks_updated_at
  BEFORE UPDATE ON public.claude_picks
  FOR EACH ROW EXECUTE FUNCTION public.update_claude_picks_updated_at();

-- Seed: migrate existing hardcoded picks (idempotent)
INSERT INTO public.claude_picks (deal_id, market_status, priority, market_note, analysis_note, checked_at, added_by) VALUES
  ('8b7a1a56-54ba-4780-997f-91fd3405b4df', 'active', 'high',
   'Active price raised to $204,900 (from $194,900)',
   'Grade A with Cap 13.8% strongest property on the list. Spread $105K with Rehab $47.7K. Submit offer.',
   '2026-03-28', 'manual'),
  ('7ee432a6-3e3e-449b-aca2-8b71a07f2773', 'active', 'medium',
   'Active reduced from $240K to $204,750, relisted several times',
   'Grade B, Cap 10.1%, low Rehab $35K. Seller wants out good negotiating leverage.',
   '2026-03-28', 'manual'),
  ('5db0bfed-f753-4132-ac0d-5bb78457fc7a', 'pending', 'medium',
   'Pending under contract since 1/19/2026 (~42 days)',
   'Cap 14.1% highest on the entire list. Worth monitoring if it falls out of contract.',
   '2026-03-28', 'manual'),
  ('5ee058c4-7d44-4f3f-940c-e75edcaee8d6', 'off-market', 'low',
   'Off Market became a rental property (FirstKey Homes)',
   'Was a strong pick already taken off-market.',
   '2026-03-28', 'manual')
ON CONFLICT (deal_id) DO NOTHING;
