"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LIFECYCLE_STATUSES } from "@/db/schema";
import { crossedThreshold } from "@/lib/coverage";
import { deleteItemMedia, processAndStoreImage } from "@/lib/media";
import { parseDollarsToCents } from "@/lib/money";
import { getCoverageSummary } from "@/lib/queries/coverage";
import { getHouseholdId } from "@/lib/queries/household";
import {
  createDraftItem,
  deleteItem,
  getItem,
  setItemStatus,
  updateItem,
  type ItemPatch,
} from "@/lib/queries/items";
import { addPhoto } from "@/lib/queries/photos";
import { recordValuations } from "@/lib/queries/valuations";
import { storePhotoFiles } from "./store-photos";

function storeFiles(itemId: number, files: File[]): Promise<number> {
  return storePhotoFiles(files, `item ${itemId}`, async (buffer, mime) => {
    const image = await processAndStoreImage(itemId, buffer, mime);
    addPhoto(itemId, image, "general");
  });
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

// Empty <select>/<input> values arrive as "" — treat them as "not provided".
const optionalId = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number().int().positive().optional(),
);

const patchSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  categoryId: optionalId,
  locationId: optionalId,
  manufacturer: z.string().trim().optional(),
  modelNumber: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  quantity: z.coerce.number().int().positive().default(1),
  condition: z.string().trim().optional(),
  ageEstimate: z.string().trim().optional(),
  lifecycleStatus: z.enum(LIFECYCLE_STATUSES).default("active"),
  lifecycleDate: z.string().trim().optional(),
  replacementCost: z.string().optional(),
  pricePaid: z.string().optional(),
  purchaseDate: z.string().trim().optional(),
});

function emptyToNull(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

export interface CoverageAlert {
  level: "approaching" | "over";
  pctUsed: number;
  totalCents: number;
  limitCents: number;
}

export type ItemFormState = {
  error?: string;
  saved?: boolean;
  coverageAlert?: CoverageAlert;
} | null;

export async function updateItemAction(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(itemId)) return { error: "Unknown item" };

  const existing = getItem(itemId);
  if (!existing) return { error: "Unknown item" };

  const parsed = patchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  // Coverage status BEFORE this save, to detect a threshold crossing.
  const before = getCoverageSummary(existing.householdId);

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
    lifecycleStatus: d.lifecycleStatus,
    lifecycleDate:
      d.lifecycleStatus === "active" ? null : emptyToNull(d.lifecycleDate),
  };
  updateItem(itemId, patch);

  recordValuations(itemId, {
    replacementCostCents: parseDollarsToCents(d.replacementCost ?? ""),
    pricePaidCents: parseDollarsToCents(d.pricePaid ?? ""),
    purchaseDate: emptyToNull(d.purchaseDate),
  });

  // Coverage status AFTER — surface a contextual nudge if risk escalated.
  const after = getCoverageSummary(existing.householdId);
  const crossed = crossedThreshold(before.status, after.status);
  const coverageAlert: CoverageAlert | undefined =
    crossed && after.limitCents !== null && after.pctUsed !== null
      ? {
          level: crossed,
          pctUsed: after.pctUsed,
          totalCents: after.totalCents,
          limitCents: after.limitCents,
        }
      : undefined;

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/worklist");
  revalidatePath("/");
  return { saved: true, coverageAlert };
}

/** Permanently delete an item (e.g. created by accident) and its media. */
export async function deleteItemAction(formData: FormData) {
  const householdId = await getHouseholdId();
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(itemId)) redirect("/items");

  const existing = getItem(itemId);
  // Only delete an item that belongs to this household.
  if (existing && existing.householdId === householdId) {
    deleteItem(itemId);
    await deleteItemMedia(itemId);
  }

  revalidatePath("/items");
  revalidatePath("/worklist");
  revalidatePath("/");
  redirect("/items");
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
