"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseId } from "@/lib/parse-id";
import { getHouseholdId } from "@/lib/queries/household";
import { createDraftItem } from "@/lib/queries/items";
import { getLocation } from "@/lib/queries/locations";
import { storeItemPhotos } from "./store-photos";

/**
 * A capture may name a location; it is honoured only when it is a real,
 * positive-integer id of a location in this household. Anything else (empty,
 * junk, another household's id) saves the draft unassigned — a bad picker
 * value must never block a capture.
 */
function householdLocationId(
	householdId: number,
	raw: FormDataEntryValue | null,
): number | null {
	const id = parseId(raw);
	if (id === null) return null;
	const location = getLocation(id);
	return location && location.householdId === householdId ? id : null;
}

/** Quick capture: photos (+ optional title/location) -> a new draft item. */
// @spec CAPTURE-FLOW-001, CAPTURE-FLOW-002, CAPTURE-FLOW-003, CAPTURE-FLOW-004, CAPTURE-FLOW-005, CAPTURE-FLOW-006, CAPTURE-FLOW-007, CAPTURE-FLOW-008, CAPTURE-FLOW-009, CAPTURE-FLOW-010, CAPTURE-FLOW-011, CAPTURE-FLOW-012
export async function captureItemAction(formData: FormData) {
	const householdId = await getHouseholdId();
	if (householdId === null) redirect("/");

	const files = formData
		.getAll("photos")
		.filter((f): f is File => f instanceof File && f.size > 0);
	const title = String(formData.get("title") ?? "").trim();

	if (files.length === 0 && title.length === 0) {
		redirect("/capture?error=empty");
	}

	const created = createDraftItem({
		householdId,
		title: title || "Untitled item",
		locationId: householdLocationId(householdId, formData.get("locationId")),
	});
	const stored = await storeItemPhotos(created.id, files);
	const dropped = files.length - stored;

	revalidatePath("/worklist");
	revalidatePath("/items");

	// Tell the owner how many photos were not saved while the item is still in
	// hand to re-shoot; the reason (size, type, quota) is in the server log.
	const droppedParam = dropped > 0 ? `dropped=${dropped}` : "";
	if (String(formData.get("intent")) === "details") {
		redirect(`/items/${created.id}${droppedParam ? `?${droppedParam}` : ""}`);
	}
	redirect(`/capture?saved=1${droppedParam ? `&${droppedParam}` : ""}`);
}
