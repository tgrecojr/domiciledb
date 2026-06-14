import "server-only";

import path from "node:path";
import sharp from "sharp";

import { config } from "@/lib/config";

/**
 * react-pdf embeds JPEG/PNG, not our webp web-variants, and embedding full-res
 * originals would blow memory on large packets (feature-spec §8 / plan §B6). So
 * we re-encode each photo to a small JPEG just for the PDF.
 */

export interface PdfImage {
  data: Buffer;
  format: "jpg";
}

/** Resolve a DATA_DIR-relative media path to an absolute one, refusing escapes. */
function resolveUnderMedia(dataDirRelPath: string): string | null {
  const abs = path.resolve(config.paths.dataDir, dataDirRelPath);
  const root = path.resolve(config.paths.mediaDir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/** Load + downscale a stored photo to a small JPEG for embedding. */
export async function loadPdfImage(
  dataDirRelPath: string,
  maxPx = 600,
): Promise<PdfImage | null> {
  const abs = resolveUnderMedia(dataDirRelPath);
  if (!abs) return null;
  try {
    const data = await sharp(abs, { failOn: "none" })
      .rotate()
      .resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { data, format: "jpg" };
  } catch {
    // Missing/corrupt file — skip it rather than failing the whole packet.
    return null;
  }
}
