import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, RefreshCw, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useGmailAuth } from '@/hooks/useGmailAuth';
import { Deal } from '@/types/deal';
import { supabase } from '@/integrations/supabase/client';

const GMAIL = 'https://www.googleapis.com/gmail/v1/users/me';

interface ThreadMessage {
  id: string;
  threadId: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  snippet: string;
}

// ── Gmail MIME helpers ────────────────────────────────────────────────────────

function getHeader(msg: any, name: string): string {
  return msg?.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decodeBase64(data: string): string {
  try {
    return decodeURIComponent(
      escape(atob(data.replace(/-/g, '+').replace(/_/g, '/')))
    );
  } catch {
    return '';
  }
}

function extractBody(payload: any): string {
  if (!payload) return '';
  // Plain text part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  // Multipart — walk parts
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return payload.body?.data ? decodeBase64(payload.body.data) : '';
}

// ── Build RFC-2822 MIME message (base64url) ───────────────────────────────────

function buildRawEmail(to: string, subject: string, body: string, inReplyTo?: string, references?: string): string {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push('', body);

  const raw = lines.join('\r\n');
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─────────────────────────────────────────────────────────────────────────────

interface EmailThreadChatProps {
  deal: Deal;
}

export function EmailThreadChat({ deal }: EmailThreadChatProps) {
  const { getValidToken } = useGmailAuth();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const threadId = deal.gmailThreadId;
  const toAddress = deal.senderEmail || '';
  const myEmail = ''; // We don't know the user's own email, inferred from sent messages

  const fetchThread = useCallback(async () => {
    if (!threadId) return;
    const token = await getValidToken();
    if (!token) { setError('Gmail non connesso'); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${GMAIL}/threads/${threadId}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Gmail API error ${res.status}`);
      const data = await res.json();

      // Derive the user's own email from the first "From" that looks like it's ours
      // We'll use sent message heuristic: "to" in the first message = the other party
      const parsed: ThreadMessage[] = (data.messages || []).map((msg: any) => {
        const from    = getHeader(msg, 'from');
        const to      = getHeader(msg, 'to');
        const subject = getHeader(msg, 'subject');
        const date    = getHeader(msg, 'date');
        const body    = extractBody(msg.payload);
        // Heuristic: if "From" contains the same sender email as the original deal sender,
        // it's inbound; otherwise outbound (we sent it)
        const isSenderEmail = deal.senderEmail
          ? from.toLowerCase().includes(deal.senderEmail.toLowerCase())
          : false;
        const direction: 'inbound' | 'outbound' = isSenderEmail ? 'inbound' : 'outbound';
        return {
          id: msg.id,
          threadId: msg.threadId,
          direction,
          from,
          to,
          subject,
          body: body.trim(),
          date,
          snippet: msg.snippet || '',
        };
      });
      setMessages(parsed);
    } catch (e: any) {
      setError(e.message || 'שגיאה בטעינת השרשור');
    } finally {
      setLoading(false);
    }
  }, [threadId, getValidToken, deal.senderEmail]);

  useEffect(() => { fetchThread(); }, [fetchThread]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!replyBody.trim() || !threadId) return;
    const token = await getValidToken();
    if (!token) return;

    setSending(true);
    try {
      // Get last message for In-Reply-To and References headers
      const lastMsg = messages[messages.length - 1];
      const msgIdHeader = lastMsg ? getHeader({ payload: { headers: [] } }, 'message-id') : undefined;
      const subject = lastMsg ? `Re: ${lastMsg.subject.replace(/^Re:\s*/i, '')}` : `Re: ${deal.emailSubject || ''}`;

      const raw = buildRawEmail(toAddress, subject, replyBody, msgIdHeader);

      const sendBody: Record<string, string> = { raw };
      if (threadId) sendBody.threadId = threadId;  // only thread if we have the ID

      const res = await fetch(`${GMAIL}/messages/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sendBody),
      });
      if (!res.ok) throw new Error(`Send failed: ${res.status}`);

      // Save outbound message in DB so it shows even without Gmail token
      const prevData = deal.emailExtractedData || {};
      const prevMessages: any[] = Array.isArray((prevData as any).threadMessages) ? (prevData as any).threadMessages : [];
      prevMessages.push({
        messageId: `local-${Date.now()}`,
        direction: 'outbound',
        from: 'me',
        senderName: 'Me',
        subject,
        body: replyBody.trim(),
        date: new Date().toISOString(),
      });
      await supabase.from('deals').update({
        email_extracted_data: { ...prevData, threadMessages: prevMessages },
      }).eq('id', deal.id);

      setReplyBody('');
      // Refresh thread from Gmail
      await fetchThread();
    } catch (e: any) {
      setError(e.message || 'שגיאה בשליחת המייל');
    } finally {
      setSending(false);
    }
  };

  // No threadId — compose-only mode (new email to the sender, not a reply in thread)
  const composeOnly = !threadId;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages (only when we have a real thread) */}
      {!composeOnly && <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0" style={{ maxHeight: '420px' }}>
        {loading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive text-center py-4">{error}</div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={cn('flex flex-col max-w-[85%] gap-1', msg.direction === 'outbound' ? 'ml-auto items-end' : 'items-start')}
          >
            <div className={cn(
              'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
              msg.direction === 'outbound'
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-muted text-foreground rounded-bl-sm'
            )}>
              {msg.body || msg.snippet}
            </div>
            <span className="text-[10px] text-muted-foreground px-1">
              {msg.direction === 'inbound' ? (deal.senderName || msg.from.split('<')[0].trim()) : 'אני'}
              {' · '}
              {msg.date ? new Date(msg.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>}

      {/* Reply / compose box */}
      <div className={cn('p-3 space-y-2', !composeOnly && 'border-t border-border')}>
        {composeOnly && (
          <p className="text-xs text-muted-foreground pb-1">
            שלח מייל ל-<span className="font-medium text-foreground">{deal.senderEmail}</span>
          </p>
        )}
        <Textarea
          value={replyBody}
          onChange={e => setReplyBody(e.target.value)}
          placeholder={`${composeOnly ? 'כתוב הודעה ל' : 'השב ל-'}${deal.senderName || deal.senderEmail || 'המוכר'}...`}
          rows={3}
          className="text-sm resize-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
          }}
        />
        <div className="flex items-center justify-between">
          {!composeOnly ? (
            <button
              onClick={fetchThread}
              disabled={loading}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
              רענן
            </button>
          ) : <span />}
          <Button size="sm" onClick={handleSend} disabled={sending || !replyBody.trim()}>
            {sending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            שלח
          </Button>
        </div>
      </div>
    </div>
  );
}
