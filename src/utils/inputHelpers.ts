/**
 * Strip non-numeric characters from a user-typed string.
 * If `allowDecimal` is true, keep one (and only one) dot.
 */
export function sanitizeNumericInput(raw: string, opts?: { allowDecimal?: boolean }): string {
  const allowDecimal = opts?.allowDecimal ?? false;
  let cleaned = raw.replace(/[^0-9.]/g, '');
  if (!allowDecimal) {
    cleaned = cleaned.replace(/\./g, '');
  } else {
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    }
  }
  return cleaned;
}

/**
 * Parse a numeric input string. Empty string → null. Otherwise parseFloat.
 */
export function toNumberOrNull(value: string): number | null {
  return value.trim() === '' ? null : parseFloat(value);
}
