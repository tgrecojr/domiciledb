import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";

import type { ReportPacket } from "@/lib/queries/report";
import { loadPdfImage, type PdfImage } from "./images";
import { ProofPacketDocument } from "./proof-packet";

const MAX_PHOTOS_PER_ITEM = 4;

/** Pre-resize photos (memory control), then render the packet to a PDF buffer. */
export async function renderProofPacket(packet: ReportPacket): Promise<Buffer> {
  const imagesByItem = new Map<number, PdfImage[]>();
  for (const room of packet.rooms) {
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
    <ProofPacketDocument packet={packet} imagesByItem={imagesByItem} />,
  );
}
