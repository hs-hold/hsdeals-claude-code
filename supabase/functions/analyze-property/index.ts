import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PARTNERS_API_BASE = 'https://partnersapi-6cqhbrsewa-uc.a.run.app';

async function getPartnersKey(): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  console.log('[getPartnersKey] url:', !!supabaseUrl, 'serviceKey:', !!serviceKey);

  if (supabaseUrl && serviceKey) {
    try {
      const db = createClient(supabaseUrl, serviceKey);
      // 4-second timeout on DB query to avoid hanging
      const result = await Promise.race([
        db.from('service_api_keys').select('api_key').eq('service_name', 'dealbeast').single(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 4000)),
      ]) as any;
      console.log('[getPartnersKey] DB result:', result?.data?.api_key ? 'KEY_FOUND' : 'NO_KEY', result?.error?.message);
      if (result?.data?.api_key) return result.data.api_key;
    } catch (e) {
      console.error('[getPartnersKey] DB error/timeout:', String(e));
    }
  }

  const envKey = Deno.env.get('PARTNERS_API_KEY') || null;
  console.log('[getPartnersKey] fallback env key:', !!envKey);
  return envKey;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, down_payment_amount, rehab_cost } = await req.json();
    
    console.log('Analyzing property:', { address, down_payment_amount, rehab_cost });

    const apiKey = await getPartnersKey();
    console.log('[analyze-property] apiKey found:', !!apiKey, '| key prefix:', apiKey?.slice(0, 8));
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API key not configured — add it in Settings → External API Keys → DealBeast' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call the external API — no timeout, let it run as long as needed
    console.log('[analyze-property] calling Partners API for:', address);
    let response: Response;
    try {
      response = await fetch(`${PARTNERS_API_BASE}/partners/sniper-mode`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          filters: { down_payment_amount: down_payment_amount || 50000 },
          extraParams: { rehab_cost: rehab_cost || 0 },
        }),
      });
    } catch (fetchErr) {
      console.error('[analyze-property] fetch error:', String(fetchErr));
      return new Response(
        JSON.stringify({ success: false, error: `Partners API unreachable: ${String(fetchErr)}` }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[analyze-property] Partners API status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[analyze-property] API error:', response.status, errorText.slice(0, 300));
      return new Response(
        JSON.stringify({ success: false, error: `API error ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('[analyze-property] top-level keys:', Object.keys(data || {}));
    const inner = data?.data || data?.result || {};
    console.log('[analyze-property] inner keys:', Object.keys(inner));
    const propObj = inner?.property || inner?.analysis || inner;
    console.log('[analyze-property] property keys:', Object.keys(propObj || {}));
    console.log('[analyze-property] property sample:', JSON.stringify(propObj).slice(0, 2000));
    console.log('[analyze-property] full response:', JSON.stringify(data).slice(0, 3000));

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-property function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
