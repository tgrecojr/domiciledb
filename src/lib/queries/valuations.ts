import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { item, type VALUE_SOURCES, valuation } from "@/db/schema";

export type ValuationSource = (typeof VALUE_SOURCES)[number];

function latestRow(itemId: number, kind: "replacement_cost" | "price_paid") {
	return (
		db
			.select({ amount: valuation.amount, valuedAt: valuation.valuedAt })
			.from(valuation)
			.where(and(eq(valuation.itemId, itemId), eq(valuation.kind, kind)))
			.orderBy(desc(valuation.valuedAt), desc(valuation.id))
			.get() ?? null
	);
}

function latestAmount(itemId: number, kind: "replacement_cost" | "price_paid") {
	return latestRow(itemId, kind)?.amount ?? null;
}

export interface ValuationInput {
	replacementCostCents?: number | null;
	pricePaidCents?: number | null;
	/** ISO date (YYYY-MM-DD) the price was paid; defaults to now. */
	purchaseDate?: string | null;
}

/**
 * Append valuation history rows only when a value actually changes, and keep
 * the item's denormalized current replacement cost (+ last-valued date, which
 * drives staleness reminders) in sync. The last-valued date moves only when
 * the amount changes: the editor autosaves on blur of any field, so a save is
 * not a re-valuation. Valuations are never mutated. `source` says who set the
 * figure: the user, or an AI suggestion the user applied.
 */
// @spec CURRENT-VAL-002, CURRENT-VAL-003, CURRENT-VAL-005, CURRENT-VAL-009, CURRENT-VAL-010, CURRENT-VAL-007 (gap), CURRENT-VAL-008 (gap)
export function recordValuations(
	itemId: number,
	input: ValuationInput,
	source: ValuationSource = "user",
) {
	const now = new Date().toISOString();

	if (input.replacementCostCents != null) {
		if (
			latestAmount(itemId, "replacement_cost") !== input.replacementCostCents
		) {
			db.insert(valuation)
				.values({
					itemId,
					kind: "replacement_cost",
					amount: input.replacementCostCents,
					valuedAt: now,
					source,
				})
				.run();
			db.update(item)
				.set({
					currentReplacementCost: input.replacementCostCents,
					currentReplacementValuedAt: now,
					updatedAt: now,
				})
				.where(eq(item.id, itemId))
				.run();
		}
	}

	if (input.pricePaidCents != null) {
		if (latestAmount(itemId, "price_paid") !== input.pricePaidCents) {
			db.insert(valuation)
				.values({
					itemId,
					kind: "price_paid",
					amount: input.pricePaidCents,
					valuedAt: input.purchaseDate || now,
					source,
				})
				.run();
		}
	}
}

/** Current price-paid + replacement-cost for an item, for the edit form. */
// @spec CURRENT-VAL-004, CURRENT-VAL-006
export function currentValuations(itemId: number) {
	const pricePaid = latestRow(itemId, "price_paid");
	return {
		pricePaidCents: pricePaid?.amount ?? null,
		purchaseDate: pricePaid?.valuedAt ?? null,
		replacementCostCents: latestAmount(itemId, "replacement_cost"),
	};
}
