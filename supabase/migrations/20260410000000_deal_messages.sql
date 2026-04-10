-- Table for storing SMS conversations per deal
CREATE TABLE IF NOT EXISTS public.deal_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  to_phone    TEXT,
  from_phone  TEXT,
  body        TEXT NOT NULL,
  twilio_sid  TEXT,
  status      TEXT DEFAULT 'sent',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_messages_deal_id_idx ON public.deal_messages(deal_id, created_at);
CREATE INDEX IF NOT EXISTS deal_messages_to_phone_idx ON public.deal_messages(to_phone);
CREATE INDEX IF NOT EXISTS deal_messages_from_phone_idx ON public.deal_messages(from_phone);

ALTER TABLE public.deal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All access on deal_messages"
  ON public.deal_messages FOR ALL
  USING (true) WITH CHECK (true);

-- Add Twilio credentials to service_api_keys
INSERT INTO public.service_api_keys (service_name, display_name, description) VALUES
  ('twilio_account_sid',  'Twilio Account SID',   'Twilio account identifier (starts with AC...)'),
  ('twilio_auth_token',   'Twilio Auth Token',     'Twilio authentication token for SMS API'),
  ('twilio_from_number',  'Twilio Phone Number',   'US number for sending/receiving SMS (format: +1XXXXXXXXXX)')
ON CONFLICT (service_name) DO NOTHING;
