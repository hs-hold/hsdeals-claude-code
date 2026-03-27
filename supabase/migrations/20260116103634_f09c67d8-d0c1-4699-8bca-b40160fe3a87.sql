-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all access to deals" ON public.deals;

-- Create policy that requires authentication
CREATE POLICY "Authenticated users can manage deals"
ON public.deals
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);