"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { config } from "@/lib/config";
import { DOCUMENT_KINDS } from "@/lib/document-kinds";
import { storeDocument } from "@/lib/documents-store";
import { sniffDocumentMime } from "@/lib/image-format";
import { deleteStoredFile, remainingMediaQuotaBytes } from "@/lib/media";
import { parseId } from "@/lib/parse-id";
import {
	addDocument,
	deleteDocument,
	getDocument,
} from "@/lib/queries/documents";
import { ownedItemById, ownedItemFromForm } from "./owned-item";

function isDocKind(v: string): v is (typeof DOCUMENT_KINDS)[number] {
	return (DOCUMENT_KINDS as readonly string[]).includes(v);
}

/** Why an upload was refused; carried to the item page as `?docError=`. */
type DocumentRejection = "missing" | "type" | "size" | "quota";

interface AdmittedDocument {
	buffer: Buffer;
	filename: string;
}

/**
 * Admit an uploaded document under the same caps as photos. The declared size
 * is checked against the per-file cap and the media quota BEFORE the bytes
 * are read, so an oversize upload is never buffered; the bytes are then
 * admitted on their SNIFFED type (allowed image or PDF), never `File.type`.
 */
// @spec ENRICH-DOC-002, ENRICH-DOC-004, ENRICH-DOC-007
async function admitDocument(
	file: FormDataEntryValue | null,
): Promise<AdmittedDocument | DocumentRejection> {
	if (!(file instanceof File) || file.size === 0) return "missing";
	if (file.size > config.uploads.maxFileBytes) return "size";
	if (file.size > (await remainingMediaQuotaBytes())) return "quota";
	const buffer = Buffer.from(await file.arrayBuffer());
	if (!sniffDocumentMime(buffer)) return "type";
	return { buffer, filename: file.name };
}

// @spec ENRICH-DOC-002, ENRICH-DOC-003, ENRICH-DOC-004, ENRICH-DOC-007, ENRICH-ITEM-018
export async function addDocumentAction(formData: FormData) {
	const item = await ownedItemFromForm(formData.get("itemId"));
	if (!item) redirect("/items");
	const itemId = item.id;

	const admitted = await admitDocument(formData.get("document"));
	if (typeof admitted === "string") {
		redirect(`/items/${itemId}?docError=${admitted}`);
	}

	const kindRaw = String(formData.get("kind") ?? "receipt");
	const kind = isDocKind(kindRaw) ? kindRaw : "receipt";
	const warrantyRaw = String(formData.get("warrantyExpiresAt") ?? "").trim();
	const warrantyExpiresAt =
		kind === "warranty" && warrantyRaw.length > 0 ? warrantyRaw : null;

	const stored = await storeDocument(
		itemId,
		admitted.buffer,
		admitted.filename,
	);
	addDocument(itemId, stored, kind, warrantyExpiresAt);

	revalidatePath(`/items/${itemId}`);
	redirect(`/items/${itemId}`);
}

// @spec ENRICH-DOC-006, ENRICH-ITEM-018, PLATFORM-DATA-007
export async function deleteDocumentAction(formData: FormData) {
	const docId = parseId(formData.get("docId"));
	const doc = docId === null ? null : getDocument(docId);
	// The document's own item decides ownership, not the itemId the form claims.
	const item = doc ? await ownedItemById(doc.itemId) : null;
	if (!doc || !item) redirect("/items");

	// Drop the row AND its bytes: the DB delete does not touch the filesystem,
	// so upload+delete cycles would otherwise grow DATA_DIR without bound.
	deleteDocument(doc.id);
	await deleteStoredFile(doc.path);

	revalidatePath(`/items/${item.id}`);
	redirect(`/items/${item.id}`);
}
