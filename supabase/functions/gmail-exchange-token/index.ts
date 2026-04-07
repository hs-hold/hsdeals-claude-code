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
    const body = await req.json();
    const { code, redirect_uri, refresh_token, grant_type } = body;

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Google OAuth credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Refresh token flow ──────────────────────────────────────────────────
    if (grant_type === 'refresh_token' || refresh_token) {
      if (!refresh_token) {
        return new Response(
          JSON.stringify({ success: false, error: 'No refresh token provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('Refreshing access token...');
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text();
        console.error('Token refresh error:', errorText);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to refresh token', details: errorText }),
          { status: refreshResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const refreshData = await refreshResponse.json();
      console.log('Token refresh successful');
      return new Response(
        JSON.stringify({
          success: true,
          access_token: refreshData.access_token,
          // Google doesn't re-issue refresh_token on refresh — keep the old one
          refresh_token: refresh_token,
          expires_in: refreshData.expires_in,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Authorization code exchange flow ────────────────────────────────────
    if (!code) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization code provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Exchanging code for token...');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to exchange token', details: errorText }),
        { status: tokenResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
    console.log('Token exchange successful');

    return new Response(
      JSON.stringify({
        success: true,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error exchanging token:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
