import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * VULN-020: the app manages exactly one household. A second setup must be
 * rejected — both at the DB level and by createHousehold. Uses a real temp
 * SQLite db (env set before app modules load).
 */
let sqlite: typeof import("@/db").sqlite;
let createHousehold: typeof import("@/lib/queries/household").createHousehold;

beforeAll(async () => {
	process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vuln020-"));
	const { runMigrations } = await import("@/db/migrate");
	({ sqlite } = await import("@/db"));
	({ createHousehold } = await import("@/lib/queries/household"));
	runMigrations();
});

describe("single-household invariant (VULN-020)", () => {
	it("createHousehold rejects a second household", async () => {
		await createHousehold({ name: "First" });
		await expect(createHousehold({ name: "Second" })).rejects.toThrow();
		const count = sqlite
			.prepare("SELECT COUNT(*) AS c FROM household")
			.get() as { c: number };
		expect(count.c).toBe(1);
	});

	it("the DB rejects a raw second household insert", () => {
		const ins = sqlite.prepare("INSERT INTO household (name) VALUES (?)");
		expect(() => ins.run("Another")).toThrow();
	});
});
