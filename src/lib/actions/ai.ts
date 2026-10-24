"use server";

import { revalidatePath } from "next/cache";

import { bufferToBase64Jpeg, imageToBase64Jpeg } from "@/lib/ai/image";
import { AI_MAX_PHOTOS } from "@/lib/ai/manifest";
import { runTask } from "@/lib/ai/openrouter";
import { isTaskKey, TASKS } from "@/lib/ai/tasks";
import { config } from "@/lib/config";
import { sniffImageMime } from "@/lib/image-format";
import { parseDollarsToCents } from "@/lib/money";
import { parseId } from "@/lib/parse-id";
import { getInteraction, logInteraction, setOutcome } from "@/lib/queries/ai";
import { findOrCreateCategory } from "@/lib/queries/categories";
import { getHouseholdId } from "@/lib/queries/household";
import { getItem, type ItemPatch, updateItem } from "@/lib/queries/items";
import { listPhotos } from "@/lib/queries/photos";
import { recordValuations } from "@/lib/queries/valuations";

export interface AiSuggestResult {
	ok: boolean;
	error?: string;
	interactionId?: number;
	suggestion?: Record<string, unknown>;
}

/**
 * The item named by a client-supplied id, only when the id is well-formed and
 * the item belongs to the household; null otherwise. Server-action arguments
 * are untrusted, so this is the gate every item write passes through.
 */
// @spec ENRICH-ITEM-018
async function ownedItem(itemId: unknown) {
	const id = parseId(String(itemId));
	if (id === null) return null;
	const item = getItem(id);
	if (!item || item.householdId !== (await getHouseholdId())) return null;
	return item;
}

/**
 * The interaction id the panel sent, only when it was logged for this item;
 * null when it is malformed, missing, or belongs to another item, so an
 * outcome can never be recorded against the wrong row.
 */
// @spec ENRICH-AI-018
function itemInteraction(interactionId: unknown, itemId: number) {
	const id = parseId(String(interactionId));
	if (id === null) return null;
	return getInteraction(id)?.itemId === itemId ? id : null;
}

/**
 * EXECUTE step: only runs after the user has seen the manifest and confirmed.
 * Calls the AI, logs the interaction for the audit trail, and returns the
 * suggestion. Never writes the suggestion to the item — that's a separate,
 * explicit apply step.
 */
// @spec ENRICH-AI-001, ENRICH-AI-005, ENRICH-AI-009, ENRICH-ITEM-018
export async function aiSuggestForItem(
	itemId: number,
	taskKey: string,
	photoId: number | null,
): Promise<AiSuggestResult> {
	if (!config.ai.enabled) return { ok: false, error: "AI is not configured." };
	if (!isTaskKey(taskKey)) return { ok: false, error: "Unknown AI task." };

	const item = await ownedItem(itemId);
	if (!item) return { ok: false, error: "Unknown item." };

	const task = TASKS[taskKey];
	const imagesBase64: string[] = [];
	const imageRefs: string[] = [];

	if (task.needsPhoto) {
		const photos = listPhotos(item.id);
		const selected = photoId
			? photos.filter((p) => p.id === photoId)
			: photos.slice(0, AI_MAX_PHOTOS);
		if (selected.length === 0) {
			return { ok: false, error: "Add a photo to this item first." };
		}
		for (const photo of selected) {
			const encoded = await imageToBase64Jpeg(photo.pathWeb);
			if (!encoded) continue;
			imagesBase64.push(encoded.base64);
			imageRefs.push(photo.pathWeb);
		}
		if (imagesBase64.length === 0) {
			return { ok: false, error: "Could not read the photo." };
		}
	}

	const result = await runTask(taskKey, { imagesBase64Jpeg: imagesBase64 });

	const interactionId = logInteraction({
		itemId: item.id,
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

// @spec COVERAGE-DECPAGE-003, COVERAGE-DECPAGE-004
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

	// Admit on the SNIFFED content, not the forgeable File.type (VULN-012).
	const buffer = Buffer.from(await file.arrayBuffer());
	if (!sniffImageMime(buffer)) {
		return { ok: false, error: "Upload an image of the declarations page." };
	}

	const encoded = await bufferToBase64Jpeg(buffer);
	if (!encoded) return { ok: false, error: "Could not read the image." };

	const result = await runTask("parse_decpage", {
		imagesBase64Jpeg: [encoded.base64],
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

function clean(v?: string) {
	const t = (v ?? "").trim();
	return t.length > 0 ? t : null;
}

/** Only non-empty fields become part of the patch; nothing is ever cleared. */
// @spec ENRICH-AI-011
function suggestionPatch(fields: ItemSuggestionFields): ItemPatch {
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
	if (categoryName) {
		// null when the category ceiling is reached; leave the item's category as is.
		const categoryId = findOrCreateCategory(categoryName);
		if (categoryId !== null) patch.categoryId = categoryId;
	}
	return patch;
}

/**
 * APPLY step: write the user-reviewed (possibly edited) suggestion to the item.
 * Only non-empty fields are written. `edited` is the panel's report of whether
 * any review field differs from what the model returned; it decides the audit
 * outcome. Returns to the client (which refreshes) rather than redirecting, so
 * the panel can reset.
 */
// @spec ENRICH-AI-011, ENRICH-AI-012, ENRICH-AI-013, ENRICH-AI-014, ENRICH-AI-018, ENRICH-ITEM-018
export async function applyItemSuggestion(
	itemId: number,
	interactionId: number | null,
	fields: ItemSuggestionFields,
	edited: boolean,
): Promise<{ ok: boolean; error?: string }> {
	const item = await ownedItem(itemId);
	if (!item) return { ok: false, error: "Unknown item." };
	const outcomeId =
		interactionId === null ? null : itemInteraction(interactionId, item.id);
	if (interactionId !== null && outcomeId === null) {
		return { ok: false, error: "Unknown suggestion." };
	}

	const patch = suggestionPatch(fields);
	if (Object.keys(patch).length > 0) updateItem(item.id, patch);

	const replacementCostCents = parseDollarsToCents(
		fields.replacementCost ?? "",
	);
	if (replacementCostCents !== null) {
		recordValuations(item.id, { replacementCostCents }, "ai");
	}

	if (outcomeId !== null) setOutcome(outcomeId, edited ? "edited" : "accepted");

	revalidatePath(`/items/${item.id}`);
	revalidatePath("/");
	return { ok: true };
}

/** The user walked away from a suggestion without applying it. Audit only. */
// @spec ENRICH-AI-013, ENRICH-AI-018, ENRICH-ITEM-018
export async function discardSuggestion(
	itemId: number,
	interactionId: number,
): Promise<{ ok: boolean }> {
	const item = await ownedItem(itemId);
	if (!item) return { ok: false };
	const id = itemInteraction(interactionId, item.id);
	if (id === null) return { ok: false };
	setOutcome(id, "rejected");
	return { ok: true };
}
