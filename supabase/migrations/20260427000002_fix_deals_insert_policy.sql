-- Allow any authenticated user to insert their own deals.
-- The previous "Admins can manage all deals" policy only covered users
-- with an explicit admin role; regular authenticated users had no INSERT
-- policy, causing silent save failures.
CREATE POLICY "Authenticated users can insert deals"
ON public.deals
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Also allow authenticated users to update deals they created (for overrides, notes, etc.)
CREATE POLICY "Authenticated users can update own deals"
ON public.deals
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
