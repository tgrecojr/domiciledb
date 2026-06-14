import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { deleteLocationAction } from "@/lib/actions/locations";
import { getHouseholdId } from "@/lib/queries/household";
import { LOCATION_KIND_LABELS } from "@/lib/location-kinds";
import { listLocations, locationItemCounts } from "@/lib/queries/locations";
import { AddLocationForm } from "./add-location-form";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const locations = listLocations(householdId);
  const counts = locationItemCounts(householdId);

  return (
    <AppShell title="Locations" back={{ href: "/", label: "Home" }}>
      <div className="flex flex-col gap-6">
        <AddLocationForm />

        {locations.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No locations yet. Add the rooms and places where your belongings
            live — you can assign items to them as you capture.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {locations.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-xs text-neutral-500">
                    {LOCATION_KIND_LABELS[l.kind]} · {counts.get(l.id) ?? 0}{" "}
                    items
                  </span>
                </div>
                <form action={deleteLocationAction}>
                  <input type="hidden" name="id" value={l.id} />
                  <button
                    type="submit"
                    className="text-sm text-neutral-400 hover:text-coverage-over"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
