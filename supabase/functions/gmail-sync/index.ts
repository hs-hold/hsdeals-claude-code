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
];

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ body?: { data?: string }; mimeType?: string }>;
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

// Extract email body from Gmail message
function extractEmailBody(message: GmailMessage): string {
  let body = '';
  
  if (message.payload?.body?.data) {
    body = decodeBase64Url(message.payload.body.data);
  } else if (message.payload?.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body = decodeBase64Url(part.body.data);
        break;
      }
      if (part.mimeType === 'text/html' && part.body?.data && !body) {
        body = decodeBase64Url(part.body.data);
      }
    }
  }
  
  return body || message.snippet || '';
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
  // Format can be: "Name <email@domain.com>" or just "email@domain.com"
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

// Extract image/photo links from email body (direct image URLs + gallery links)
function extractImageLinks(emailBody: string): string[] {
  const found = new Set<string>();

  // img src attributes
  const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgSrcRegex.exec(emailBody)) !== null) {
    const url = m[1];
    if (url.startsWith('http') && !/tracking|pixel|beacon|spacer|logo|icon/i.test(url)) {
      found.add(url);
    }
  }

  // Direct image file URLs
  const directImgRegex = /https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp|gif)/gi;
  while ((m = directImgRegex.exec(emailBody)) !== null) {
    found.add(m[0].split('"')[0].split("'")[0]);
  }

  // Gallery / cloud storage links (Google Drive, Dropbox, OneDrive, iCloud, etc.)
  const galleryRegex = /https?:\/\/(?:drive\.google\.com|photos\.google\.com|dropbox\.com|1drv\.ms|onedrive\.live\.com|icloud\.com|photos\.app\.goo\.gl|album\.link|flickr\.com|imgur\.com|cloudinary\.com)[^\s"'<>]*/gi;
  while ((m = galleryRegex.exec(emailBody)) !== null) {
    found.add(m[0].split('"')[0].split("'")[0]);
  }

  return [...found].slice(0, 20); // cap at 20
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
  
  // Exact match after normalization
  if (norm1 === norm2) return true;
  
  // Check if one contains the other (for partial matches)
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  
  // Extract street number and name for comparison
  const extractStreetParts = (addr: string) => {
    const parts = addr.split(' ');
    const number = parts.find(p => /^\d+$/.test(p));
    const words = parts.filter(p => !/^\d+$/.test(p) && p.length > 2);
    return { number, words };
  };
  
  const parts1 = extractStreetParts(norm1);
  const parts2 = extractStreetParts(norm2);
  
  // If street numbers match and at least 2 words match
  if (parts1.number && parts1.number === parts2.number) {
    const matchingWords = parts1.words.filter(w => parts2.words.includes(w));
    if (matchingWords.length >= 2) return true;
  }
  
  return false;
}

interface ExtractedDeal {
  address: string;
  purchasePrice: number | null;
  dealType: string | null;
  extractedData: Record<string, any>;
}

// Use Anthropic claude-haiku to extract ALL property addresses and comprehensive deal info from email content
async function extractDealsWithAI(emailContent: string, subject: string): Promise<ExtractedDeal[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured');
    return [];
  }

  const prompt = `You are a real estate deal analyzer. Extract ALL properties and their details from this email.

Email Subject: ${subject}

Email Content:
${emailContent.substring(0, 6000)}

For EACH property found, extract as much of the following as possible:

1. **address** (required): Full US property address with street, city, state, ZIP
2. **purchasePrice**: The asking/purchase price (NOT rehab, NOT ARV)
3. **dealType**: Classify the deal. Choose the MOST specific type that applies:
   - "Fix & Flip", "Wholetail", "Wholesale", "Buy & Hold", "BRRRR", "Co-Living",
   - "Multifamily", "Mixed Use", "Triple Net", "Subject To", "Seller Financing",
   - "Wrap Mortgage", "Assumable Mortgage", "Ground Up Development", "Tax Lien / Tax Deed",
   - "Other" (put exact term from email), or null if unknown
4. **units**: Number of units (for multifamily)
5. **bedrooms**: Number of bedrooms (per unit if multi)
6. **bathrooms**: Number of bathrooms (per unit if multi)
7. **sqft**: Square footage
8. **arv**: After Repair Value if mentioned
9. **rehabCost**: Estimated rehab/renovation cost
10. **rent**: Monthly rent or rental estimate (total or per unit)
11. **downPayment**: Down payment amount or required cash
12. **existingLoanBalance**: Existing mortgage/loan balance (for SubTo, Assumable)
13. **monthlyPITI**: Monthly PITI payment
14. **monthlyExpenses**: Other monthly expenses
15. **capRate**: Cap rate if mentioned
16. **cashFlow**: Monthly cash flow if mentioned
17. **lotSize**: Lot size
18. **yearBuilt**: Year built
19. **propertyType**: single_family, multi_family, condo, townhouse, duplex, triplex, fourplex, commercial, land, other
20. **condition**: Property condition notes
21. **occupancy**: occupied, vacant, tenant-occupied, owner-occupied
22. **financingNotes**: Any financing details, terms, interest rates mentioned
23. **dealNotes**: Any other important deal details from the email
24. **propertyDescription**: A clean, well-organized 2-3 paragraph description of the property. Include ALL details mentioned in the email (location, specs, condition, financials, opportunity). Do NOT invent or change any data — only organize and present what is in the email.
25. **photoLinks**: Array of any photo gallery links, Google Drive/Dropbox/OneDrive links, or direct photo URLs found in the email body. Empty array if none.

Return ONLY a JSON object:
{
  "deals": [
    {
      "address": "123 Main St, City, State ZIP",
      "purchasePrice": 150000,
      "dealType": "Subject To",
      "units": 4,
      "bedrooms": 2,
      "bathrooms": 2,
      "sqft": 1350,
      "arv": null,
      "rehabCost": null,
      "rent": 2200,
      "downPayment": 75000,
      "existingLoanBalance": 580000,
      "monthlyPITI": 4564,
      "monthlyExpenses": null,
      "capRate": null,
      "cashFlow": null,
      "lotSize": null,
      "yearBuilt": null,
      "propertyType": "multi_family",
      "condition": null,
      "occupancy": null,
      "financingNotes": "Existing loan at $580k, $75k down required",
      "dealNotes": "4 units, each 2bd/2ba ~1350 SF, rent potential $2200/unit",
      "propertyDescription": "This 4-unit multifamily property is located at 123 Main St...",
      "photoLinks": ["https://drive.google.com/..."]
    }
  ]
}

Return { "deals": [] } if no valid US property addresses are found.`;

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
        max_tokens: 2500,
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return [];
    }

    const data = await response.json();
    const responseText = data.content?.[0]?.text?.trim();

    console.log('AI response for deals extraction:', responseText);

    try {
      let jsonStr = responseText;
      if (jsonStr.includes('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }
      const parsed = JSON.parse(jsonStr);
      const deals = Array.isArray(parsed) ? parsed : (parsed.deals || []);

      return deals
        .filter((d: any) => d.address && typeof d.address === 'string' && d.address.length > 5)
        .map((d: any) => {
          const { address, purchasePrice, dealType, ...rest } = d;
          return {
            address: address.trim(),
            purchasePrice: purchasePrice ? Number(purchasePrice) : null,
            dealType: dealType || null,
            extractedData: rest,
          };
        });
    } catch (e) {
      console.error('Error parsing AI response:', e);
      return [];
    }
  } catch (error) {
    console.error('Error extracting deals with AI:', error);
    return [];
  }
}

// Mark email as read in Gmail
async function markEmailAsRead(accessToken: string, messageId: string): Promise<void> {
  try {
    await fetch(
      `${GMAIL_API_BASE}/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          removeLabelIds: ['UNREAD'],
        }),
      }
    );
    console.log(`Marked email ${messageId} as read`);
  } catch (error) {
    console.error(`Failed to mark email ${messageId} as read:`, error);
  }
}

// Compare deals to determine which is "better" (has more/better data)
function isBetterDeal(newDealData: any, existingDeal: any): boolean {
  // If new deal has purchase price from email and existing doesn't, new is better
  const newHasPrice = newDealData.emailPurchasePrice || newDealData.purchasePrice;
  const existingHasPrice = existingDeal.overrides?.purchasePrice || existingDeal.api_data?.purchasePrice;
  
  if (newHasPrice && !existingHasPrice) return true;
  
  // If new deal has lower purchase price, it's better
  if (newHasPrice && existingHasPrice && newHasPrice < existingHasPrice) return true;
  
  // Otherwise, keep existing
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { access_token, max_results = 50, since_days, mark_all_read = false, include_read = false, target_state } = await req.json();
    
    if (!access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'No access token provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching emails from Gmail... (since_days: ${since_days ?? 'all'}, mark_all_read: ${mark_all_read}, include_read: ${include_read})`);

    // Build Gmail search query
    let query = include_read ? '' : 'is:unread';
    if (since_days) {
      query += `${query ? ' ' : ''}newer_than:${since_days}d`;
    }
    const encodedQuery = encodeURIComponent(query.trim());

    // Fetch recent unread emails
    const listResponse = await fetch(
      `${GMAIL_API_BASE}/users/me/messages?maxResults=${max_results}&q=${encodedQuery}`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
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
    console.log(`Found ${messages.length} unread emails`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all existing deals for duplicate detection
    const { data: existingDeals } = await supabase
      .from('deals')
      .select('id, address_full, gmail_message_id, overrides, api_data');
    
    const existingAddresses = existingDeals?.map(d => ({ 
      id: d.id, 
      address: d.address_full,
      deal: d,
    })) || [];

    const syncDetails: SyncDetails[] = [];
    const processedDeals: any[] = [];
    const errors: string[] = [];
    const skippedAddresses: string[] = [];
    const portalEmails: string[] = [];
    let dealsSkippedDuplicate = 0;
    let dealsSkippedPortal = 0;

    // If no emails found, return early
    if (messages.length === 0) {
      // Save sync history
      await supabase.from('sync_history').insert({
        total_emails_scanned: 0,
        deals_created: 0,
        deals_skipped_duplicate: 0,
        deals_skipped_portal: 0,
        skipped_addresses: [],
        portal_emails: [],
        errors: [],
        details: [],
      });

      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          deals: [],
          message: 'No unread emails found',
          syncDetails: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process each email
    for (const msg of messages) {
      try {
        // Check if already processed by gmail_message_id
        const alreadyProcessed = existingDeals?.some(d => d.gmail_message_id === msg.id);
        if (alreadyProcessed) {
          console.log(`Email ${msg.id} already processed, skipping`);
          await markEmailAsRead(access_token, msg.id);
          continue;
        }

        // Fetch full message
        const msgResponse = await fetch(
          `${GMAIL_API_BASE}/users/me/messages/${msg.id}?format=full`,
          {
            headers: {
              'Authorization': `Bearer ${access_token}`,
            },
          }
        );

        if (!msgResponse.ok) {
          console.error(`Failed to fetch message ${msg.id}`);
          continue;
        }

        const fullMessage: GmailMessage = await msgResponse.json();
        const subject = getHeader(fullMessage, 'subject');
        const date = getHeader(fullMessage, 'date');
        const fromHeader = getHeader(fullMessage, 'from');
        const senderInfo = parseSenderInfo(fromHeader);
        const body = extractEmailBody(fullMessage);
        const snippet = fullMessage.snippet || '';

        console.log(`Processing email from: ${senderInfo.email}, subject: ${subject}`);

        // Check if from portal
        if (isPortalEmail(senderInfo.email)) {
          console.log(`Skipping portal email from: ${senderInfo.email}`);
          portalEmails.push(`${senderInfo.email}: ${subject}`);
          dealsSkippedPortal++;
          syncDetails.push({
            address: '',
            action: 'skipped_portal',
            senderEmail: senderInfo.email,
            senderName: senderInfo.name,
            subject,
            reason: `Portal email from ${senderInfo.email}`,
          });
          await markEmailAsRead(access_token, msg.id);
          continue;
        }

        // Extract ALL addresses and purchase prices using AI (supports multiple properties per email)
        const extractedDeals = await extractDealsWithAI(body, subject);
        
        if (extractedDeals.length === 0) {
          console.log(`No addresses found in email: ${subject}`);
          syncDetails.push({
            address: '',
            action: 'no_address',
            senderEmail: senderInfo.email,
            senderName: senderInfo.name,
            subject,
            reason: 'No property address found in email',
          });
          await markEmailAsRead(access_token, msg.id);
          continue;
        }

        console.log(`Found ${extractedDeals.length} deal(s) in email: ${subject}`);

        // Process each deal from this email
        for (const dealInfo of extractedDeals) {
          const address = dealInfo.address;
          const emailPurchasePrice = dealInfo.purchasePrice;
          console.log(`Processing address: ${address}, price: ${emailPurchasePrice}`);

          // Skip deals over budget
          if (emailPurchasePrice && emailPurchasePrice > MAX_DEAL_PRICE) {
            console.log(`Skipping over-budget deal: ${address} at $${emailPurchasePrice}`);
            syncDetails.push({
              address,
              action: 'skipped_over_budget',
              senderEmail: senderInfo.email,
              senderName: senderInfo.name,
              subject,
              reason: `Price $${emailPurchasePrice.toLocaleString()} exceeds $${MAX_DEAL_PRICE.toLocaleString()} limit`,
            });
            continue;
          }

          // Check for duplicate address (fuzzy matching)
          const duplicateMatch = existingAddresses.find(ea => addressesMatch(ea.address, address));
          
          if (duplicateMatch) {
            console.log(`Duplicate address found: ${address} matches existing ${duplicateMatch.address}`);
            
            // Check if this is a better deal
            const newDealData = { emailPurchasePrice, purchasePrice: emailPurchasePrice };
            if (isBetterDeal(newDealData, duplicateMatch.deal)) {
              console.log(`New deal is better, updating existing deal ${duplicateMatch.id}`);
              
              // Update existing deal with better data
              const { error: updateError } = await supabase
                .from('deals')
                .update({
                  overrides: {
                    ...(duplicateMatch.deal.overrides || {}),
                    purchasePrice: emailPurchasePrice,
                  },
                  is_off_market: true,
                  sender_name: senderInfo.name,
                  sender_email: senderInfo.email,
                  email_snippet: snippet,
                  email_subject: subject,
                  email_date: date ? new Date(date).toISOString() : null,
                })
                .eq('id', duplicateMatch.id);

              if (updateError) {
                console.error('Error updating deal:', updateError);
              } else {
                syncDetails.push({
                  address,
                  action: 'updated_existing',
                  existingDealId: duplicateMatch.id,
                  senderEmail: senderInfo.email,
                  senderName: senderInfo.name,
                  subject,
                  reason: `Updated with better price: $${emailPurchasePrice}`,
                });
              }
            } else {
              skippedAddresses.push(address);
              dealsSkippedDuplicate++;
              syncDetails.push({
                address,
                action: 'skipped_duplicate',
                existingDealId: duplicateMatch.id,
                senderEmail: senderInfo.email,
                senderName: senderInfo.name,
                subject,
                reason: `Duplicate of existing deal: ${duplicateMatch.address}`,
              });
            }
            continue; // Continue to next deal in this email
          }

          // Parse address parts
          const addressParts = address.split(',').map((p: string) => p.trim());
          const street = addressParts[0] || address;
          const city = addressParts[1] || '';
          const stateZip = addressParts[2] || '';
          const [state, zip] = stateZip.split(' ').filter(Boolean);

          // Check if deal matches target state
          if (target_state && state) {
            const normalizedState = state.toUpperCase().trim();
            const normalizedTarget = target_state.toUpperCase().trim();
            if (normalizedState !== normalizedTarget) {
              console.log(`Skipping deal in wrong state: ${address} (${normalizedState} != ${normalizedTarget})`);
              syncDetails.push({
                address,
                action: 'skipped_wrong_state',
                senderEmail: senderInfo.email,
                senderName: senderInfo.name,
                subject,
                reason: `State ${normalizedState} doesn't match target ${normalizedTarget}`,
              });
              continue;
            }
          }

          // Merge regex-extracted image links with AI-found photo links
          const regexImageLinks = extractImageLinks(body);
          const aiPhotoLinks: string[] = Array.isArray(dealInfo.extractedData?.photoLinks)
            ? dealInfo.extractedData.photoLinks
            : [];
          const allImageLinks = [...new Set([...aiPhotoLinks, ...regexImageLinks])].slice(0, 20);
          const enrichedExtractedData = {
            ...dealInfo.extractedData,
            imageLinks: allImageLinks,
          };

          // Prepare deal data
          const dealData: Record<string, any> = {
            address_street: street,
            address_city: city,
            address_state: state || '',
            address_zip: zip || null,
            address_full: address,
            status: 'new',
            source: 'email',
            is_off_market: true,
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

          // Insert into database
          const { data: newDeal, error: insertError } = await supabase
            .from('deals')
            .insert(dealData)
            .select()
            .single();

          if (insertError) {
            console.error('Error inserting deal:', insertError);
            errors.push(`Failed to save deal for ${address}: ${insertError.message}`);
            syncDetails.push({
              address,
              action: 'error',
              senderEmail: senderInfo.email,
              senderName: senderInfo.name,
              subject,
              reason: insertError.message,
            });
            continue;
          }

          // Add to existing addresses for subsequent duplicate detection in this batch
          existingAddresses.push({ id: newDeal.id, address: newDeal.address_full, deal: newDeal });

          processedDeals.push(newDeal);
          syncDetails.push({
            address,
            action: 'created',
            dealId: newDeal.id,
            senderEmail: senderInfo.email,
            senderName: senderInfo.name,
            subject,
          });
          console.log(`Successfully created deal: ${address}`);
        }

        // Mark email as read after processing all deals from it
        await markEmailAsRead(access_token, msg.id);

      } catch (error) {
        console.error(`Error processing message ${msg.id}:`, error);
        errors.push(`Error processing email: ${error instanceof Error ? error.message : 'Unknown error'}`);
        syncDetails.push({
          address: '',
          action: 'error',
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Mark all older unread emails as read if requested
    let olderMarkedRead = 0;
    if (mark_all_read && since_days) {
      try {
        // Fetch ALL unread emails (not just recent ones)
        const allUnreadResponse = await fetch(
          `${GMAIL_API_BASE}/users/me/messages?maxResults=500&q=${encodeURIComponent('is:unread')}`,
          { headers: { 'Authorization': `Bearer ${access_token}` } }
        );
        if (allUnreadResponse.ok) {
          const allUnreadData = await allUnreadResponse.json();
          const allUnread = allUnreadData.messages || [];
          // Filter out messages we already processed in this batch
          const processedIds = new Set(messages.map((m: any) => m.id));
          const olderMessages = allUnread.filter((m: any) => !processedIds.has(m.id));
          
          for (const oldMsg of olderMessages) {
            await markEmailAsRead(access_token, oldMsg.id);
            olderMarkedRead++;
          }
          console.log(`Marked ${olderMarkedRead} older emails as read`);
        }
      } catch (e) {
        console.error('Error marking older emails as read:', e);
      }
    }

    // Save sync history
    const { data: syncHistoryRecord } = await supabase
      .from('sync_history')
      .insert({
        total_emails_scanned: messages.length,
        deals_created: processedDeals.length,
        deals_skipped_duplicate: dealsSkippedDuplicate,
        deals_skipped_portal: dealsSkippedPortal,
        skipped_addresses: skippedAddresses,
        portal_emails: portalEmails,
        errors,
        details: syncDetails,
      })
      .select()
      .single();

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
        syncHistoryId: syncHistoryRecord?.id,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in gmail-sync function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
