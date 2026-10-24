"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LIFECYCLE_STATUSES } from "@/db/schema";
import { crossedThreshold } from "@/lib/coverage";
import { deleteItemMedia } from "@/lib/media";
import { parseDollarsToCents } from "@/lib/money";
import {
	type CoverageSummary,
	getCoverageSummary,
} from "@/lib/queries/coverage";
import {
	deleteItem,
	type ItemPatch,
	setItemStatus,
	updateItem,
} from "@/lib/queries/items";
import { recordValuations } from "@/lib/queries/valuations";
import { ownedItemFromForm } from "./owned-item";
import { storeItemPhotos } from "./store-photos";

/** Add more photos to an existing item (from the detail page). */
// @spec ENRICH-PHOTO-002, ENRICH-ITEM-018
export async function addPhotosAction(formData: FormData) {
	const item = await ownedItemFromForm(formData.get("itemId"));
	if (!item) redirect("/items");
	const files = formData
		.getAll("photos")
		.filter((f): f is File => f instanceof File && f.size > 0);
	await storeItemPhotos(item.id, files);
	revalidatePath(`/items/${item.id}`);
	redirect(`/items/${item.id}`);
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
	// @spec HOUSEHOLD-LOC-009
	locationId: optionalId,
	manufacturer: z.string().trim().optional(),
	modelNumber: z.string().trim().optional(),
	serialNumber: z.string().trim().optional(),
	// Bounded positive integer: an unbounded quantity flows into the coverage
	// spine (replacementCostCents * qty) and overflows the safe-integer range.
	// One million of any single line item is far beyond any real home inventory.
	quantity: z.coerce.number().int().positive().max(1_000_000).default(1),
	condition: z.string().trim().optional(),
	ageEstimate: z.string().trim().optional(),
	lifecycleStatus: z.enum(LIFECYCLE_STATUSES).default("active"),
	lifecycleDate: z.string().trim().optional(),
	replacementCost: z.string().optional(),
	pricePaid: z.string().optional(),
	purchaseDate: z.string().trim().optional(),
});

type ParsedPatch = z.infer<typeof patchSchema>;

function emptyToNull(v: string | undefined): string | null {
	return v && v.length > 0 ? v : null;
}

function toPatch(d: ParsedPatch): ItemPatch {
	return {
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
		// @spec CURRENT-LIFE-002, CURRENT-LIFE-004
		lifecycleDate:
			d.lifecycleStatus === "active" ? null : emptyToNull(d.lifecycleDate),
	};
}

/**
 * A blank money field means "no value"; anything else must parse as a
 * non-negative dollar amount, or the save is refused with this message.
 */
// @spec ENRICH-ITEM-012
function moneyError(raw: string | undefined, label: string): string | null {
	if (!raw || raw.trim().length === 0) return null;
	return parseDollarsToCents(raw) === null
		? `Enter ${label} as a dollar amount`
		: null;
}

export interface CoverageAlert {
	level: "approaching" | "over";
	pctUsed: number;
	totalCents: number;
	limitCents: number;
}

/** A contextual nudge when a save escalated the household's coverage risk. */
// @spec ENRICH-ITEM-014, COVERAGE-CALC-009, COVERAGE-UI-006
function alertIfCrossed(
	before: CoverageSummary,
	after: CoverageSummary,
): CoverageAlert | undefined {
	const crossed = crossedThreshold(before.status, after.status);
	return crossed && after.limitCents !== null && after.pctUsed !== null
		? {
				level: crossed,
				pctUsed: after.pctUsed,
				totalCents: after.totalCents,
				limitCents: after.limitCents,
			}
		: undefined;
}

export type ItemFormState = {
	error?: string;
	saved?: boolean;
	coverageAlert?: CoverageAlert;
} | null;

// @spec ENRICH-ITEM-009, ENRICH-ITEM-010, ENRICH-ITEM-011, ENRICH-ITEM-012, ENRICH-ITEM-013, ENRICH-ITEM-018
export async function updateItemAction(
	_prev: ItemFormState,
	formData: FormData,
): Promise<ItemFormState> {
	const existing = await ownedItemFromForm(formData.get("itemId"));
	if (!existing) return { error: "Unknown item" };

	const parsed = patchSchema.safeParse(Object.fromEntries(formData));
	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}
	const d = parsed.data;

	// Refuse the whole save rather than silently drop a value the user typed.
	const moneyProblem =
		moneyError(d.replacementCost, "replacement cost") ??
		moneyError(d.pricePaid, "price paid");
	if (moneyProblem) return { error: moneyProblem };

	const itemId = existing.id;
	// Coverage status BEFORE this save, to detect a threshold crossing.
	const before = getCoverageSummary(existing.householdId);

	updateItem(itemId, toPatch(d));
	recordValuations(itemId, {
		replacementCostCents: parseDollarsToCents(d.replacementCost ?? ""),
		pricePaidCents: parseDollarsToCents(d.pricePaid ?? ""),
		purchaseDate: emptyToNull(d.purchaseDate),
	});

	const coverageAlert = alertIfCrossed(
		before,
		getCoverageSummary(existing.householdId),
	);

	revalidatePath(`/items/${itemId}`);
	revalidatePath("/worklist");
	revalidatePath("/");
	return { saved: true, coverageAlert };
}

/** Permanently delete an item (e.g. created by accident) and its media. */
// @spec ENRICH-ITEM-017, PLATFORM-DATA-007
export async function deleteItemAction(formData: FormData) {
	const existing = await ownedItemFromForm(formData.get("itemId"));
	if (!existing) redirect("/items");

	deleteItem(existing.id);
	await deleteItemMedia(existing.id);

	revalidatePath("/items");
	revalidatePath("/worklist");
	revalidatePath("/");
	redirect("/items");
}

/** Toggle completeness: marking complete clears it from the worklist. */
// @spec ENRICH-ITEM-015, ENRICH-ITEM-018
export async function setItemStatusAction(formData: FormData) {
	const item = await ownedItemFromForm(formData.get("itemId"));
	if (!item) redirect("/items");
	const status = String(formData.get("status"));
	if (status === "complete" || status === "draft") {
		setItemStatus(item.id, status);
	}
	revalidatePath(`/items/${item.id}`);
	revalidatePath("/worklist");
	redirect(`/items/${item.id}`);
}
