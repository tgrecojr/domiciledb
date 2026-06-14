import { Lightbulb } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { setItemStatusAction } from "@/lib/actions/items";
import { getHouseholdId } from "@/lib/queries/household";
import { getItem } from "@/lib/queries/items";
import { listCategories } from "@/lib/queries/categories";
import { listLocations } from "@/lib/queries/locations";
import { listPhotos } from "@/lib/queries/photos";
import { listDocuments } from "@/lib/queries/documents";
import { currentValuations } from "@/lib/queries/valuations";
import { deleteDocumentAction } from "@/lib/actions/documents";
import { DOCUMENT_KIND_LABELS, type DocumentKind } from "@/lib/document-kinds";
import { config } from "@/lib/config";
import { mediaUrl } from "@/lib/media";
import { ItemEditForm } from "./item-edit-form";
import { AddPhotos } from "./add-photos";
import { AddDocument } from "./documents-section";
import { AiAssist } from "./ai-assist";
import { DeleteItem } from "./delete-item";

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
  const documents = listDocuments(itemId);
  const categories = listCategories();
  const locations = listLocations(householdId);
  const values = currentValuations(itemId);
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

        {config.ai.enabled ? (
          <AiAssist
            itemId={itemId}
            hasPhoto={photos.length > 0}
            model={config.ai.model}
          />
        ) : null}

        <ItemEditForm
          item={{
            id: item.id,
            title: item.title,
            description: item.description,
            categoryId: item.categoryId,
            locationId: item.locationId,
            manufacturer: item.manufacturer,
            modelNumber: item.modelNumber,
            serialNumber: item.serialNumber,
            quantity: item.quantity,
            condition: item.condition,
            ageEstimate: item.ageEstimate,
            lifecycleStatus: item.lifecycleStatus,
            lifecycleDate: item.lifecycleDate,
            replacementCostCents: values.replacementCostCents,
            pricePaidCents: values.pricePaidCents,
            purchaseDate: values.purchaseDate,
          }}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        />

        {/* Proof documents — receipts/warranties/manuals strengthen a claim. */}
        <section className="flex flex-col gap-2 border-t pt-4">
          <h2 className="text-sm font-semibold">Documents</h2>
          {documents.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2"
                >
                  <a
                    href={mediaUrl(d.path)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 flex-col"
                  >
                    <span className="truncate text-sm font-medium">
                      {d.filename}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {DOCUMENT_KIND_LABELS[d.kind as DocumentKind]}
                      {d.warrantyExpiresAt
                        ? ` · expires ${d.warrantyExpiresAt.slice(0, 10)}`
                        : ""}
                    </span>
                  </a>
                  <form action={deleteDocumentAction}>
                    <input type="hidden" name="itemId" value={itemId} />
                    <input type="hidden" name="docId" value={d.id} />
                    <button
                      type="submit"
                      className="text-xs text-neutral-400 hover:text-coverage-over"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <AddDocument itemId={itemId} />
        </section>

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

        {/* Hard delete (for items created by accident) — distinct from the
            lifecycle "sold/disposed" statuses, which keep the item on record. */}
        <DeleteItem itemId={itemId} />
      </div>
    </AppShell>
  );
}
