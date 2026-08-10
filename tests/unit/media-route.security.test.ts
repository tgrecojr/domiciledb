import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

/**
 * VULN-023 (CWE-524 + CWE-312): inventory photos and documents must not be
 * pinned in an on-device HTTP cache. The media route may only hand out a
 * private, short-lived, revalidated policy — never a long-lived immutable one.
 *
 * VULN-009 (CWE-400): the route must stream the file and refuse anything over
 * the serve cap, instead of buffering whole originals into the heap.
 */

const readFileSpy = vi.fn();

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	readFileSpy.mockImplementation(actual.readFile);
	const patched = { ...actual, readFile: readFileSpy };
	return { ...patched, default: patched };
});

const DATA_DIR = `${process.env.TMPDIR ?? "/tmp"}/vuln023-${process.pid}`;
process.env.DATA_DIR = DATA_DIR;

const FILES: Array<{ parts: string[]; body: string }> = [
	{ parts: ["items", "1", "receipt-web.webp"], body: "RIFFfake-photo" },
	{ parts: ["documents", "items", "1", "policy.pdf"], body: "%PDF-1.4 fake" },
];

for (const { parts, body } of FILES) {
	const abs = path.join(DATA_DIR, "media", ...parts);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, body);
}

afterAll(() => fs.rmSync(DATA_DIR, { recursive: true, force: true }));

function directives(cacheControl: string | null): string[] {
	return (cacheControl ?? "")
		.split(",")
		.map((d) => d.trim().toLowerCase())
		.filter(Boolean);
}

describe("VULN-023 media cache policy", () => {
	it.each(FILES.map((f) => f.parts))(
		"serves /api/media/%s/%s with a private, non-persistent policy",
		async (...parts: string[]) => {
			const { GET } = await import("@/app/api/media/[...path]/route");
			const res = await GET(
				new Request(`http://localhost/api/media/${parts.join("/")}`),
				{ params: Promise.resolve({ path: parts }) },
			);

			expect(res.status).toBe(200);

			const cc = res.headers.get("Cache-Control");
			const parsed = directives(cc);

			expect(parsed).toContain("private");
			expect(parsed).not.toContain("public");
			// `immutable` tells the device it never has to revalidate — the copy
			// survives deletion of the item in the app.
			expect(parsed).not.toContain("immutable");

			const maxAge = Number(
				/(?:^|,\s*)max-age=(\d+)/.exec(cc ?? "")?.[1] ?? "0",
			);
			// Either no stored copy at all, or one that expires immediately and must
			// be revalidated before reuse.
			expect(parsed.includes("no-store") || maxAge === 0).toBe(true);
			expect(maxAge).toBeLessThanOrEqual(60);
		},
	);
});

const REL = ["items", "1", "photo-original.jpg"];

function makeMedia(bytes: number) {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vuln009-unit-"));
	const abs = path.join(dataDir, "media", ...REL);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, Buffer.alloc(bytes, 0x41));
	return { dataDir, abs };
}

async function get(dataDir: string) {
	vi.resetModules();
	vi.stubEnv("DATA_DIR", dataDir);
	const { GET } = await import("@/app/api/media/[...path]/route");
	return GET(new Request("http://x/api/media/items/1/photo-original.jpg"), {
		params: Promise.resolve({ path: REL }),
	});
}

describe("GET /api/media/* memory bounds (VULN-009)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
		readFileSpy.mockClear();
	});

	it("streams the file instead of buffering it into the heap", async () => {
		const { dataDir } = makeMedia(64 * 1024);
		const res = await get(dataDir);
		expect(res.status).toBe(200);
		expect(readFileSpy).not.toHaveBeenCalled();
		const body = await res.arrayBuffer();
		expect(body.byteLength).toBe(64 * 1024);
		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	it("refuses a file larger than the serve cap", async () => {
		const { dataDir } = makeMedia(3 * 1024 * 1024);
		vi.stubEnv("MEDIA_MAX_SERVE_MB", "1");
		const res = await get(dataDir);
		expect(res.status).toBe(413);
		expect(readFileSpy).not.toHaveBeenCalled();
		fs.rmSync(dataDir, { recursive: true, force: true });
	});
});
