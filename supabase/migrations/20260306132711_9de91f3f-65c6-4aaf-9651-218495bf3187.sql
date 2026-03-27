
-- RLS policy: agents can read their own deals
CREATE POLICY "Agents can read own deals"
ON public.deals
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'agent'::app_role) AND created_by = auth.uid()
);

-- RLS policy: agents can insert deals (with their own user id as created_by)
CREATE POLICY "Agents can insert deals"
ON public.deals
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'agent'::app_role) AND created_by = auth.uid()
);

-- RLS policy: agents can update their own deals
CREATE POLICY "Agents can update own deals"
ON public.deals
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'agent'::app_role) AND created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'agent'::app_role) AND created_by = auth.uid()
);
