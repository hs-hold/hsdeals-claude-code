import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deal_id, to_phone, body } = await req.json();

    if (!deal_id || !to_phone || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: deal_id, to_phone, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceKey);

    // Get Twilio credentials from service_api_keys (with env fallback)
    const [sidRow, tokenRow, fromRow] = await Promise.all([
      db.from('service_api_keys').select('api_key').eq('service_name', 'twilio_account_sid').single(),
      db.from('service_api_keys').select('api_key').eq('service_name', 'twilio_auth_token').single(),
      db.from('service_api_keys').select('api_key').eq('service_name', 'twilio_from_number').single(),
    ]);

    const accountSid = sidRow.data?.api_key || Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken  = tokenRow.data?.api_key || Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = fromRow.data?.api_key  || Deno.env.get('TWILIO_FROM_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(
        JSON.stringify({ error: 'Twilio credentials not configured. Add them in Settings → API Keys.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const toNormalized = normalizePhone(to_phone);

    // Send SMS via Twilio REST API
    const credentials = btoa(`${accountSid}:${authToken}`);
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To:   toNormalized,
          From: fromNumber,
          Body: body,
        }),
      }
    );

    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      return new Response(
        JSON.stringify({ error: twilioData.message || 'Twilio API error', code: twilioData.code }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save message to DB
    const { error: dbError } = await db.from('deal_messages').insert({
      deal_id,
      direction:  'outbound',
      to_phone:   toNormalized,
      from_phone: fromNumber,
      body,
      twilio_sid: twilioData.sid,
      status:     twilioData.status,
    });

    if (dbError) console.error('[send-sms] DB insert error:', dbError);

    return new Response(
      JSON.stringify({ success: true, sid: twilioData.sid, status: twilioData.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-sms] error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
