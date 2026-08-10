import { config } from "@/lib/config";
import { renderProofPacket } from "@/lib/pdf/render";
import { getHouseholdId } from "@/lib/queries/household";
import { getReportPacket, type ReportFilter } from "@/lib/queries/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function intParam(value: string | null): number | undefined {
	if (!value) return undefined;
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function GET(req: Request) {
	const householdId = await getHouseholdId();
	if (householdId === null) {
		return new Response("No household set up", { status: 404 });
	}

	const url = new URL(req.url);
	const filter: ReportFilter = {
		locationId: intParam(url.searchParams.get("location")),
		categoryId: intParam(url.searchParams.get("category")),
	};

	const packet = getReportPacket(householdId, filter);
	if (!packet) {
		return new Response("No household set up", { status: 404 });
	}

	// Both filters are optional, so an unfiltered request would render the whole
	// inventory — bounded CPU/memory per request matters more here than serving
	// one giant PDF, so ask the caller to narrow it instead.
	if (packet.itemCount > config.export.maxPacketItems) {
		return new Response(
			`This packet covers ${packet.itemCount} items, over the ${config.export.maxPacketItems}-item limit. Narrow it with ?location= or ?category=.`,
			{ status: 413, headers: { "Cache-Control": "no-store" } },
		);
	}

	const pdf = await renderProofPacket(packet);
	const date = packet.generatedAt.slice(0, 10);
	const filename = `home-inventory-${date}.pdf`;

	return new Response(new Uint8Array(pdf), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "no-store",
		},
	});
}
