# API Documentation

## Base URL

```
https://kqeeldtjusdjmpuomtvs.supabase.co/functions/v1
```

## Authentication

Every request requires **two headers**:

| Header | Value | Description |
|--------|-------|-------------|
| `x-api-key` | Your personal access key | Generated in Settings → API Keys by an admin |
| `apikey` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxZWVsZHRqdXNkam1wdW9tdHZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTAyNjEsImV4cCI6MjA4MDUyNjI2MX0.r0zHhZkZeM8jh4waUxgVb2VovH_FrXt3C581Aw7H-Sw` | Platform gateway key (always the same) |

> 💡 You do **not** need any external API key. The analysis engine runs on our server — your `x-api-key` simply authenticates your access.

---

## Endpoints

### 1. Analyze Property (Address Mode)

Analyze a single property by address. Returns real-time financial analysis.

**POST** `/api-analyze-zip`

#### Request Body

```json
{
  "address": "1514 Peachcrest Rd, Decatur, GA 30032"
}
```

#### Response (200 OK)

```json
{
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
    "monthly_cashflow": 285,
    "annual_cashflow": 3420,
    "cash_on_cash_percent": 8.5,
    "cap_rate_percent": 7.2,
    "money_in_deal": 40200,
    "score": 5
  },
  "brrrr": {
    "money_in_deal": 12000,
    "monthly_cashflow": 185,
    "annual_cashflow": 2220,
    "cash_on_cash_percent": 18.5,
    "equity": 54000,
    "score": 7,
    "recommended": true
  },
  "best_strategy": "Flip (Cash)",
  "best_score": 8,
  "mao": null,
  "ai_summary": "AI-generated property analysis summary..."
}
```

> If the property was previously analyzed, `already_analyzed` will be `true` and `deal_id` will be included. No re-analysis is performed unless a price drop is detected.

---

### 2. Bulk Search by ZIP Code (Zipcode Mode)

Search a ZIP code for investment properties, analyze them in the background, and receive results via webhook.

**POST** `/api-analyze-zip`

#### Request Body

```json
{
  "zipcode": "30032",
  "max_results": 20,
  "callback_url": "https://your-server.com/webhook",
  "webhook_secret": "my-secret-token"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `zipcode` | string | ✅ | — | US ZIP code to search |
| `max_results` | number | ❌ | 5 | Max new properties to analyze (max 60) |
| `callback_url` | string | ✅ | — | Webhook URL to receive results when processing is complete |
| `webhook_secret` | string | ❌ | — | Secret token appended as `?token=YOUR_SECRET` to your callback URL for verification |

#### Immediate Response (200 OK)

```json
{
  "success": true,
  "mode": "zipcode",
  "status": "processing",
  "job_id": "abc123-...",
  "zipcode": "30032",
  "total_found": 45,
  "total_after_filter": 28,
  "total_to_analyze": 20,
  "total_already_analyzed": 8,
  "filters_applied": {
    "homeType": "SingleFamily",
    "listType": "for-sale",
    "minPrice": 80000,
    "maxPrice": 250000,
    "minBeds": 2,
    "maxBeds": 4,
    "minBaths": 1,
    "minSqft": 1150,
    "maxSqft": 2300
  },
  "message": "Processing 20 new properties (8 already analyzed). Results will be sent to https://your-server.com/webhook."
}
```

---

### 3. Webhook Results

When all properties are analyzed, results are automatically **POSTed** to your `callback_url`.

**Webhook Payload** (POST to your `callback_url`):

```json
{
  "success": true,
  "job_id": "abc123-...",
  "zipcode": "30032",
  "summary": "Found 20 properties in ZIP 30032. 5 are good deals (Flip Score ≥ 8), 12 filtered out (below threshold), 3 already analyzed, 0 price drops updated.",
  "total_analyzed": 20,
  "total_good_deals": 5,
  "total_filtered_out": 12,
  "total_duplicate_skipped": 3,
  "total_price_drop_updated": 0,
  "deals": [
    {
      "deal_id": "deal-uuid-...",
      "address": "123 Main St, Decatur, GA 30032",
      "grade": "B+",
      "purchase_price": 145000,
      "arv": 230000,
      "rehab_cost": 30000,
      "monthly_rent": 1700,
      "flip": {
        "cash": { "net_profit": 28500, "roi_percent": 14.2, "total_investment": 200800 },
        "hml": { "net_profit": 22100, "roi_percent": 52.1, "cash_out_of_pocket": 42400 },
        "score": 9
      },
      "rental": { "monthly_cashflow": 310, "annual_cashflow": 3720, "cash_on_cash_percent": 9.1, "cap_rate_percent": 7.8, "money_in_deal": 40800, "score": 6 },
      "brrrr": { "money_in_deal": 8500, "monthly_cashflow": 210, "annual_cashflow": 2520, "cash_on_cash_percent": 29.6, "equity": 60500, "score": 8, "recommended": true },
      "best_strategy": "Flip (Cash)",
      "best_score": 9,
      "mao": null,
      "ai_summary": "Strong flip candidate..."
    }
  ],
  "filtered_out_deals": ["456 Oak Ave: flip score 5/10 (ROI 11.2%) - below 8"],
  "errors": []
}
```

> Properties are analyzed sequentially (one at a time) for stability. Each property takes ~5-8 seconds.

---

## Scoring System

### Flip Score (1-10)

| Score | ROI % |
|-------|-------|
| 10 | ≥ 25% |
| 9 | ≥ 20% |
| 8 | ≥ 18% |
| 7 | ≥ 16% |
| 6 | ≥ 15% |
| 5 | ≥ 13% |

**Only deals with Flip Score ≥ 8 are returned as "good deals."** Properties below this threshold are saved with status `filtered_out` and can be viewed in the dashboard.

### MAO (Maximum Allowable Offer)

Returned only when:
- Flip Score < 8 (property is close but not quite a good deal)
- Required price discount is ≤ 8%

---

## Deduplication

- Addresses are normalized (lowercase, alphanumeric only)
- Previously analyzed properties are skipped automatically
- **Price drops trigger re-analysis**: if the listing price dropped below the previous analysis, the property is re-analyzed and updated

---

## Preset Search Filters (ZIP Mode)

All ZIP code searches use these fixed filters:

| Filter | Value |
|--------|-------|
| Home Type | Single Family |
| Price Range | $80,000 - $250,000 |
| Bedrooms | 2-4 |
| Bathrooms | 1+ |
| Square Feet | 1,150 - 2,300 |

---

## Error Responses

| Status | Description |
|--------|-------------|
| 400 | Missing required parameters (including `callback_url` for ZIP mode) |
| 401 | Missing `x-api-key` header |
| 403 | Invalid or inactive API key |
| 502 | External analysis service error |
| 500 | Internal server error |

---

## Example: Full Workflow

```bash
# Step 1: Submit ZIP code analysis with webhook
curl -X POST "https://kqeeldtjusdjmpuomtvs.supabase.co/functions/v1/api-analyze-zip" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ACCESS_KEY" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxZWVsZHRqdXNkam1wdW9tdHZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTAyNjEsImV4cCI6MjA4MDUyNjI2MX0.r0zHhZkZeM8jh4waUxgVb2VovH_FrXt3C581Aw7H-Sw" \
  -d '{
    "zipcode": "30032",
    "max_results": 10,
    "callback_url": "https://your-server.com/webhook",
    "webhook_secret": "my-secret-token"
  }'

# Step 2: Wait for webhook POST to your callback_url with full results
# No polling needed!
```

## Example: Address Mode

```bash
curl -X POST "https://kqeeldtjusdjmpuomtvs.supabase.co/functions/v1/api-analyze-zip" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ACCESS_KEY" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxZWVsZHRqdXNkam1wdW9tdHZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTAyNjEsImV4cCI6MjA4MDUyNjI2MX0.r0zHhZkZeM8jh4waUxgVb2VovH_FrXt3C581Aw7H-Sw" \
  -d '{
    "address": "1514 Peachcrest Rd, Decatur, GA 30032"
  }'
```
