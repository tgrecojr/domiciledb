import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Exercises the seam between the (unit-tested) pure logic and the real database:
 * valuation history integrity and coverage aggregation with lifecycle. Uses a
 * real temp SQLite db (no S3 needed). Env is set before the app modules load,
 * so config points at the temp DATA_DIR. Report and item-list filtering and the
 * delete cascade live in db-report-items.test.ts.
 */

// Loaded in beforeAll after DATA_DIR is set (so config resolves to the temp db).
let db: typeof import("@/db").db;
let schema: typeof import("@/db/schema");
let recordValuations: typeof import("@/lib/queries/valuations").recordValuations;
let currentValuations: typeof import("@/lib/queries/valuations").currentValuations;
let getCoverageSummary: typeof import("@/lib/queries/coverage").getCoverageSummary;
let dataDir: string;

let householdId: number;

beforeAll(async () => {
	dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "domicile-dbq-"));
	process.env.DATA_DIR = dataDir;
	process.env.COVERAGE_WARN_PCT = "0.8";

	const { runMigrations } = await import("@/db/migrate");
	({ db } = await import("@/db"));
	schema = await import("@/db/schema");
	({ recordValuations, currentValuations } = await import(
		"@/lib/queries/valuations"
	));
	({ getCoverageSummary } = await import("@/lib/queries/coverage"));

	runMigrations();
	householdId = db
		.insert(schema.household)
		.values({ name: "DB Test Household" })
		.returning()
		.all()[0]!.id;
});

function newItem(over: Partial<typeof schema.item.$inferInsert> = {}) {
	return db
		.insert(schema.item)
		.values({ householdId, title: "Item", ...over })
		.returning()
		.all()[0]!;
}

describe("recordValuations integrity", () => {
	// @spec CURRENT-VAL-002, CURRENT-VAL-003, CURRENT-VAL-006
	it("inserts only on change and keeps the item's denormalized cost in sync", () => {
		const it = newItem();

		recordValuations(it.id, { replacementCostCents: 100_00 });
		let rows = db
			.select()
			.from(schema.valuation)
			.where(eq(schema.valuation.itemId, it.id))
			.all();
		expect(rows).toHaveLength(1);

		let item = db
			.select()
			.from(schema.item)
			.where(eq(schema.item.id, it.id))
			.get()!;
		expect(item.currentReplacementCost).toBe(100_00);
		expect(item.currentReplacementValuedAt).toBeTruthy();

		// Same value again -> no new history row, and the last-valued date does
		// not move: an autosave is not a re-valuation.
		const staleDate = "2020-01-01T00:00:00.000Z";
		db.update(schema.item)
			.set({ currentReplacementValuedAt: staleDate })
			.where(eq(schema.item.id, it.id))
			.run();
		recordValuations(it.id, { replacementCostCents: 100_00 });
		rows = db
			.select()
			.from(schema.valuation)
			.where(eq(schema.valuation.itemId, it.id))
			.all();
		expect(rows).toHaveLength(1);
		item = db
			.select()
			.from(schema.item)
			.where(eq(schema.item.id, it.id))
			.get()!;
		expect(item.currentReplacementValuedAt).toBe(staleDate);

		// Changed value -> new row + denormalized cost and date updated.
		recordValuations(it.id, { replacementCostCents: 150_00 });
		rows = db
			.select()
			.from(schema.valuation)
			.where(eq(schema.valuation.itemId, it.id))
			.all();
		expect(rows.filter((r) => r.kind === "replacement_cost")).toHaveLength(2);
		item = db
			.select()
			.from(schema.item)
			.where(eq(schema.item.id, it.id))
			.get()!;
		expect(item.currentReplacementCost).toBe(150_00);
		expect(item.currentReplacementValuedAt).not.toBe(staleDate);
		expect(currentValuations(it.id).replacementCostCents).toBe(150_00);
	});

	// @spec CURRENT-VAL-005, CURRENT-VAL-006
	it("records price paid with the purchase date", () => {
		const it = newItem();
		recordValuations(it.id, {
			pricePaidCents: 80_00,
			purchaseDate: "2021-03-15",
		});
		const v = currentValuations(it.id);
		expect(v.pricePaidCents).toBe(80_00);
		expect(v.purchaseDate).toBe("2021-03-15");
	});

	// @spec CURRENT-VAL-010
	it("stores the caller's source on every row and defaults to user", () => {
		const it = newItem();
		recordValuations(
			it.id,
			{ replacementCostCents: 100_00, pricePaidCents: 50_00 },
			"ai",
		);
		recordValuations(it.id, { replacementCostCents: 200_00 });
		const rows = db
			.select({ kind: schema.valuation.kind, source: schema.valuation.source })
			.from(schema.valuation)
			.where(eq(schema.valuation.itemId, it.id))
			.orderBy(schema.valuation.id)
			.all();
		expect(rows).toEqual([
			{ kind: "replacement_cost", source: "ai" },
			{ kind: "price_paid", source: "ai" },
			{ kind: "replacement_cost", source: "user" },
		]);
	});
});

// @spec COVERAGE-CALC-010, COVERAGE-CALC-002
describe("getCoverageSummary wired to the database", () => {
	// @spec CURRENT-LIFE-003
	it("counts active valued items, drops sold ones, and excludes unvalued ones", () => {
		// Updated for VULN-020: household is a DB-enforced singleton, so reuse the
		// shared household and reset its rows instead of inserting a second one.
		db.delete(schema.item).run();
		db.delete(schema.policy).run();
		db.insert(schema.policy)
			.values({
				householdId,
				coverageBPersonalProperty: 1_000_00,
				source: "user",
				updatedAt: new Date().toISOString(),
			})
			.run();

		const valued = db
			.insert(schema.item)
			.values({
				householdId,
				title: "Valued",
				currentReplacementCost: 500_00,
				quantity: 1,
			})
			.returning()
			.all()[0]!;

		let s = getCoverageSummary(householdId);
		expect(s.totalCents).toBe(500_00);
		expect(s.status).toBe("within");

		// Mark it sold -> it must leave the coverage total.
		db.update(schema.item)
			.set({ lifecycleStatus: "sold" })
			.where(eq(schema.item.id, valued.id))
			.run();
		s = getCoverageSummary(householdId);
		expect(s.totalCents).toBe(0);

		// An active item with no replacement cost is excluded, not counted.
		db.insert(schema.item).values({ householdId, title: "Unvalued" }).run();
		s = getCoverageSummary(householdId);
		expect(s.totalCents).toBe(0);
		expect(s.excludedCount).toBe(1);
	});
});
