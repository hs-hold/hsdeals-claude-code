import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BookOpen, Terminal, Zap, Shield, ArrowLeft, Copy, Check, Bell, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useState, useCallback } from 'react';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxZWVsZHRqdXNkam1wdW9tdHZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTAyNjEsImV4cCI6MjA4MDUyNjI2MX0.r0zHhZkZeM8jh4waUxgVb2VovH_FrXt3C581Aw7H-Sw';
const BASE_URL = 'https://kqeeldtjusdjmpuomtvs.supabase.co/functions/v1';

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-muted/80 border border-border rounded-lg p-4 overflow-x-auto text-sm font-mono text-foreground">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost" size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold mt-8 mb-3 text-foreground">{children}</h2>;
}

function ParamTable({ rows }: { rows: { name: string; type: string; required: boolean; def?: string; desc: string }[] }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden my-3">
      <table className="w-full text-sm">
        <thead><tr className="bg-muted/50 border-b border-border">
          <th className="text-left p-2.5 font-medium text-muted-foreground">Field</th>
          <th className="text-left p-2.5 font-medium text-muted-foreground">Type</th>
          <th className="text-left p-2.5 font-medium text-muted-foreground">Required</th>
          <th className="text-left p-2.5 font-medium text-muted-foreground">Default</th>
          <th className="text-left p-2.5 font-medium text-muted-foreground">Description</th>
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.name} className="border-b border-border last:border-0">
            <td className="p-2.5 font-mono text-xs text-primary">{r.name}</td>
            <td className="p-2.5 text-muted-foreground">{r.type}</td>
            <td className="p-2.5">{r.required ? <Badge variant="destructive" className="text-[10px]">Yes</Badge> : <Badge variant="secondary" className="text-[10px]">No</Badge>}</td>
            <td className="p-2.5 text-muted-foreground">{r.def || '—'}</td>
            <td className="p-2.5 text-muted-foreground">{r.desc}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function ApiDocumentationPage() {
  const navigate = useNavigate();
  const [quickGuideCopied, setQuickGuideCopied] = useState(false);

  const generateQuickGuide = useCallback(() => {
    const guide = `# API — Quick Start Guide

## Setup
Base URL: ${BASE_URL}
Every request needs 2 headers:
  x-api-key: YOUR_ACCESS_KEY  (generated in Settings → API Keys)
  apikey: ${ANON_KEY}

Note: You do NOT need any external API key. The analysis engine runs on our server.
Your x-api-key simply authenticates your access.

## 1) Analyze a Single Address
POST /api-analyze-zip
Body: { "address": "123 Main St, Atlanta, GA 30032" }
→ Returns instant financial analysis (flip ROI, rental cashflow, BRRRR metrics, best strategy, score 1-10)

## 2) Bulk ZIP Code Search
POST /api-analyze-zip
Body: { "zipcode": "30032", "max_results": 10, "callback_url": "https://your-server.com/webhook", "webhook_secret": "my-secret" }
→ Searches for Single Family homes ($80K-$250K, 2-4 beds, 1+ bath, 1150-2300 sqft)
→ Analyzes up to 60 properties in background (one at a time for stability)
→ Results automatically POSTed to your callback_url with ?token=my-secret when complete

## 3) Results Format
Good deals (Flip Score ≥ 8) include: purchase_price, arv, rehab_cost, flip ROI/profit, rental cashflow/cap_rate, BRRRR metrics, best_strategy, ai_summary
Properties below threshold saved as "filtered_out" (viewable in dashboard)

## Quick curl Example
curl -X POST "${BASE_URL}/api-analyze-zip" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_ACCESS_KEY" \\
  -H "apikey: ${ANON_KEY}" \\
  -d '{ "zipcode": "30032", "max_results": 5, "callback_url": "https://your-webhook.com", "webhook_secret": "my-secret" }'

## Notes
• Duplicate addresses are skipped automatically
• Price drops trigger re-analysis
• MAO (Max Allowable Offer) returned when a deal is close but needs a small discount
`;
    navigator.clipboard.writeText(guide);
    setQuickGuideCopied(true);
    setTimeout(() => setQuickGuideCopied(false), 3000);
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />Back
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">API Documentation</h1>
            <p className="text-muted-foreground">External API Reference</p>
          </div>
        </div>
        <Button onClick={generateQuickGuide} variant="outline" className="gap-2">
          {quickGuideCopied ? (
            <><Check className="w-4 h-4 text-green-500" />Copied!</>
          ) : (
            <><FileText className="w-4 h-4" />Copy Quick Guide</>
          )}
        </Button>
      </div>

      {/* Base URL */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="w-5 h-5" /> Base URL
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CodeBlock code={BASE_URL} />
        </CardContent>
      </Card>

      {/* Authentication */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5" /> Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Every request requires <strong>two headers</strong>:</p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 border-b border-border">
                <th className="text-left p-2.5 font-medium text-muted-foreground">Header</th>
                <th className="text-left p-2.5 font-medium text-muted-foreground">Description</th>
              </tr></thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="p-2.5 font-mono text-xs text-primary">x-api-key</td>
                  <td className="p-2.5 text-muted-foreground">Your personal access key (generated in Settings → API Keys by an admin)</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-mono text-xs text-primary">apikey</td>
                  <td className="p-2.5 text-muted-foreground">Platform gateway key (always the same, shown below)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <CodeBlock code={`apikey: ${ANON_KEY}`} />
          <p className="text-xs text-muted-foreground italic">
            💡 You do <strong>not</strong> need any external API key. The analysis engine runs on our server — your <code>x-api-key</code> simply authenticates your access.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Address Mode */}
      <SectionTitle>1. Analyze Single Property (Address Mode)</SectionTitle>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Badge className="bg-green-600 text-white">POST</Badge>
            <code className="text-sm font-mono text-foreground">/api-analyze-zip</code>
          </div>
          <p className="text-sm text-muted-foreground">Analyze a single property by full address. Returns real-time financial analysis.</p>
          <h3 className="font-semibold text-sm">Request Body</h3>
          <CodeBlock code={`{
  "address": "1514 Peachcrest Rd, Decatur, GA 30032"
}`} language="json" />
          <h3 className="font-semibold text-sm">Response</h3>
          <CodeBlock code={`{
  "success": true,
  "mode": "address",
  "already_analyzed": false,
  "address": "1514 Peachcrest Rd, Decatur, GA 30032",
  "grade": "B",
  "purchase_price": 150000,
  "arv": 220000,
  "rehab_cost": 25000,
  "monthly_rent": 1600,
  "flip": {
    "cash": { "net_profit": 23500, "roi_percent": 12.8, "total_investment": 183200 },
    "hml": { "net_profit": 18200, "roi_percent": 45.3, "cash_out_of_pocket": 40200 },
    "score": 8
  },
  "rental": {
    "monthly_cashflow": 285, "cash_on_cash_percent": 8.5,
    "cap_rate_percent": 7.2, "score": 5
  },
  "brrrr": {
    "money_in_deal": 12000, "monthly_cashflow": 185,
    "cash_on_cash_percent": 18.5, "equity": 54000,
    "score": 7, "recommended": true
  },
  "best_strategy": "Flip (Cash)",
  "best_score": 8,
  "mao": null,
  "ai_summary": "AI-generated analysis..."
}`} language="json" />
          <p className="text-xs text-muted-foreground italic">
            If previously analyzed, <code>already_analyzed: true</code> and <code>deal_id</code> will be included. Re-analysis only occurs on price drops.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Zipcode Mode */}
      <SectionTitle>2. Bulk Search by ZIP Code (Zipcode Mode)</SectionTitle>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Badge className="bg-green-600 text-white">POST</Badge>
            <code className="text-sm font-mono text-foreground">/api-analyze-zip</code>
          </div>
          <p className="text-sm text-muted-foreground">Search a ZIP code for investment properties and analyze them in the background.</p>
          <h3 className="font-semibold text-sm">Request Body</h3>
          <CodeBlock code={`{
  "zipcode": "30032",
  "max_results": 20,
  "callback_url": "https://your-server.com/webhook",
  "webhook_secret": "my-secret-token"
}`} language="json" />
          <ParamTable rows={[
            { name: 'zipcode', type: 'string', required: true, desc: 'US ZIP code to search' },
            { name: 'max_results', type: 'number', required: false, def: '5', desc: 'Max new properties to analyze (max 60)' },
            { name: 'callback_url', type: 'string', required: true, desc: 'Webhook URL — results POSTed here when complete' },
            { name: 'webhook_secret', type: 'string', required: false, desc: 'Secret token appended as ?token=YOUR_SECRET to your callback URL for verification' },
          ]} />
          <h3 className="font-semibold text-sm">Immediate Response</h3>
          <CodeBlock code={`{
  "success": true,
  "mode": "zipcode",
  "status": "processing",
  "job_id": "abc123-...",
  "zipcode": "30032",
  "total_found": 45,
  "total_after_filter": 28,
  "total_to_analyze": 20,
  "message": "Processing 20 new properties. Results will be sent to your webhook."
}`} language="json" />
        </CardContent>
      </Card>

      <Separator />

      {/* Getting Results */}
      <SectionTitle>3. Getting Results (Webhook)</SectionTitle>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Webhook Delivery
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            When all properties are analyzed, results are automatically <strong>POSTed</strong> to your <code className="text-primary">callback_url</code>.
          </p>
          <h3 className="font-semibold text-sm">Webhook Payload</h3>
          <CodeBlock code={`{
  "success": true,
  "job_id": "abc123-...",
  "zipcode": "30032",
  "summary": "Found 20 properties. 5 good deals, 12 filtered out...",
  "total_analyzed": 20,
  "total_good_deals": 5,
  "total_filtered_out": 12,
  "deals": [
    {
      "deal_id": "uuid-...",
      "address": "123 Main St, Decatur, GA 30032",
      "purchase_price": 145000,
      "arv": 230000,
      "flip": { "score": 9, "cash": { "roi_percent": 14.2 } },
      "best_strategy": "Flip (Cash)",
      "best_score": 9,
      "ai_summary": "Strong flip candidate..."
    }
  ],
  "filtered_out_deals": ["456 Oak Ave: flip score 5/10 - below 8"],
  "errors": []
}`} language="json" />
        </CardContent>
      </Card>

      <Separator />

      {/* Scoring */}
      <SectionTitle>4. Scoring System</SectionTitle>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-semibold text-sm">Flip Score (1-10)</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 border-b border-border">
                <th className="text-left p-2.5 font-medium text-muted-foreground">Score</th>
                <th className="text-left p-2.5 font-medium text-muted-foreground">ROI %</th>
              </tr></thead>
              <tbody>
                {[
                  ['10', '≥ 25%'], ['9', '≥ 20%'], ['8', '≥ 18%'],
                  ['7', '≥ 16%'], ['6', '≥ 15%'], ['5', '≥ 13%'],
                ].map(([s, r]) => (
                  <tr key={s} className="border-b border-border last:border-0">
                    <td className="p-2.5 font-bold">{s}</td>
                    <td className="p-2.5 text-muted-foreground">{r}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            <strong>Only deals with Flip Score ≥ 8</strong> are returned as "good deals." Lower scores are saved as <code>filtered_out</code>.
          </p>

          <h3 className="font-semibold text-sm mt-4">MAO (Maximum Allowable Offer)</h3>
          <p className="text-sm text-muted-foreground">
            Returned when Flip Score &lt; 8 and required price discount ≤ 8%. Suggests the max price for a profitable deal.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Preset Filters */}
      <SectionTitle>5. Preset Search Filters (ZIP Mode)</SectionTitle>
      <Card>
        <CardContent className="pt-6">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 border-b border-border">
                <th className="text-left p-2.5 font-medium text-muted-foreground">Filter</th>
                <th className="text-left p-2.5 font-medium text-muted-foreground">Value</th>
              </tr></thead>
              <tbody>
                {[
                  ['Home Type', 'Single Family'],
                  ['Price Range', '$80,000 - $250,000'],
                  ['Bedrooms', '2-4'],
                  ['Bathrooms', '1+'],
                  ['Square Feet', '1,150 - 2,300'],
                ].map(([f, v]) => (
                  <tr key={f} className="border-b border-border last:border-0">
                    <td className="p-2.5 font-medium">{f}</td>
                    <td className="p-2.5 text-muted-foreground">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Examples */}
      <SectionTitle>6. Full Examples</SectionTitle>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> ZIP Code with Webhook
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CodeBlock code={`curl -X POST "${BASE_URL}/api-analyze-zip" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "apikey: ${ANON_KEY}" \\
  -d '{
    "zipcode": "30032",
    "max_results": 10,
    "callback_url": "https://your-server.com/webhook"
  }'`} />
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Single Address</CardTitle>
        </CardHeader>
        <CardContent>
          <CodeBlock code={`curl -X POST "${BASE_URL}/api-analyze-zip" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "apikey: ${ANON_KEY}" \\
  -d '{ "address": "1514 Peachcrest Rd, Decatur, GA 30032" }'`} />
        </CardContent>
      </Card>

      <Separator />

      {/* Errors */}
      <SectionTitle>7. Error Codes</SectionTitle>
      <Card>
        <CardContent className="pt-6">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 border-b border-border">
                <th className="text-left p-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-2.5 font-medium text-muted-foreground">Description</th>
              </tr></thead>
              <tbody>
                {[
                  ['401', 'Missing x-api-key header'],
                  ['403', 'Invalid or inactive API key'],
                  ['400', 'Missing required parameters'],
                  ['502', 'External analysis service error'],
                  ['500', 'Internal server error'],
                ].map(([s, d]) => (
                  <tr key={s} className="border-b border-border last:border-0">
                    <td className="p-2.5 font-mono font-bold text-destructive">{s}</td>
                    <td className="p-2.5 text-muted-foreground">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dedup note */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Deduplication & Price Drops</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li>Addresses are normalized (lowercase, alphanumeric only)</li>
            <li>Previously analyzed properties are skipped automatically</li>
            <li>Price drops trigger re-analysis and update the existing deal</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
