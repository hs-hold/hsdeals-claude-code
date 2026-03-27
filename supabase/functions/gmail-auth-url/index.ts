import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { redirect_uri } = await req.json();
    
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    if (!clientId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Google Client ID not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify', // To mark emails as read
    ];

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirect_uri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    // Force account selection to avoid org/account mismatch 403 screens
    authUrl.searchParams.set('prompt', 'select_account consent');
    // Keep prior consents when expanding scopes
    authUrl.searchParams.set('include_granted_scopes', 'true');

    console.log('Generated auth URL for redirect:', redirect_uri);

    return new Response(
      JSON.stringify({ success: true, auth_url: authUrl.toString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating auth URL:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
