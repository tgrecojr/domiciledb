import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { item, valuation } from "@/db/schema";

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
 * drives staleness reminders) in sync. Valuations are never mutated.
 */
export function recordValuations(itemId: number, input: ValuationInput) {
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
          source: "user",
        })
        .run();
    }
    // Always refresh the denormalized pointer + last-valued date on save.
    db.update(item)
      .set({
        currentReplacementCost: input.replacementCostCents,
        currentReplacementValuedAt: now,
        updatedAt: now,
      })
      .where(eq(item.id, itemId))
      .run();
  }

  if (input.pricePaidCents != null) {
    if (latestAmount(itemId, "price_paid") !== input.pricePaidCents) {
      db.insert(valuation)
        .values({
          itemId,
          kind: "price_paid",
          amount: input.pricePaidCents,
          valuedAt: input.purchaseDate || now,
          source: "user",
        })
        .run();
    }
  }
}

/** Current price-paid + replacement-cost for an item, for the edit form. */
export function currentValuations(itemId: number) {
  const pricePaid = latestRow(itemId, "price_paid");
  return {
    pricePaidCents: pricePaid?.amount ?? null,
    purchaseDate: pricePaid?.valuedAt ?? null,
    replacementCostCents: latestAmount(itemId, "replacement_cost"),
  };
}
