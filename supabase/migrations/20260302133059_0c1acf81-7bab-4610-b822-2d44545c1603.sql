
CREATE TABLE public.api_deal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_normalized text NOT NULL,
  zipcode text NOT NULL,
  purchase_price numeric,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_deal_history_zip ON public.api_deal_history(zipcode);
CREATE UNIQUE INDEX idx_api_deal_history_address ON public.api_deal_history(address_normalized);

ALTER TABLE public.api_deal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.api_deal_history
  FOR ALL USING (true) WITH CHECK (true);
