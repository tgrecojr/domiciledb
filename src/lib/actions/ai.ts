"use server";

import { revalidatePath } from "next/cache";

import { bufferToBase64Jpeg, imageToBase64Jpeg } from "@/lib/ai/image";
import { runTask } from "@/lib/ai/openrouter";
import { TASKS, type AiTaskKey } from "@/lib/ai/tasks";
import { config } from "@/lib/config";
import { parseDollarsToCents } from "@/lib/money";
import { logInteraction, setOutcome } from "@/lib/queries/ai";
import { findOrCreateCategory } from "@/lib/queries/categories";
import { getItem, updateItem, type ItemPatch } from "@/lib/queries/items";
import { listPhotos } from "@/lib/queries/photos";
import { recordValuations } from "@/lib/queries/valuations";

export interface AiSuggestResult {
  ok: boolean;
  error?: string;
  interactionId?: number;
  suggestion?: Record<string, unknown>;
}

function isTaskKey(v: string): v is AiTaskKey {
  return v in TASKS;
}

/**
 * EXECUTE step: only runs after the user has seen the manifest and confirmed.
 * Calls the AI, logs the interaction for the audit trail, and returns the
 * suggestion. Never writes the suggestion to the item — that's a separate,
 * explicit apply step.
 */
export async function aiSuggestForItem(
  itemId: number,
  taskKey: string,
  photoId: number | null,
): Promise<AiSuggestResult> {
  if (!config.ai.enabled) return { ok: false, error: "AI is not configured." };
  if (!isTaskKey(taskKey)) return { ok: false, error: "Unknown AI task." };

  const item = getItem(itemId);
  if (!item) return { ok: false, error: "Unknown item." };

  const task = TASKS[taskKey];
  let imageBase64: string | undefined;
  const imageRefs: string[] = [];

  if (task.needsPhoto) {
    const photos = listPhotos(itemId);
    const photo = photoId ? photos.find((p) => p.id === photoId) : photos[0];
    if (!photo) return { ok: false, error: "Add a photo to this item first." };
    const encoded = await imageToBase64Jpeg(photo.pathWeb);
    if (!encoded) return { ok: false, error: "Could not read the photo." };
    imageBase64 = encoded.base64;
    imageRefs.push(photo.pathWeb);
  }

  const result = await runTask(taskKey, { imageBase64Jpeg: imageBase64 });

  const interactionId = logInteraction({
    itemId,
    action: taskKey,
    model: config.ai.model,
    promptText: task.prompt,
    imageRefs,
    response: result.ok ? result.data : { error: result.error },
  });

  if (!result.ok) return { ok: false, error: result.error, interactionId };
  return {
    ok: true,
    interactionId,
    suggestion: result.data as Record<string, unknown>,
  };
}

const DECPAGE_IMAGE = /^image\/(jpe?g|png|webp|heic|heif)$/i;

/**
 * Parse an uploaded declarations-page image to pre-fill the Coverage B policy
 * form. Returns a suggestion the user reviews/confirms before saving. Logs the
 * call; never writes the policy itself.
 */
export async function aiParseDecPageAction(
  formData: FormData,
): Promise<AiSuggestResult> {
  if (!config.ai.enabled) return { ok: false, error: "AI is not configured." };

  const file = formData.get("decpage");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a declarations-page image." };
  }
  if (!DECPAGE_IMAGE.test(file.type)) {
    return { ok: false, error: "Upload an image of the declarations page." };
  }

  const encoded = await bufferToBase64Jpeg(
    Buffer.from(await file.arrayBuffer()),
  );
  if (!encoded) return { ok: false, error: "Could not read the image." };

  const result = await runTask("parse_decpage", {
    imageBase64Jpeg: encoded.base64,
  });

  const interactionId = logInteraction({
    itemId: null,
    action: "parse_decpage",
    model: config.ai.model,
    promptText: TASKS.parse_decpage.prompt,
    imageRefs: [],
    response: result.ok ? result.data : { error: result.error },
  });

  if (!result.ok) return { ok: false, error: result.error, interactionId };
  return {
    ok: true,
    interactionId,
    suggestion: result.data as Record<string, unknown>,
  };
}

export interface ItemSuggestionFields {
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  description?: string;
  categoryName?: string;
  replacementCost?: string;
}

/**
 * APPLY step: write the user-reviewed (possibly edited) suggestion to the item.
 * Only non-empty fields are written. Records the audit outcome. Returns to the
 * client (which refreshes) rather than redirecting, so the panel can reset.
 */
export async function applyItemSuggestion(
  itemId: number,
  interactionId: number | null,
  fields: ItemSuggestionFields,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(itemId)) return { ok: false, error: "Unknown item." };
  const item = getItem(itemId);
  if (!item) return { ok: false, error: "Unknown item." };

  const clean = (v?: string) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  };

  const patch: ItemPatch = {};
  const manufacturer = clean(fields.manufacturer);
  const modelNumber = clean(fields.modelNumber);
  const serialNumber = clean(fields.serialNumber);
  const description = clean(fields.description);
  const categoryName = clean(fields.categoryName);
  if (manufacturer) patch.manufacturer = manufacturer;
  if (modelNumber) patch.modelNumber = modelNumber;
  if (serialNumber) patch.serialNumber = serialNumber;
  if (description) patch.description = description;
  if (categoryName) patch.categoryId = findOrCreateCategory(categoryName);

  if (Object.keys(patch).length > 0) updateItem(itemId, patch);

  const replacementCostCents = parseDollarsToCents(
    fields.replacementCost ?? "",
  );
  if (replacementCostCents !== null) {
    recordValuations(itemId, { replacementCostCents });
  }

  if (interactionId !== null && Number.isInteger(interactionId)) {
    setOutcome(interactionId, "accepted");
  }

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/");
  return { ok: true };
}
