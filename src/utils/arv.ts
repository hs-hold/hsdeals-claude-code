// Utility helpers for ARV extraction from AI summary text/HTML

/**
 * Extracts ARV (After Repair Value) from an AI summary string.
 * 
 * Important: We intentionally only match ARV amounts that appear on the *same line*
 * as the ARV label to avoid accidentally capturing other dollar amounts (e.g. rent).
 */
export function extractArvFromSummary(aiSummary: string | null | undefined): number | null {
  if (!aiSummary) return null;

  // Normalize HTML to line-based plain text.
  const normalized = aiSummary
    .replace(/<\s*\/\s*p\s*>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\u00a0/g, ' ');

  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!/\barv\b/i.test(line)) continue;

    // Common formats we see:
    // - "ARV Estimate: $305,333"
    // - "ARV: 305,333"
    // - "ARV Estimate - $300,000"
    const match = line.match(/\bARV\b\s*(?:Estimate)?\s*[:\-]?\s*\$?\s*([\d,]{3,})/i);
    if (!match) continue;

    const value = parseInt(match[1].replace(/,/g, ''), 10);

    // Guardrails: ARV should not look like a rent/payment amount.
    if (!Number.isFinite(value) || value < 10000) continue;

    return value;
  }

  return null;
}
