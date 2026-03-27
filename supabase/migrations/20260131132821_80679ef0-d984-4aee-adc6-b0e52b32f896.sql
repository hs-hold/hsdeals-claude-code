-- Remove the unique constraint on gmail_message_id since multiple deals can come from the same email
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_gmail_message_id_key;