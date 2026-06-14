import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ItemList } from "@/components/item-list";
import { getHouseholdId } from "@/lib/queries/household";
import { listItems } from "@/lib/queries/items";
import { listLocations } from "@/lib/queries/locations";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const items = listItems(householdId);
  const locationNames = new Map(
    listLocations(householdId).map((l) => [l.id, l.name]),
  );

  return (
    <AppShell title="Items">
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-neutral-600">No items yet.</p>
          <Link
            href="/capture"
            className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
          >
            Capture your first item
          </Link>
        </div>
      ) : (
        <ItemList items={items} locationNames={locationNames} />
      )}
    </AppShell>
  );
}
