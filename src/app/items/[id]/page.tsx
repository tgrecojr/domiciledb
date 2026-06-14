import { Lightbulb } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { setItemStatusAction } from "@/lib/actions/items";
import { getHouseholdId } from "@/lib/queries/household";
import { getItem } from "@/lib/queries/items";
import { listCategories } from "@/lib/queries/categories";
import { listLocations } from "@/lib/queries/locations";
import { listPhotos } from "@/lib/queries/photos";
import { mediaUrl } from "@/lib/media";
import { ItemEditForm } from "./item-edit-form";
import { AddPhotos } from "./add-photos";

export const dynamic = "force-dynamic";

/** Gentle, non-blocking hints about commonly-missing fields. */
function missingHints(
  item: NonNullable<ReturnType<typeof getItem>>,
  photoCount: number,
): string[] {
  const hints: string[] = [];
  if (photoCount === 0) hints.push("a photo");
  if (!item.categoryId) hints.push("a category");
  if (!item.locationId) hints.push("a location");
  if (!item.manufacturer) hints.push("manufacturer");
  if (!item.serialNumber) hints.push("serial number");
  return hints;
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) notFound();

  const item = getItem(itemId);
  if (!item || item.householdId !== householdId) notFound();

  const photos = listPhotos(itemId);
  const categories = listCategories();
  const locations = listLocations(householdId);
  const hints = missingHints(item, photos.length);
  const isDraft = item.status === "draft";

  return (
    <AppShell title={item.title} back={{ href: "/items", label: "Items" }}>
      <div className="flex flex-col gap-5">
        {/* Photo gallery + add. */}
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={mediaUrl(p.pathWeb)}
              alt=""
              className="h-20 w-20 rounded-lg object-cover"
            />
          ))}
          <AddPhotos itemId={itemId} />
        </div>

        {/* Completeness hint (non-blocking) + status control. */}
        {isDraft && hints.length > 0 ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
            <span>You might still add: {hints.join(", ")}.</span>
          </p>
        ) : null}

        <ItemEditForm
          item={item}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        />

        <form action={setItemStatusAction} className="border-t pt-4">
          <input type="hidden" name="itemId" value={itemId} />
          <input
            type="hidden"
            name="status"
            value={isDraft ? "complete" : "draft"}
          />
          <button
            type="submit"
            className={`w-full rounded-lg px-4 py-2.5 text-base font-medium ${
              isDraft
                ? "bg-coverage-within text-white"
                : "border border-neutral-300 text-neutral-700"
            }`}
          >
            {isDraft ? "Mark complete" : "Move back to drafts"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
