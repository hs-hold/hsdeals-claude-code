// supabase/functions/gmail-sync/extract.ts

import type { NormalizedEmail, ExtractionResult, ExtractionAudit } from './types.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const EXTRACTION_PROMPT_TEMPLATE = `You are a real estate deal data extractor for off-market wholesale emails.

Rules:
- Extract ONLY values explicitly stated. Never infer or guess.
- Return null for any field not explicitly present.
- "email_type" must be one of: "deal", "non_deal", "follow_up", "unknown".
- Every non-null field MUST include evidence: a direct quote from the email, max 80 chars.
- Numbers must be plain integers or decimals with no $ signs and no commas.
- ZIP codes and phone numbers must be strings.
- If multiple conflicting values exist for the same field and there is no clear winner, return null for that field.
- Multiple properties must be returned as multiple objects in the "properties" array.
- Return exactly one JSON object.
- Do not wrap the JSON in markdown.
- Do not include any text outside the JSON.
- Every property object must include ALL keys shown below, even when the value is null.
- "source" must be one of: "subject", "body", or "table", based on where the evidence came from.
- Treat the subject line and body as EQUALLY valid sources of evidence. Address, city, ZIP, property type, or price stated only in the subject MUST still be extracted.

Common patterns to recognize (these are explicit, not inferences):
- Money shorthand: "$70k" or "70K" = 70000; "$1.2M" = 1200000; "300k ARV" = arv 300000.
- Bed/bath shorthand: "3/2" = 3 beds / 2 baths; "3BR/2BA" = same; "3 BR 2 BA" = same.
- Property type abbreviations: SFH or SFR = Single Family; MFH or MF = Multi-Family; THP = Townhouse.
- Bracketed labels common in wholesale templates: "[PRICE: 70,000]", "BEDROOMS: [2]", "SQUARE FOOTAGE: [900]" — extract the value inside the brackets.
- "Rehab", "repair budget", "work needed $X" → repair_estimate.
- "Tenant occupied", "currently rented", "vacant", "owner occupied" → occupancy.
- Phone formats: (404) 631-7756, 404-631-7756, 404.631.7756 — keep as a string in any consistent format.

Always attempt to extract these core fields when present anywhere in the email: address, city, state, zip, asking_price, beds, baths, sqft, year_built, contact_name, contact_phone.

Email:
{{combined_context}}

Return exactly this structure:
{
  "email_type": "deal",
  "properties": [
    {
      "address_full":    { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "street":          { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "city":            { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "state":           { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "zip":             { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "asking_price":    { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "arv":             { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "rent":            { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "repair_estimate": { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "beds":            { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "baths":           { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "sqft":            { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "lot_size":        { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "year_built":      { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "property_type":   { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "occupancy":       { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "condition":       { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "access_notes":    { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "contact_name":    { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "contact_phone":   { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "contact_email":   { "value": null, "evidence": null, "confidence": "low", "source": "body" },
      "deal_notes":      { "value": null, "evidence": null, "confidence": "low", "source": "body" }
    }
  ]
}

If no real estate properties are found, return:
{ "email_type": "non_deal", "properties": [] }`;

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}

export async function extractDealsFromEmail(
  email: NormalizedEmail,
  apiKey: string,
): Promise<{ result: ExtractionResult; audit: ExtractionAudit }> {
  const prompt = EXTRACTION_PROMPT_TEMPLATE.replace('{{combined_context}}', email.combinedContext);

  const audit: ExtractionAudit = {
    messageId: email.messageId,
    rawResponse: '',
    promptTokensEstimate: estimateTokens(prompt),
    stage: 'extract',
    createdAt: new Date().toISOString(),
  };

  const fallbackResult: ExtractionResult = {
    email_type: 'unknown',
    properties: [],
  };

  if (!apiKey) {
    console.error('[extract] ANTHROPIC_API_KEY not set');
    audit.rawResponse = 'ERROR: no api key';
    return { result: fallbackResult, audit };
  }

  try {
    console.log(`[extract] Calling claude-sonnet-4-6 for message ${email.messageId}`);

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
      console.error(`[extract] Anthropic API error: ${response.status} ${errText}`);
      audit.rawResponse = `ERROR: ${response.status} ${errText.substring(0, 500)}`;
      return { result: fallbackResult, audit };
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text?.trim() || '';
    audit.rawResponse = rawText;

    console.log(`[extract] Raw response (first 400 chars): ${rawText.substring(0, 400)}`);

    // Strip markdown fences if present
    let jsonStr = rawText;
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    // Extract JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[extract] No JSON found in response');
      return { result: { email_type: 'unknown', properties: [] }, audit };
    }

    const parsed = JSON.parse(jsonMatch[0]) as ExtractionResult;

    // Validate top-level shape
    if (!parsed.email_type || !Array.isArray(parsed.properties)) {
      console.error('[extract] Unexpected response shape');
      return { result: fallbackResult, audit };
    }

    // Ensure all property objects have the required fields with sane defaults
    const REQUIRED_FIELDS = [
      'address_full', 'street', 'city', 'state', 'zip',
      'asking_price', 'arv', 'rent', 'repair_estimate',
      'beds', 'baths', 'sqft', 'lot_size', 'year_built',
      'property_type', 'occupancy', 'condition', 'access_notes',
      'contact_name', 'contact_phone', 'contact_email', 'deal_notes',
    ];

    for (const prop of parsed.properties) {
      for (const field of REQUIRED_FIELDS) {
        if (!(prop as any)[field]) {
          (prop as any)[field] = { value: null, evidence: null, confidence: 'low', source: 'body' };
        }
      }
    }

    console.log(`[extract] email_type=${parsed.email_type} properties=${parsed.properties.length}`);
    return { result: parsed, audit };

  } catch (err) {
    console.error('[extract] Error:', err);
    audit.rawResponse = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    return { result: fallbackResult, audit };
  }
}
