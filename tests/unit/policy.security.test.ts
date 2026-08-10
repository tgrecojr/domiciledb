import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * VULN-022: the policy table must enforce one policy per household at the DB
 * level, and upsertPolicy must be an atomic upsert. Uses a real temp SQLite db
 * (env set before app modules load, so config points at the temp DATA_DIR).
 */
let db: typeof import("@/db").db;
let sqlite: typeof import("@/db").sqlite;
let schema: typeof import("@/db/schema");
let upsertPolicy: typeof import("@/lib/queries/policy").upsertPolicy;
let getPolicy: typeof import("@/lib/queries/policy").getPolicy;
let householdId: number;

beforeAll(async () => {
	process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vuln022-"));
	const { runMigrations } = await import("@/db/migrate");
	({ db, sqlite } = await import("@/db"));
	schema = await import("@/db/schema");
	({ upsertPolicy, getPolicy } = await import("@/lib/queries/policy"));
	runMigrations();
	householdId = db
		.insert(schema.household)
		.values({ name: "H" })
		.returning()
		.all()[0]!.id;
});

describe("policy uniqueness invariant (VULN-022)", () => {
	it("rejects a second policy row for the same household", () => {
		const ins = sqlite.prepare(
			"INSERT INTO policy (household_id, coverage_b_personal_property) VALUES (?, ?)",
		);
		ins.run(householdId, 100);
		expect(() => ins.run(householdId, 200)).toThrow();
		const count = sqlite
			.prepare("SELECT COUNT(*) AS c FROM policy WHERE household_id = ?")
			.get(householdId) as { c: number };
		expect(count.c).toBe(1);
	});

	// Updated for VULN-020: the single-household invariant forbids a second
	// household, so this reuses the one household. The previous test left it with
	// one policy row; upsert must keep it at one and update in place.
	it("upsertPolicy keeps a single row and updates it in place", () => {
		upsertPolicy(householdId, { coverageBPersonalProperty: 100 });
		upsertPolicy(householdId, { coverageBPersonalProperty: 200 });
		const rows = db
			.select()
			.from(schema.policy)
			.where(eq(schema.policy.householdId, householdId))
			.all();
		expect(rows).toHaveLength(1);
		expect(getPolicy(householdId)?.coverageBPersonalProperty).toBe(200);
	});
});
