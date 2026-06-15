import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ItemList } from "@/components/item-list";
import { LocationFilter } from "@/components/location-filter";
import { getHouseholdId } from "@/lib/queries/household";
import { listItems } from "@/lib/queries/items";
import { listLocations } from "@/lib/queries/locations";

export const dynamic = "force-dynamic";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const locations = listLocations(householdId);
  const locationNames = new Map(locations.map((l) => [l.id, l.name]));

  const { location } = await searchParams;
  // "unassigned" → null filter, a numeric id → that location, anything else → all.
  const locationId =
    location === "unassigned"
      ? null
      : location && /^\d+$/.test(location)
        ? Number(location)
        : undefined;
  const filterValue =
    locationId === null ? "unassigned" : (locationId?.toString() ?? "all");

  const items = listItems(
    householdId,
    locationId !== undefined ? { location: locationId } : {},
  );

  const filter = (
    <LocationFilter
      locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      value={filterValue}
    />
  );

  return (
    <AppShell title="Items" action={locations.length > 0 ? filter : undefined}>
      {items.length === 0 ? (
        <EmptyState filtered={filterValue !== "all"} />
      ) : (
        <ItemList items={items} locationNames={locationNames} />
      )}
    </AppShell>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-neutral-600">No items in this location.</p>
        <Link href="/items" className="text-sm text-neutral-500 underline">
          Show all items
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-neutral-600">No items yet.</p>
      <Link
        href="/capture"
        className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
      >
        Capture your first item
      </Link>
    </div>
  );
}
