/**
 * Money is integer CENTS everywhere in DomicileDB (feature-spec: exact coverage
 * math, no float drift). These helpers are the ONLY place dollars <-> cents
 * conversion happens, so the rounding rule lives in one tested spot.
 */

/**
 * Parse a user-entered dollar string into integer cents.
 * Accepts "$1,234.56", "1234.5", "1,000", " 12 ". Returns null for empty or
 * unparseable input, or for negative amounts (values can't be negative).
 */
export function parseDollarsToCents(
  input: string | null | undefined,
): number | null {
  if (input === null || input === undefined) return null;
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  // Only digits with an optional single decimal point.
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const USD_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format integer cents as "$1,234.56". */
export function formatCents(cents: number): string {
  return USD.format(cents / 100);
}

/** Format integer cents with no decimals, e.g. "$1,235" — for summaries. */
export function formatCentsWhole(cents: number): string {
  return USD_WHOLE.format(cents / 100);
}
