import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DealMessage {
  id: string;
  deal_id: string;
  direction: 'outbound' | 'inbound';
  to_phone: string | null;
  from_phone: string | null;
  body: string;
  twilio_sid: string | null;
  status: string;
  created_at: string;
}

export function useDealMessages(dealId: string | undefined) {
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    const { data } = await supabase
      .from('deal_messages')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: true });
    setMessages((data as DealMessage[]) || []);
    setLoading(false);
  }, [dealId]);

  useEffect(() => {
    fetchMessages();

    if (!dealId) return;

    const channel = supabase
      .channel(`deal-messages-${dealId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deal_messages', filter: `deal_id=eq.${dealId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as DealMessage]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [dealId, fetchMessages]);

  const sendSms = useCallback(async (toPhone: string, body: string) => {
    if (!dealId) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { deal_id: dealId, to_phone: toPhone, body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    } finally {
      setSending(false);
    }
  }, [dealId]);

  return { messages, loading, sending, sendSms, refetch: fetchMessages };
}
