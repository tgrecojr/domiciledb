import { afterEach, describe, expect, it, vi } from "vitest";

const getReportPacket = vi.fn();
const renderProofPacket = vi.fn(async () => Buffer.from("%PDF-1.7"));

vi.mock("@/lib/queries/household", () => ({ getHouseholdId: async () => 1 }));
vi.mock("@/lib/queries/report", () => ({ getReportPacket }));
vi.mock("@/lib/pdf/render", () => ({ renderProofPacket }));

function packet(itemCount: number) {
	return {
		rooms: [],
		categoryTotals: [],
		grandTotalCents: 0,
		countedCount: itemCount,
		excludedCount: 0,
		itemCount,
		householdName: "H",
		householdAddress: null,
		generatedAt: "2026-08-09T00:00:00.000Z",
		filterLabel: "Entire household",
		coverage: {},
	};
}

async function load() {
	vi.resetModules();
	const { GET } = await import("@/app/api/proof-packet/route");
	return GET;
}

describe("GET /api/proof-packet render cap (VULN-010)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("refuses to render an unfiltered packet past the item cap", async () => {
		vi.stubEnv("PROOF_PACKET_MAX_ITEMS", "50");
		getReportPacket.mockReturnValue(packet(5000));
		const GET = await load();

		const res = await GET(new Request("http://x/api/proof-packet"));
		expect(res.status).toBe(413);
		expect(renderProofPacket).not.toHaveBeenCalled();
	});

	it("still renders a packet within the cap", async () => {
		vi.stubEnv("PROOF_PACKET_MAX_ITEMS", "50");
		getReportPacket.mockReturnValue(packet(10));
		const GET = await load();

		const res = await GET(new Request("http://x/api/proof-packet"));
		expect(res.status).toBe(200);
		expect(renderProofPacket).toHaveBeenCalledTimes(1);
	});
});
