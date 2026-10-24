import "server-only";

import { parseId } from "@/lib/parse-id";
import { getHouseholdId } from "@/lib/queries/household";
import { getItem } from "@/lib/queries/items";

export type OwnedItem = NonNullable<ReturnType<typeof getItem>>;

/**
 * Resolve an item the current household may write to, or null. Every item
 * write action resolves its target here so none can act on another
 * household's row.
 */
// @spec ENRICH-ITEM-018
export async function ownedItemById(id: number): Promise<OwnedItem | null> {
	const item = getItem(id);
	if (!item) return null;
	return item.householdId === (await getHouseholdId()) ? item : null;
}

/**
 * The same, from a raw form or query value. The id is parsed fail-closed:
 * an absent, blank, zero, negative, or non-integer value never reaches the
 * database as item 0 (what `Number()` would make of it).
 */
// @spec ENRICH-ITEM-018, PLATFORM-DATA-007
export async function ownedItemFromForm(
	raw: unknown,
): Promise<OwnedItem | null> {
	const id = parseId(raw);
	return id === null ? null : ownedItemById(id);
}
