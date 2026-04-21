import { useState, useEffect, useRef, useCallback } from 'react';
import { Wand2, Send, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Deal } from '@/types/deal';
import { supabase } from '@/integrations/supabase/client';
import { useSettings } from '@/context/SettingsContext';
import { formatCurrency, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';
import { useGmailAuth } from '@/hooks/useGmailAuth';
import { toast } from 'sonner';

const TARGET_PROFIT = 50_000;
const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';

function buildRawEmail(to: string, subject: string, body: string): string {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    '',
    body,
  ];
  const raw = lines.join('\r\n');
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface OfferEmailDraftProps {
  deal: Deal;
}

export function OfferEmailDraft({ deal }: OfferEmailDraftProps) {
  const { settings } = useSettings();
  const { getValidToken } = useGmailAuth();
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [stale, setStale] = useState(false);
  const prevSnapshotRef = useRef('');

  const loanDefaults = settings.loanDefaults;

  // Mark draft stale when deal numbers change
  useEffect(() => {
    const snapshot = JSON.stringify({
      overrides: deal.overrides,
      financials: deal.financials,
      apiData: deal.apiData,
    });
    if (prevSnapshotRef.current && prevSnapshotRef.current !== snapshot && draft) {
      setStale(true);
    }
    prevSnapshotRef.current = snapshot;
  }, [deal.overrides, deal.financials, deal.apiData, draft]);

  const calcNumbers = useCallback(() => {
    const { apiData, financials, overrides } = deal;
    if (!apiData || !financials) return null;

    const purchasePrice = overrides?.purchasePrice ?? apiData.purchasePrice ?? 0;
    const arv = overrides?.arv ?? financials.arv ?? apiData.arv ?? 0;
    if (purchasePrice <= 0 || arv <= 0) return null;

    const rehabCost = overrides?.rehabCost ?? apiData.rehabCost ?? 0;
    const holdingMonths = loanDefaults?.holdingMonths ?? 4;
    const propertyTaxMonthly = (apiData.propertyTax ?? 0) / 12;
    const insuranceMonthly = getEffectiveMonthlyInsurance(apiData.insurance);
    const holdingCosts = (propertyTaxMonthly + insuranceMonthly + 300) * holdingMonths;
    const agentCommission = arv * 0.06;
    const notaryFees = 500;
    const closingCosts = purchasePrice * 0.02;
    const totalCosts = rehabCost + closingCosts + holdingCosts + agentCommission + notaryFees;
    const netProfit = arv - purchasePrice - totalCosts;

    // Price at which netProfit = TARGET_PROFIT
    // arv - offerPrice*1.02 - rehabCost - holdingCosts - agentCommission - notaryFees = 50000
    const offerPrice = (arv - rehabCost - holdingCosts - agentCommission - notaryFees - TARGET_PROFIT) / 1.02;

    return { purchasePrice, arv, rehabCost, holdingCosts, holdingMonths, agentCommission, notaryFees, closingCosts, netProfit, offerPrice };
  }, [deal, loanDefaults]);

  const generate = async () => {
    const nums = calcNumbers();
    if (!nums) {
      toast.error('Deal has no analysis data yet — analyze it first');
      return;
    }

    setGenerating(true);
    setStale(false);
    try {
      const { data: keyRow } = await supabase
        .from('service_api_keys')
        .select('api_key')
        .eq('service_name', 'anthropic')
        .single();

      if (!keyRow?.api_key) {
        toast.error('Anthropic API key not configured in Settings');
        return;
      }

      const senderName = deal.senderName?.split(' ')[0] || 'there';
      const address = deal.address.full;
      const sellingCosts = nums.agentCommission + nums.notaryFees + nums.closingCosts;

      const prompt = `Write a concise, professional reply email to a real estate wholesaler/seller about a property we're evaluating for a cash flip.

The email must:
1. Thank them for the opportunity and express genuine interest in the property
2. Present our investment analysis showing why the current price doesn't work
3. Make a specific verbal offer at the price that achieves our minimum $50,000 net profit
4. Keep a respectful, collaborative tone — we want to do business if the numbers work
5. Be under 180 words. No subject line.

Analysis:
- Property: ${address}
- Asking price: ${formatCurrency(nums.purchasePrice)}
- Our ARV estimate: ${formatCurrency(nums.arv)}
- Estimated repairs: ${formatCurrency(nums.rehabCost)}
- Holding costs (${nums.holdingMonths} months): ${formatCurrency(nums.holdingCosts)}
- Selling costs (6% agent + closing + fees): ${formatCurrency(sellingCosts)}
- Net profit at asking price: ${formatCurrency(nums.netProfit)}
- Our minimum profit requirement: $50,000
- Our offer (for $50K profit): ${formatCurrency(nums.offerPrice)}

Start with "Hi ${senderName}," — do not include a subject line or sign-off placeholder.`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': keyRow.api_key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claude API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      setDraft(data.content?.[0]?.text?.trim() ?? '');
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate email');
    } finally {
      setGenerating(false);
    }
  };

  const sendReply = async () => {
    if (!draft.trim() || !deal.senderEmail) return;
    const token = await getValidToken();
    if (!token) {
      toast.error('Gmail not connected');
      return;
    }

    setSending(true);
    try {
      const subject = `Re: ${(deal.emailSubject || 'Your property').replace(/^Re:\s*/i, '')}`;
      const raw = buildRawEmail(deal.senderEmail, subject, draft);
      const body: Record<string, string> = { raw };
      if (deal.gmailThreadId) body.threadId = deal.gmailThreadId;

      const res = await fetch(`${GMAIL_API}/messages/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Send failed: ${res.status}`);

      toast.success('Offer email sent!');
      setDraft('');
      setStale(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          AI Offer Email
        </p>
        <Button
          size="sm"
          variant={stale ? 'default' : 'outline'}
          className="h-7 text-xs gap-1.5"
          onClick={generate}
          disabled={generating}
        >
          {generating ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
          ) : stale ? (
            <><RefreshCw className="w-3 h-3" /> Refresh Draft</>
          ) : (
            <><Wand2 className="w-3 h-3" /> Generate Offer Email</>
          )}
        </Button>
      </div>

      {draft && (
        <>
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="min-h-[200px] text-sm resize-y"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {stale ? (
                <span className="text-yellow-400">Numbers changed — refresh to update draft</span>
              ) : (
                'Review and edit before sending'
              )}
            </p>
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={sendReply}
              disabled={sending || !deal.senderEmail}
              title={!deal.senderEmail ? 'No sender email available' : undefined}
            >
              {sending ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Sending...</>
              ) : (
                <><Send className="w-3 h-3" /> Send Reply</>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
