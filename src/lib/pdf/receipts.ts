/**
 * Picks which attached receipts the proof packet can embed. Pure (no I/O) so
 * the selection rule is unit-testable; render.tsx does the actual loading.
 *
 * Only image receipts qualify: the distroless runtime has no PDF rasterizer or
 * headless browser, so a PDF receipt is listed by filename, not rendered.
 */

import type { ReportDocument } from "@/lib/report";

export const MAX_RECEIPTS_PER_ITEM = 2;

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic"];

function isImageFilename(filename: string): boolean {
	const lower = filename.toLowerCase();
	return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** The first `max` receipt-kind documents with an image filename, in input order. */
// @spec PACKET-PDF-011
export function receiptCandidates(
	documents: ReportDocument[],
	max = MAX_RECEIPTS_PER_ITEM,
): ReportDocument[] {
	return documents
		.filter((d) => d.kind === "receipt" && isImageFilename(d.filename))
		.slice(0, max);
}
