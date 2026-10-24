import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";

import type { ReportPacket } from "@/lib/queries/report";
import { loadPdfImage, type PdfImage } from "./images";
import { ProofPacketDocument } from "./proof-packet";
import { receiptCandidates } from "./receipts";

const MAX_PHOTOS_PER_ITEM = 4;
const MAX_PHOTOS_PER_ROOM = 4;

/** Load each path in order, one at a time, skipping any that cannot be read. */
async function loadAll(relPaths: string[]): Promise<PdfImage[]> {
	const loaded: PdfImage[] = [];
	for (const relPath of relPaths) {
		const img = await loadPdfImage(relPath);
		if (img) loaded.push(img);
	}
	return loaded;
}

/** Pre-resize photos (memory control), then render the packet to a PDF buffer. */
// @spec PACKET-PDF-007, PACKET-PDF-011
export async function renderProofPacket(packet: ReportPacket): Promise<Buffer> {
	const imagesByItem = new Map<number, PdfImage[]>();
	// Receipt images (not PDFs) per item, downscaled like photos.
	const receiptsByItem = new Map<number, PdfImage[]>();
	// Room photos keyed by locationId; the unassigned room (null) has none.
	const imagesByRoom = new Map<number, PdfImage[]>();
	for (const room of packet.rooms) {
		if (room.locationId !== null && room.photos.length > 0) {
			const loaded: PdfImage[] = [];
			for (const p of room.photos.slice(0, MAX_PHOTOS_PER_ROOM)) {
				const img = await loadPdfImage(p.pathOriginal);
				if (img) loaded.push(img);
			}
			imagesByRoom.set(room.locationId, loaded);
		}
		for (const item of room.items) {
			imagesByItem.set(
				item.id,
				await loadAll(
					item.photos.slice(0, MAX_PHOTOS_PER_ITEM).map((p) => p.pathOriginal),
				),
			);
			receiptsByItem.set(
				item.id,
				await loadAll(receiptCandidates(item.documents).map((d) => d.path)),
			);
		}
	}

	return renderToBuffer(
		<ProofPacketDocument
			packet={packet}
			imagesByItem={imagesByItem}
			imagesByRoom={imagesByRoom}
			receiptsByItem={receiptsByItem}
		/>,
	);
}
