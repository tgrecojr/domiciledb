import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { item, location } from "@/db/schema";
import type { LocationKind } from "@/lib/location-kinds";

export function listLocations(householdId: number) {
  return db
    .select()
    .from(location)
    .where(eq(location.householdId, householdId))
    .orderBy(asc(location.name))
    .all();
}

export function getLocation(id: number) {
  return db.select().from(location).where(eq(location.id, id)).get() ?? null;
}

export function createLocation(
  householdId: number,
  name: string,
  kind: LocationKind,
) {
  const rows = db
    .insert(location)
    .values({ householdId, name, kind })
    .returning()
    .all();
  return rows[0]!;
}

export function updateLocation(
  id: number,
  fields: { name: string; kind: LocationKind; description: string | null },
) {
  db.update(location).set(fields).where(eq(location.id, id)).run();
}

/** Items reference location with onDelete:set null, so deletion is safe. */
export function deleteLocation(id: number) {
  db.delete(location).where(eq(location.id, id)).run();
}

/** Count of active items per location, for the locations overview. */
export function locationItemCounts(householdId: number) {
  const rows = db
    .select({ locationId: item.locationId, id: item.id })
    .from(item)
    .where(eq(item.householdId, householdId))
    .all();
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.locationId === null) continue;
    counts.set(r.locationId, (counts.get(r.locationId) ?? 0) + 1);
  }
  return counts;
}
