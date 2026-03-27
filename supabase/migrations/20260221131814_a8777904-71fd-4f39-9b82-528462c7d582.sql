CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  selected_state TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences" ON public.user_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences" ON public.user_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());