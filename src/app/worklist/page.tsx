import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ItemList } from "@/components/item-list";
import { getHouseholdId } from "@/lib/queries/household";
import { listItems } from "@/lib/queries/items";
import { listLocations } from "@/lib/queries/locations";

export const dynamic = "force-dynamic";

export default async function WorklistPage() {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const items = listItems(householdId, { status: "draft" });
  const locationNames = new Map(
    listLocations(householdId).map((l) => [l.id, l.name]),
  );

  return (
    <AppShell title="To finish">
      <p className="mb-3 text-sm text-neutral-500">
        Drafts that still need detail. Finish them, then mark each complete to
        clear it from this list.
      </p>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center text-neutral-500">
          <CheckCircle2 className="text-coverage-within h-10 w-10" />
          <p>All caught up — nothing waiting for detail.</p>
          <Link
            href="/capture"
            className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
          >
            Capture more
          </Link>
        </div>
      ) : (
        <ItemList items={items} locationNames={locationNames} />
      )}
    </AppShell>
  );
}
