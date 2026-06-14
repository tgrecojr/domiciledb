import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { document, DOCUMENT_KINDS } from "@/db/schema";
import type { StoredDocument } from "@/lib/documents-store";

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export function addDocument(
  itemId: number,
  stored: StoredDocument,
  kind: DocumentKind,
  warrantyExpiresAt: string | null,
) {
  const rows = db
    .insert(document)
    .values({
      itemId,
      kind,
      path: stored.path,
      contentHash: stored.contentHash,
      filename: stored.filename,
      warrantyExpiresAt,
    })
    .returning()
    .all();
  return rows[0]!;
}

export function listDocuments(itemId: number) {
  return db
    .select()
    .from(document)
    .where(eq(document.itemId, itemId))
    .orderBy(asc(document.id))
    .all();
}

export function getDocument(id: number) {
  return db.select().from(document).where(eq(document.id, id)).get() ?? null;
}

export function deleteDocument(id: number) {
  db.delete(document).where(eq(document.id, id)).run();
}
