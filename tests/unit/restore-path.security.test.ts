import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	isSqliteDatabase,
	referencedOnly,
	resolveWithinDataDir,
} from "../../scripts/restore-path";

const DATA = path.resolve("/data");

// @spec RESILIENCE-RESTORE-002
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

// @spec RESILIENCE-RESTORE-005
describe("isSqliteDatabase header check", () => {
	const header = Buffer.from("SQLite format 3\0", "latin1");

	it("recognizes the SQLite 3 header", () => {
		expect(isSqliteDatabase(Buffer.concat([header, Buffer.alloc(100)]))).toBe(
			true,
		);
	});

	it("rejects anything else, including short and HTML/ZIP bodies", () => {
		expect(isSqliteDatabase(Buffer.alloc(0))).toBe(false);
		expect(isSqliteDatabase(Buffer.from("SQLite format"))).toBe(false);
		expect(isSqliteDatabase(Buffer.from("<html>Access denied</html>"))).toBe(
			false,
		);
		expect(isSqliteDatabase(Buffer.from("PK\u0003\u0004zip"))).toBe(false);
	});
});

// @spec RESILIENCE-RESTORE-007
describe("referencedOnly keeps the bucket append-only but the restore faithful", () => {
	it("restores only keys a row in the restored database references", () => {
		const referenced = new Set([
			"media/items/1/aaa-web.webp",
			"media/items/1/aaa-thumb.webp",
			"media/documents/items/1/bbb-receipt.pdf",
		]);
		const { restore, skipped } = referencedOnly(
			[
				"media/items/1/aaa-web.webp",
				"media/items/1/aaa-thumb.webp",
				"media/items/7/deleted-long-ago-web.webp",
				"media/documents/items/1/bbb-receipt.pdf",
				"media/locations/3/orphan-original.jpg",
			],
			referenced,
		);
		expect(restore).toEqual([
			"media/items/1/aaa-web.webp",
			"media/items/1/aaa-thumb.webp",
			"media/documents/items/1/bbb-receipt.pdf",
		]);
		expect(skipped).toEqual([
			"media/items/7/deleted-long-ago-web.webp",
			"media/locations/3/orphan-original.jpg",
		]);
	});

	it("normalizes Windows separators in stored paths before comparing", () => {
		const { restore } = referencedOnly(
			["media/items/1/x-web.webp"],
			new Set(["media\\items\\1\\x-web.webp"]),
		);
		expect(restore).toEqual(["media/items/1/x-web.webp"]);
	});
});
