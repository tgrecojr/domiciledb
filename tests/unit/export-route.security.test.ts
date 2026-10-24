import { beforeEach, describe, expect, it, vi } from "vitest";

const createSnapshot = vi.fn(() => ({ path: "/dev/null", bytes: 1 }));

vi.mock("@/lib/queries/household", () => ({
	getHouseholdId: async () => 1,
}));
vi.mock("@/lib/backup/snapshot", () => ({ createSnapshot }));
vi.mock("archiver", async () => {
	const { Readable } = await import("node:stream");
	class ZipArchive extends Readable {
		file() {}
		directory() {}
		async finalize() {
			this.push("zip");
			this.push(null);
		}
		override _read() {}
	}
	return { ZipArchive };
});

async function drain(res: Response) {
	if (res.body) await new Response(res.body).arrayBuffer();
}

// @spec RESILIENCE-EXPORT-002
describe("GET /api/export throttling (VULN-002)", () => {
	beforeEach(() => {
		vi.resetModules();
		createSnapshot.mockClear();
	});

	it("runs only one export when requests arrive concurrently", async () => {
		const { GET } = await import("@/app/api/export/route");
		const responses = await Promise.all([GET(), GET(), GET(), GET(), GET()]);
		await Promise.all(responses.map(drain));

		const okCount = responses.filter((r) => r.status === 200).length;
		const throttled = responses.filter((r) => r.status === 429);
		expect(okCount).toBe(1);
		expect(throttled).toHaveLength(4);
		expect(createSnapshot).toHaveBeenCalledTimes(1);
	});

	it("rejects a follow-up export inside the minimum interval", async () => {
		const { GET } = await import("@/app/api/export/route");
		const first = await GET();
		await drain(first);
		expect(first.status).toBe(200);

		const second = await GET();
		expect(second.status).toBe(429);
		expect(second.headers.get("Retry-After")).toBeTruthy();
		expect(createSnapshot).toHaveBeenCalledTimes(1);

		// @spec RESILIENCE-EXPORT-004
		// A browser following the plain export link lands on this response, so
		// it must read as a page that says when to retry, not a raw string.
		expect(second.headers.get("Content-Type")).toMatch(/text\/html/);
		const body = await second.text();
		expect(body).toMatch(/try again in \d+ second/i);
		expect(body).toMatch(/href="\/resilience"/);
	});
});
