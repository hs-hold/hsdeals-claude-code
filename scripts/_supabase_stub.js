// Stub for @/integrations/supabase/client when importing analyzeAndCreateDeal
// from a node script that doesn't actually use the supabase client (we only
// need mapToDealApiData, which is pure). Throws if anyone touches it.
export const supabase = new Proxy({}, {
  get() { throw new Error('supabase client not available in node script'); },
});
