import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  Home,
  Ruler,
  Search,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  TrendingUp,
  MapPin,
  GraduationCap,
  Hammer,
  ScrollText,
  Languages,
} from 'lucide-react';

// ARV / Property Evaluation Guide — bilingual (English / Hebrew).
// Toggle in the top-right swaps the language. Hebrew renders with dir="rtl".
// Content lives in a single `content` dict keyed by lang so the JSX shape
// stays identical between languages.

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
  title: 'Property Evaluation & ARV Guide',
  intro:
    'A step-by-step playbook for evaluating a property and estimating its After-Repair Value (ARV). Use this any time you underwrite a deal — same process whether the lead comes from MLS, an agent, a wholesaler, or auto-discovery.',
  badges: ['Atlanta metro tuned', 'SFR flips & BRRRR', 'Sales Comparison Approach'],
  toc: [
    { label: 'What ARV actually is', href: '#what-is-arv' },
    { label: 'Where to pull comps from', href: '#sources' },
    { label: 'Picking the right comps', href: '#comp-criteria' },
    { label: 'Adjusting comps', href: '#adjustments' },
    { label: 'Bracketing & the final number', href: '#bracketing' },
    { label: 'Reading condition from photos', href: '#condition' },
    { label: 'Location signals that move ARV', href: '#location' },
    { label: 'Schools & the "school cliff"', href: '#school' },
    { label: 'From ARV to offer (MAO & 70% rule)', href: '#mao' },
    { label: 'Common mistakes', href: '#mistakes' },
    { label: 'Before-you-offer checklist', href: '#checklist' },
  ],
  sections: [
    {
      id: 'what-is-arv',
      icon: Home,
      title: '1. What ARV actually is',
      subtitle: 'Definition first — most bad numbers come from a fuzzy definition.',
      body: (
        <>
          <p>
            <strong>After-Repair Value (ARV)</strong> is the price the property would sell for, on the
            open market, in <em>retail-ready, fully renovated condition</em>, sold to an owner-occupant
            buyer. It is <em>not</em> the Zestimate, not the asking price, not a wholesaler&rsquo;s
            claim, and not what comparable homes are <em>listed</em> for — it is what comparable,
            recently renovated homes <em>actually closed</em> at.
          </p>
          <Tip>
            Always state ARV as a range first (e.g. &ldquo;$240K&ndash;$255K&rdquo;) and only collapse
            it to a single number when you have to plug it into a formula.
          </Tip>
          <p>
            ARV uses the <strong>Sales Comparison Approach</strong> — the same method a licensed
            appraiser uses on a 1004 form. Find recently sold properties that closely match the
            subject, adjust them for differences, and triangulate.
          </p>
        </>
      ),
    },
    {
      id: 'sources',
      icon: Search,
      title: '2. Where to pull comps from',
      subtitle: 'Not all data sources are equal. Tier them.',
      body: (
        <>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>MLS sold data (best)</strong> — via your agent or broker portal.</li>
            <li><strong>Zillow / Redfin / Realtor.com sold tab</strong> — public mirror of MLS. Filter to <em>Sold in last 6 months</em>.</li>
            <li><strong>County tax assessor</strong> — confirms legal sale price + lot/year.</li>
            <li><strong>PropStream, Privy, BatchLeads</strong> — paid investor tools; auto-ARVs are rough.</li>
            <li><strong>Broker Price Opinion (BPO)</strong> — cheapest sanity check before offering.</li>
          </ul>
          <Warn>
            <strong>Never use list price comps to set ARV.</strong> Listings are aspirational; closed
            sales are reality.
          </Warn>
        </>
      ),
    },
    {
      id: 'comp-criteria',
      icon: Ruler,
      title: '3. Picking the right comps',
      subtitle: 'Aim for 3–5 closed sales that match on the criteria below.',
      body: (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Criterion</th>
                  <th className="text-left p-2">Ideal</th>
                  <th className="text-left p-2">Acceptable</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr><td className="p-2 font-medium">Recency</td><td className="p-2">≤ 3 mo</td><td className="p-2">≤ 6 mo</td></tr>
                <tr><td className="p-2 font-medium">Distance</td><td className="p-2">≤ 0.5 mi</td><td className="p-2">≤ 1 mi urban / 2 mi rural</td></tr>
                <tr><td className="p-2 font-medium">Sqft</td><td className="p-2">±10%</td><td className="p-2">±20%</td></tr>
                <tr><td className="p-2 font-medium">Beds / baths</td><td className="p-2">Same</td><td className="p-2">±1 bed, ±0.5 bath</td></tr>
                <tr><td className="p-2 font-medium">Year built</td><td className="p-2">±10 yr</td><td className="p-2">±20 yr</td></tr>
                <tr><td className="p-2 font-medium">Condition</td><td className="p-2">Renovated — matches plan</td><td className="p-2">Light cosmetic update</td></tr>
                <tr><td className="p-2 font-medium">School zone</td><td className="p-2">Same elementary &amp; middle</td><td className="p-2">Same district</td></tr>
              </tbody>
            </table>
          </div>
          <Tip>
            Stay on the <strong>same side</strong> of any major road, railroad, or river.
          </Tip>
        </>
      ),
    },
    {
      id: 'adjustments',
      icon: Calculator,
      title: '4. Adjusting comps',
      subtitle: 'Make the comps apples-to-apples with the subject.',
      body: (
        <>
          <ol className="list-decimal pl-5 space-y-2">
            <li><strong>$/sqft method:</strong> compute closed $/sqft per comp, drop high+low if ≥5 comps, average middle, multiply by subject sqft.</li>
            <li><strong>Line-item adjustments:</strong> start from each comp&rsquo;s sold price and adjust toward the subject.</li>
          </ol>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium mb-1">Atlanta metro contributory values (SFR, 2024–2026)</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Extra full bath: ~$5K&ndash;$10K</li>
              <li>Extra half bath: ~$2.5K&ndash;$5K</li>
              <li>Extra bedroom (legal): ~$8K&ndash;$15K</li>
              <li>Garage 1-car: ~$8K&ndash;$15K, 2-car: ~$15K&ndash;$25K</li>
              <li>Finished basement: ~50&ndash;60% of above-grade $/sqft</li>
              <li>Pool: ~$10K&ndash;$25K (sometimes negative low-end)</li>
              <li>New roof / HVAC: ~$5K&ndash;$10K each</li>
              <li>Major condition gap: $30K+</li>
            </ul>
          </div>
          <Warn><strong>Adjust the comp toward the subject, not the subject toward the comp.</strong></Warn>
        </>
      ),
    },
    {
      id: 'bracketing',
      icon: TrendingUp,
      title: '5. Bracketing & landing the final number',
      subtitle: 'Bracketing keeps you honest.',
      body: (
        <>
          <p>
            <strong>Bracketing</strong> means choosing comps that surround the subject — at least one
            slightly inferior, one slightly superior, one very similar. If all comps are bigger and
            nicer, ARV is too high; if all are smaller and uglier, too low.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Compute adjusted $/sqft for each.</li>
            <li>Drop outliers if you have enough comps.</li>
            <li>Take median or weighted average (most-similar weighted heaviest).</li>
            <li>Multiply by subject sqft.</li>
            <li>Sanity check vs adjusted-price median — within 5%.</li>
          </ul>
          <Tip>If $/sqft and adjusted-price disagree by more than 5%, your comp set is too noisy.</Tip>
        </>
      ),
    },
    {
      id: 'condition',
      icon: Hammer,
      title: '6. Reading condition from photos',
      subtitle: 'Listing photos are the cheapest inspection there is.',
      body: (
        <>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Roof:</strong> shingle age, sagging ridgeline, missing pieces.</li>
            <li><strong>Foundation:</strong> stair-step cracks, sloping floors, water staining.</li>
            <li><strong>HVAC age:</strong> model number sticker; 20+ years needs replacement.</li>
            <li><strong>Electrical:</strong> Federal Pacific or Zinsco panels, knob-and-tube, two-prong.</li>
            <li><strong>Plumbing:</strong> galvanized, polybutylene, lead supply lines.</li>
            <li><strong>Kitchen:</strong> granite/quartz + shaker is the modern minimum.</li>
            <li><strong>Bathrooms:</strong> tile vs fiberglass, vanity, ventilation.</li>
            <li><strong>Floors:</strong> hardwood / LVP / carpet-over-hardwood.</li>
            <li><strong>Windows:</strong> single-pane wood vs double-pane vinyl.</li>
            <li><strong>No photos of a room = assume the worst.</strong></li>
          </ul>
          <Warn>
            <strong>Biggest mistake:</strong> comping a fully-renovated comp against a tired subject.
            &ldquo;Renovated&rdquo; on a listing means almost nothing — look at photos.
          </Warn>
        </>
      ),
    },
    {
      id: 'location',
      icon: MapPin,
      title: '7. Location signals that move ARV',
      subtitle: 'Pricing per sqft can shift 30%+ over a few blocks.',
      body: (
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>On a highway / parkway / 4-lane:</strong> -10 to -25%.</li>
          <li><strong>Power lines / cell towers:</strong> -5 to -15%.</li>
          <li><strong>Train tracks / flight path:</strong> -5 to -10%.</li>
          <li><strong>Commercial backdrop:</strong> negative.</li>
          <li><strong>Cul-de-sac:</strong> small positive, especially with kids.</li>
          <li><strong>Walkable amenities:</strong> Trader Joe&rsquo;s, Whole Foods, popular park — positive.</li>
          <li><strong>Crime / vacancy patterns:</strong> Google Street View the block.</li>
        </ul>
      ),
    },
    {
      id: 'school',
      icon: GraduationCap,
      title: '8. Schools & the "school cliff"',
      subtitle: 'The single biggest invisible driver of ARV.',
      body: (
        <>
          <p>
            Two identical houses, different elementary zones → ARVs can diverge by 15%+. Verify zoning
            on the county lookup tool, not just GreatSchools. Buyer threshold is typically 7+/10.
            Confirm comps are in the <em>same elementary zone</em>, not just the same district.
          </p>
        </>
      ),
    },
    {
      id: 'mao',
      icon: Calculator,
      title: '9. From ARV to offer: the 70% rule & MAO',
      subtitle: 'ARV is one input. Your Maximum Allowable Offer is the output.',
      body: (
        <>
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-sm">
            MAO = (ARV × 70%) − Repair Costs
          </div>
          <p>
            70&ndash;75% on lower-priced flips, 75&ndash;80% on higher-priced. For BRRRR run a parallel
            check on Cash-Left-In-Deal after 75% LTV refi (target $0&ndash;$15K).
          </p>
          <Tip>
            Plug the ARV range into the <Link to="/acquisition" className="underline">Acquisition Engine</Link> to compute MAO.
          </Tip>
        </>
      ),
    },
    {
      id: 'mistakes',
      icon: AlertTriangle,
      title: '10. Common mistakes',
      subtitle: 'Every one of these has cost real investors real money.',
      body: (
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Listed prices instead of sold.</strong> A $300K listing isn&rsquo;t a $300K comp.</li>
          <li><strong>Crossing school zones / major roads.</strong></li>
          <li><strong>Skipping condition matching.</strong></li>
          <li><strong>Stale comps</strong> (&gt;6 mo in moving market).</li>
          <li><strong>Cherry-picking.</strong></li>
          <li><strong>Ignoring days-on-market.</strong></li>
          <li><strong>Trusting the Zestimate.</strong></li>
          <li><strong>Forgetting concessions.</strong> $300K with $10K credit = $290K.</li>
        </ul>
      ),
    },
    {
      id: 'checklist',
      icon: ListChecks,
      title: '11. Before-you-offer checklist',
      subtitle: "Don't send a number until every box is checked.",
      body: (
        <ul className="space-y-2">
          {[
            '3+ closed sales, ≤6 mo, ≤0.5–1 mi.',
            'Same elementary school zone.',
            'No comp crosses highway/railroad/river vs subject.',
            'Bracket on size, beds/baths, condition.',
            'Line-item adjusted each comp.',
            'Verified condition from photos (subject + each comp).',
            'Confirmed sale prices in county records.',
            '$/sqft and adjusted-price agree within 5%.',
            'ARV stated as a range.',
            'Agent BPO if real shortlist.',
            'Acquisition Engine for MAO.',
            '10–15% rehab contingency on top of line-item.',
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
    'ARV is what a renovated comp actually closed at, not a listing price or Zestimate. Pull 3–5 closed sales within 6 months and ~1 mile, in the same school zone, that bracket your subject on size and condition. Adjust each one toward the subject line-by-line. Triangulate $/sqft and adjusted-price methods. MAO = ARV × 70% − repairs.',
};

// ===================== HEBREW =====================
const heContent: Content = {
  title: 'מדריך לשמאות ARV של נכסים',
  intro:
    'מדריך מעשי שלב-אחר-שלב להערכת נכס וחישוב ערך לאחר שיפוץ (ARV). השתמש בו כל פעם שבוחנים עסקה — אותו תהליך בין אם הליד מגיע מ-MLS, מסוכן, מ-wholesaler או מהדיסקברי האוטומטי.',
  badges: ['מותאם לאטלנטה מטרו', 'פליפים ו-BRRRR', 'גישת השוואת מכירות'],
  toc: [
    { label: 'מה זה ARV באמת', href: '#what-is-arv' },
    { label: 'מאיפה מושכים קומפים', href: '#sources' },
    { label: 'בחירת קומפים נכונים', href: '#comp-criteria' },
    { label: 'התאמת קומפים', href: '#adjustments' },
    { label: 'Bracketing והמספר הסופי', href: '#bracketing' },
    { label: 'קריאת מצב הנכס מתמונות', href: '#condition' },
    { label: 'אותות מיקום שמשפיעים על ARV', href: '#location' },
    { label: 'בתי ספר ו"הצוק" של אזור הרישום', href: '#school' },
    { label: 'מ-ARV להצעה (MAO וכלל ה-70%)', href: '#mao' },
    { label: 'טעויות נפוצות', href: '#mistakes' },
    { label: 'צ׳קליסט לפני הצעה', href: '#checklist' },
  ],
  sections: [
    {
      id: 'what-is-arv',
      icon: Home,
      title: '1. מה זה ARV באמת',
      subtitle: 'הגדרה קודם — רוב המספרים הגרועים נובעים מהגדרה לא ברורה.',
      body: (
        <>
          <p>
            <strong>ARV (Value After-Repair)</strong> הוא המחיר שבו הנכס היה נמכר בשוק החופשי
            במצב <em>משופץ במלואו ומוכן למגורים</em> לקונה גר-בעצמו (owner-occupant). זה
            <em> לא </em>Zestimate, לא מחיר ביקוש, לא טענה של wholesaler, ולא המחיר ש-נכסים דומים
            <em> מבוקשים </em>בו — אלא המחיר שבו נכסים דומים שעברו שיפוץ <em>נמכרו בפועל</em>.
          </p>
          <Tip>
            תמיד הצג ARV קודם כטווח (למשל &ldquo;$240K&ndash;$255K&rdquo;), ורק אז כווץ למספר אחד
            כשצריך להכניס לנוסחה. הטווח מאלץ אותך להיות הוגן לגבי אי-ודאות.
          </Tip>
          <p>
            ARV משתמש ב<strong>גישת השוואת המכירות</strong> — אותה שיטה ששמאי מורשה משתמש בה
            על טופס 1004. מצא נכסים שנמכרו לאחרונה ודומים לסובייקט, התאם אותם להבדלים, וגזור.
          </p>
        </>
      ),
    },
    {
      id: 'sources',
      icon: Search,
      title: '2. מאיפה מושכים קומפים',
      subtitle: 'לא כל מקורות הנתונים שווים. דרג אותם.',
      body: (
        <>
          <ul className="list-disc pr-5 space-y-2">
            <li><strong>MLS sold data (הכי טוב)</strong> — דרך הסוכן או פורטל ברוקר.</li>
            <li><strong>Zillow / Redfin / Realtor.com</strong> טאב Sold — מראה ציבורית של MLS. סנן ל-6 חודשים אחרונים.</li>
            <li><strong>רשם המקרקעין של המחוז</strong> — מאשר מחיר מכירה חוקי + שטח/שנת בנייה.</li>
            <li><strong>PropStream, Privy, BatchLeads</strong> — כלים בתשלום; ה-ARV האוטומטי שלהם גס.</li>
            <li><strong>BPO (Broker Price Opinion)</strong> — בדיקת שפיות הזולה ביותר לפני הצעה.</li>
          </ul>
          <Warn>
            <strong>אף פעם אל תשתמש במחירי listing כקומפים.</strong> Listings הן ציפיות; סגירות הן מציאות.
          </Warn>
        </>
      ),
    },
    {
      id: 'comp-criteria',
      icon: Ruler,
      title: '3. בחירת קומפים נכונים',
      subtitle: 'כוון ל-3–5 סגירות שתואמות את הקריטריונים למטה.',
      body: (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-2">קריטריון</th>
                  <th className="text-right p-2">אידיאלי</th>
                  <th className="text-right p-2">מקובל</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr><td className="p-2 font-medium">חדישות מכירה</td><td className="p-2">עד 3 חודשים</td><td className="p-2">עד 6 חודשים</td></tr>
                <tr><td className="p-2 font-medium">מרחק</td><td className="p-2">עד 0.5 מייל</td><td className="p-2">עד 1 מייל עירוני / 2 כפרי</td></tr>
                <tr><td className="p-2 font-medium">שטח (sqft)</td><td className="p-2">±10%</td><td className="p-2">±20%</td></tr>
                <tr><td className="p-2 font-medium">חדרים / אמבטיות</td><td className="p-2">זהה</td><td className="p-2">±1 חדר, ±0.5 אמבטיה</td></tr>
                <tr><td className="p-2 font-medium">שנת בנייה</td><td className="p-2">±10 שנים</td><td className="p-2">±20 שנים</td></tr>
                <tr><td className="p-2 font-medium">מצב</td><td className="p-2">משופץ — תואם לתוכנית</td><td className="p-2">חידוש קוסמטי קל</td></tr>
                <tr><td className="p-2 font-medium">אזור רישום</td><td className="p-2">אותו יסודי וחטיבה</td><td className="p-2">אותו מחוז</td></tr>
              </tbody>
            </table>
          </div>
          <Tip>
            הישאר באותו <strong>צד</strong> של כל כביש ראשי, רכבת או נהר.
          </Tip>
        </>
      ),
    },
    {
      id: 'adjustments',
      icon: Calculator,
      title: '4. התאמת קומפים',
      subtitle: 'הופך את הקומפים להשוואה אמיתית עם הסובייקט.',
      body: (
        <>
          <ol className="list-decimal pr-5 space-y-2">
            <li><strong>שיטת $/sqft:</strong> חשב $/sqft בסגירה לכל קומפ, השמט גבוה+נמוך אם יש ≥5 קומפים, ממוצע אמצעי × sqft של הסובייקט.</li>
            <li><strong>התאמות לפי שורות (line-item):</strong> התחל ממחיר הסגירה של כל קומפ, התאם <em>לכיוון הסובייקט</em>.</li>
          </ol>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium mb-1">ערכי תרומה — אטלנטה מטרו (SFR, 2024–2026)</div>
            <ul className="list-disc pr-5 space-y-1">
              <li>אמבטיה מלאה נוספת: ~$5K&ndash;$10K</li>
              <li>חצי אמבטיה נוספת: ~$2.5K&ndash;$5K</li>
              <li>חדר שינה נוסף (חוקי): ~$8K&ndash;$15K</li>
              <li>מוסך 1 רכב: ~$8K&ndash;$15K; 2 רכבים: ~$15K&ndash;$25K</li>
              <li>מרתף מוגמר: ~50&ndash;60% מ-$/sqft של הקומה הראשית</li>
              <li>בריכה: ~$10K&ndash;$25K (לפעמים שלילי בקצה התחתון)</li>
              <li>גג חדש / HVAC חדש: ~$5K&ndash;$10K כל אחד</li>
              <li>פער מצב משמעותי (מיושן מול משופץ): $30K+</li>
            </ul>
          </div>
          <Warn><strong>התאם את הקומפ לכיוון הסובייקט, לא להפך.</strong> הסובייקט הוא הנעלם.</Warn>
        </>
      ),
    },
    {
      id: 'bracketing',
      icon: TrendingUp,
      title: '5. Bracketing וקבלת המספר הסופי',
      subtitle: 'Bracketing זו המשמעת ששומרת אותך הוגן.',
      body: (
        <>
          <p>
            <strong>Bracketing</strong> פירושו לבחור קומפים ש<em>מקיפים</em> את הסובייקט — לפחות אחד נחות
            מעט, אחד עליון מעט, ואחד דומה מאוד. אם כל הקומפים גדולים ויפים יותר, ה-ARV גבוה מדי. אם
            כולם קטנים ומכוערים יותר, ה-ARV נמוך מדי.
          </p>
          <ul className="list-disc pr-5 space-y-1">
            <li>חשב $/sqft מותאם לכל קומפ.</li>
            <li>השמט outliers אם יש מספיק קומפים.</li>
            <li>קח חציון או ממוצע משוקלל (הקומפ הדומה ביותר במשקל הגבוה).</li>
            <li>הכפל ב-sqft של הסובייקט.</li>
            <li>בדיקת שפיות מול חציון מחיר מותאם — בתוך 5%.</li>
          </ul>
          <Tip>אם השיטות חלוקות ביותר מ-5%, סט הקומפים רועש מדי. צמצם.</Tip>
        </>
      ),
    },
    {
      id: 'condition',
      icon: Hammer,
      title: '6. קריאת מצב הנכס מתמונות',
      subtitle: 'תמונות הליסטינג הן הבדיקה הזולה ביותר שיש.',
      body: (
        <>
          <ul className="list-disc pr-5 space-y-1">
            <li><strong>גג:</strong> גיל רעפים, רכס שקוע, חתיכות חסרות.</li>
            <li><strong>יסודות:</strong> סדקי מדרגות בלבני חוץ, רצפות שקועות, כתמי מים בתחתית קירות.</li>
            <li><strong>מיזוג / חימום:</strong> מדבקת מספר דגם; 20+ שנים = החלפה.</li>
            <li><strong>חשמל:</strong> לוחות Federal Pacific או Zinsco, knob-and-tube, שקעי 2-פינים.</li>
            <li><strong>אינסטלציה:</strong> צנרת מגולוונת, polybutylene, צינורות עופרת.</li>
            <li><strong>מטבח:</strong> גרניט/קוורץ + ארונות shaker זה המינימום המודרני.</li>
            <li><strong>אמבטיות:</strong> קרמיקה לעומת fiberglass, ארון, אוורור.</li>
            <li><strong>רצפות:</strong> פרקט / LVP / שטיח על פרקט.</li>
            <li><strong>חלונות:</strong> פנל-יחיד עץ לעומת פנל-כפול PVC.</li>
            <li><strong>אין תמונות לחדר = הנח את הגרוע ביותר.</strong></li>
          </ul>
          <Warn>
            <strong>הטעות הכי גדולה:</strong> להשוות קומפ משופץ במלואו לסובייקט מיושן.
            &ldquo;Renovated&rdquo; בליסטינג כמעט לא אומר כלום — תסתכל בתמונות.
          </Warn>
        </>
      ),
    },
    {
      id: 'location',
      icon: MapPin,
      title: '7. אותות מיקום שמשפיעים על ARV',
      subtitle: 'מחיר ל-sqft יכול לזוז 30%+ במרחק כמה רחובות.',
      body: (
        <ul className="list-disc pr-5 space-y-1">
          <li><strong>על כביש מהיר / parkway / 4-נתיבי:</strong> 25%- עד 10%-.</li>
          <li><strong>קווי מתח / אנטנות:</strong> 15%- עד 5%-.</li>
          <li><strong>פסי רכבת / מסלול טיסה:</strong> 10%- עד 5%-.</li>
          <li><strong>גב מסחרי:</strong> שלילי.</li>
          <li><strong>Cul-de-sac:</strong> חיובי קטן, במיוחד עם ילדים.</li>
          <li><strong>הליכתיות / מתקנים:</strong> Trader Joe&rsquo;s, Whole Foods, פארק פופולרי — חיובי.</li>
          <li><strong>פשע / נטישה:</strong> Google Street View על הבלוק.</li>
        </ul>
      ),
    },
    {
      id: 'school',
      icon: GraduationCap,
      title: '8. בתי ספר ו"הצוק" של אזור הרישום',
      subtitle: 'המנוע הסמוי הגדול ביותר של ARV.',
      body: (
        <p>
          שני בתים זהים, אזורי יסודי שונים → ARVs יכולים להיפרד ב-15%+. אמת את האזור על כלי החיפוש
          של מחוז בית הספר, לא רק GreatSchools. סף הקונה הוא בדרך כלל 7+/10. אמת שהקומפים
          ב<em>אותו אזור יסודי</em>, לא רק באותו מחוז.
        </p>
      ),
    },
    {
      id: 'mao',
      icon: Calculator,
      title: '9. מ-ARV להצעה: כלל ה-70% ו-MAO',
      subtitle: 'ARV הוא קלט אחד. ה-MAO הוא הפלט.',
      body: (
        <>
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-sm" dir="ltr">
            MAO = (ARV × 70%) − Repair Costs
          </div>
          <p>
            70&ndash;75% על פליפים זולים יותר, 75&ndash;80% על יקרים יותר. ל-BRRRR הרץ במקביל
            את Cash-Left-In-Deal אחרי refi של 75% LTV (יעד $0&ndash;$15K).
          </p>
          <Tip>
            הכנס את טווח ה-ARV ל<Link to="/acquisition" className="underline">Acquisition Engine</Link> לחישוב MAO.
          </Tip>
        </>
      ),
    },
    {
      id: 'mistakes',
      icon: AlertTriangle,
      title: '10. טעויות נפוצות',
      subtitle: 'כל אחת מהן עלתה למשקיעים אמיתיים כסף אמיתי.',
      body: (
        <ul className="list-disc pr-5 space-y-2">
          <li><strong>מחירי listing במקום sold.</strong> $300K listing הוא לא קומפ של $300K.</li>
          <li><strong>חציית אזורי רישום / כבישים ראשיים.</strong></li>
          <li><strong>דילוג על התאמת מצב.</strong></li>
          <li><strong>קומפים ישנים</strong> (יותר מ-6 חודשים בשוק נע).</li>
          <li><strong>Cherry-picking.</strong></li>
          <li><strong>התעלמות מ-days-on-market.</strong></li>
          <li><strong>אמון ב-Zestimate.</strong></li>
          <li><strong>שכחת concessions.</strong> $300K עם $10K זיכוי = $290K.</li>
        </ul>
      ),
    },
    {
      id: 'checklist',
      icon: ListChecks,
      title: '11. צ׳קליסט לפני הצעה',
      subtitle: 'אל תשלח מספר עד שכל סעיף מסומן.',
      body: (
        <ul className="space-y-2">
          {[
            '3+ סגירות, ≤6 חודשים, ≤0.5–1 מייל.',
            'אותו אזור יסודי.',
            'אף קומפ לא חוצה כביש מהיר/רכבת/נהר מול הסובייקט.',
            'Bracketing על גודל, חדרים/אמבטיות, מצב.',
            'התאמה לפי שורות לכל קומפ.',
            'אימות מצב מתמונות (סובייקט + כל קומפ).',
            'אימות מחירי מכירה ברשם המחוז.',
            '$/sqft ומחיר מותאם מסכימים בתוך 5%.',
            'ARV מוצג כטווח.',
            'BPO של סוכן אם זו רשימה קצרה אמיתית.',
            'Acquisition Engine ל-MAO.',
            '10–15% רזרבה לשיפוץ מעל אומדן ה-line-item.',
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
    'ARV הוא המחיר שבו קומפ משופץ נסגר בפועל — לא מחיר listing ולא Zestimate. משוך 3–5 סגירות תוך 6 חודשים ו-~1 מייל, באותו אזור רישום, שעושות bracketing לסובייקט בגודל ובמצב. התאם כל אחת לכיוון הסובייקט לפי שורות. גזור בין $/sqft למחיר מותאם. MAO = ARV × 70% − שיפוצים.',
};

export default function ArvGuidePage() {
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
              <BookOpen className="w-6 h-6 text-primary" />
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
