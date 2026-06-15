import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";

import type { ReportPacket } from "@/lib/queries/report";
import { loadPdfImage, type PdfImage } from "./images";
import { ProofPacketDocument } from "./proof-packet";

const MAX_PHOTOS_PER_ITEM = 4;
const MAX_PHOTOS_PER_ROOM = 4;

/** Pre-resize photos (memory control), then render the packet to a PDF buffer. */
export async function renderProofPacket(packet: ReportPacket): Promise<Buffer> {
  const imagesByItem = new Map<number, PdfImage[]>();
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
      const loaded: PdfImage[] = [];
      for (const p of item.photos.slice(0, MAX_PHOTOS_PER_ITEM)) {
        const img = await loadPdfImage(p.pathOriginal);
        if (img) loaded.push(img);
      }
      imagesByItem.set(item.id, loaded);
    }
  }

  return renderToBuffer(
    <ProofPacketDocument
      packet={packet}
      imagesByItem={imagesByItem}
      imagesByRoom={imagesByRoom}
    />,
  );
}
