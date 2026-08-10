import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveWithinDataDir } from "../../scripts/restore-path";

const DATA = path.resolve("/data");

describe("resolveWithinDataDir containment (VULN-005)", () => {
	it("rejects zip-slip keys that escape DATA_DIR", () => {
		expect(
			resolveWithinDataDir(DATA, "media/../../../../tmp/pwned"),
		).toBeNull();
		expect(resolveWithinDataDir(DATA, "../etc/passwd")).toBeNull();
		expect(resolveWithinDataDir(DATA, "/etc/passwd")).toBeNull();
	});

	it("rejects NUL bytes and the sibling-prefix bypass", () => {
		expect(resolveWithinDataDir(DATA, "media/x\0.webp")).toBeNull();
		expect(resolveWithinDataDir(DATA, "../data-evil/secret")).toBeNull();
	});

	it("accepts a normal key and resolves it inside DATA_DIR", () => {
		const dest = resolveWithinDataDir(DATA, "media/items/1/abc-web.webp");
		expect(dest).not.toBeNull();
		expect(dest).toBe(path.join(DATA, "media/items/1/abc-web.webp"));
	});
});
