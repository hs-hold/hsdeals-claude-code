import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';

// ARV / Property Evaluation Guide
// ---------------------------------
// Plain-English playbook for valuing single-family flips in our markets
// (Atlanta metro, GA in particular). Distilled from BiggerPockets-style
// investor practice + standard Sales Comparison Approach used by appraisers.
// Goal: give the operator (and any agent) a repeatable procedure so
// underwriting numbers don't drift to wishful thinking.

// Reusable section components — kept inline so the page is self-contained
// and the file can be moved without dragging shared subcomponents around.
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

export default function ArvGuidePage() {
  return (
    <div className="container max-w-4xl py-8 px-4">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Property Evaluation &amp; ARV Guide
          </h1>
        </div>
        <p className="text-muted-foreground max-w-3xl">
          A step-by-step playbook for evaluating a property and estimating its
          After-Repair Value (ARV). Use this as a reference any time you
          underwrite a deal &mdash; the same process applies whether the lead
          comes from the MLS, an agent, a wholesaler, or our auto-discovery.
        </p>
        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          <Badge variant="secondary">Atlanta metro tuned</Badge>
          <Badge variant="secondary">SFR flips &amp; BRRRR</Badge>
          <Badge variant="secondary">Sales Comparison Approach</Badge>
        </div>
      </header>

      {/* ============== TOC ============== */}
      <Card className="mb-8 border-dashed">
        <CardContent className="py-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            On this page
          </div>
          <ol className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm list-decimal pl-5">
            <li><a href="#what-is-arv" className="hover:underline">What ARV actually is</a></li>
            <li><a href="#sources" className="hover:underline">Where to pull comps from</a></li>
            <li><a href="#comp-criteria" className="hover:underline">Picking the right comps</a></li>
            <li><a href="#adjustments" className="hover:underline">Adjusting comps</a></li>
            <li><a href="#bracketing" className="hover:underline">Bracketing &amp; the final number</a></li>
            <li><a href="#condition" className="hover:underline">Reading condition from photos</a></li>
            <li><a href="#location" className="hover:underline">Location signals that move ARV</a></li>
            <li><a href="#school" className="hover:underline">Schools &amp; the &quot;school cliff&quot;</a></li>
            <li><a href="#mao" className="hover:underline">From ARV to offer (MAO &amp; 70% rule)</a></li>
            <li><a href="#mistakes" className="hover:underline">Common mistakes &amp; how to avoid them</a></li>
            <li><a href="#checklist" className="hover:underline">Before-you-offer checklist</a></li>
          </ol>
        </CardContent>
      </Card>

      {/* ============== 1. What is ARV ============== */}
      <div id="what-is-arv">
        <Section
          icon={Home}
          title="1. What ARV actually is"
          subtitle="Definition first — most bad numbers come from a fuzzy definition."
        >
          <p>
            <strong>After-Repair Value (ARV)</strong> is the price the property
            would sell for, on the open market, in <em>retail-ready, fully
            renovated condition</em>, sold to an owner-occupant buyer. It is
            <em> not</em> the Zestimate, not the asking price, not a
            wholesaler&rsquo;s claim, and not what comparable homes are
            <em> listed</em> for &mdash; it is what comparable, recently
            renovated homes <em>actually closed</em> at.
          </p>
          <Tip>
            Always state ARV as a range first (e.g. &ldquo;$240K&ndash;$255K&rdquo;)
            and only collapse it to a single number when you have to plug it
            into a formula. The range forces you to be honest about
            uncertainty.
          </Tip>
          <p>
            ARV uses the <strong>Sales Comparison Approach</strong> &mdash; the
            same method a licensed appraiser uses on a 1004 form. You find
            recently sold properties that closely match the subject, adjust
            them for differences, and triangulate.
          </p>
        </Section>
      </div>

      {/* ============== 2. Sources ============== */}
      <div id="sources">
        <Section
          icon={Search}
          title="2. Where to pull comps from"
          subtitle="Not all data sources are equal. Tier them."
        >
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>MLS sold data (best)</strong> &mdash; via your agent or a
              broker portal. Includes condition notes, days-on-market, and
              accurate sold price + concessions. This is the gold standard.
            </li>
            <li>
              <strong>Zillow / Redfin / Realtor.com sold tab</strong> &mdash;
              public-facing mirror of MLS data. Good enough for a first pass.
              Filter to <em>Sold in last 6 months</em>. Verify the photos
              actually show a renovated interior.
            </li>
            <li>
              <strong>County tax assessor / public records</strong> &mdash; for
              confirming the legal sale price (Zillow occasionally shows a
              wrong number) and lot size / year built.
            </li>
            <li>
              <strong>PropStream, Privy, BatchLeads</strong> &mdash; paid
              investor tools. Helpful for batch work; their auto-ARVs are
              still rough &mdash; treat them as a starting point, not the
              answer.
            </li>
            <li>
              <strong>Broker Price Opinion (BPO)</strong> &mdash; a local
              agent&rsquo;s informal valuation. The cheapest sanity check
              for any deal you&rsquo;re actually about to offer on.
            </li>
          </ul>
          <Warn>
            <strong>Never use list price comps to set ARV.</strong> Listings
            are aspirational; closed sales are reality. The market is full of
            properties that have sat on the MLS at $X for 90 days because
            they&rsquo;re overpriced.
          </Warn>
        </Section>
      </div>

      {/* ============== 3. Comp criteria ============== */}
      <div id="comp-criteria">
        <Section
          icon={Ruler}
          title="3. Picking the right comps"
          subtitle="Aim for 3–5 closed sales that match on the criteria below."
        >
          <p className="mb-2">
            Tighten or loosen the filters based on density. In dense urban
            ZIPs you can be very strict; in rural areas you may have to widen.
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Criterion</th>
                  <th className="text-left p-2">Ideal</th>
                  <th className="text-left p-2">Acceptable</th>
                  <th className="text-left p-2">Why it matters</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-2 font-medium">Recency (sale date)</td>
                  <td className="p-2">≤ 3 months</td>
                  <td className="p-2">≤ 6 months</td>
                  <td className="p-2">Markets shift; older data lies.</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Distance</td>
                  <td className="p-2">≤ 0.5 mi</td>
                  <td className="p-2">≤ 1 mi (urban) / ≤ 2 mi (rural)</td>
                  <td className="p-2">Don&rsquo;t cross neighborhoods, school zones, or major roads.</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Living area (sqft)</td>
                  <td className="p-2">±10%</td>
                  <td className="p-2">±20%</td>
                  <td className="p-2">$/sqft isn&rsquo;t linear &mdash; very different sizes don&rsquo;t map.</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Beds / baths</td>
                  <td className="p-2">Same</td>
                  <td className="p-2">±1 bed, ±0.5 bath</td>
                  <td className="p-2">Buyers shop on bed count first.</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Year built</td>
                  <td className="p-2">±10 yr</td>
                  <td className="p-2">±20 yr</td>
                  <td className="p-2">Era affects layout, ceiling height, electrical, plumbing.</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Style</td>
                  <td className="p-2">Same (ranch / 2-story / split)</td>
                  <td className="p-2">Similar</td>
                  <td className="p-2">Style is a discrete preference, not a smooth adjustment.</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Lot size</td>
                  <td className="p-2">±25%</td>
                  <td className="p-2">±50%</td>
                  <td className="p-2">Big lots get a small premium; tiny lots take a hit.</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Condition</td>
                  <td className="p-2">Renovated &mdash; matches your post-rehab plan</td>
                  <td className="p-2">Light cosmetic update</td>
                  <td className="p-2">Most critical and most ignored. See section 6.</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">School zone</td>
                  <td className="p-2">Same elementary &amp; middle</td>
                  <td className="p-2">Same school district</td>
                  <td className="p-2">A street away can mean a different school = different price.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Tip>
            Stay on the <strong>same side</strong> of any major road, railroad,
            or river. Buyers psychologically don&rsquo;t cross those lines &mdash;
            and our system already filters out properties on highways from
            discovery.
          </Tip>
        </Section>
      </div>

      {/* ============== 4. Adjustments ============== */}
      <div id="adjustments">
        <Section
          icon={Calculator}
          title="4. Adjusting comps"
          subtitle="No two houses are identical. The point of an adjustment is to make them comparable apples-to-apples."
        >
          <p>
            Two methods, used together:
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong>$/sqft method (quick):</strong> compute closed
              $/sqft for each comp, throw out the high and the low if you
              have ≥ 5 comps, average the middle, multiply by your subject&rsquo;s
              sqft. Best when comps are very tight on every other dimension.
            </li>
            <li>
              <strong>Line-item adjustments (proper):</strong> start from each
              comp&rsquo;s sold price and adjust <em>up or down to match the
              subject</em>. If the comp has one more bathroom than the
              subject, subtract that bathroom&rsquo;s contributory value. If
              the subject has a finished basement and the comp doesn&rsquo;t,
              add the basement value to the comp.
            </li>
          </ol>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium mb-1">Common contributory values (Atlanta metro, SFR, 2024–2026)</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Extra full bathroom: ~$5K&ndash;$10K</li>
              <li>Extra half bath: ~$2.5K&ndash;$5K</li>
              <li>Extra bedroom (legal): ~$8K&ndash;$15K</li>
              <li>Garage (1-car): ~$8K&ndash;$15K, (2-car): ~$15K&ndash;$25K</li>
              <li>Finished basement (per sqft): ~50&ndash;60% of above-grade $/sqft</li>
              <li>Pool (in-ground, decent shape): ~$10K&ndash;$25K, sometimes negative in low-end markets</li>
              <li>New roof / new HVAC: ~$5K&ndash;$10K each (only if comp doesn&rsquo;t have it)</li>
              <li>Major condition gap (dated vs. fully renovated): can easily be $30K+</li>
            </ul>
          </div>
          <Warn>
            <strong>Adjust the comp toward the subject, not the subject toward
            the comp.</strong> The subject is the unknown; you&rsquo;re moving
            comps onto its level.
          </Warn>
        </Section>
      </div>

      {/* ============== 5. Bracketing ============== */}
      <div id="bracketing">
        <Section
          icon={TrendingUp}
          title="5. Bracketing & landing the final number"
          subtitle="Bracketing is the discipline that keeps you honest."
        >
          <p>
            <strong>Bracketing</strong> means choosing comps so that the
            subject&rsquo;s key features are <em>surrounded</em> by comp values
            &mdash; ideally one comp slightly inferior, one slightly superior,
            one very similar. If all three of your comps are bigger and nicer
            than the subject, your ARV is going to be too high. If all three
            are smaller and uglier, your ARV is too low.
          </p>
          <p>
            Once you have 3&ndash;5 adjusted comps:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Compute the <strong>adjusted</strong> $/sqft for each.</li>
            <li>Throw out outliers if you have enough comps.</li>
            <li>Take the median or weighted average (weight the most-similar comp heaviest).</li>
            <li>Multiply by the subject&rsquo;s sqft.</li>
            <li>Sanity check against the simple median <strong>adjusted sold price</strong> &mdash; the two numbers should be within 5%.</li>
          </ul>
          <Tip>
            If your adjusted-$/sqft and adjusted-price methods disagree by more
            than ~5%, your comp set is too noisy. Tighten it.
          </Tip>
        </Section>
      </div>

      {/* ============== 6. Condition ============== */}
      <div id="condition">
        <Section
          icon={Hammer}
          title="6. Reading condition from photos"
          subtitle="You can&rsquo;t fix what you didn&rsquo;t see. Listing photos are the cheapest inspection there is."
        >
          <p>
            Investors who skip this step blow their rehab budget. Here&rsquo;s
            what to scan for, room by room:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Roof:</strong> shingle age, sagging ridgeline, missing pieces. Drone shots if available.</li>
            <li><strong>Foundation:</strong> stair-step cracks in brick, sloping floors visible in photos, water staining at the base of walls.</li>
            <li><strong>HVAC age:</strong> look for the model number sticker; furnaces 20+ years old need replacement.</li>
            <li><strong>Electrical:</strong> federal Pacific or Zinsco panels, knob-and-tube, two-prong outlets.</li>
            <li><strong>Plumbing:</strong> galvanized or polybutylene piping, lead supply lines.</li>
            <li><strong>Kitchen:</strong> cabinet quality, countertop material, layout. Granite/quartz + shaker cabinets is the modern minimum.</li>
            <li><strong>Bathrooms:</strong> tile vs. fiberglass surround, vanity quality, ventilation.</li>
            <li><strong>Floors:</strong> hardwood (refinishable?), LVP, original 1950s tile, carpet over hardwood.</li>
            <li><strong>Windows:</strong> single-pane wood vs. double-pane vinyl; sash condition.</li>
            <li><strong>Yard / drainage:</strong> water pooling, dead grass patterns, retaining-wall lean.</li>
            <li><strong>Photo gaps:</strong> if there are no photos of a room, assume the worst. Sellers don&rsquo;t hide things they want you to see.</li>
          </ul>
          <Warn>
            <strong>The biggest ARV mistake is comping a cosmetically-renovated
            comp against a fully-renovated subject (or vice versa).</strong>
            &ldquo;Renovated&rdquo; on a listing means almost nothing. Look at
            the photos.
          </Warn>
        </Section>
      </div>

      {/* ============== 7. Location ============== */}
      <div id="location">
        <Section
          icon={MapPin}
          title="7. Location signals that move ARV"
          subtitle="Pricing per sqft can shift 30%+ over a few blocks."
        >
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Major roads:</strong> properties on a highway, parkway, or 4-lane arterial sell for 10&ndash;25% less than the same house one street back. Our discovery already filters these out.</li>
            <li><strong>Power lines / cell towers:</strong> visible high-tension lines kill 5&ndash;15%.</li>
            <li><strong>Train tracks &amp; airports (flight path):</strong> usually a 5&ndash;10% discount.</li>
            <li><strong>Commercial backdrop:</strong> a lot backing onto a strip mall or warehouse loses curb appeal.</li>
            <li><strong>Cul-de-sac premium:</strong> small but real, especially with kids.</li>
            <li><strong>HOA quality:</strong> well-maintained subdivision = positive; deferred-maintenance HOA = negative.</li>
            <li><strong>Walkability / amenities:</strong> Trader Joe&rsquo;s, Whole Foods, a popular park nearby &mdash; positive.</li>
            <li><strong>Crime / vacancy patterns:</strong> Google Street View the block. Boarded windows two doors down are a signal.</li>
          </ul>
        </Section>
      </div>

      {/* ============== 8. Schools ============== */}
      <div id="school">
        <Section
          icon={GraduationCap}
          title="8. Schools & the &quot;school cliff&quot;"
          subtitle="The single biggest invisible driver of ARV."
        >
          <p>
            In owner-occupant markets, school district drives buyer demand more
            than almost anything else. Two identical houses on the same street,
            in different elementary zones, can have ARVs that diverge by 15%+.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Verify the elementary/middle/high zoning on the county school
              district&rsquo;s lookup tool &mdash; not just GreatSchools, which
              is sometimes stale.</li>
            <li>Use GreatSchools rating + Niche grade as a buyer signal, but
              know that 7+/10 is the typical &ldquo;buyer threshold.&rdquo;</li>
            <li>Confirm comps are in the <em>same</em> elementary zone, not
              just the same district.</li>
          </ul>
        </Section>
      </div>

      {/* ============== 9. MAO ============== */}
      <div id="mao">
        <Section
          icon={Calculator}
          title="9. From ARV to offer: the 70% rule & MAO"
          subtitle="ARV is one input. Your Maximum Allowable Offer is the output."
        >
          <p>
            The classic flipper formula:
          </p>
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-sm">
            MAO = (ARV × 70%) − Repair Costs
          </div>
          <p>
            The 70% covers profit + carrying costs + selling costs + risk
            buffer. In Atlanta&rsquo;s current market we typically tune to
            <strong> 70&ndash;75%</strong> on lower-priced flips and
            <strong> 75&ndash;80%</strong> on higher-priced ones, where
            transaction costs are a smaller share of price.
          </p>
          <p>
            For BRRRR (rent &amp; refinance) we run a parallel check on
            <strong> Cash-Left-In-Deal</strong> after a 75% LTV cash-out
            refi &mdash; the goal is usually $0&ndash;$15K stuck in. Our
            Acquisition Engine page already wires this all together; this
            guide is the &ldquo;why&rdquo; behind those numbers.
          </p>
          <Tip>
            Plug your ARV range into the <Link to="/acquisition" className="underline">Acquisition Engine</Link>
            {' '}and it will show you Buy/Pass plus the score breakdown.
          </Tip>
        </Section>
      </div>

      {/* ============== 10. Mistakes ============== */}
      <div id="mistakes">
        <Section
          icon={AlertTriangle}
          title="10. Common mistakes & how to avoid them"
          subtitle="Every one of these has cost real investors real money."
        >
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Using listed prices instead of sold.</strong> A $300K
              listing is not a $300K comp. It&rsquo;s an unsold $300K listing.
            </li>
            <li>
              <strong>Crossing school zones / major roads.</strong> The map
              shows two streets next to each other; the buyer pool sees two
              completely different neighborhoods.
            </li>
            <li>
              <strong>Skipping condition matching.</strong> Comping a $250K
              fully-renovated sale against a tired $200K subject inflates ARV
              by exactly the gap you didn&rsquo;t adjust for.
            </li>
            <li>
              <strong>Using stale comps.</strong> A 12-month-old sale in a
              moving market is wrong in either direction.
            </li>
            <li>
              <strong>Cherry-picking.</strong> If you only keep the comps that
              support the number you wanted, you&rsquo;re writing fiction.
            </li>
            <li>
              <strong>Ignoring days-on-market.</strong> A comp that sat 120 days
              and sold below list signals soft demand. A comp that sold in 4
              days with multiple offers signals strong demand. Both inform ARV.
            </li>
            <li>
              <strong>Trusting the Zestimate.</strong> Useful as one of many
              data points; never as the answer.
            </li>
            <li>
              <strong>Forgetting concessions.</strong> A &ldquo;$300K sale&rdquo;
              with $10K seller credit is really a $290K sale. MLS shows this;
              Zillow usually doesn&rsquo;t.
            </li>
          </ul>
        </Section>
      </div>

      {/* ============== 11. Checklist ============== */}
      <div id="checklist">
        <Section
          icon={ListChecks}
          title="11. Before-you-offer checklist"
          subtitle="Don&rsquo;t send a number until every box is checked."
        >
          <ul className="space-y-2">
            {[
              'Pulled at least 3 closed sales within the last 6 months and 0.5–1 mi.',
              'All comps are in the same elementary school zone.',
              'No comp crosses a highway, railroad, or river relative to subject.',
              'Comps bracket the subject on size, beds/baths, and condition.',
              'Adjusted each comp line-by-line for differences vs. subject.',
              'Verified condition from listing photos for both subject and each comp.',
              'Confirmed sale prices in county records (not just Zillow).',
              'Computed ARV both via $/sqft and adjusted-price; results agree within ~5%.',
              'Stated ARV as a range, not a single point estimate.',
              'Got an agent BPO if the deal is on your real shortlist.',
              'Plugged the ARV into the Acquisition Engine to compute MAO.',
              'Built in 10–15% rehab contingency on top of the line-item rehab estimate.',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Separator className="my-8" />

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">TL;DR</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          ARV is what a renovated comp <em>actually closed at</em>, not a
          listing price or Zestimate. Pull 3&ndash;5 closed sales within
          6 months and ~1 mile, in the same school zone, that bracket your
          subject on size and condition. Adjust each one toward the subject
          line-by-line. Triangulate $/sqft and adjusted-price methods. Pass
          the result through MAO = ARV × 70% − repairs. When in doubt, get
          a local agent BPO.
        </CardContent>
      </Card>
    </div>
  );
}
