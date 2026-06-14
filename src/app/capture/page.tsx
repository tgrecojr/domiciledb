import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getHouseholdId } from "@/lib/queries/household";
import { listLocations } from "@/lib/queries/locations";
import { CaptureForm } from "./capture-form";

export const dynamic = "force-dynamic";

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const locations = listLocations(householdId);
  const sp = await searchParams;

  return (
    <AppShell title="Capture">
      <CaptureForm
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        justSaved={sp.saved === "1"}
        emptyError={sp.error === "empty"}
      />
    </AppShell>
  );
}
