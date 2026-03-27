
DROP POLICY "Service role full access" ON public.api_deal_history;

CREATE POLICY "Admins can manage api_deal_history" ON public.api_deal_history
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
