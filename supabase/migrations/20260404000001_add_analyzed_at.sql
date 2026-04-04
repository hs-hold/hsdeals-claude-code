-- Add analyzed_at timestamp to deals table
ALTER TABLE deals ADD COLUMN IF NOT EXISTS analyzed_at timestamptz DEFAULT NULL;
