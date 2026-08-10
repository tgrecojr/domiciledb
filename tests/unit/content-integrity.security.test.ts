import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * VULN-018: content-addressed storage must use the FULL sha256 digest as the
 * on-disk identity (not a 64-bit prefix), and must be able to verify a stored
 * file's bytes against the recorded digest on read-back.
 */
let storeDocument: typeof import("@/lib/documents-store").storeDocument;
let verifyStoredContent: typeof import("@/lib/media").verifyStoredContent;
let dataDir: string;

beforeAll(async () => {
	dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vuln018-"));
	process.env.DATA_DIR = dataDir;
	({ storeDocument } = await import("@/lib/documents-store"));
	({ verifyStoredContent } = await import("@/lib/media"));
});

describe("content identity (VULN-018)", () => {
	it("names a stored document with the full 64-hex-char digest", async () => {
		const bytes = Buffer.from("a receipt");
		const stored = await storeDocument(1, bytes, "receipt.pdf");
		const hashPart = path.basename(stored.path).split("-")[0];
		expect(hashPart).toMatch(/^[0-9a-f]{64}$/);
		// Identity must match the true content digest end-to-end.
		const disk = createHash("sha256")
			.update(fs.readFileSync(path.join(dataDir, stored.path)))
			.digest("hex");
		expect(disk).toBe(stored.contentHash);
		expect(hashPart).toBe(stored.contentHash);
	});

	it("verifies intact content and detects a tampered read-back", async () => {
		const stored = await storeDocument(2, Buffer.from("genuine"), "r.pdf");
		expect(await verifyStoredContent(stored.path, stored.contentHash)).toBe(
			true,
		);
		// Swap the bytes on disk: the recorded digest no longer matches.
		fs.writeFileSync(
			path.join(dataDir, stored.path),
			Buffer.from("forged bytes"),
		);
		expect(await verifyStoredContent(stored.path, stored.contentHash)).toBe(
			false,
		);
	});
});
