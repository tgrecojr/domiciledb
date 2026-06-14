"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DOCUMENT_KINDS } from "@/lib/document-kinds";
import { storeDocument } from "@/lib/documents-store";
import { addDocument, deleteDocument } from "@/lib/queries/documents";

const ACCEPTED = /^(application\/pdf|image\/(jpe?g|png|webp|heic|heif))$/i;

function isDocKind(v: string): v is (typeof DOCUMENT_KINDS)[number] {
  return (DOCUMENT_KINDS as readonly string[]).includes(v);
}

export async function addDocumentAction(formData: FormData) {
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(itemId)) redirect("/items");

  const kindRaw = String(formData.get("kind") ?? "receipt");
  const kind = isDocKind(kindRaw) ? kindRaw : "receipt";
  const warrantyRaw = String(formData.get("warrantyExpiresAt") ?? "").trim();
  const warrantyExpiresAt = warrantyRaw.length > 0 ? warrantyRaw : null;

  const file = formData.get("document");
  if (file instanceof File && file.size > 0 && ACCEPTED.test(file.type)) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeDocument(itemId, buffer, file.name);
    addDocument(
      itemId,
      stored,
      kind,
      kind === "warranty" ? warrantyExpiresAt : null,
    );
  }

  revalidatePath(`/items/${itemId}`);
  redirect(`/items/${itemId}`);
}

export async function deleteDocumentAction(formData: FormData) {
  const itemId = Number(formData.get("itemId"));
  const docId = Number(formData.get("docId"));
  if (Number.isInteger(docId)) deleteDocument(docId);
  if (Number.isInteger(itemId)) {
    revalidatePath(`/items/${itemId}`);
    redirect(`/items/${itemId}`);
  }
  redirect("/items");
}
