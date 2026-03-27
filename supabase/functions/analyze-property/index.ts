import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PARTNERS_API_BASE = 'https://partnersapi-6cqhbrsewa-uc.a.run.app';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, down_payment_amount, rehab_cost } = await req.json();
    
    console.log('Analyzing property:', { address, down_payment_amount, rehab_cost });

    const apiKey = Deno.env.get('PARTNERS_API_KEY');
    if (!apiKey) {
      console.error('PARTNERS_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call the external API
    const response = await fetch(`${PARTNERS_API_BASE}/partners/sniper-mode`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address,
        filters: {
          down_payment_amount: down_payment_amount || 50000,
        },
        extraParams: {
          rehab_cost: rehab_cost || 0,
        },
      }),
    });

    console.log('API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `API error: ${response.status}`,
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('API response received successfully');

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
