import { getHouseholdId } from "@/lib/queries/household";
import { getReportPacket, type ReportFilter } from "@/lib/queries/report";
import { renderProofPacket } from "@/lib/pdf/render";

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
