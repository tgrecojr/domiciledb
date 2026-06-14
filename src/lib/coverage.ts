/**
 * The insurance spine (feature-spec §7). Pure function — no DB, no I/O — so it
 * is exhaustively unit-testable. Wiring to the dashboard happens in Phase 2.
 *
 * Compares the total REPLACEMENT-COST value of ACTIVE inventory against the
 * Coverage B – Personal Property limit. Items missing a replacement cost are
 * NOT counted and are surfaced as "excluded", so the picture is honestly
 * "at least $X" rather than silently undercounting.
 *
 * All money is integer CENTS.
 */

export type CoverageStatus = "within" | "approaching" | "over";

export interface CoverageItemInput {
  /** Per-item replacement cost in cents, or null if not yet valued. */
  replacementCostCents: number | null;
  quantity: number;
  /** Only "active" items count toward coverage. */
  lifecycleStatus: string;
}

export interface CoverageInput {
  items: CoverageItemInput[];
  /** Coverage B limit in cents, or null if no policy is set up yet. */
  coverageBLimitCents: number | null;
  /** Fraction (0–1] at which "approaching" begins. Operator config. */
  warnPct: number;
}

export interface CoverageResult {
  /** Aggregate replacement cost of counted (active + valued) items, cents. */
  totalCents: number;
  limitCents: number | null;
  /** total / limit, or null when no limit is set. */
  pctUsed: number | null;
  /** null when no limit is set. */
  status: CoverageStatus | null;
  /** Active items with no replacement cost (excluded from the total). */
  excludedCount: number;
  /** Active items that have a replacement cost (included in the total). */
  countedCount: number;
}

function isActive(lifecycleStatus: string): boolean {
  return lifecycleStatus === "active";
}

export function computeCoverage(input: CoverageInput): CoverageResult {
  let totalCents = 0;
  let countedCount = 0;
  let excludedCount = 0;

  for (const it of input.items) {
    if (!isActive(it.lifecycleStatus)) continue;
    if (it.replacementCostCents === null) {
      excludedCount += 1;
      continue;
    }
    const qty = Number.isFinite(it.quantity) ? Math.max(0, it.quantity) : 0;
    totalCents += it.replacementCostCents * qty;
    countedCount += 1;
  }

  const limitCents = input.coverageBLimitCents;
  if (limitCents === null || limitCents <= 0) {
    return {
      totalCents,
      limitCents,
      pctUsed: null,
      status: null,
      excludedCount,
      countedCount,
    };
  }

  const pctUsed = totalCents / limitCents;
  const status: CoverageStatus =
    pctUsed > 1 ? "over" : pctUsed >= input.warnPct ? "approaching" : "within";

  return {
    totalCents,
    limitCents,
    pctUsed,
    status,
    excludedCount,
    countedCount,
  };
}
