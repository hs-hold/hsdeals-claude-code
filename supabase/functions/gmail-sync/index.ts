import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_DEAL_PRICE = 1000000; // Skip deals above this price

// List of portal/listing service domains to skip
const PORTAL_DOMAINS = [
  'zillow.com',
  'redfin.com',
  'realtor.com',
  'trulia.com',
  'homes.com',
  'movoto.com',
  'coldwellbanker.com',
  'century21.com',
  'kw.com',
  'compass.com',
  'opendoor.com',
  'offerpad.com',
  'loopnet.com',
  'crexi.com',
  'costar.com',
  'apartments.com',
  'rent.com',
];

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ body?: { data?: string }; mimeType?: string; parts?: any[] }>;
    mimeType?: string;
  };
}

interface SyncDetails {
  address: string;
  action: 'created' | 'skipped_duplicate' | 'skipped_portal' | 'skipped_over_budget' | 'skipped_wrong_state' | 'updated_existing' | 'no_address' | 'error' | 'message' | 'skipped_newsletter';
  dealId?: string;
  senderEmail?: string;
  senderName?: string;
  subject?: string;
  reason?: string;
  existingDealId?: string;
  messageId?: string;
  purchasePrice?: number | null;
  dealType?: string | null;
  extractedData?: Record<string, any>;
  emailSnippet?: string;
  extractionSource?: 'ai' | 'regex';
  isImportant?: boolean;
  messagePreview?: string;
}

// Decode base64url encoded content from Gmail
function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    const paddedBase64 = padding ? base64 + '='.repeat(4 - padding) : base64;
    return atob(paddedBase64);
  } catch (e) {
    console.error('Error decoding base64:', e);
    return '';
  }
}

/** Strip HTML tags and clean up whitespace for AI parsing */
function stripHtml(html: string): string {
  return html
    // Remove script/style blocks entirely
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Remove inline images (base64 or tracking pixels — keep nothing useful)
    .replace(/<img[^>]+src=["']data:[^"']+["'][^>]*>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    // Block-level elements → newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|tr|td|th|h[1-6]|section|article|table|tbody|thead|tfoot|blockquote)[^>]*>/gi, '\n')
    // Keep href text for links (Google Drive, Dropbox, photo links)
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi, ' $1 ')
    // Strip remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Extract email body from Gmail message — always returns clean plain text
function extractEmailBody(message: GmailMessage): string {
  let plainText = '';
  let htmlText  = '';

  if (message.payload?.body?.data) {
    // Single-part message
    const raw = decodeBase64Url(message.payload.body.data);
    if (raw.trim().startsWith('<') || message.payload.mimeType === 'text/html') {
      htmlText = stripHtml(raw);
    } else {
      plainText = raw;
    }
  } else if (message.payload?.parts) {
    // Multipart message — collect both plain and HTML from nested parts
    const walk = (parts: any[]) => {
      for (const part of parts ?? []) {
        if (part.mimeType === 'text/plain' && part.body?.data && !plainText) {
          plainText = decodeBase64Url(part.body.data);
        } else if (part.mimeType === 'text/html' && part.body?.data && !htmlText) {
          htmlText = stripHtml(decodeBase64Url(part.body.data));
        }
        if (part.parts) walk(part.parts);
      }
    };
    walk(message.payload.parts);
  }

  // Decide which source to use:
  // Prefer HTML when:
  //   1. plain text is very short (< 200 chars) — "view in browser" placeholder
  //   2. plain text contains a browser-view hint
  //   3. HTML is significantly longer than plain text (CRM email with rich HTML body)
  const plainHasBrowserHint = /view (this |in |your )?((email|message) (in|on) )?(a |your )?(web)?browser/i.test(plainText);
  const htmlIsRicher = htmlText.length > 0 && htmlText.length > plainText.length * 1.5;
  const plainIsUseful = plainText.length > 200 && !plainHasBrowserHint && !htmlIsRicher;
  console.log(`[extractBody] plain=${plainText.length} chars, html=${htmlText.length} chars, usingPlain=${plainIsUseful} (browserHint=${plainHasBrowserHint}, htmlIsRicher=${htmlIsRicher})`);
  const body = (plainIsUseful ? plainText : (htmlText || plainText)) || message.snippet || '';
  // Limit to 25000 chars (stripped HTML is dense; property details can appear late in CRM emails)
  return body.substring(0, 25000);
}

// Extract raw HTML (un-stripped) from a Gmail message for link parsing
function extractRawHtml(message: GmailMessage): string {
  if (message.payload?.body?.data) {
    const raw = decodeBase64Url(message.payload.body.data);
    if (raw.trim().startsWith('<') || message.payload.mimeType === 'text/html') return raw;
  }
  if (message.payload?.parts) {
    let html = '';
    const walk = (parts: any[]) => {
      for (const part of parts ?? []) {
        if (part.mimeType === 'text/html' && part.body?.data && !html) {
          html = decodeBase64Url(part.body.data);
        }
        if (part.parts) walk(part.parts);
      }
    };
    walk(message.payload.parts);
    return html;
  }
  return '';
}

// Extract labeled document links from raw HTML before it's stripped.
// Handles patterns like:  Photos <a href="url">HERE</a>
//                         <a href="url">House Sketch</a>
function extractDocumentLinks(rawHtml: string): Array<{label: string; url: string}> {
  if (!rawHtml) return [];
  const results: Array<{label: string; url: string}> = [];
  const seen = new Set<string>();

  // Pattern 1: "Some Label <a href="url">HERE</a>"
  const herePattern = /([A-Za-z][A-Za-z\s&;:#\-]{0,60}?)\s*<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>\s*HERE\s*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = herePattern.exec(rawHtml)) !== null) {
    const rawLabel = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const url = m[2];
    if (!url || seen.has(url)) continue;
    // Take last meaningful segment (avoid trailing HTML noise)
    const label = rawLabel.split(/[|•·\n\r>]+/).pop()?.trim() ?? rawLabel;
    if (label && label.length >= 2 && label.length <= 60) {
      seen.add(url);
      results.push({ label: label.substring(0, 50), url });
    }
  }

  // Pattern 2: links with descriptive anchor text
  const descriptivePattern = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>\s*(Photos?|House\s*Sketch|Sold\s*Comps?|Rent\s*Comp|Closed\s*Rent|Property\s*Info|Active\s*Under\s*Contract[^<]*|Inspection[^<]*|Appraisal[^<]*|Flyer|Floor\s*Plan|Layout|Sketch)\s*<\/a>/gi;
  while ((m = descriptivePattern.exec(rawHtml)) !== null) {
    const url = m[1];
    const label = m[2].replace(/\s+/g, ' ').trim();
    if (!seen.has(url) && label.length >= 2) {
      seen.add(url);
      results.push({ label, url });
    }
  }

  return results.slice(0, 15);
}

// Get header value from Gmail message
function getHeader(message: GmailMessage, headerName: string): string {
  const header = message.payload?.headers?.find(
    h => h.name.toLowerCase() === headerName.toLowerCase()
  );
  return header?.value || '';
}

// Parse sender info from "From" header
function parseSenderInfo(fromHeader: string): { name: string; email: string } {
  const match = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || '',
      email: match[2]?.trim().toLowerCase() || fromHeader.toLowerCase(),
    };
  }
  return { name: '', email: fromHeader.toLowerCase() };
}

// Check if email is from a portal/listing service
function isPortalEmail(senderEmail: string): boolean {
  return PORTAL_DOMAINS.some(domain => senderEmail.includes(domain));
}

// Extract image/photo links from email body
function extractImageLinks(emailBody: string): string[] {
  const found = new Set<string>();

  const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgSrcRegex.exec(emailBody)) !== null) {
    const url = m[1];
    if (url.startsWith('http') && !/tracking|pixel|beacon|spacer|logo|icon/i.test(url)) {
      found.add(url);
    }
  }

  const directImgRegex = /https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp|gif)/gi;
  while ((m = directImgRegex.exec(emailBody)) !== null) {
    found.add(m[0].split('"')[0].split("'")[0]);
  }

  const galleryRegex = /https?:\/\/(?:drive\.google\.com|photos\.google\.com|dropbox\.com|1drv\.ms|onedrive\.live\.com|icloud\.com|photos\.app\.goo\.gl|album\.link|flickr\.com|imgur\.com|cloudinary\.com)[^\s"'<>]*/gi;
  while ((m = galleryRegex.exec(emailBody)) !== null) {
    found.add(m[0].split('"')[0].split("'")[0]);
  }

  return [...found].slice(0, 20);
}

// Normalize address for fuzzy matching
function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/[.,#\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way|place|pl|circle|cir)\b/g, '')
    .replace(/\b(apartment|apt|unit|suite|ste|#)\s*\w*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check if two addresses match (fuzzy)
function addressesMatch(addr1: string, addr2: string): boolean {
  const norm1 = normalizeAddress(addr1);
  const norm2 = normalizeAddress(addr2);
  if (norm1 === norm2) return true;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  const extractStreetParts = (addr: string) => {
    const parts = addr.split(' ');
    const number = parts.find(p => /^\d+$/.test(p));
    const words = parts.filter(p => !/^\d+$/.test(p) && p.length > 2);
    return { number, words };
  };
  const parts1 = extractStreetParts(norm1);
  const parts2 = extractStreetParts(norm2);
  if (parts1.number && parts1.number === parts2.number) {
    const matchingWords = parts1.words.filter(w => parts2.words.includes(w));
    if (matchingWords.length >= 2) return true;
  }
  return false;
}

// ─── Regex-based US address extractor (no AI needed) ───────────────────────
function extractAddressesWithRegex(text: string): string[] {
  const STREET_TYPES = [
    'Street', 'St', 'Avenue', 'Ave', 'Drive', 'Dr', 'Road', 'Rd',
    'Lane', 'Ln', 'Court', 'Ct', 'Boulevard', 'Blvd', 'Way', 'Place', 'Pl',
    'Circle', 'Cir', 'Northwest', 'Northeast', 'Southwest', 'Southeast',
    'Parkway', 'Pkwy', 'Highway', 'Hwy', 'Terrace', 'Ter', 'Trail', 'Trl',
    'Loop', 'Run', 'Pass', 'Pike', 'Row', 'Alley', 'Point', 'Pointe',
    'Ridge', 'Glen', 'Grove', 'Park', 'Path', 'View', 'Walk', 'Wood',
    'Commons', 'Landing', 'Crossing', 'Creek', 'Mill', 'Spring', 'Square',
  ].join('|');

  const pattern = new RegExp(
    `\\b(\\d{1,5})\\s+` +                          // street number
    `([A-Za-z0-9][A-Za-z0-9\\s\\.]{1,40}?)\\s+` + // street name
    `(${STREET_TYPES})` +                           // street type
    `(?:\\s+(?:NW|NE|SW|SE|N|S|E|W))?` +           // optional direction
    `,?\\s+` +
    `([A-Za-z][A-Za-z\\s\\.]{1,30}?)` +            // city
    `,?\\s+` +
    `([A-Z]{2})` +                                  // state
    `\\s+(\\d{5}(?:-\\d{4})?)`,                    // ZIP
    'gi'
  );

  const addresses: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const num    = match[1];
    const name   = match[2].trim().replace(/\s+/g, ' ');
    const type   = match[3];
    const city   = match[4].trim().replace(/\s+/g, ' ');
    const state  = match[5].toUpperCase();
    const zip    = match[6];
    const addr   = `${num} ${name} ${type}, ${city}, ${state} ${zip}`;

    // Skip clearly bad matches
    if (name.length < 2 || city.length < 2) continue;
    if (!addresses.some(a => normalizeAddress(a) === normalizeAddress(addr))) {
      addresses.push(addr);
    }
  }

  console.log(`[regex] Found ${addresses.length} addresses:`, addresses);
  return addresses;
}

interface ExtractedDeal {
  address: string;
  purchasePrice: number | null;
  dealType: string | null;
  extractedData: Record<string, any>;
  source: 'ai' | 'regex';
}

/** Parse a price value that may come back as "$585,000", "585000", 585000, etc. */
function parsePrice(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : Math.round(val);
  const cleaned = String(val).replace(/[$,\s]/g, '');
  const num = Number(cleaned);
  return isNaN(num) || num <= 0 ? null : Math.round(num);
}

/** Parse a decimal number (bathrooms: "2.5", 2.5, etc.) */
function parseDecimal(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const num = Number(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

/** Parse an integer (bedrooms, sqft, yearBuilt, etc.) */
function parseInteger(val: any): number | null {
  const n = parseDecimal(val);
  return n === null ? null : Math.round(n);
}

// Detect if a string looks like a US street address: "123 Main St, City, ST 12345"
function looksLikeAddress(s: string): boolean {
  return /^\d+\s+[a-zA-Z0-9\s]+(?:st|ave|dr|blvd|rd|ln|ct|pl|way|cir|pkwy|hwy|sw|nw|se|ne)\b.*,\s*[a-zA-Z\s]+,\s*[a-zA-Z]{2}\s+\d{5}/i.test(s.trim());
}

interface NonDealClassification {
  type: 'message' | 'newsletter';
  isImportant: boolean;
  preview: string;
}

/** Classify a non-deal email: personal message vs newsletter/spam */
async function classifyNonDealEmail(emailContent: string, subject: string, senderEmail: string): Promise<NonDealClassification> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const preview = emailContent.substring(0, 300).replace(/\s+/g, ' ').trim();

  if (!apiKey) {
    return { type: 'newsletter', isImportant: false, preview };
  }

  const prompt = `You are classifying an email that does NOT contain real estate deal listings.

From: ${senderEmail}
Subject: ${subject}
Content (first 600 chars): ${emailContent.substring(0, 600)}

Classify this email:
1. Is it a personal/business message (someone reaching out, replying, asking something, sharing info directly) OR a newsletter/marketing/automated email?
2. If it's a personal message, is it important (requires attention or response)?

Return JSON only:
{
  "type": "message" | "newsletter",
  "isImportant": true | false,
  "reason": "brief reason"
}

- "message": a real person wrote this specifically (not mass-sent), OR it contains important business information
- "newsletter": automated, marketing, mass-mailed, subscription, notification, alert, digest, promotion
- isImportant: true only for "message" type that seems to need attention`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return { type: 'newsletter', isImportant: false, preview };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { type: 'newsletter', isImportant: false, preview };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      type: parsed.type === 'message' ? 'message' : 'newsletter',
      isImportant: Boolean(parsed.isImportant),
      preview,
    };
  } catch {
    return { type: 'newsletter', isImportant: false, preview };
  }
}

// Use Anthropic claude-haiku to extract ALL property addresses and deal info from email
async function extractDealsWithAI(emailContent: string, subject: string): Promise<ExtractedDeal[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('[extractDeals] ANTHROPIC_API_KEY not set — using regex fallback');
    return extractAddressesWithRegex(emailContent + '\n' + subject).map(addr => ({
      address: addr, purchasePrice: null, dealType: null, extractedData: {}, source: 'regex' as const,
    }));
  }

  // Fast path: subject IS a full property address
  if (looksLikeAddress(subject)) {
    console.log('[extractDeals] subject is an address:', subject);
    return [{ address: subject.trim(), purchasePrice: null, dealType: null, extractedData: {}, source: 'ai' }];
  }

  const prompt = `You are a real estate deal analyzer. Extract ALL properties from this wholesaler email.

Email Subject: ${subject}

Email Content:
${emailContent}

RULES:
- Find ALL properties listed — wholesalers often list 2-10 properties per email
- Each property needs a street number (e.g. "463 Main St"). City-only phrases are NOT addresses.
- ALL numeric fields MUST be plain numbers — no $ signs, no commas. e.g. 162000 not "$162,000"
- Extract EVERY available field. Never leave a field null if the data exists in the email.
- "Total Interior Area", "Living Area", "Heated Sq Ft" etc. → use as sqft
- "Budget", "Rehab Budget", "Repairs" → use as rehabCost
- "Market Rent", "Rental Income" → use as rent
- "FCFS" = First Come First Served (note in dealNotes)
- Beds/Baths may appear as "3 Beds / 3 Baths", "3BD/2BA", "Bedrooms: 3", "3 bed 2 bath"
- "Total Interior Area", "Second Floor Finished", "First Floor Finished" → sum for sqft if no single total given

For each property, extract:
- address: Full US address with street, city, state, and ZIP if available. ZIP is optional — "123 Main St, Atlanta, GA" is valid. If multiple properties share the same city/state context, apply it to all of them.
- purchasePrice: Asking/offer/purchase price as plain number (NOT ARV, NOT rehab). e.g. 162000
- arv: After Repair Value as plain number
- dealType: Fix & Flip / Wholesale / Buy & Hold / BRRRR / Subject To / Seller Financing / Multifamily / Other / null
- bedrooms: number of bedrooms (integer)
- bathrooms: number of bathrooms (decimal ok, e.g. 2.5)
- sqft: total interior square footage (integer) — use any area field if explicit sqft not given
- units, yearBuilt
- lotSize: e.g. "0.52 acres" or "6500 sqft"
- rehabCost: rehab/repair/budget cost as plain number
- rent: monthly rent as plain number
- capRate, cashFlow, downPayment, existingLoanBalance, monthlyPITI
- propertyType: single_family / multi_family / condo / townhouse / duplex / triplex / fourplex / commercial / land / other
- condition: e.g. "Good", "Fair", "Needs Work", "Occupied" — any condition descriptor
- exterior: exterior material/style e.g. "Siding", "Brick", "Stucco" (null if not mentioned)
- access: how to access the property e.g. "Appointment", "Lockbox", "Vacant" (null if not mentioned)
- occupancy: e.g. "Occupied", "Vacant", "Tenant Occupied"
- county, neighborhood
- financingNotes, dealNotes
- propertyDescription: organized summary of ALL details from the email — include floor breakdown, garage, access info, financing terms, FCFS, everything
- photoLinks: array of any http/https URLs mentioned in the email (Google Drive, Dropbox, etc.)

Return ONLY valid JSON, nothing else:
{
  "deals": [
    {
      "address": "463 Voyles Drive, Riverdale, GA 30274",
      "purchasePrice": 160000,
      "arv": 250000,
      "dealType": "Fix & Flip",
      "bedrooms": 4,
      "bathrooms": 2.5,
      "sqft": 1350,
      "units": null,
      "yearBuilt": 1970,
      "lotSize": "0.37 acres",
      "rehabCost": null,
      "rent": null,
      "capRate": null,
      "cashFlow": null,
      "downPayment": null,
      "existingLoanBalance": null,
      "monthlyPITI": null,
      "propertyType": "single_family",
      "condition": null,
      "exterior": null,
      "access": null,
      "occupancy": null,
      "financingNotes": null,
      "dealNotes": null,
      "propertyDescription": "...",
      "photoLinks": ["https://drive.google.com/..."]
    }
  ]
}

Return { "deals": [] } if no valid US property addresses with street numbers are found.`;

  try {
    console.log('[extractDeals] Calling Claude Haiku — body preview (first 800 chars):');
    console.log(emailContent.substring(0, 800));
    console.log('[extractDeals] Subject:', subject);
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 32000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[extractDeals] Anthropic API error:', response.status, errText);
      // Fall back to regex
      return extractAddressesWithRegex(emailContent + '\n' + subject).map(addr => ({
        address: addr, purchasePrice: null, dealType: null, extractedData: {}, source: 'regex' as const,
      }));
    }

    const data = await response.json();
    const responseText = data.content?.[0]?.text?.trim() || '';
    console.log('[extractDeals] AI raw response (first 600 chars):', responseText.substring(0, 600));

    // ── Robust JSON extraction ─────────────────────────────────────────────
    let jsonStr = responseText;
    // Strip markdown fences
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }
    // Extract the first JSON object from anywhere in the string
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[extractDeals] No JSON found in AI response — trying regex fallback');
      return extractAddressesWithRegex(emailContent + '\n' + subject).map(addr => ({
        address: addr, purchasePrice: null, dealType: null, extractedData: {}, source: 'regex' as const,
      }));
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const deals = Array.isArray(parsed) ? parsed : (parsed.deals || []);
    console.log(`[extractDeals] AI extracted ${deals.length} deals`);

    const aiDeals: ExtractedDeal[] = deals
      .filter((d: any) => d.address && typeof d.address === 'string' && d.address.length > 10)
      .map((d: any) => {
        const { address, purchasePrice, dealType, ...rest } = d;
        // Normalize all numeric fields so "$585,000" / "3 beds" etc. become proper numbers
        const normalizedData: Record<string, any> = { ...rest };
        if ('arv'              in normalizedData) normalizedData.arv          = parsePrice(normalizedData.arv);
        if ('rehabCost'        in normalizedData) normalizedData.rehabCost    = parsePrice(normalizedData.rehabCost);
        if ('rent'             in normalizedData) normalizedData.rent         = parsePrice(normalizedData.rent);
        if ('cashFlow'         in normalizedData) normalizedData.cashFlow     = parsePrice(normalizedData.cashFlow);
        if ('downPayment'      in normalizedData) normalizedData.downPayment  = parsePrice(normalizedData.downPayment);
        if ('existingLoanBalance' in normalizedData) normalizedData.existingLoanBalance = parsePrice(normalizedData.existingLoanBalance);
        if ('monthlyPITI'      in normalizedData) normalizedData.monthlyPITI  = parsePrice(normalizedData.monthlyPITI);
        if ('bedrooms'         in normalizedData) normalizedData.bedrooms     = parseInteger(normalizedData.bedrooms);
        if ('bathrooms'        in normalizedData) normalizedData.bathrooms    = parseDecimal(normalizedData.bathrooms);
        if ('sqft'             in normalizedData) normalizedData.sqft         = parseInteger(normalizedData.sqft);
        if ('units'            in normalizedData) normalizedData.units        = parseInteger(normalizedData.units);
        if ('yearBuilt'        in normalizedData) normalizedData.yearBuilt    = parseInteger(normalizedData.yearBuilt);
        if ('capRate'          in normalizedData) normalizedData.capRate      = parseDecimal(normalizedData.capRate);

        const parsedPrice = parsePrice(purchasePrice);
        console.log(`[extractDeals] deal="${address}" price=${parsedPrice} beds=${normalizedData.bedrooms} baths=${normalizedData.bathrooms} sqft=${normalizedData.sqft}`);
        return {
          address: address.trim(),
          purchasePrice: parsedPrice,
          dealType: dealType || null,
          extractedData: normalizedData,
          source: 'ai' as const,
        };
      });

    // If AI found nothing, try regex as backup
    if (aiDeals.length === 0) {
      console.log('[extractDeals] AI found 0 deals — trying regex fallback');
      return extractAddressesWithRegex(emailContent + '\n' + subject).map(addr => ({
        address: addr, purchasePrice: null, dealType: null, extractedData: {}, source: 'regex' as const,
      }));
    }

    return aiDeals;
  } catch (error) {
    console.error('[extractDeals] Error:', error);
    // Final fallback to regex
    return extractAddressesWithRegex(emailContent + '\n' + subject).map(addr => ({
      address: addr, purchasePrice: null, dealType: null, extractedData: {}, source: 'regex' as const,
    }));
  }
}

/**
 * Second-pass address extraction: simpler prompt, more aggressive, used when the full
 * extractDealsWithAI returns 0 results. Returns minimal ExtractedDeal objects (address only).
 */
async function extractAddressesSecondPass(emailContent: string, subject: string): Promise<ExtractedDeal[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return [];

  const prompt = `Look carefully at this email. Does it mention any specific US property address — even without a ZIP code?

Subject: ${subject}

Email (first 3000 chars):
${emailContent.substring(0, 3000)}

Rules:
- An address must have a street number AND street name (e.g. "456 Elm St" or "456 Elm Street, Atlanta, GA")
- ZIP code is optional
- If you see city/state context (like "Atlanta, GA" or "Clayton County"), apply it to nearby addresses that lack city/state
- Price mentions like "$175K", "175k", "ARV: $280,000", "Asking: $135,000" help confirm this is a deal email
- "3/2", "3 bed/2 bath", "3BR/2BA" etc. help confirm this is a property listing

Return JSON ONLY:
{ "addresses": ["123 Main St, Atlanta, GA 30274", "456 Oak Ave, College Park, GA"] }

If no street-number addresses found: { "addresses": [] }`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const addresses: string[] = Array.isArray(parsed.addresses) ? parsed.addresses : [];
    console.log(`[secondPass] Found ${addresses.length} addresses:`, addresses);

    return addresses
      .filter((a: string) => typeof a === 'string' && a.length > 10)
      .map((a: string) => ({
        address: a.trim(),
        purchasePrice: null,
        dealType: null,
        extractedData: {},
        source: 'ai' as const,
      }));
  } catch (err) {
    console.error('[secondPass] error:', err);
    return [];
  }
}

// Mark email as read in Gmail
async function markEmailAsRead(accessToken: string, messageId: string): Promise<void> {
  try {
    const res = await fetch(`${GMAIL_API_BASE}/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`markEmailAsRead ${messageId} → HTTP ${res.status}: ${errText}`);
    }
  } catch (error) {
    console.error(`Failed to mark email ${messageId} as read:`, error);
  }
}

// Mark email as unread in Gmail
async function markEmailAsUnread(accessToken: string, messageId: string): Promise<void> {
  try {
    await fetch(`${GMAIL_API_BASE}/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
    });
  } catch (error) {
    console.error(`Failed to mark email ${messageId} as unread:`, error);
  }
}

function isBetterDeal(newDealData: any, existingDeal: any): boolean {
  const newHasPrice = newDealData.emailPurchasePrice || newDealData.purchasePrice;
  const existingHasPrice = existingDeal.overrides?.purchasePrice || existingDeal.api_data?.purchasePrice;
  if (newHasPrice && !existingHasPrice) return true;
  if (newHasPrice && existingHasPrice && newHasPrice < existingHasPrice) return true;
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      access_token,
      max_results = 200,
      since_days,
      mark_all_read = false,
      include_read = false,
      target_state,
      mark_old_only = false,
      mark_unread_recent = false,
      dry_run = false,
      force_rescan = false,        // DEBUG: skip already-processed check
      message_ids,                 // Optional: pre-fetched message IDs to skip Gmail list API
    } = body;

    if (!access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'No access token provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Mark old emails as read ───────────────────────────────────────────
    if (mark_old_only) {
      const olderThan = since_days ?? 7;
      const query = encodeURIComponent(`is:unread older_than:${olderThan}d`);
      const listResp = await fetch(
        `${GMAIL_API_BASE}/users/me/messages?maxResults=500&q=${query}`,
        { headers: { 'Authorization': `Bearer ${access_token}` } }
      );
      if (!listResp.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch old unread emails' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const listData = await listResp.json();
      const oldMessages = listData.messages || [];
      for (const msg of oldMessages) await markEmailAsRead(access_token, msg.id);
      return new Response(
        JSON.stringify({ success: true, marked: oldMessages.length, message: `Marked ${oldMessages.length} old emails as read` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Mark recent inbox emails as UNREAD so they can be re-scanned ──────
    if (mark_unread_recent) {
      // Fetch inbox messages directly using labelIds (no query filters that can fail)
      const listResp = await fetch(
        `${GMAIL_API_BASE}/users/me/messages?maxResults=200&labelIds=INBOX`,
        { headers: { 'Authorization': `Bearer ${access_token}` } }
      );

      if (!listResp.ok) {
        const errText = await listResp.text();
        console.error('[mark_unread_recent] list failed:', listResp.status, errText);
        return new Response(
          JSON.stringify({ success: false, error: `Gmail API error ${listResp.status}: ${errText}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const listData = await listResp.json();
      const messages: any[] = listData.messages || [];
      console.log(`[mark_unread_recent] Found ${messages.length} inbox messages`);

      if (messages.length === 0) {
        return new Response(
          JSON.stringify({ success: true, marked: 0, message: 'Inbox is empty' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Mark all as UNREAD
      let marked = 0;
      for (const msg of messages) {
        const r = await fetch(`${GMAIL_API_BASE}/users/me/messages/${msg.id}/modify`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
        });
        if (r.ok) marked++;
        else {
          const e = await r.text();
          console.error(`[mark_unread_recent] failed ${msg.id}: ${r.status} ${e}`);
        }
      }

      console.log(`[mark_unread_recent] Marked ${marked}/${messages.length} as unread`);
      return new Response(
        JSON.stringify({ success: true, marked, total: messages.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching emails... (since_days: ${since_days ?? 'all'}, include_read: ${include_read}, dry_run: ${dry_run}, message_ids: ${message_ids ? message_ids.length : 'none'})`);

    let messages: Array<{ id: string }>;

    if (Array.isArray(message_ids) && message_ids.length > 0) {
      // Caller already fetched the message list — skip Gmail list API
      messages = message_ids.map((id: string) => ({ id }));
      console.log(`Using provided ${messages.length} message IDs — skipping Gmail list API`);
    } else {
      // Build Gmail search query
      let query = include_read ? '' : 'is:unread';
      if (since_days) query += `${query ? ' ' : ''}newer_than:${since_days}d`;
      const encodedQuery = encodeURIComponent(query.trim());

      const listResponse = await fetch(
        `${GMAIL_API_BASE}/users/me/messages?maxResults=${max_results}&q=${encodedQuery}`,
        { headers: { 'Authorization': `Bearer ${access_token}` } }
      );

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error('Gmail API error:', listResponse.status, errorText);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch emails', details: errorText }),
          { status: listResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const listData = await listResponse.json();
      messages = listData.messages || [];
    }

    console.log(`Found ${messages.length} emails to process`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existingDeals } = await supabase
      .from('deals')
      .select('id, address_full, gmail_message_id, gmail_thread_id, overrides, api_data, sender_email, email_subject, email_extracted_data');

    const existingAddresses = existingDeals?.map(d => ({
      id: d.id, address: d.address_full, deal: d,
    })) || [];

    // Build a map of threadId → deal for fast reply detection
    const threadIdToDeal = new Map<string, any>();
    for (const d of existingDeals || []) {
      if (d.gmail_thread_id) threadIdToDeal.set(d.gmail_thread_id, d);
    }

    // Shared mutable state — all concurrent workers accumulate into this object
    interface SharedState {
      existingAddresses: Array<{ id: string; address: string; deal: any }>;
      syncDetails: SyncDetails[];
      processedDeals: any[];
      errors: string[];
      skippedAddresses: string[];
      portalEmails: string[];
      dealsSkippedDuplicate: number;
      dealsSkippedPortal: number;
    }

    const sharedState: SharedState = {
      existingAddresses,
      syncDetails: [],
      processedDeals: [],
      errors: [],
      skippedAddresses: [],
      portalEmails: [],
      dealsSkippedDuplicate: 0,
      dealsSkippedPortal: 0,
    };

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, deals: [], message: 'No unread emails found', syncDetails: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process one email message — accumulates into sharedState
    async function processOneMessage(msg: { id: string }, state: SharedState): Promise<void> {
      try {
        // Skip already-processed message IDs (unless dry_run, include_read, or force_rescan)
        if (!dry_run && !include_read && !force_rescan) {
          const alreadyProcessed = existingDeals?.some(d => d.gmail_message_id === msg.id);
          if (alreadyProcessed) {
            console.log(`Email ${msg.id} already processed, skipping`);
            await markEmailAsRead(access_token, msg.id);
            return;
          }
        }

        // Fetch full message
        const msgResponse = await fetch(
          `${GMAIL_API_BASE}/users/me/messages/${msg.id}?format=full`,
          { headers: { 'Authorization': `Bearer ${access_token}` } }
        );
        if (!msgResponse.ok) {
          console.error(`Failed to fetch message ${msg.id}`);
          return;
        }

        const fullMessage: GmailMessage = await msgResponse.json();
        const subject = getHeader(fullMessage, 'subject');
        const date    = getHeader(fullMessage, 'date');
        const from    = getHeader(fullMessage, 'from');
        const senderInfo = parseSenderInfo(from);
        const rawHtml = extractRawHtml(fullMessage);   // un-stripped, for link extraction
        const body    = extractEmailBody(fullMessage); // stripped plain text for AI
        const docLinks = extractDocumentLinks(rawHtml);
        const snippet = fullMessage.snippet || '';

        console.log(`Processing: from=${senderInfo.email} | subject="${subject}" | body_len=${body.length}`);

        // ── Thread reply detection ────────────────────────────────────────────
        // If this email belongs to a thread we already have a deal for, store it
        // as a reply on that deal. Also check if it introduces a NEW property
        // (e.g. "that one sold, here's another") — if so, create a new deal too.
        let preExtractedDeals: ExtractedDeal[] | null = null;
        const existingDealForThread = fullMessage.threadId ? threadIdToDeal.get(fullMessage.threadId) : null;
        if (existingDealForThread && existingDealForThread.gmail_message_id !== msg.id) {
          console.log(`Thread reply detected — deal ${existingDealForThread.id}, thread ${fullMessage.threadId}`);
          if (!dry_run) {
            const prevData = existingDealForThread.email_extracted_data || {};
            const prevMessages: any[] = Array.isArray(prevData.threadMessages) ? prevData.threadMessages : [];
            // Only append if this messageId isn't already stored
            if (!prevMessages.some((m: any) => m.messageId === msg.id)) {
              prevMessages.push({
                messageId: msg.id,
                direction: 'inbound',
                from: senderInfo.email,
                senderName: senderInfo.name,
                subject,
                body: body.slice(0, 4000),
                date: date || new Date().toISOString(),
              });
              await supabase.from('deals').update({
                email_extracted_data: { ...prevData, threadMessages: prevMessages },
              }).eq('id', existingDealForThread.id);
            }
          }

          // Check if this reply also contains a NEW property address
          const replyExtracts = await extractDealsWithAI(body, subject);
          const existingAddr = existingDealForThread.address_full || '';
          const newProperties = replyExtracts.filter(d => !addressesMatch(d.address, existingAddr));

          state.syncDetails.push({
            address: existingAddr,
            action: 'thread_reply',
            existingDealId: existingDealForThread.id,
            senderEmail: senderInfo.email,
            senderName: senderInfo.name,
            subject,
            messageId: msg.id,
            emailSnippet: snippet,
          });

          if (newProperties.length === 0) {
            // Pure thread reply — no new property to create
            await markEmailAsRead(access_token, msg.id);
            return;
          }

          // New property found in this reply — fall through to deal creation
          console.log(`Thread reply contains ${newProperties.length} new property deal(s) — processing`);
          preExtractedDeals = newProperties;
        }
        // ─────────────────────────────────────────────────────────────────────

        // Skip portal emails — mark them as read immediately
        if (isPortalEmail(senderInfo.email)) {
          state.portalEmails.push(`${senderInfo.email}: ${subject}`);
          state.dealsSkippedPortal++;
          state.syncDetails.push({ address: '', action: 'skipped_portal', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `Portal: ${senderInfo.email}`, messageId: msg.id, emailSnippet: snippet });
          await markEmailAsRead(access_token, msg.id);
          return;
        }

        // Extract deals (reuse results from thread-reply scan if available)
        let extractedDeals = preExtractedDeals ?? await extractDealsWithAI(body, subject);

        // Second-pass: if primary extraction found nothing, try a simpler focused prompt
        if (extractedDeals.length === 0 && preExtractedDeals === null) {
          console.log(`[secondPass] Primary extraction found 0 — trying second pass for: "${subject}"`);
          extractedDeals = await extractAddressesSecondPass(body, subject);
          if (extractedDeals.length > 0) {
            console.log(`[secondPass] Recovered ${extractedDeals.length} address(es) on second pass`);
          }
        }

        if (extractedDeals.length === 0) {
          console.log(`No addresses found in: "${subject}" — classifying email type`);

          // If this sender has previously sent us deals, never silently discard their email
          const isKnownWholesaler = state.existingAddresses.some(
            ea => ea.deal?.sender_email && ea.deal.sender_email.toLowerCase() === senderInfo.email.toLowerCase()
          );

          // Broad keyword check — includes common wholesaler patterns
          const DEAL_KEYWORDS = /\b(arv|flip|rehab|asking\s*price|purchase\s*price|wholesal|off.?market|assignment|emd|earnest|clear\s*title|fixer|beds?\s*\/\s*baths?|bed\s*\/\s*bath|\$\s*\d{2,3}[,k]|price\s*drop|price\s*reduced|available\s*(now|today)|new\s*(deal|listing|property|home)|deal\s*(alert|available)|sqft|sq\.?\s*ft|square\s*feet|vacant|occupied|single\s*family|multi[\s-]?family|investment\s*propert|rental|buy\s*and\s*hold|fix\s*(and|&|\+)\s*flip|cash\s*buyer|closing\s*cost|under\s*contract|property\s*available|below\s*market)\b/i;
          const looksLikeDeal = DEAL_KEYWORDS.test(body) || DEAL_KEYWORDS.test(subject);

          if (isKnownWholesaler || looksLikeDeal) {
            // Don't mark as read — leave for manual review or next sync attempt
            console.log(`[classify] Looks like deal email (knownWholesaler=${isKnownWholesaler}, keywords=${looksLikeDeal}) — keeping unread for review`);
            state.syncDetails.push({
              address: '',
              action: 'message',
              senderEmail: senderInfo.email,
              senderName: senderInfo.name,
              subject,
              messageId: msg.id,
              emailSnippet: snippet,
              isImportant: true,
              messagePreview: body.substring(0, 300),
              reason: isKnownWholesaler ? 'Known wholesaler — no address extracted' : 'Deal keywords found — no address extracted',
            });
            return;
          }

          const classification = await classifyNonDealEmail(body, subject, senderInfo.email);
          await markEmailAsRead(access_token, msg.id);

          if (classification.type === 'message') {
            console.log(`[classify] Personal message from ${senderInfo.email}, important=${classification.isImportant}`);
            state.syncDetails.push({
              address: '',
              action: 'message',
              senderEmail: senderInfo.email,
              senderName: senderInfo.name,
              subject,
              messageId: msg.id,
              emailSnippet: snippet,
              isImportant: classification.isImportant,
              messagePreview: classification.preview,
            });
          } else {
            console.log(`[classify] Newsletter/automated from ${senderInfo.email} — marked read, skipping`);
            state.syncDetails.push({
              address: '',
              action: 'skipped_newsletter',
              senderEmail: senderInfo.email,
              senderName: senderInfo.name,
              subject,
              messageId: msg.id,
              emailSnippet: snippet,
            });
          }
          return;
        }

        console.log(`Found ${extractedDeals.length} deal(s) in "${subject}"`);

        let dealsFromThisEmail = 0;

        let emailWasProcessed = false; // any address extracted → mark as read regardless of outcome

        for (const dealInfo of extractedDeals) {
          const address = dealInfo.address;
          const emailPurchasePrice = dealInfo.purchasePrice;
          console.log(`  Deal: "${address}" price=$${emailPurchasePrice} source=${dealInfo.source}`);

          // Any address found → email is considered "processed", mark as read after loop
          emailWasProcessed = true;

          // Skip over-budget
          if (emailPurchasePrice && emailPurchasePrice > MAX_DEAL_PRICE) {
            state.syncDetails.push({ address, action: 'skipped_over_budget', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `$${emailPurchasePrice.toLocaleString()} > $${MAX_DEAL_PRICE.toLocaleString()}`, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet, extractionSource: dealInfo.source });
            continue;
          }

          // Duplicate check — skip when force_rescan so we can see full extraction
          // Note: existingAddresses is shared — within-batch dedup works because workers
          // push to it immediately after creating a deal.
          const duplicateMatch = force_rescan ? null : state.existingAddresses.find(ea => addressesMatch(ea.address, address));
          if (duplicateMatch) {
            const newDealData = { emailPurchasePrice, purchasePrice: emailPurchasePrice };
            if (!dry_run && isBetterDeal(newDealData, duplicateMatch.deal)) {
              await supabase.from('deals').update({
                overrides: { ...(duplicateMatch.deal.overrides || {}), purchasePrice: emailPurchasePrice },
                sender_name: senderInfo.name,
                sender_email: senderInfo.email,
                email_snippet: snippet,
                email_subject: subject,
                email_date: date ? new Date(date).toISOString() : null,
              }).eq('id', duplicateMatch.id);
              state.syncDetails.push({ address, action: 'updated_existing', existingDealId: duplicateMatch.id, senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `Better price: $${emailPurchasePrice}`, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet, extractionSource: dealInfo.source });
              dealsFromThisEmail++;
            } else {
              state.skippedAddresses.push(address);
              state.dealsSkippedDuplicate++;
              state.syncDetails.push({ address, action: 'skipped_duplicate', existingDealId: duplicateMatch.id, senderEmail: senderInfo.email, senderName: senderInfo.name, subject, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet, extractionSource: dealInfo.source });
            }
            continue;
          }

          // Parse address parts
          const addressParts = address.split(',').map((p: string) => p.trim());
          const street   = addressParts[0] || address;
          const city     = addressParts[1] || '';
          const stateZip = addressParts[2] || '';
          const [state_code, zip] = stateZip.split(' ').filter(Boolean);

          // State filter
          if (target_state && state_code) {
            const normState = state_code.toUpperCase().trim();
            const normTarget = target_state.toUpperCase().trim();
            if (normState !== normTarget) {
              state.syncDetails.push({ address, action: 'skipped_wrong_state', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `State ${normState} != ${normTarget}`, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet, extractionSource: dealInfo.source });
              continue;
            }
          }

          // Merge image links (use rawHtml so <img> tags are still present)
          const regexImageLinks = extractImageLinks(rawHtml || body);
          const aiPhotoLinks: string[] = Array.isArray(dealInfo.extractedData?.photoLinks)
            ? dealInfo.extractedData.photoLinks : [];
          const allImageLinks = [...new Set([...aiPhotoLinks, ...regexImageLinks])].slice(0, 20);
          const enrichedExtractedData = {
            ...dealInfo.extractedData,
            imageLinks: allImageLinks,
            documentLinks: docLinks.length > 0 ? docLinks : undefined,
          };

          const dealData: Record<string, any> = {
            address_street: street,
            address_city: city,
            address_state: state_code || '',
            address_zip: zip || null,
            address_full: address,
            status: 'new',
            source: 'email',
            api_data: emailPurchasePrice ? { emailPurchasePrice } : null,
            overrides: emailPurchasePrice ? { arv: null, rent: null, rehabCost: null, purchasePrice: emailPurchasePrice } : undefined,
            email_subject: subject,
            email_date: date ? new Date(date).toISOString() : null,
            gmail_message_id: msg.id,
            gmail_thread_id: fullMessage.threadId || null,
            sender_name: senderInfo.name,
            sender_email: senderInfo.email,
            email_snippet: snippet,
            deal_type: dealInfo.dealType || null,
            email_extracted_data: Object.keys(enrichedExtractedData).length > 0 ? enrichedExtractedData : null,
          };

          if (dry_run || force_rescan) {
            // force_rescan: look up existing deal to return its ID for analysis
            const existingMatch = force_rescan
              ? state.existingAddresses.find(ea => addressesMatch(ea.address, address))
              : null;
            const existingId = existingMatch?.id && existingMatch.id !== 'dry-run' ? existingMatch.id : null;

            state.processedDeals.push({ ...dealData, dry_run: true, extractionSource: dealInfo.source });
            if (existingId) {
              state.syncDetails.push({ address, action: 'updated_existing', existingDealId: existingId, senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `[RESCAN] Source: ${dealInfo.source} price=${emailPurchasePrice}`, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet, extractionSource: dealInfo.source });
            } else {
              state.syncDetails.push({ address, action: 'created', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `[TEST] Source: ${dealInfo.source} price=${emailPurchasePrice}`, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet, extractionSource: dealInfo.source });
            }
            // Register address immediately so within-batch dedup works
            state.existingAddresses.push({ id: existingId || 'dry-run', address, deal: dealData });
            dealsFromThisEmail++;
            continue;
          }

          const { data: newDeal, error: insertError } = await supabase
            .from('deals').insert(dealData).select().single();

          if (insertError) {
            console.error('Error inserting deal:', insertError);
            state.errors.push(`Failed to save ${address}: ${insertError.message}`);
            state.syncDetails.push({ address, action: 'error', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: insertError.message, messageId: msg.id, emailSnippet: snippet });
            continue;
          }

          // Register immediately so subsequent parallel workers see this address
          state.existingAddresses.push({ id: newDeal.id, address: newDeal.address_full, deal: newDeal });
          state.processedDeals.push(newDeal);
          state.syncDetails.push({ address, action: 'created', dealId: newDeal.id, senderEmail: senderInfo.email, senderName: senderInfo.name, subject, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet, extractionSource: dealInfo.source });
          dealsFromThisEmail++;
          console.log(`  ✓ Created deal: ${address}`);
        }

        // Mark as read whenever any address was found (even if skipped/duplicate/over-budget).
        // Only leave unread when no address was found at all (no_address → retry).
        // force_rescan is also allowed to mark as read — it is used as "Reset & Rescan"
        // which is a real scan, not a preview. Only dry_run (true preview) skips marking.
        if (!dry_run && emailWasProcessed) {
          await markEmailAsRead(access_token, msg.id);
        }

      } catch (error) {
        console.error(`Error processing message ${msg.id}:`, error);
        sharedState.errors.push(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        sharedState.syncDetails.push({ address: '', action: 'error', reason: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    // Process messages in parallel batches of 4 to stay well within the 60s timeout
    const CONCURRENCY = 4;
    for (let i = 0; i < messages.length; i += CONCURRENCY) {
      const batch = messages.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map(msg => processOneMessage(msg, sharedState)));
    }

    // Extract from shared state for response building
    const { syncDetails, processedDeals, errors, skippedAddresses, portalEmails, dealsSkippedDuplicate, dealsSkippedPortal } = sharedState;

    // Mark older unread emails as read if requested
    let olderMarkedRead = 0;
    if (!dry_run && mark_all_read && since_days) {
      const allUnreadResp = await fetch(
        `${GMAIL_API_BASE}/users/me/messages?maxResults=500&q=${encodeURIComponent('is:unread')}`,
        { headers: { 'Authorization': `Bearer ${access_token}` } }
      );
      if (allUnreadResp.ok) {
        const allUnreadData = await allUnreadResp.json();
        const processedIds = new Set(messages.map((m: any) => m.id));
        const olderMessages = (allUnreadData.messages || []).filter((m: any) => !processedIds.has(m.id));
        for (const oldMsg of olderMessages) {
          await markEmailAsRead(access_token, oldMsg.id);
          olderMarkedRead++;
        }
      }
    }

    // Save sync history
    if (!dry_run) {
      await supabase.from('sync_history').insert({
        total_emails_scanned: messages.length,
        deals_created: processedDeals.length,
        deals_skipped_duplicate: dealsSkippedDuplicate,
        deals_skipped_portal: dealsSkippedPortal,
        skipped_addresses: skippedAddresses,
        portal_emails: portalEmails,
        errors,
        details: syncDetails,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedDeals.length,
        deals: processedDeals,
        skippedDuplicate: dealsSkippedDuplicate,
        skippedPortal: dealsSkippedPortal,
        totalScanned: messages.length,
        olderMarkedRead,
        syncDetails,
        errors: errors.length > 0 ? errors : undefined,
        dry_run,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in gmail-sync:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
