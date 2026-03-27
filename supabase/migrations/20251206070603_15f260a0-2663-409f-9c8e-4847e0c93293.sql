-- Create deals table to store imported deals
CREATE TABLE public.deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address_street TEXT NOT NULL,
  address_city TEXT NOT NULL DEFAULT 'Atlanta',
  address_state TEXT NOT NULL DEFAULT 'GA',
  address_zip TEXT,
  address_full TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'email',
  
  -- API data from Partners API
  api_data JSONB,
  
  -- User overrides
  overrides JSONB DEFAULT '{"arv": null, "rent": null, "rehabCost": null}'::jsonb,
  
  -- Calculated financials
  financials JSONB,
  
  -- Deal metadata
  rejection_reason TEXT,
  notes TEXT,
  email_subject TEXT,
  email_date TIMESTAMPTZ,
  email_id TEXT UNIQUE,
  gmail_message_id TEXT UNIQUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (but allow all access for single-user app)
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (single-user app, no auth required)
CREATE POLICY "Allow all access to deals" 
ON public.deals 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_deals_status ON public.deals(status);
CREATE INDEX idx_deals_created_at ON public.deals(created_at DESC);
CREATE INDEX idx_deals_gmail_message_id ON public.deals(gmail_message_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_deals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_deals_updated_at
BEFORE UPDATE ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.update_deals_updated_at();