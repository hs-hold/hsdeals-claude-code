-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'investor');

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create investors table to store investor details
CREATE TABLE public.investors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  strategies TEXT[] DEFAULT '{}',
  profit_split_percent NUMERIC(5,2) DEFAULT 50.00,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on investors
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

-- Create deal_investors junction table to link deals to investors
CREATE TABLE public.deal_investors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE NOT NULL,
  investor_id UUID REFERENCES public.investors(id) ON DELETE CASCADE NOT NULL,
  profit_split_percent NUMERIC(5,2),
  visible_strategies TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (deal_id, investor_id)
);

-- Enable RLS on deal_investors
ALTER TABLE public.deal_investors ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
-- Admins can manage all roles
CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can read their own roles
CREATE POLICY "Users can read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- RLS Policies for investors table
-- Admins can manage all investors
CREATE POLICY "Admins can manage investors"
ON public.investors
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Investors can read their own record
CREATE POLICY "Investors can read own record"
ON public.investors
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- RLS Policies for deal_investors table
-- Admins can manage all deal-investor links
CREATE POLICY "Admins can manage deal investors"
ON public.deal_investors
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Investors can read their own deal links
CREATE POLICY "Investors can read their deals"
ON public.deal_investors
FOR SELECT
TO authenticated
USING (
  investor_id IN (
    SELECT id FROM public.investors WHERE user_id = auth.uid()
  )
);

-- Update deals RLS to allow investors to read shared deals
DROP POLICY IF EXISTS "Authenticated users can manage deals" ON public.deals;

-- Admins can manage all deals
CREATE POLICY "Admins can manage all deals"
ON public.deals
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Investors can read deals shared with them
CREATE POLICY "Investors can read shared deals"
ON public.deals
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT di.deal_id 
    FROM public.deal_investors di
    JOIN public.investors i ON di.investor_id = i.id
    WHERE i.user_id = auth.uid()
  )
);

-- Create trigger for investors updated_at
CREATE TRIGGER update_investors_updated_at
BEFORE UPDATE ON public.investors
FOR EACH ROW
EXECUTE FUNCTION public.update_deals_updated_at();