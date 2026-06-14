import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { photo, PHOTO_KINDS } from "@/db/schema";
import type { StoredImage } from "@/lib/media";

export type PhotoKind = (typeof PHOTO_KINDS)[number];

export function addPhoto(itemId: number, stored: StoredImage, kind: PhotoKind) {
  const rows = db
    .insert(photo)
    .values({
      itemId,
      kind,
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

export function listPhotos(itemId: number) {
  return db
    .select()
    .from(photo)
    .where(eq(photo.itemId, itemId))
    .orderBy(asc(photo.sortOrder), asc(photo.id))
    .all();
}

/** First photo (thumb) per item, for list views. Keyed by itemId. */
export function firstThumbByItem(itemIds: number[]) {
  if (itemIds.length === 0) return new Map<number, string>();
  const rows = db
    .select({
      itemId: photo.itemId,
      pathThumb: photo.pathThumb,
      id: photo.id,
    })
    .from(photo)
    .where(inArray(photo.itemId, itemIds))
    .orderBy(asc(photo.itemId), asc(photo.sortOrder), asc(photo.id))
    .all();
  const map = new Map<number, string>();
  for (const r of rows) {
    if (!map.has(r.itemId)) map.set(r.itemId, r.pathThumb);
  }
  return map;
}
