"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { processAndStoreImage } from "@/lib/media";
import { getHouseholdId } from "@/lib/queries/household";
import {
  createDraftItem,
  setItemStatus,
  updateItem,
  type ItemPatch,
} from "@/lib/queries/items";
import { addPhoto } from "@/lib/queries/photos";

const ACCEPTED = /^image\/(jpe?g|png|webp|heic|heif)$/i;

async function storeFiles(itemId: number, files: File[]) {
  for (const file of files) {
    if (file.size === 0 || !ACCEPTED.test(file.type)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await processAndStoreImage(itemId, buffer, file.type);
    addPhoto(itemId, stored, "general");
  }
}

/** Quick capture: photos (+ optional title/location) -> a new draft item. */
export async function captureItemAction(formData: FormData) {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File);
  const realFiles = files.filter((f) => f.size > 0);
  const title = String(formData.get("title") ?? "").trim();
  const locationRaw = String(formData.get("locationId") ?? "");
  const locationId = locationRaw ? Number(locationRaw) : null;

  if (realFiles.length === 0 && title.length === 0) {
    redirect("/capture?error=empty");
  }

  const created = createDraftItem({
    householdId: householdId!,
    title: title || "Untitled item",
    locationId,
  });
  await storeFiles(created.id, realFiles);

  revalidatePath("/worklist");
  revalidatePath("/items");

  if (String(formData.get("intent")) === "details") {
    redirect(`/items/${created.id}`);
  }
  redirect("/capture?saved=1");
}

/** Add more photos to an existing item (from the detail page). */
export async function addPhotosAction(formData: FormData) {
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(itemId)) redirect("/items");
  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  await storeFiles(itemId, files);
  revalidatePath(`/items/${itemId}`);
  redirect(`/items/${itemId}`);
}

const patchSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  locationId: z.coerce.number().int().positive().optional(),
  manufacturer: z.string().trim().optional(),
  modelNumber: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  quantity: z.coerce.number().int().positive().default(1),
  condition: z.string().trim().optional(),
  ageEstimate: z.string().trim().optional(),
});

function emptyToNull(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

export type ItemFormState = { error?: string } | null;

export async function updateItemAction(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(itemId)) return { error: "Unknown item" };

  const parsed = patchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const patch: ItemPatch = {
    title: d.title,
    description: emptyToNull(d.description),
    categoryId: d.categoryId ?? null,
    locationId: d.locationId ?? null,
    manufacturer: emptyToNull(d.manufacturer),
    modelNumber: emptyToNull(d.modelNumber),
    serialNumber: emptyToNull(d.serialNumber),
    quantity: d.quantity,
    condition: emptyToNull(d.condition),
    ageEstimate: emptyToNull(d.ageEstimate),
  };
  updateItem(itemId, patch);
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/worklist");
  return null;
}

/** Toggle completeness: marking complete clears it from the worklist. */
export async function setItemStatusAction(formData: FormData) {
  const itemId = Number(formData.get("itemId"));
  const status = String(formData.get("status"));
  if (!Number.isInteger(itemId)) redirect("/items");
  if (status === "complete" || status === "draft") {
    setItemStatus(itemId, status);
  }
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/worklist");
  redirect(`/items/${itemId}`);
}
