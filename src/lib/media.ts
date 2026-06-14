import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { config } from "@/lib/config";

/**
 * Image processing + storage. Every uploaded photo is stored three ways under
 * DATA_DIR/media/items/<itemId>/:
 *   - original (untouched bytes, our proof of the raw capture)
 *   - web   (<= 1024px long edge, webp) for in-app display
 *   - thumb (<= 320px square cover, webp) for lists/galleries
 *
 * DB stores paths RELATIVE to DATA_DIR (e.g. "media/items/1/<hash>-web.webp")
 * so restore is mount-independent and the S3 backup key == the relative path.
 */

const WEB_MAX = 1024;
const THUMB_MAX = 320;

export interface StoredImage {
  pathOriginal: string;
  pathWeb: string;
  pathThumb: string;
  contentHash: string;
  width: number | null;
  height: number | null;
}

/** Public URL for a stored (DATA_DIR-relative) media path. */
export function mediaUrl(relativePath: string): string {
  return `/api/${relativePath}`;
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}

/** Resolve a DATA_DIR-relative path to an absolute one, refusing traversal. */
export function resolveMediaPath(relativeUnderMedia: string): string | null {
  const abs = path.resolve(config.paths.mediaDir, relativeUnderMedia);
  const root = path.resolve(config.paths.mediaDir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

export async function processAndStoreImage(
  itemId: number,
  buffer: Buffer,
  mimeType: string,
): Promise<StoredImage> {
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const shortHash = contentHash.slice(0, 16);

  const relDir = path.join("media", "items", String(itemId));
  const absDir = path.join(config.paths.dataDir, relDir);
  await fs.mkdir(absDir, { recursive: true });

  const ext = extFromMime(mimeType);
  const originalName = `${shortHash}-original.${ext}`;
  const webName = `${shortHash}-web.webp`;
  const thumbName = `${shortHash}-thumb.webp`;

  // Auto-rotate via EXIF before reading dimensions / resizing.
  const base = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await base.metadata();

  await Promise.all([
    fs.writeFile(path.join(absDir, originalName), buffer),
    base
      .clone()
      .resize(WEB_MAX, WEB_MAX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(absDir, webName)),
    base
      .clone()
      .resize(THUMB_MAX, THUMB_MAX, { fit: "cover" })
      .webp({ quality: 70 })
      .toFile(path.join(absDir, thumbName)),
  ]);

  return {
    pathOriginal: path.join(relDir, originalName),
    pathWeb: path.join(relDir, webName),
    pathThumb: path.join(relDir, thumbName),
    contentHash,
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}
