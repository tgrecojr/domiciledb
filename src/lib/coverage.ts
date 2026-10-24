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

/**
 * The per-item value rule shared by the coverage total and the proof packet:
 * per-unit replacement cost × quantity, a non-finite or negative quantity
 * counting as zero, clamped to the safe-integer range.
 */
// @spec COVERAGE-CALC-001, COVERAGE-CALC-004, COVERAGE-CALC-005, PACKET-DATA-002
export function itemValueCents(
	replacementCostCents: number | null,
	quantity: number,
): number | null {
	if (replacementCostCents === null) return null;
	const qty = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
	return Math.min(Number.MAX_SAFE_INTEGER, replacementCostCents * qty);
}

/**
 * Add cents without leaving the safe-integer range. An out-of-range quantity
 * or value (rejected at the write boundary, but this is the spine — stay
 * defensive) would otherwise overflow past Number.MAX_SAFE_INTEGER, silently
 * losing integer precision and corrupting pctUsed/status. A clamped total
 * still reads honestly as "over".
 */
// @spec COVERAGE-CALC-005, PACKET-DATA-012
export function addCents(a: number, b: number): number {
	return Math.min(Number.MAX_SAFE_INTEGER, a + b);
}

// @spec COVERAGE-CALC-001, COVERAGE-CALC-002, COVERAGE-CALC-003, COVERAGE-CALC-004, COVERAGE-CALC-005, COVERAGE-CALC-006, COVERAGE-CALC-007
export function computeCoverage(input: CoverageInput): CoverageResult {
	let totalCents = 0;
	let countedCount = 0;
	let excludedCount = 0;

	for (const it of input.items) {
		// @spec CURRENT-LIFE-003
		if (!isActive(it.lifecycleStatus)) continue;
		const value = itemValueCents(it.replacementCostCents, it.quantity);
		if (value === null) {
			excludedCount += 1;
			continue;
		}
		totalCents = addCents(totalCents, value);
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

const STATUS_RANK: Record<CoverageStatus, number> = {
	within: 0,
	approaching: 1,
	over: 2,
};

// @spec COVERAGE-CALC-009
/**
 * Decide whether a change ESCALATED coverage risk, for the contextual nudge
 * (feature-spec §7: alert right after the item that crosses a threshold).
 * Returns the newly-reached level ("approaching" | "over") only when status
 * moved up to it; returns null when unchanged, de-escalated, or no policy.
 */
export function crossedThreshold(
	before: CoverageStatus | null,
	after: CoverageStatus | null,
): Exclude<CoverageStatus, "within"> | null {
	if (after === null || after === "within") return null;
	const beforeRank = before === null ? -1 : STATUS_RANK[before];
	if (STATUS_RANK[after] > beforeRank) return after;
	return null;
}
