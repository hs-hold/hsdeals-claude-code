import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_DEAL_PRICE = 300000; // Skip deals above this price

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
  action: 'created' | 'skipped_duplicate' | 'skipped_portal' | 'skipped_over_budget' | 'skipped_wrong_state' | 'updated_existing' | 'no_address' | 'error';
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
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|tr|td|th|h[1-6]|section|article)[^>]*>/gi, '\n')
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi, ' $1 ') // keep href text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Extract email body from Gmail message — always returns clean plain text
function extractEmailBody(message: GmailMessage): string {
  let plainText = '';
  let htmlText  = '';

  if (message.payload?.body?.data) {
    const raw = decodeBase64Url(message.payload.body.data);
    plainText = raw.trim().startsWith('<') ? stripHtml(raw) : raw;
  } else if (message.payload?.parts) {
    const walk = (parts: any[]) => {
      for (const part of parts ?? []) {
        if (part.mimeType === 'text/plain' && part.body?.data && !plainText) {
          plainText = decodeBase64Url(part.body.data);
        }
        if (part.mimeType === 'text/html' && part.body?.data && !htmlText) {
          htmlText = stripHtml(decodeBase64Url(part.body.data));
        }
        if (part.parts) walk(part.parts);
      }
    };
    walk(message.payload.parts);
  }

  const body = plainText || htmlText || message.snippet || '';
  // Limit to 10000 chars
  return body.substring(0, 10000);
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

// Detect if a string looks like a US street address: "123 Main St, City, ST 12345"
function looksLikeAddress(s: string): boolean {
  return /^\d+\s+[a-zA-Z0-9\s]+(?:st|ave|dr|blvd|rd|ln|ct|pl|way|cir|pkwy|hwy|sw|nw|se|ne)\b.*,\s*[a-zA-Z\s]+,\s*[a-zA-Z]{2}\s+\d{5}/i.test(s.trim());
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
- Common formats: "463 Voyles Drive, Riverdale, GA 30274", "Property: 456 Elm Dr, Atlanta GA 30311"
- If the subject mentions a city/state and the body has street addresses, combine them

For each property, extract:
- address: Full US address with street, city, state, ZIP (required)
- purchasePrice: Asking price (NOT ARV, NOT rehab cost)
- arv: After Repair Value
- dealType: Fix & Flip / Wholesale / Buy & Hold / BRRRR / Subject To / Seller Financing / Multifamily / Other / null
- bedrooms, bathrooms, sqft, units, yearBuilt, lotSize
- rehabCost, rent, capRate, cashFlow, downPayment
- existingLoanBalance, monthlyPITI
- propertyType: single_family / multi_family / condo / townhouse / duplex / triplex / fourplex / commercial / land / other
- condition, occupancy
- financingNotes, dealNotes
- propertyDescription: 2-3 paragraph organized summary of all details (do not invent data)
- photoLinks: Array of Google Drive / Dropbox / photo URLs found in email (empty array if none)

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
    console.log('[extractDeals] Calling Claude Haiku...');
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20251001',
        max_tokens: 4096,
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
        return {
          address: address.trim(),
          purchasePrice: purchasePrice ? Number(purchasePrice) : null,
          dealType: dealType || null,
          extractedData: rest,
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

// Mark email as read in Gmail
async function markEmailAsRead(accessToken: string, messageId: string): Promise<void> {
  try {
    await fetch(`${GMAIL_API_BASE}/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });
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
      max_results = 50,
      since_days,
      mark_all_read = false,
      include_read = false,
      target_state,
      mark_old_only = false,
      mark_unread_recent = false,  // NEW: mark recent emails as unread for re-scanning
      dry_run = false,             // NEW: extract but don't save to DB
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

    // ── Mark recent INBOX emails as UNREAD so they can be re-scanned ──────
    if (mark_unread_recent) {
      const days = since_days ?? 7;
      // Only inbox, both read and unread, from the last N days
      const query = encodeURIComponent(`in:inbox newer_than:${days}d`);
      let allMessages: any[] = [];
      let pageToken: string | undefined;

      // Paginate through all results
      do {
        const url = `${GMAIL_API_BASE}/users/me/messages?maxResults=500&q=${query}${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const listResp = await fetch(url, { headers: { 'Authorization': `Bearer ${access_token}` } });
        if (!listResp.ok) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to fetch recent emails' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const listData = await listResp.json();
        allMessages = allMessages.concat(listData.messages || []);
        pageToken = listData.nextPageToken;
      } while (pageToken);

      console.log(`[mark_unread_recent] Marking ${allMessages.length} inbox emails as unread`);
      for (const msg of allMessages) await markEmailAsUnread(access_token, msg.id);
      return new Response(
        JSON.stringify({ success: true, marked: allMessages.length, message: `Marked ${allMessages.length} inbox emails as unread` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching emails... (since_days: ${since_days ?? 'all'}, include_read: ${include_read}, dry_run: ${dry_run})`);

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
    const messages = listData.messages || [];
    console.log(`Found ${messages.length} emails to process`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existingDeals } = await supabase
      .from('deals')
      .select('id, address_full, gmail_message_id, overrides, api_data');

    const existingAddresses = existingDeals?.map(d => ({
      id: d.id, address: d.address_full, deal: d,
    })) || [];

    const syncDetails: SyncDetails[] = [];
    const processedDeals: any[] = [];
    const errors: string[] = [];
    const skippedAddresses: string[] = [];
    const portalEmails: string[] = [];
    let dealsSkippedDuplicate = 0;
    let dealsSkippedPortal = 0;

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, deals: [], message: 'No unread emails found', syncDetails: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    for (const msg of messages) {
      try {
        // Skip already-processed message IDs (unless dry_run or include_read)
        if (!dry_run && !include_read) {
          const alreadyProcessed = existingDeals?.some(d => d.gmail_message_id === msg.id);
          if (alreadyProcessed) {
            console.log(`Email ${msg.id} already processed, skipping`);
            await markEmailAsRead(access_token, msg.id);
            continue;
          }
        }

        // Fetch full message
        const msgResponse = await fetch(
          `${GMAIL_API_BASE}/users/me/messages/${msg.id}?format=full`,
          { headers: { 'Authorization': `Bearer ${access_token}` } }
        );
        if (!msgResponse.ok) {
          console.error(`Failed to fetch message ${msg.id}`);
          continue;
        }

        const fullMessage: GmailMessage = await msgResponse.json();
        const subject = getHeader(fullMessage, 'subject');
        const date    = getHeader(fullMessage, 'date');
        const from    = getHeader(fullMessage, 'from');
        const senderInfo = parseSenderInfo(from);
        const body    = extractEmailBody(fullMessage);
        const snippet = fullMessage.snippet || '';

        console.log(`Processing: from=${senderInfo.email} | subject="${subject}" | body_len=${body.length}`);

        // Skip portal emails — mark them as read immediately
        if (isPortalEmail(senderInfo.email)) {
          portalEmails.push(`${senderInfo.email}: ${subject}`);
          dealsSkippedPortal++;
          syncDetails.push({ address: '', action: 'skipped_portal', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `Portal: ${senderInfo.email}`, messageId: msg.id, emailSnippet: snippet });
          await markEmailAsRead(access_token, msg.id);
          continue;
        }

        // Extract deals (AI + regex fallback)
        const extractedDeals = await extractDealsWithAI(body, subject);

        if (extractedDeals.length === 0) {
          console.log(`No addresses found in: "${subject}"`);
          syncDetails.push({ address: '', action: 'no_address', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: 'No property address found (AI + regex both returned nothing)', messageId: msg.id, emailSnippet: snippet });
          // ── KEY FIX: Do NOT mark as read — leave unread so it can be retried ──
          continue;
        }

        console.log(`Found ${extractedDeals.length} deal(s) in "${subject}"`);

        let dealsFromThisEmail = 0;

        for (const dealInfo of extractedDeals) {
          const address = dealInfo.address;
          const emailPurchasePrice = dealInfo.purchasePrice;
          console.log(`  Deal: "${address}" price=$${emailPurchasePrice} source=${dealInfo.source}`);

          // Skip over-budget
          if (emailPurchasePrice && emailPurchasePrice > MAX_DEAL_PRICE) {
            syncDetails.push({ address, action: 'skipped_over_budget', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `$${emailPurchasePrice.toLocaleString()} > $${MAX_DEAL_PRICE.toLocaleString()}`, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet });
            continue;
          }

          // Duplicate check
          const duplicateMatch = existingAddresses.find(ea => addressesMatch(ea.address, address));
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
              syncDetails.push({ address, action: 'updated_existing', existingDealId: duplicateMatch.id, senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `Better price: $${emailPurchasePrice}`, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet });
              dealsFromThisEmail++;
            } else {
              skippedAddresses.push(address);
              dealsSkippedDuplicate++;
              syncDetails.push({ address, action: 'skipped_duplicate', existingDealId: duplicateMatch.id, senderEmail: senderInfo.email, senderName: senderInfo.name, subject, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet });
            }
            continue;
          }

          // Parse address parts
          const addressParts = address.split(',').map((p: string) => p.trim());
          const street   = addressParts[0] || address;
          const city     = addressParts[1] || '';
          const stateZip = addressParts[2] || '';
          const [state, zip] = stateZip.split(' ').filter(Boolean);

          // State filter
          if (target_state && state) {
            const normState = state.toUpperCase().trim();
            const normTarget = target_state.toUpperCase().trim();
            if (normState !== normTarget) {
              syncDetails.push({ address, action: 'skipped_wrong_state', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `State ${normState} != ${normTarget}`, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet });
              continue;
            }
          }

          // Merge image links
          const regexImageLinks = extractImageLinks(body);
          const aiPhotoLinks: string[] = Array.isArray(dealInfo.extractedData?.photoLinks)
            ? dealInfo.extractedData.photoLinks : [];
          const allImageLinks = [...new Set([...aiPhotoLinks, ...regexImageLinks])].slice(0, 20);
          const enrichedExtractedData = { ...dealInfo.extractedData, imageLinks: allImageLinks };

          const dealData: Record<string, any> = {
            address_street: street,
            address_city: city,
            address_state: state || '',
            address_zip: zip || null,
            address_full: address,
            status: 'new',
            source: 'email',
            api_data: emailPurchasePrice ? { emailPurchasePrice } : null,
            overrides: emailPurchasePrice ? { arv: null, rent: null, rehabCost: null, purchasePrice: emailPurchasePrice } : undefined,
            email_subject: subject,
            email_date: date ? new Date(date).toISOString() : null,
            gmail_message_id: msg.id,
            sender_name: senderInfo.name,
            sender_email: senderInfo.email,
            email_snippet: snippet,
            deal_type: dealInfo.dealType || null,
            email_extracted_data: Object.keys(enrichedExtractedData).length > 0 ? enrichedExtractedData : null,
          };

          if (dry_run) {
            // Don't save — just report
            processedDeals.push({ ...dealData, dry_run: true, extractionSource: dealInfo.source });
            syncDetails.push({ address, action: 'created', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: `[DRY RUN] Would create. Source: ${dealInfo.source}`, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet });
            existingAddresses.push({ id: 'dry-run', address, deal: dealData });
            dealsFromThisEmail++;
            continue;
          }

          const { data: newDeal, error: insertError } = await supabase
            .from('deals').insert(dealData).select().single();

          if (insertError) {
            console.error('Error inserting deal:', insertError);
            errors.push(`Failed to save ${address}: ${insertError.message}`);
            syncDetails.push({ address, action: 'error', senderEmail: senderInfo.email, senderName: senderInfo.name, subject, reason: insertError.message, messageId: msg.id, emailSnippet: snippet });
            continue;
          }

          existingAddresses.push({ id: newDeal.id, address: newDeal.address_full, deal: newDeal });
          processedDeals.push(newDeal);
          syncDetails.push({ address, action: 'created', dealId: newDeal.id, senderEmail: senderInfo.email, senderName: senderInfo.name, subject, messageId: msg.id, purchasePrice: emailPurchasePrice, dealType: dealInfo.dealType, extractedData: dealInfo.extractedData, emailSnippet: snippet });
          dealsFromThisEmail++;
          console.log(`  ✓ Created deal: ${address}`);
        }

        // ── Mark as read only if we actually processed deals from this email ──
        if (!dry_run && dealsFromThisEmail > 0) {
          await markEmailAsRead(access_token, msg.id);
        }
        // If no deals found from a non-portal email → leave unread for retry

      } catch (error) {
        console.error(`Error processing message ${msg.id}:`, error);
        errors.push(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        syncDetails.push({ address: '', action: 'error', reason: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

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
