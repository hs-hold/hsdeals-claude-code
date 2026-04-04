import { supabase } from '@/integrations/supabase/client';

export interface ScoutSearch {
  id: string;
  zip: string;
  max_price: number;
  result_count: number;
  created_at: string;
}

export type DealStatus = 'new' | 'hot' | 'watching' | 'skip';

export interface ScoutResult {
  id?: string;
  search_id?: string;
  zpid: string;
  address: string;
  price: number;
  arv: number | null;
  rehab: number;
  spread: number | null;
  cap_rate: number | null;
  score: number;
  grade: string;
  rent: number;
  sqft: number;
  beds: number;
  baths: number;
  days_on_market: number;
  img_src: string;
  detail_url: string;
  // Deal management
  status?: DealStatus;
  arv_override?: number | null;
  rehab_override?: number | null;
  rent_override?: number | null;
  notes?: string | null;
  is_starred?: boolean;
  // From joins
  zip?: string;
}

export async function loadHistory(): Promise<ScoutSearch[]> {
  const { data } = await supabase
    .from('scout_searches')
    .select('id, zip, max_price, result_count, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data as ScoutSearch[]) || [];
}

export async function saveSearch(
  zip: string,
  maxPrice: number,
  results: ScoutResult[]
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: search, error } = await supabase
    .from('scout_searches')
    .insert({ zip, max_price: maxPrice, result_count: results.length, user_id: user.id })
    .select('id')
    .single();

  if (error || !search) return null;

  const rows = results.map(r => ({
    search_id: search.id,
    zpid: r.zpid,
    address: r.address,
    price: r.price,
    arv: r.arv,
    rehab: r.rehab,
    spread: r.spread,
    cap_rate: r.cap_rate,
    score: r.score,
    grade: r.grade,
    rent: r.rent,
    sqft: r.sqft,
    beds: r.beds,
    baths: r.baths,
    days_on_market: r.days_on_market,
    img_src: r.img_src,
    detail_url: r.detail_url,
  }));

  await supabase.from('scout_results').insert(rows);
  return search.id;
}

export async function loadResults(searchId: string): Promise<ScoutResult[]> {
  const { data } = await supabase
    .from('scout_results')
    .select('*')
    .eq('search_id', searchId)
    .order('score', { ascending: false });
  return (data as ScoutResult[]) || [];
}

export async function loadAllResults(): Promise<ScoutResult[]> {
  const { data } = await supabase
    .from('scout_results')
    .select('*, scout_searches!inner(zip)')
    .order('score', { ascending: false })
    .limit(500);

  return ((data as any[]) || []).map(r => ({
    ...r,
    zip: r.scout_searches?.zip,
    scout_searches: undefined,
  })) as ScoutResult[];
}

export async function updateResultStatus(id: string, status: DealStatus): Promise<void> {
  await supabase.from('scout_results').update({ status }).eq('id', id);
}

export async function toggleStarred(id: string, value: boolean): Promise<void> {
  await supabase.from('scout_results').update({ is_starred: value }).eq('id', id);
}

export async function updateResultOverrides(
  id: string,
  overrides: Partial<Pick<ScoutResult, 'arv_override' | 'rehab_override' | 'rent_override' | 'notes'>>
): Promise<void> {
  await supabase.from('scout_results').update(overrides).eq('id', id);
}
