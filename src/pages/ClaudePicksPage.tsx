import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDeals } from '@/context/DealsContext';
import { formatCurrency } from '@/utils/financialCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, CheckCircle2, Clock, AlertCircle, ExternalLink, TrendingUp, Home, Wrench } from 'lucide-react';
import { Deal } from '@/types/deal';

const CLAUDE_PICKS: {
  id: string;
  marketStatus: 'active' | 'pending' | 'off-market';
  priority: 'high' | 'medium' | 'low';
  marketNote: string;
  analysisNote: string;
  checkedAt: string;
}[] = [
  {
    id: '8b7a1a56-54ba-4780-997f-91fd3405b4df',
    marketStatus: 'active',
    priority: 'high',
    marketNote: 'Active — מחיר עלה ל-$204,900 (מ-$194,900)',
    analysisNote: 'Grade A עם Cap 13.8% — הנכס הכי חזק. Spread של $105K עם Rehab $47.7K. הגש הצעה.',
    checkedAt: '28.3.2026',
  },
  {
    id: '7ee432a6-3e3e-449b-aca2-8b71a07f2773',
    marketStatus: 'active',
    priority: 'medium',
    marketNote: 'Active — הוזל מ-$240K ל-$204,750, רשומה מחדש כמה פעמים',
    analysisNote: 'Grade B, Cap 10.1%, Rehab נמוך $35K. המוכר רוצה לצאת — יש כוח מיקוח.',
    checkedAt: '28.3.2026',
  },
  {
    id: '5db0bfed-f753-4132-ac0d-5bb78457fc7a',
    marketStatus: 'pending',
    priority: 'medium',
    marketNote: 'Pending — תחת חוזה מ-19.1.2026 (~42 ימים)',
    analysisNote: 'Cap 14.1% — הגבוה ביותר בכל הרשימה. שווה לעקוב אם ייפול מחוזה.',
    checkedAt: '28.3.2026',
  },
  {
    id: '5ee058c4-7d44-4f3f-940c-e75edcaee8d6',
    marketStatus: 'off-market',
    priority: 'low',
    marketNote: 'Off Market — הפך לנכס שכירות (FirstKey Homes)',
    analysisNote: 'Cap 12.2%, Grade A. יצא מהשוק אך שווה לבדוק ישירות עם הבעלים.',
    checkedAt: '28.3.2026',
  },
];

const statusConfig = {
  active: { label: 'Active', icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  'off-market': { label: 'Off Market', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
};

const priorityConfig = {
  high: { label: 'הגש הצעה', className: 'bg-green-500/20 text-green-400 border-green-400/30' },
  medium: { label: 'עקוב', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-400/30' },
  low: { label: 'בדוק ידנית', className: 'bg-red-500/20 text-red-400 border-red-400/30' },
};

export default function ClaudePicksPage() {
  const { deals, isLoading } = useDeals();

  const picks = useMemo(() => {
    return CLAUDE_PICKS.map(pick => {
      const deal = deals.find(d => d.id === pick.id);
      return deal && deal.status !== 'not_relevant' ? { deal, ...pick } : null;
    }).filter(Boolean) as { deal: Deal; id: string; marketStatus: 'active' | 'pending' | 'off-market'; priority: 'high' | 'medium' | 'low'; marketNote: string; analysisNote: string; checkedAt: string }[];
  }, [deals]);

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Bot className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl md:text-3xl font-bold">Claude's Picks</h1>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-400/30">AI Research</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          עסקאות שנחקרו ידנית ב-{CLAUDE_PICKS[0].checkedAt} — כולל בדיקת סטטוס שוק בזמן אמת
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {picks.map(({ deal, marketStatus, priority, marketNote, analysisNote }) => {
          const a = deal.apiData;
          const sCfg = statusConfig[marketStatus];
          const pCfg = priorityConfig[priority];
          const StatusIcon = sCfg.icon;
          const price = deal.overrides?.purchasePrice ?? a?.purchasePrice ?? 0;
          const arv = deal.overrides?.arv ?? a?.arv ?? 0;
          const rehab = deal.overrides?.rehabCost ?? a?.rehabCost ?? 0;
          const cap = a?.capRate ?? 0;
          const rent = a?.rent ?? 0;
          const grade = a?.grade ?? '?';
          const spread = arv - price;

          return (
            <Card key={deal.id} className={`border transition-all duration-200 hover:shadow-lg ${marketStatus === 'active' ? 'border-blue-500/30 hover:border-blue-500/60' : 'border-border/50 opacity-80'}`}>
              <CardContent className="p-5 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold px-2 py-0.5 rounded ${grade === 'A' ? 'bg-green-500/20 text-green-400' : grade === 'B' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        Grade {grade}
                      </span>
                      <Badge variant="outline" className={pCfg.className}>{pCfg.label}</Badge>
                    </div>
                    <p className="font-semibold">{deal.address.street}</p>
                    <p className="text-sm text-muted-foreground">{deal.address.city}, {deal.address.state} {deal.address.zip}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${sCfg.bg} ${sCfg.color} shrink-0`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {sCfg.label}
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-4 gap-3 py-3 border-y border-border/50">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Cap Rate</p>
                    <p className="text-base font-bold text-blue-400">{cap.toFixed(1)}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Spread</p>
                    <p className="text-base font-bold text-green-400">{formatCurrency(spread)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center justify-center gap-0.5"><Home className="w-2.5 h-2.5" />Rent</p>
                    <p className="text-base font-bold">{formatCurrency(rent)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center justify-center gap-0.5"><Wrench className="w-2.5 h-2.5" />Rehab</p>
                    <p className="text-base font-bold text-yellow-400">{formatCurrency(rehab)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-muted/30 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">מחיר</p>
                    <p className="font-semibold">{formatCurrency(price)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">ARV</p>
                    <p className="font-semibold text-green-400">{formatCurrency(arv)}</p>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 rounded-lg p-2.5">
                    <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                    <span>{marketNote}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 rounded-lg p-2.5">
                    <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                    <span>{analysisNote}</span>
                  </div>
                </div>

                <Link to={`/deals/${deal.id}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium">
                  <ExternalLink className="w-4 h-4" /> פתח ניתוח מלא
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
