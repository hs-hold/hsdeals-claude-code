import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Hammer,
  Wrench,
  ClipboardCheck,
  Layers,
  DollarSign,
  Home,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Camera,
  Calendar,
  Shield,
  TrendingUp,
  ScrollText,
  Languages,
  HardHat,
} from 'lucide-react';

// Renovation / Rehab Estimation Guide — bilingual (English / Hebrew).
// Same architecture as ArvGuidePage: language-keyed `content` dict, RTL on Hebrew.
// Numbers are Atlanta-metro 2024–2026 benchmarks (materials + labor combined),
// reasonable for SFR flips. Adjust for ITP / OTP / rural multipliers.

type Lang = 'en' | 'he';

type Content = {
  title: string;
  intro: string;
  badges: string[];
  toc: { label: string; href: string }[];
  sections: {
    id: string;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    subtitle: string;
    body: React.ReactNode;
  }[];
  tldrTitle: string;
  tldr: string;
};

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed text-foreground/90 space-y-3">
        {children}
      </CardContent>
    </Card>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="text-sm">{children}</div>
    </div>
  );
}

// ===================== ENGLISH =====================
const enContent: Content = {
  title: 'Renovation & Rehab Estimation Guide',
  intro:
    'Operator-grade playbook for scoping and pricing a single-family rehab. Numbers are tuned for Atlanta metro SFR flips, 2024–2026. Goal: a defensible scope of work and budget that matches the ARV plan, with no surprises after closing.',
  badges: ['Atlanta metro tuned', 'SFR flips & BRRRR', 'SOW + budget'],
  toc: [
    { label: 'What rehab estimation actually is', href: '#what' },
    { label: 'Renovation tiers ($/sqft ranges)', href: '#tiers' },
    { label: 'The walkthrough — what to inspect', href: '#walkthrough' },
    { label: 'Reading rehab from photos', href: '#photos' },
    { label: 'Line-item benchmark prices', href: '#prices' },
    { label: 'Atlanta-specific multipliers', href: '#atlanta' },
    { label: 'Contractor pricing & change orders', href: '#contractors' },
    { label: 'Contingency', href: '#contingency' },
    { label: 'Holding & selling costs', href: '#holding' },
    { label: 'Putting it together — deal math', href: '#math' },
    { label: 'Common mistakes', href: '#mistakes' },
    { label: 'Pre-offer checklist', href: '#checklist' },
  ],
  sections: [
    {
      id: 'what',
      icon: Wrench,
      title: '1. What rehab estimation actually is',
      subtitle: 'Two outputs: a Scope of Work (SOW) and a budget. Both must match the ARV plan.',
      body: (
        <>
          <p>
            Rehab estimation is <strong>not</strong> &ldquo;how much will I spend.&rdquo; It is
            the cost a competent contractor needs to deliver retail-ready condition that matches
            the renovation level of your ARV comps. If your comps are quartz-and-LVP, you cannot
            scope to laminate and Formica.
          </p>
          <p>
            Every line item has both a <strong>quantity</strong> (sqft, linear ft, count) and a
            <strong> unit cost</strong> (materials + labor combined). A budget without quantities
            is wishful thinking.
          </p>
          <Tip>
            The SOW should match the ARV tier of your comps. Over-renovating burns money you
            can&rsquo;t recover; under-renovating tanks resale.
          </Tip>
        </>
      ),
    },
    {
      id: 'tiers',
      icon: Layers,
      title: '2. Renovation tiers',
      subtitle: 'Pick a tier first, then build the SOW. Mismatched tiers = lost money.',
      body: (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Tier</th>
                <th className="text-left p-2">$/sqft</th>
                <th className="text-left p-2">Typical scope</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr><td className="p-2 font-medium">Cosmetic / lipstick</td><td className="p-2">$10–$25</td><td className="p-2">Paint, flooring refresh, hardware swap, light fixtures</td></tr>
              <tr><td className="p-2 font-medium">Light rehab</td><td className="p-2">$25–$40</td><td className="p-2">All paint, all flooring, kitchen + 1 bath update, basic landscape</td></tr>
              <tr><td className="p-2 font-medium">Standard flip</td><td className="p-2">$40–$60</td><td className="p-2">Full kitchen, both baths, all floors, paint, doors, trim, some electrical/plumbing, roof if needed</td></tr>
              <tr><td className="p-2 font-medium">Heavy rehab</td><td className="p-2">$60–$100</td><td className="p-2">All of standard + HVAC + electrical panel + roof + windows + minor layout</td></tr>
              <tr><td className="p-2 font-medium">Gut rehab</td><td className="p-2">$100–$150</td><td className="p-2">Down to studs, full mechanicals, layout changes, possibly addition</td></tr>
              <tr><td className="p-2 font-medium">Tear-down + rebuild</td><td className="p-2">$150–$250</td><td className="p-2">New build on existing lot</td></tr>
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: 'walkthrough',
      icon: ClipboardCheck,
      title: '3. The walkthrough — what to inspect',
      subtitle: 'Outside first, then top-down inside. Camera + tape + flashlight + outlet tester.',
      body: (
        <>
          <p className="font-medium">Outside</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Roof:</strong> shingle age (granules in gutters = end of life), sagging ridge, missing pieces, valleys.</li>
            <li><strong>Foundation:</strong> hairline cracks OK; <em>stair-step</em> or <em>horizontal</em> cracks = structural.</li>
            <li><strong>Grading & drainage:</strong> water flows away from house; gutters intact, downspouts extended.</li>
            <li><strong>Siding:</strong> rot at sill plates, soft fascia, peeling paint.</li>
            <li><strong>Windows:</strong> count + type (single vs double pane) + condition.</li>
          </ul>
          <p className="font-medium mt-3">Inside (top-down)</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Attic:</strong> insulation level, daylight = roof leak, rodent evidence.</li>
            <li><strong>Ceilings:</strong> water staining = active or past leak.</li>
            <li><strong>Sub-floor:</strong> walk every room — soft = rot.</li>
            <li><strong>HVAC:</strong> brand + model number → age. 15+ yr = budget replacement.</li>
            <li><strong>Water heater:</strong> sticker date. 12 yr = end of life.</li>
            <li><strong>Electrical panel:</strong> Federal Pacific or Zinsco = replace. Fuse box = replace. 60A service = upgrade.</li>
            <li><strong>Plumbing supply:</strong> copper/PEX OK; galvanized/poly-B/lead = re-plumb.</li>
            <li><strong>Drain lines:</strong> cast iron over 50 yr = scope it.</li>
            <li><strong>Sewer line:</strong> always scope on pre-1970 ($150–$300, prevents $8K surprises).</li>
            <li><strong>Crawlspace/basement:</strong> water staining, moisture, structural sag, vapor barrier.</li>
            <li><strong>Termite damage:</strong> tap framing, look at sill plates and joists.</li>
            <li><strong>Mold:</strong> anywhere wet — under sinks, behind toilets, basement corners.</li>
            <li><strong>Asbestos:</strong> pre-1980 — popcorn ceilings, vinyl floor tiles, pipe wrap.</li>
            <li><strong>Lead paint:</strong> pre-1978 always.</li>
          </ul>
          <Warn>If you can&rsquo;t inspect a major system (sealed crawlspace, attic blocked), <strong>budget worst-case</strong>. The unknown bites you, not the known.</Warn>
        </>
      ),
    },
    {
      id: 'photos',
      icon: Camera,
      title: '4. Reading rehab from listing photos',
      subtitle: 'No walkthrough yet? Photos give you 70% of the scope.',
      body: (
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Kitchen:</strong> count cabinets (linear ft × $200) + counter sqft + appliances + plumbing.</li>
          <li><strong>Bath:</strong> if dated, assume gut at $7K each. Modern tile + vanity = lipstick at $1–2K.</li>
          <li><strong>Floors:</strong> original strip oak under carpet usually saves money — refinish $3–5/sqft vs replace $4–6/sqft.</li>
          <li><strong>Windows:</strong> count from exterior photos × $700 if all need replacing.</li>
          <li><strong>HVAC:</strong> outdoor condenser in photo? Bent fins / rust = budget replacement.</li>
          <li><strong>Roof:</strong> aerial in Zillow shows patches, sag, mismatched shingles.</li>
          <li><strong>Bathrooms with no photo, kitchens with no photo, basements with no photo:</strong> assume the worst.</li>
          <li><strong>&ldquo;Sold as-is&rdquo; / &ldquo;cash only&rdquo;</strong> in MLS = mechanical issues lender flagged. Budget heavy.</li>
        </ul>
      ),
    },
    {
      id: 'prices',
      icon: DollarSign,
      title: '5. Line-item benchmark prices (Atlanta, 2024–2026)',
      subtitle: 'Materials + labor combined, mid-tier finishes for a standard flip.',
      body: (
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">Mechanicals</div>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Roof</strong> (arch shingles, 1500–2000sqft): $5K–$9K, $400–$550/square</li>
              <li><strong>HVAC</strong> 3-ton (heat pump or gas/AC): $7K–$12K replacement</li>
              <li><strong>Water heater</strong> 40–50 gal: $1.5K–$2.5K</li>
              <li><strong>Electrical panel</strong> 100→200A upgrade: $2K–$3.5K</li>
              <li><strong>Whole-house re-wire</strong>: $8K–$15K</li>
              <li><strong>Re-plumb supply lines</strong>: $4K–$8K</li>
              <li><strong>Sewer line</strong> spot repair: $4K–$8K, full replacement: $8K–$15K</li>
              <li><strong>Foundation pier</strong> (each): $1.2K–$2K</li>
              <li><strong>Crawlspace encapsulation</strong>: $5K–$10K</li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">Kitchen (~150sqft, standard flip)</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Stock shaker cabinets: $150–$250/linear ft</li>
              <li>Quartz counters: $55–$75/sqft installed</li>
              <li>Tile backsplash: $15–$25/sqft installed</li>
              <li>Stainless appliance package: $2K–$3K</li>
              <li>Sink + faucet + plumbing: $500–$800</li>
              <li><strong>Total kitchen typical:</strong> $10K–$18K</li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">Bathroom (full gut)</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Tile shower/tub surround: $2K–$4K</li>
              <li>Vanity: $400–$1.2K</li>
              <li>Toilet: $250–$450</li>
              <li>Tile floor: $8–$12/sqft installed</li>
              <li>Plumbing fixtures: $400–$800</li>
              <li><strong>Total per bath:</strong> $5K–$9K</li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">Flooring (installed)</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>LVP (luxury vinyl plank): $4–$6/sqft</li>
              <li>Engineered hardwood: $7–$10/sqft</li>
              <li>Refinish existing hardwood: $3–$5/sqft</li>
              <li>Tile: $7–$12/sqft</li>
              <li>Carpet: $3–$5/sqft</li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">Paint, doors, trim, exterior</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Interior paint (walls + ceilings + trim): $2.5–$4/sqft floor area</li>
              <li>Exterior paint (typical SFR): $3K–$6K</li>
              <li>Drywall (per 4×8 sheet hung + finished): $50–$80</li>
              <li>Interior door (hollow-core slab): $150–$250 installed</li>
              <li>Solid-core door: $300–$450 installed</li>
              <li>Exterior door (steel/fiberglass): $800–$1.5K installed</li>
              <li>Trim (base + casing): $2–$4/lf installed</li>
              <li>Lighting fixtures: $50–$200 each typical</li>
              <li>Windows (vinyl, installed): $500–$900 each</li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">Site work</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sod (1000sqft): $1K–$1.5K</li>
              <li>Cleanup + mulch + bushes: $500–$1.5K</li>
              <li>Pressure wash: $300–$600</li>
              <li>Demo + dumpster (typical flip): $1K–$3K</li>
              <li>Pest treatment: $400–$1.5K</li>
              <li>Permits: $500–$3K depending on scope</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'atlanta',
      icon: Home,
      title: '6. Atlanta-specific multipliers',
      subtitle: 'Same scope, different zip = 20% swing.',
      body: (
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>ITP (Inside the Perimeter, I-285):</strong> +10–20% labor.</li>
          <li><strong>OTP suburbs:</strong> baseline.</li>
          <li><strong>Rural (outer counties):</strong> -5–10% labor, but trades are slower and harder to schedule.</li>
          <li><strong>HOA neighborhoods:</strong> stricter inspections — plan for permits and approvals.</li>
          <li><strong>Pre-1970 in Decatur / Avondale / East Atlanta / Kirkwood:</strong> knob-and-tube risk, lead paint, asbestos, cast-iron drains. Add 15–25%.</li>
          <li><strong>30315 / 30310 / 30314:</strong> older stock, more deferred maintenance, bigger scopes.</li>
          <li><strong>30349 / Old National / Cascade:</strong> easier scopes, but lower comps mean tighter budgets — be ruthless.</li>
        </ul>
      ),
    },
    {
      id: 'contractors',
      icon: HardHat,
      title: '7. Contractor pricing & change orders',
      subtitle: 'Where flips bleed.',
      body: (
        <>
          <ul className="list-disc pl-5 space-y-1">
            <li>Get <strong>three bids</strong> on anything ≥ $5K. Drop the lowest (usually missing scope), use the middle.</li>
            <li>GC markup: 15–30% on materials + labor. Fair, if scope is locked.</li>
            <li><strong>Fixed-bid only.</strong> &ldquo;T&amp;M&rdquo; (time and materials) on a flip = open checkbook.</li>
            <li>Lock the SOW <em>before</em> demo. Drawings + finish schedule + product list.</li>
            <li>Change orders are where flips lose money. If a change is needed, price it before starting.</li>
            <li>Pay by milestone, not weekly. 10% deposit / 30% at rough-in / 30% at drywall / 20% at trim / 10% at punch-list.</li>
            <li>Never pay material deposits over 25% upfront — burned-by-disappearing-contractor is the #1 flip horror story.</li>
          </ul>
          <Warn>Subbing direct is 15–30% cheaper but requires experience and a project manager. If you don&rsquo;t have either, pay the GC.</Warn>
        </>
      ),
    },
    {
      id: 'contingency',
      icon: Shield,
      title: '8. Contingency',
      subtitle: 'Carried separately. Never spent on "while we\'re at it."',
      body: (
        <ul className="list-disc pl-5 space-y-1">
          <li>Cosmetic / light rehab: <strong>10%</strong></li>
          <li>Standard flip: <strong>15%</strong></li>
          <li>Heavy rehab or anything pre-1960: <strong>20–25%</strong></li>
          <li>Gut rehab or unknown systems: <strong>25–30%</strong></li>
        </ul>
      ),
    },
    {
      id: 'holding',
      icon: Calendar,
      title: '9. Holding & selling costs',
      subtitle: 'Forgotten by amateurs. Atlanta SFR flips run 4–6 months.',
      body: (
        <>
          <p className="font-medium">Holding (per month)</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Hard money interest (10–12% × loan): $1.5K–$3K/mo on typical Atlanta deal</li>
            <li>Property tax (prorated): $50–$200/mo</li>
            <li>Vacant / builder&rsquo;s risk insurance: $150–$250/mo</li>
            <li>Utilities: $150–$300/mo</li>
            <li>HOA: $0–$300/mo</li>
          </ul>
          <p className="font-medium mt-3">Selling (% of resale)</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Agent commission: 5–6%</li>
            <li>Buyer concessions / closing-cost credits: 1–3%</li>
            <li>Title + closing + transfer tax: 1–1.5%</li>
            <li><strong>Total: 8–10% of ARV.</strong></li>
          </ul>
          <Tip>Plan for 4 months minimum; underwrite 6. Every flip runs 30–50% longer than planned.</Tip>
        </>
      ),
    },
    {
      id: 'math',
      icon: TrendingUp,
      title: '10. Putting it together — deal math',
      subtitle: 'Profit = ARV − (Purchase + Rehab + Holding + Selling + Financing).',
      body: (
        <>
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-sm" dir="ltr">
            Profit = ARV − Purchase − Rehab − Holding − Selling − Financing fees
          </div>
          <p className="font-medium mt-2">Minimum profit targets</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>$200K ARV: $30K minimum</li>
            <li>$300K ARV: $50K minimum</li>
            <li>$400K+ ARV: $75K+ minimum</li>
          </ul>
          <Tip>
            Plug your numbers into the <Link to="/acquisition" className="underline">Acquisition Engine</Link> to compute MAO and net profit side-by-side with the 70% rule.
          </Tip>
        </>
      ),
    },
    {
      id: 'mistakes',
      icon: AlertTriangle,
      title: '11. Common mistakes',
      subtitle: 'Each of these has cost real flippers real money.',
      body: (
        <ol className="list-decimal pl-5 space-y-1">
          <li>Estimating off a list of items instead of walking each room.</li>
          <li>Skipping age check on roof, HVAC, water heater.</li>
          <li>No sewer scope on pre-1970 — $8K surprise.</li>
          <li>Underestimating tile labor — always more than you think.</li>
          <li>&ldquo;We&rsquo;ll handle permits later&rdquo; → re-doing finished work.</li>
          <li>No contingency, or contingency spent on upgrades.</li>
          <li>Forgetting holding costs in the profit math.</li>
          <li>Optimistic timeline — every flip runs 30–50% longer.</li>
          <li>Mismatched tier: luxury scope on mid-tier comps.</li>
          <li>Forgetting demo + dumpster ($1K–$3K).</li>
          <li>Not checking comparable <em>renovation level</em> in the comps — quartz vs laminate is a $15K swing.</li>
        </ol>
      ),
    },
    {
      id: 'checklist',
      icon: ListChecks,
      title: '12. Pre-offer checklist',
      subtitle: 'Don\'t submit a number until every box is checked.',
      body: (
        <ul className="space-y-2">
          {[
            'Walked every room with camera + tape.',
            'Photographed mechanicals + serial numbers.',
            'Sewer scope ordered (pre-1970 SFR).',
            'Roof inspected (climbed or droned, not just from yard).',
            'Crawlspace / basement checked for water + structure.',
            'Three contractor walks (or one trusted GC).',
            'SOW written line-by-line, priced, matches ARV tier.',
            'Contingency added separately (10–25%).',
            'Holding costs calculated for 4–6 months.',
            'Selling costs at 8–10% of ARV.',
            'Profit hits target before submitting offer.',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ),
    },
  ],
  tldrTitle: 'TL;DR',
  tldr:
    'Pick a renovation tier that matches the ARV comps. Walk every room and inspect every system, top-down. Build a line-item SOW with quantities and unit costs. Add 10–25% contingency. Add 4–6 months of holding + 8–10% selling costs. If the profit doesn\'t clear $30K/$50K/$75K depending on ARV size, walk.',
};

// ===================== HEBREW =====================
const heContent: Content = {
  title: 'מדריך הערכת שיפוץ ויזמות',
  intro:
    'מדריך מעשי ברמת יזם להגדרת היקף שיפוץ ותמחורו לנכס למשפחה אחת. המספרים מותאמים לאטלנטה מטרו, פליפים של SFR, 2024–2026. המטרה: SOW (היקף עבודה) ותקציב הגיוניים שמתאימים לתוכנית ה-ARV — בלי הפתעות אחרי הסגירה.',
  badges: ['מותאם לאטלנטה מטרו', 'פליפים ו-BRRRR', 'SOW + תקציב'],
  toc: [
    { label: 'מה זה הערכת שיפוץ באמת', href: '#what' },
    { label: 'רמות שיפוץ (טווחי $/sqft)', href: '#tiers' },
    { label: 'הסיור — מה לבדוק', href: '#walkthrough' },
    { label: 'קריאת היקף שיפוץ מתמונות', href: '#photos' },
    { label: 'מחירי benchmark לפי שורות', href: '#prices' },
    { label: 'מקדמים ייחודיים לאטלנטה', href: '#atlanta' },
    { label: 'תמחור קבלן ו-change orders', href: '#contractors' },
    { label: 'רזרבה (contingency)', href: '#contingency' },
    { label: 'עלויות החזקה ומכירה', href: '#holding' },
    { label: 'חישוב הרווח של העסקה', href: '#math' },
    { label: 'טעויות נפוצות', href: '#mistakes' },
    { label: 'צ׳קליסט לפני הצעה', href: '#checklist' },
  ],
  sections: [
    {
      id: 'what',
      icon: Wrench,
      title: '1. מה זה הערכת שיפוץ באמת',
      subtitle: 'שני פלטים: SOW (היקף עבודה) ותקציב. שניהם חייבים להתאים לתוכנית ה-ARV.',
      body: (
        <>
          <p>
            הערכת שיפוץ היא <strong>לא</strong> &ldquo;כמה אני אוציא&rdquo;. זו העלות שקבלן מקצועי
            צריך כדי לספק נכס במצב מוכן-לקונה שמתאים לרמת השיפוץ של הקומפים שלך ב-ARV. אם
            הקומפים הם quartz ו-LVP, אסור לך לתכנן laminate ו-Formica.
          </p>
          <p>
            כל שורה צריכה <strong>כמות</strong> (sqft, מטר אורך, יחידות) <strong>ועלות יחידה</strong>
            (חומרים + עבודה ביחד). תקציב בלי כמויות זה משאלת לב.
          </p>
          <Tip>
            ה-SOW חייב להתאים לרמת ה-ARV. שיפוץ-יתר = שורף כסף שלא תחזיר; שיפוץ-חסר = פוגע במכירה.
          </Tip>
        </>
      ),
    },
    {
      id: 'tiers',
      icon: Layers,
      title: '2. רמות שיפוץ',
      subtitle: 'בחר רמה קודם, אז בנה את ה-SOW. רמות לא תואמות = הפסד.',
      body: (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-right p-2">רמה</th>
                <th className="text-right p-2">$/sqft</th>
                <th className="text-right p-2">היקף טיפוסי</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr><td className="p-2 font-medium">קוסמטי / lipstick</td><td className="p-2">$10–$25</td><td className="p-2">צבע, רענון רצפות, ידיות, גופי תאורה</td></tr>
              <tr><td className="p-2 font-medium">שיפוץ קל</td><td className="p-2">$25–$40</td><td className="p-2">צבע מלא, רצפות מלאות, מטבח + אמבטיה אחת, נוף בסיסי</td></tr>
              <tr><td className="p-2 font-medium">פליפ סטנדרטי</td><td className="p-2">$40–$60</td><td className="p-2">מטבח מלא, שתי אמבטיות, רצפות, צבע, דלתות, חיפויים, חשמל/אינסטלציה חלקיים, גג אם צריך</td></tr>
              <tr><td className="p-2 font-medium">שיפוץ כבד</td><td className="p-2">$60–$100</td><td className="p-2">כל הסטנדרטי + HVAC + לוח חשמל + גג + חלונות + שינויי תכנון קלים</td></tr>
              <tr><td className="p-2 font-medium">Gut rehab</td><td className="p-2">$100–$150</td><td className="p-2">עד הקירות, מערכות מלאות, שינויי תכנון, אולי תוספת</td></tr>
              <tr><td className="p-2 font-medium">הריסה ובנייה מחדש</td><td className="p-2">$150–$250</td><td className="p-2">בנייה חדשה על המגרש הקיים</td></tr>
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: 'walkthrough',
      icon: ClipboardCheck,
      title: '3. הסיור בנכס — מה לבדוק',
      subtitle: 'חוץ קודם, אז פנים מלמעלה למטה. מצלמה + מטר + פנס + בודק שקעים.',
      body: (
        <>
          <p className="font-medium">חוץ</p>
          <ul className="list-disc pr-5 space-y-1">
            <li><strong>גג:</strong> גיל רעפים (גרגרים בתעלות = סוף חיים), רכס שקוע, חתיכות חסרות, מפגשים.</li>
            <li><strong>יסודות:</strong> סדקי שערה תקינים; <em>סדקי מדרגות</em> או <em>אופקיים</em> = מבני.</li>
            <li><strong>גרדינג וניקוז:</strong> מים זורמים מהבית, מרזבים תקינים, יציאות מאריכות.</li>
            <li><strong>חיפוי חוץ:</strong> ריקבון בסיף-פלייט, פאסיה רכה, צבע מתקלף.</li>
            <li><strong>חלונות:</strong> כמות + סוג (פנל יחיד מול כפול) + מצב.</li>
          </ul>
          <p className="font-medium mt-3">פנים (מלמעלה למטה)</p>
          <ul className="list-disc pr-5 space-y-1">
            <li><strong>עליית גג:</strong> עובי בידוד, אור יום = דליפת גג, סימני מכרסמים.</li>
            <li><strong>תקרות:</strong> כתמי מים = דליפה פעילה או עברה.</li>
            <li><strong>תת-רצפה:</strong> צעד בכל חדר — רך = ריקבון.</li>
            <li><strong>HVAC:</strong> מותג + מספר דגם → גיל. 15+ שנים = תקציב להחלפה.</li>
            <li><strong>דוד מים:</strong> תאריך על המדבקה. 12 שנים = סוף חיים.</li>
            <li><strong>לוח חשמל:</strong> Federal Pacific או Zinsco = החלפה. fuse box = החלפה. 60A = שדרוג.</li>
            <li><strong>צנרת אספקה:</strong> נחושת/PEX תקין; מגולוון/poly-B/עופרת = החלפה מלאה.</li>
            <li><strong>צנרת ניקוז:</strong> ברזל יצוק מעל 50 שנה = scope.</li>
            <li><strong>קו ביוב:</strong> תמיד scope על נכס לפני 1970 ($150–$300, מונע הפתעת $8K).</li>
            <li><strong>Crawlspace/בייסמנט:</strong> כתמי מים, לחות, שקיעה מבנית, vapor barrier.</li>
            <li><strong>נזק טרמיטים:</strong> דפוק על קורות, בדוק sill plates ו-joists.</li>
            <li><strong>עובש:</strong> בכל מקום רטוב — מתחת לכיורים, מאחורי שירותים, פינות בייסמנט.</li>
            <li><strong>אזבסט:</strong> לפני 1980 — popcorn ceiling, אריחי PVC, עטיפת צנרת.</li>
            <li><strong>צבע עופרת:</strong> תמיד לפני 1978.</li>
          </ul>
          <Warn>אם אי אפשר לבדוק מערכת מרכזית (crawlspace סגור, גג בלתי נגיש), <strong>תקצב את הגרוע ביותר</strong>. הלא-ידוע נושך, לא הידוע.</Warn>
        </>
      ),
    },
    {
      id: 'photos',
      icon: Camera,
      title: '4. קריאת היקף שיפוץ מתמונות',
      subtitle: 'עוד לא היה סיור? תמונות נותנות 70% מההיקף.',
      body: (
        <ul className="list-disc pr-5 space-y-1">
          <li><strong>מטבח:</strong> ספור ארונות (מטר אורך × $200) + sqft שיש + מכשירים + אינסטלציה.</li>
          <li><strong>אמבטיה:</strong> אם מיושנת, הנח gut ב-$7K לכל אחת. קרמיקה מודרנית + ארון = lipstick ב-$1–2K.</li>
          <li><strong>רצפות:</strong> פרקט שטרי oak מתחת לשטיח בדרך כלל חוסך — refinish ב-$3–5/sqft מול החלפה ב-$4–6/sqft.</li>
          <li><strong>חלונות:</strong> ספור מתמונות חוץ × $700 אם כולם להחלפה.</li>
          <li><strong>HVAC:</strong> מעבה חיצוני בתמונה? פינים מעוקלים / חלודה = תקציב להחלפה.</li>
          <li><strong>גג:</strong> תצלום אווירי ב-Zillow מראה טלאים, שקיעה, רעפים לא תואמים.</li>
          <li><strong>אמבטיות בלי תמונה, מטבחים בלי תמונה, בייסמנטים בלי תמונה:</strong> הנח את הגרוע ביותר.</li>
          <li><strong>&ldquo;Sold as-is&rdquo; / &ldquo;cash only&rdquo;</strong> ב-MLS = בעיות מערכתיות שהבנק סימן. תקצב כבד.</li>
        </ul>
      ),
    },
    {
      id: 'prices',
      icon: DollarSign,
      title: '5. מחירי benchmark לפי שורות (אטלנטה, 2024–2026)',
      subtitle: 'חומרים + עבודה ביחד, גימור mid-tier לפליפ סטנדרטי.',
      body: (
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">מערכות</div>
            <ul className="list-disc pr-5 space-y-1">
              <li><strong>גג</strong> (arch shingles, 1500–2000sqft): $5K–$9K, $400–$550/square</li>
              <li><strong>HVAC</strong> 3-tons (heat pump או gas/AC): $7K–$12K החלפה</li>
              <li><strong>דוד מים</strong> 40–50 גלון: $1.5K–$2.5K</li>
              <li><strong>שדרוג לוח חשמל</strong> 100→200A: $2K–$3.5K</li>
              <li><strong>חיווט מחדש לכל הבית</strong>: $8K–$15K</li>
              <li><strong>החלפת צנרת אספקה</strong>: $4K–$8K</li>
              <li><strong>קו ביוב</strong> תיקון נקודתי: $4K–$8K, החלפה מלאה: $8K–$15K</li>
              <li><strong>פייר ליסודות</strong> (כל אחד): $1.2K–$2K</li>
              <li><strong>אטימת crawlspace</strong>: $5K–$10K</li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">מטבח (~150sqft, פליפ סטנדרטי)</div>
            <ul className="list-disc pr-5 space-y-1">
              <li>ארונות shaker stock: $150–$250/מטר אורך</li>
              <li>שיש קוורץ: $55–$75/sqft מותקן</li>
              <li>backsplash קרמיקה: $15–$25/sqft</li>
              <li>חבילת מכשירים נירוסטה: $2K–$3K</li>
              <li>כיור + ברז + אינסטלציה: $500–$800</li>
              <li><strong>סך מטבח טיפוסי:</strong> $10K–$18K</li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">אמבטיה (gut מלא)</div>
            <ul className="list-disc pr-5 space-y-1">
              <li>קרמיקה למקלחת/אמבטיה: $2K–$4K</li>
              <li>ארון: $400–$1.2K</li>
              <li>אסלה: $250–$450</li>
              <li>קרמיקה לרצפה: $8–$12/sqft</li>
              <li>ברזים וכלים סניטריים: $400–$800</li>
              <li><strong>סך כל אמבטיה:</strong> $5K–$9K</li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">רצפות (מותקן)</div>
            <ul className="list-disc pr-5 space-y-1">
              <li>LVP (luxury vinyl plank): $4–$6/sqft</li>
              <li>פרקט מהונדס: $7–$10/sqft</li>
              <li>refinish לפרקט קיים: $3–$5/sqft</li>
              <li>קרמיקה: $7–$12/sqft</li>
              <li>שטיח: $3–$5/sqft</li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">צבע, דלתות, חיפויים, חוץ</div>
            <ul className="list-disc pr-5 space-y-1">
              <li>צבע פנים (קירות + תקרות + חיפוי): $2.5–$4/sqft שטח רצפה</li>
              <li>צבע חוץ (SFR טיפוסי): $3K–$6K</li>
              <li>גבס (לוח 4×8 תלוי + מוגמר): $50–$80</li>
              <li>דלת פנים (hollow-core): $150–$250 מותקנת</li>
              <li>דלת solid-core: $300–$450 מותקנת</li>
              <li>דלת חוץ (פלדה/פיברגלס): $800–$1.5K מותקנת</li>
              <li>חיפויים (פנלים + מסגרות): $2–$4/lf מותקן</li>
              <li>גופי תאורה: $50–$200 כל אחד טיפוסי</li>
              <li>חלונות (PVC, מותקן): $500–$900 כל אחד</li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="font-medium mb-2">עבודות חצר</div>
            <ul className="list-disc pr-5 space-y-1">
              <li>דשא רול (1000sqft): $1K–$1.5K</li>
              <li>ניקיון + mulch + שיחים: $500–$1.5K</li>
              <li>שטיפה בלחץ: $300–$600</li>
              <li>הריסה + dumpster (פליפ טיפוסי): $1K–$3K</li>
              <li>טיפול במזיקים: $400–$1.5K</li>
              <li>היתרים: $500–$3K לפי היקף</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'atlanta',
      icon: Home,
      title: '6. מקדמים ייחודיים לאטלנטה',
      subtitle: 'אותו היקף, zip שונה = פער של 20%.',
      body: (
        <ul className="list-disc pr-5 space-y-1">
          <li><strong>ITP (בתוך טבעת I-285):</strong> +10–20% לעלות עבודה.</li>
          <li><strong>OTP פרברים:</strong> בסיס.</li>
          <li><strong>כפרי (מחוזות חיצוניים):</strong> -5–10% לעבודה, אבל בעלי מקצוע איטיים יותר וקשים לתזמון.</li>
          <li><strong>שכונות HOA:</strong> בדיקות מחמירות — תקצב היתרים ואישורים.</li>
          <li><strong>לפני 1970 ב-Decatur / Avondale / East Atlanta / Kirkwood:</strong> סיכון knob-and-tube, צבע עופרת, אזבסט, צנרת ברזל יצוק. הוסף 15–25%.</li>
          <li><strong>30315 / 30310 / 30314:</strong> בנייה ישנה, deferred maintenance, היקפים גדולים יותר.</li>
          <li><strong>30349 / Old National / Cascade:</strong> היקפים קלים יותר, אבל הקומפים נמוכים — תקציבים צמודים, היה אכזרי.</li>
        </ul>
      ),
    },
    {
      id: 'contractors',
      icon: HardHat,
      title: '7. תמחור קבלן ו-change orders',
      subtitle: 'איפה פליפים מאבדים כסף.',
      body: (
        <>
          <ul className="list-disc pr-5 space-y-1">
            <li>קבל <strong>שלוש הצעות</strong> על כל דבר ≥ $5K. השמט את הנמוכה (חסרה היקף), השתמש באמצעית.</li>
            <li>ה-markup של GC: 15–30% על חומרים + עבודה. הוגן, אם ההיקף נעול.</li>
            <li><strong>פיקס-בידד בלבד.</strong> &ldquo;T&amp;M&rdquo; (זמן וחומרים) על פליפ = פנקס פתוח.</li>
            <li>נעל את ה-SOW <em>לפני</em> ההריסה. שרטוטים + לוח גמרים + רשימת מוצרים.</li>
            <li>Change orders זה איפה פליפים מפסידים. אם נדרש שינוי, תמחר אותו לפני שמתחילים.</li>
            <li>שלם לפי milestones, לא שבועי. 10% מקדמה / 30% rough-in / 30% גבס / 20% גמרים / 10% punch-list.</li>
            <li>אף פעם אל תשלם מקדמת חומרים מעל 25% מראש — &ldquo;הקבלן נעלם&rdquo; הוא סיפור האימה מספר 1 בפליפים.</li>
          </ul>
          <Warn>תת-קבלנים ישירות זול ב-15–30% אבל דורש ניסיון ומנהל פרויקט. אם אין לך אף אחד מהם, שלם ל-GC.</Warn>
        </>
      ),
    },
    {
      id: 'contingency',
      icon: Shield,
      title: '8. רזרבה (contingency)',
      subtitle: 'מוחזקת בנפרד. אף פעם לא מבוזבזת על "כבר אנחנו פה".',
      body: (
        <ul className="list-disc pr-5 space-y-1">
          <li>קוסמטי / שיפוץ קל: <strong>10%</strong></li>
          <li>פליפ סטנדרטי: <strong>15%</strong></li>
          <li>שיפוץ כבד או נכס לפני 1960: <strong>20–25%</strong></li>
          <li>Gut rehab או מערכות לא ידועות: <strong>25–30%</strong></li>
        </ul>
      ),
    },
    {
      id: 'holding',
      icon: Calendar,
      title: '9. עלויות החזקה ומכירה',
      subtitle: 'נשכחות ע״י חובבנים. פליפים באטלנטה רצים 4–6 חודשים.',
      body: (
        <>
          <p className="font-medium">החזקה (לחודש)</p>
          <ul className="list-disc pr-5 space-y-1">
            <li>ריבית hard money (10–12% × הלוואה): $1.5K–$3K/חודש בעסקה אטלנטית טיפוסית</li>
            <li>ארנונה (יחסית): $50–$200/חודש</li>
            <li>ביטוח builders risk לנכס ריק: $150–$250/חודש</li>
            <li>חשבונות (חשמל/מים/גז): $150–$300/חודש</li>
            <li>HOA: $0–$300/חודש</li>
          </ul>
          <p className="font-medium mt-3">מכירה (% מהמכירה)</p>
          <ul className="list-disc pr-5 space-y-1">
            <li>עמלת סוכן: 5–6%</li>
            <li>concessions לקונה / זיכויי closing: 1–3%</li>
            <li>title + closing + transfer tax: 1–1.5%</li>
            <li><strong>סך הכל: 8–10% מה-ARV.</strong></li>
          </ul>
          <Tip>תכנן ל-4 חודשים מינימום; בנה underwriting ל-6. כל פליפ רץ 30–50% יותר מהמתוכנן.</Tip>
        </>
      ),
    },
    {
      id: 'math',
      icon: TrendingUp,
      title: '10. חישוב הרווח של העסקה',
      subtitle: 'רווח = ARV − (רכישה + שיפוץ + החזקה + מכירה + מימון).',
      body: (
        <>
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-sm" dir="ltr">
            Profit = ARV − Purchase − Rehab − Holding − Selling − Financing fees
          </div>
          <p className="font-medium mt-2">יעדי רווח מינימלי</p>
          <ul className="list-disc pr-5 space-y-1">
            <li>ARV $200K: $30K מינימום</li>
            <li>ARV $300K: $50K מינימום</li>
            <li>ARV $400K+: $75K+ מינימום</li>
          </ul>
          <Tip>
            הכנס מספרים ל-<Link to="/acquisition" className="underline">Acquisition Engine</Link> לחישוב MAO ורווח נטו לצד כלל ה-70%.
          </Tip>
        </>
      ),
    },
    {
      id: 'mistakes',
      icon: AlertTriangle,
      title: '11. טעויות נפוצות',
      subtitle: 'כל אחת מהן עלתה לפליפרים אמיתיים כסף אמיתי.',
      body: (
        <ol className="list-decimal pr-5 space-y-1">
          <li>הערכה לפי רשימת פריטים במקום סיור בכל חדר.</li>
          <li>דילוג על בדיקת גיל גג, HVAC, דוד מים.</li>
          <li>אין sewer scope על נכס לפני 1970 — הפתעה של $8K.</li>
          <li>תת-הערכת עבודות קרמיקה — תמיד יותר ממה שחשבת.</li>
          <li>&ldquo;נטפל בהיתרים אחר כך&rdquo; → ביצוע מחדש של עבודה גמורה.</li>
          <li>אין רזרבה, או רזרבה שמתבזבזת על שדרוגים.</li>
          <li>שכחת עלויות החזקה בחישוב הרווח.</li>
          <li>לוח זמנים אופטימי — כל פליפ רץ 30–50% יותר.</li>
          <li>רמה לא תואמת: היקף יוקרתי על קומפים בינוניים.</li>
          <li>שכחת הריסה + dumpster ($1K–$3K).</li>
          <li>אי-בדיקת <em>רמת השיפוץ</em> בקומפים — quartz מול laminate זה פער של $15K.</li>
        </ol>
      ),
    },
    {
      id: 'checklist',
      icon: ListChecks,
      title: '12. צ׳קליסט לפני הצעה',
      subtitle: 'אל תשלח מספר עד שכל סעיף מסומן.',
      body: (
        <ul className="space-y-2">
          {[
            'סיור בכל חדר עם מצלמה + מטר.',
            'תיעוד מערכות + מספרים סידוריים.',
            'sewer scope הוזמן (SFR לפני 1970).',
            'גג נבדק (טיפסת או drone, לא רק מהחצר).',
            'crawlspace / בייסמנט נבדקו לרטיבות + מבנה.',
            'שלושה סיורי קבלנים (או אחד GC אמין).',
            'SOW כתוב שורה-שורה, מתומחר, תואם רמת ה-ARV.',
            'רזרבה הוספה בנפרד (10–25%).',
            'עלויות החזקה חושבו ל-4–6 חודשים.',
            'עלויות מכירה ב-8–10% מה-ARV.',
            'הרווח עומד ביעד לפני הגשת הצעה.',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ),
    },
  ],
  tldrTitle: 'TL;DR',
  tldr:
    'בחר רמת שיפוץ שתואמת את קומפי ה-ARV. סייר בכל חדר ובדוק כל מערכת מלמעלה למטה. בנה SOW לפי שורות עם כמויות ועלויות יחידה. הוסף רזרבה 10–25%. הוסף 4–6 חודשי החזקה + 8–10% עלויות מכירה. אם הרווח לא חוצה $30K/$50K/$75K לפי גודל ה-ARV — תוותר.',
};

export default function RehabGuidePage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = lang === 'he' ? heContent : enContent;
  const isHe = lang === 'he';

  return (
    <div
      className="container max-w-4xl py-8 px-4"
      dir={isHe ? 'rtl' : 'ltr'}
    >
      <header className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 shrink-0">
              <Hammer className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
          </div>
          <div className="flex items-center gap-1 rounded-md border p-0.5 shrink-0">
            <Button
              variant={lang === 'en' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setLang('en')}
              className="h-7 px-2 gap-1"
            >
              <Languages className="w-3.5 h-3.5" />
              EN
            </Button>
            <Button
              variant={lang === 'he' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setLang('he')}
              className="h-7 px-2"
            >
              עברית
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground max-w-3xl">{t.intro}</p>
        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          {t.badges.map((b) => (
            <Badge key={b} variant="secondary">{b}</Badge>
          ))}
        </div>
      </header>

      <Card className="mb-8 border-dashed">
        <CardContent className="py-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {isHe ? 'בעמוד זה' : 'On this page'}
          </div>
          <ol className={`grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm list-decimal ${isHe ? 'pr-5' : 'pl-5'}`}>
            {t.toc.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="hover:underline">{item.label}</a>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {t.sections.map((s) => (
        <div id={s.id} key={s.id}>
          <Section icon={s.icon} title={s.title} subtitle={s.subtitle}>
            {s.body}
          </Section>
        </div>
      ))}

      <Separator className="my-8" />

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">{t.tldrTitle}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">{t.tldr}</CardContent>
      </Card>
    </div>
  );
}
