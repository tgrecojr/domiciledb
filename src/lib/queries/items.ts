import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { item, ITEM_STATUSES, LIFECYCLE_STATUSES } from "@/db/schema";
import { firstThumbByItem } from "./photos";

export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

/** Descriptive + lifecycle fields a user can edit (valuation is separate). */
export interface ItemPatch {
  title?: string;
  description?: string | null;
  categoryId?: number | null;
  locationId?: number | null;
  manufacturer?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  quantity?: number;
  condition?: string | null;
  ageEstimate?: string | null;
  lifecycleStatus?: LifecycleStatus;
  lifecycleDate?: string | null;
}

export function createDraftItem(input: {
  householdId: number;
  title: string;
  locationId?: number | null;
}) {
  const rows = db
    .insert(item)
    .values({
      householdId: input.householdId,
      title: input.title,
      locationId: input.locationId ?? null,
      status: "draft",
    })
    .returning()
    .all();
  return rows[0]!;
}

export function getItem(id: number) {
  return db.select().from(item).where(eq(item.id, id)).get() ?? null;
}

export function updateItem(id: number, patch: ItemPatch) {
  db.update(item)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(item.id, id))
    .run();
}

export function setItemStatus(id: number, status: ItemStatus) {
  db.update(item)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(item.id, id))
    .run();
}

/** Hard-delete an item. FKs cascade to photos/documents/valuations/tags. */
export function deleteItem(id: number) {
  db.delete(item).where(eq(item.id, id)).run();
}

export interface ItemListRow {
  id: number;
  title: string;
  status: ItemStatus;
  locationId: number | null;
  thumbPath: string | null;
}

/** Items for a list view, newest first, each with its first photo thumb. */
export function listItems(
  householdId: number,
  opts: { status?: ItemStatus } = {},
): ItemListRow[] {
  const where = opts.status
    ? and(eq(item.householdId, householdId), eq(item.status, opts.status))
    : eq(item.householdId, householdId);

  const rows = db
    .select({
      id: item.id,
      title: item.title,
      status: item.status,
      locationId: item.locationId,
    })
    .from(item)
    .where(where)
    .orderBy(desc(item.createdAt))
    .all();

  const thumbs = firstThumbByItem(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, thumbPath: thumbs.get(r.id) ?? null }));
}

export function countDraftItems(householdId: number): number {
  return db
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.householdId, householdId), eq(item.status, "draft")))
    .all().length;
}
