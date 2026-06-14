import "server-only";

import path from "node:path";
import sharp from "sharp";

import { config } from "@/lib/config";

/**
 * Encode a stored photo as a base64 JPEG for the AI request, downscaled to keep
 * the payload small. The user is told the resized size before sending.
 */
export interface EncodedImage {
  base64: string;
  bytes: number;
  maxPx: number;
}

function resolveUnderMedia(dataDirRelPath: string): string | null {
  const abs = path.resolve(config.paths.dataDir, dataDirRelPath);
  const root = path.resolve(config.paths.mediaDir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

async function encode(
  input: string | Buffer,
  maxPx: number,
): Promise<EncodedImage | null> {
  try {
    const buf = await sharp(input, { failOn: "none" })
      .rotate()
      .resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { base64: buf.toString("base64"), bytes: buf.length, maxPx };
  } catch {
    return null;
  }
}

export async function imageToBase64Jpeg(
  dataDirRelPath: string,
  maxPx = 1024,
): Promise<EncodedImage | null> {
  const abs = resolveUnderMedia(dataDirRelPath);
  if (!abs) return null;
  return encode(abs, maxPx);
}

/** Encode an uploaded image buffer (e.g. a photographed dec page) for the AI. */
export async function bufferToBase64Jpeg(
  buffer: Buffer,
  maxPx = 1280,
): Promise<EncodedImage | null> {
  return encode(buffer, maxPx);
}
