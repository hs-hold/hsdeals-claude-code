// supabase/functions/gmail-sync/normalize.ts

import type { NormalizedEmail } from './types.ts';

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

/** Extract all HTML tables and convert to pipe-delimited row strings */
function extractTables(html: string): string[] {
  if (!html) return [];
  const tables: string[] = [];

  const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tablePattern.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const rows: string[] = [];

    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cells: string[] = [];

      const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
        // Strip inner HTML tags from cell content
        const cellText = cellMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/&#\d+;/g, ' ')
          .replace(/&[a-z]+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cellText) cells.push(cellText);
      }

      if (cells.length > 0) {
        rows.push(cells.join(' | '));
      }
    }

    if (rows.length > 0) {
      tables.push(rows.join('\n'));
    }
  }

  return tables;
}

/** Strip HTML tags and clean up whitespace for text processing */
function stripHtmlForText(html: string): string {
  return html
    // Remove script/style blocks entirely
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Remove inline images
    .replace(/<img[^>]+src=["']data:[^"']+["'][^>]*>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    // Block-level elements → newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|tr|td|th|h[1-6]|section|article|table|tbody|thead|tfoot|blockquote)[^>]*>/gi, '\n')
    // Keep href text for links
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

/** Remove quoted thread content, signatures, and footers */
function stripThreadsAndSignatures(text: string): string {
  // Strip quoted threads
  text = text
    // "On ... wrote:"
    .replace(/^On .{0,200}wrote:[\s\S]*/m, '')
    // "-----Original Message-----"
    .replace(/^-{3,}Original Message-{3,}[\s\S]*/m, '')
    // "From: ... Sent: ... To:" block
    .replace(/^From:.*?\nSent:.*?\nTo:[\s\S]*/m, '')
    // Lines starting with ">"
    .replace(/^>.*$/gm, '');

  // Strip signatures
  text = text
    .replace(/^--\s*\n[\s\S]*/m, '')
    .replace(/^Best regards[\s\S]*/im, '')
    .replace(/^Best,[\s\S]*/im, '')
    .replace(/^Thanks,[\s\S]*/im, '')
    .replace(/^Thank you,[\s\S]*/im, '')
    .replace(/^Regards,[\s\S]*/im, '')
    .replace(/^Sent from my iPhone[\s\S]*/im, '')
    .replace(/^Sent from my Android[\s\S]*/im, '');

  // Strip footers (line by line)
  const lines = text.split('\n');
  const filteredLines = lines.filter(line => {
    const l = line.trim().toLowerCase();
    if (!l) return true; // keep blank lines for spacing
    // Unsubscribe / privacy / copyright footers
    if (/unsubscribe|opt.?out|manage (your )?(subscription|preferences|email)/i.test(l)) return false;
    if (/privacy policy|terms (of service|of use)|copyright \d{4}/i.test(l)) return false;
    if (/you (are|were) (receiving|subscribed)/i.test(l)) return false;
    if (/this email was sent to/i.test(l)) return false;
    return true;
  });

  return filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Build a clean subject: strip RE:/FWD:/brackets */
function buildCleanSubject(subject: string): string {
  return subject
    .replace(/^\s*(?:re|fwd?|fw):\s*/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getHeader(message: GmailMessage, headerName: string): string {
  const header = message.payload?.headers?.find(
    h => h.name.toLowerCase() === headerName.toLowerCase()
  );
  return header?.value || '';
}

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

export function normalizeEmail(message: GmailMessage): NormalizedEmail {
  const subject = getHeader(message, 'subject');
  const date = getHeader(message, 'date');
  const from = getHeader(message, 'from');
  const senderInfo = parseSenderInfo(from);
  const snippet = message.snippet || '';

  let plainText = '';
  let htmlRaw = '';

  // Collect plain text and HTML from the message parts
  if (message.payload?.body?.data) {
    const raw = decodeBase64Url(message.payload.body.data);
    if (raw.trim().startsWith('<') || message.payload.mimeType === 'text/html') {
      htmlRaw = raw;
    } else {
      plainText = raw;
    }
  } else if (message.payload?.parts) {
    const walk = (parts: any[]) => {
      for (const part of parts ?? []) {
        if (part.mimeType === 'text/plain' && part.body?.data && !plainText) {
          plainText = decodeBase64Url(part.body.data);
        } else if (part.mimeType === 'text/html' && part.body?.data && !htmlRaw) {
          htmlRaw = decodeBase64Url(part.body.data);
        }
        if (part.parts) walk(part.parts);
      }
    };
    walk(message.payload.parts);
  }

  const rawBodyLength = (plainText || htmlRaw).length;

  // Extract tables from HTML before stripping
  const tables = extractTables(htmlRaw);

  // Build clean text
  let cleanText: string;
  if (htmlRaw) {
    const stripped = stripHtmlForText(htmlRaw);
    // Prefer HTML-derived text if it's richer than plain text
    const plainHasBrowserHint = /view (this |in |your )?((email|message) (in|on) )?(a |your )?(web)?browser/i.test(plainText);
    const htmlIsRicher = stripped.length > plainText.length * 1.5;
    const plainIsUseful = plainText.length > 200 && !plainHasBrowserHint && !htmlIsRicher;
    cleanText = plainIsUseful ? plainText : stripped;
  } else {
    cleanText = plainText;
  }

  // Strip threads, signatures, and footers
  cleanText = stripThreadsAndSignatures(cleanText);

  const cleanSubject = buildCleanSubject(subject);

  // Build combined context
  let combined = cleanSubject + '\n\n' + cleanText;
  if (tables.length > 0) {
    combined += '\n\n--- TABLES ---\n' + tables.join('\n\n---\n');
  }
  // Truncate to 20,000 chars
  const combinedContext = combined.substring(0, 20000);

  return {
    messageId: message.id,
    threadId: message.threadId || '',
    subject,
    cleanSubject,
    senderEmail: senderInfo.email,
    senderName: senderInfo.name,
    date,
    cleanText,
    tables,
    combinedContext,
    snippet,
    rawBodyLength,
  };
}
