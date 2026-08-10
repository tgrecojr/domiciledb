import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { config } from "@/lib/config";

/**
 * Document attachments (receipts, warranties, manuals) are stored as-is — no
 * resizing — under DATA_DIR/media/documents/items/<itemId>/. DB stores the
 * DATA_DIR-relative path (served via /api/media). PDFs and images are accepted.
 */

export interface StoredDocument {
	path: string;
	contentHash: string;
	filename: string;
}

/** Strip directory components + unsafe chars from a user-supplied filename. */
export function sanitizeFilename(name: string): string {
	const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
	return base.length > 0 ? base.slice(0, 120) : "file";
}

export async function storeDocument(
	itemId: number,
	buffer: Buffer,
	filename: string,
): Promise<StoredDocument> {
	// Use the FULL sha256 digest as the content identity: a 64-bit prefix has a
	// feasible (2^32) collision bound, so two distinct files could share a name
	// and silently overwrite/dedup each other, corrupting the proof.
	const contentHash = createHash("sha256").update(buffer).digest("hex");
	const safe = sanitizeFilename(filename);

	const relDir = path.join("media", "documents", "items", String(itemId));
	const absDir = path.join(config.paths.dataDir, relDir);
	await fs.mkdir(absDir, { recursive: true });

	const storedName = `${contentHash}-${safe}`;
	await fs.writeFile(path.join(absDir, storedName), buffer);

	return {
		path: path.join(relDir, storedName),
		contentHash,
		filename: safe,
	};
}
