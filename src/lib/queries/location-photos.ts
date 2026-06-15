import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { locationPhoto } from "@/db/schema";
import type { StoredImage } from "@/lib/media";

export function addLocationPhoto(locationId: number, stored: StoredImage) {
  const rows = db
    .insert(locationPhoto)
    .values({
      locationId,
      pathOriginal: stored.pathOriginal,
      pathWeb: stored.pathWeb,
      pathThumb: stored.pathThumb,
      contentHash: stored.contentHash,
      width: stored.width,
      height: stored.height,
    })
    .returning()
    .all();
  return rows[0]!;
}

export function listLocationPhotos(locationId: number) {
  return db
    .select()
    .from(locationPhoto)
    .where(eq(locationPhoto.locationId, locationId))
    .orderBy(asc(locationPhoto.sortOrder), asc(locationPhoto.id))
    .all();
}

export function getLocationPhoto(id: number) {
  return (
    db.select().from(locationPhoto).where(eq(locationPhoto.id, id)).get() ?? null
  );
}

export function deleteLocationPhoto(id: number) {
  db.delete(locationPhoto).where(eq(locationPhoto.id, id)).run();
}

/** Count of photos per location, for the locations overview. Keyed by id. */
export function locationPhotoCounts(locationIds: number[]) {
  const counts = new Map<number, number>();
  if (locationIds.length === 0) return counts;
  const rows = db
    .select({ locationId: locationPhoto.locationId, id: locationPhoto.id })
    .from(locationPhoto)
    .where(inArray(locationPhoto.locationId, locationIds))
    .all();
  for (const r of rows) {
    counts.set(r.locationId, (counts.get(r.locationId) ?? 0) + 1);
  }
  return counts;
}

/** Photos grouped by locationId, for the proof packet. */
export function locationPhotosByLocation(locationIds: number[]) {
  const map = new Map<
    number,
    { pathOriginal: string; pathWeb: string }[]
  >();
  if (locationIds.length === 0) return map;
  const rows = db
    .select({
      locationId: locationPhoto.locationId,
      pathOriginal: locationPhoto.pathOriginal,
      pathWeb: locationPhoto.pathWeb,
    })
    .from(locationPhoto)
    .where(inArray(locationPhoto.locationId, locationIds))
    .orderBy(asc(locationPhoto.sortOrder), asc(locationPhoto.id))
    .all();
  for (const r of rows) {
    const list = map.get(r.locationId);
    const photo = { pathOriginal: r.pathOriginal, pathWeb: r.pathWeb };
    if (list) list.push(photo);
    else map.set(r.locationId, [photo]);
  }
  return map;
}
