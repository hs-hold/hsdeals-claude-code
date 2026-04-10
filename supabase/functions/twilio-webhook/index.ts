import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWIML_EMPTY = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

serve(async (req) => {
  // Twilio sends POST with form-encoded body
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const formData = await req.formData();
    const from       = formData.get('From') as string;
    const to         = formData.get('To') as string;
    const body       = formData.get('Body') as string;
    const messageSid = formData.get('MessageSid') as string;

    console.log(`[twilio-webhook] Incoming SMS from ${from}: ${body?.substring(0, 50)}`);

    if (!from || !body) {
      return new Response(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceKey);

    // Find the deal associated with this sender's phone number
    // Match by the last outbound message sent TO this number
    const { data: lastMsg } = await db
      .from('deal_messages')
      .select('deal_id')
      .eq('to_phone', from)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastMsg?.deal_id) {
      await db.from('deal_messages').insert({
        deal_id:    lastMsg.deal_id,
        direction:  'inbound',
        from_phone: from,
        to_phone:   to,
        body,
        twilio_sid: messageSid,
        status:     'received',
      });
      console.log(`[twilio-webhook] Saved reply for deal ${lastMsg.deal_id}`);
    } else {
      console.warn(`[twilio-webhook] No outbound message found for ${from} — cannot match to deal`);
    }

    // Always return empty TwiML (no auto-reply)
    return new Response(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } });
  } catch (error) {
    console.error('[twilio-webhook] error:', error);
    return new Response(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } });
  }
});
