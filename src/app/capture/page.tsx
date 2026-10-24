import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getHouseholdId } from "@/lib/queries/household";
import { listLocations } from "@/lib/queries/locations";
import { CaptureForm } from "./capture-form";

export const dynamic = "force-dynamic";

// @spec CAPTURE-UI-005, CAPTURE-UI-006, CAPTURE-UI-007
export default async function CapturePage({
	searchParams,
}: {
	searchParams: Promise<{ saved?: string; error?: string; dropped?: string }>;
}) {
	const householdId = await getHouseholdId();
	if (householdId === null) redirect("/");

	const locations = listLocations(householdId);
	const sp = await searchParams;
	const dropped = Math.max(0, Number.parseInt(sp.dropped ?? "", 10) || 0);

	return (
		<AppShell title="Capture">
			<CaptureForm
				locations={locations.map((l) => ({ id: l.id, name: l.name }))}
				justSaved={sp.saved === "1"}
				emptyError={sp.error === "empty"}
				dropped={dropped}
			/>
		</AppShell>
	);
}
