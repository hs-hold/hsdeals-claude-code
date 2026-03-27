-- Note: The overrides column is already JSONB, so we just need to ensure the code handles the new fields
-- No schema change needed - the overrides JSONB column already supports dynamic fields
-- This migration is a no-op placeholder for documentation purposes

SELECT 1;
-- New fields to be added to overrides JSON:
-- lotSizeSqft: number | null - Override lot size in square feet
-- The UI will handle conversion between acres and sqft