import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { config } from "@/lib/config";

// Keep sharp's footprint small on a self-hosted box: no operation cache and a
// single libvips thread per op. Full-size phone photos (up to ~48 MP) can
// otherwise spike native memory enough to OOM-kill the process.
sharp.cache(false);
sharp.concurrency(1);

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

/**
 * Resolve a (possibly user-supplied) path to an absolute one INSIDE the media
 * root, or null if it would escape. `path.resolve` normalizes `.`/`..`, so this
 * defeats `../` traversal and absolute-path injection; the trailing separator on
 * the prefix check defeats the sibling-prefix bypass (e.g. `media-evil`). This
 * guard is LEXICAL — the route adds a realpath re-check for symlinks.
 */
export function resolveMediaPath(relativeUnderMedia: string): string | null {
  if (typeof relativeUnderMedia !== "string") return null;
  // Reject NUL bytes outright (would otherwise truncate the path at the C layer).
  if (relativeUnderMedia.includes("\0")) return null;

  const root = path.resolve(config.paths.mediaDir);
  const abs = path.resolve(root, relativeUnderMedia);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/** Whether an absolute path is the media root or strictly inside it. */
export function isInsideMediaRoot(abs: string): boolean {
  const root = path.resolve(config.paths.mediaDir);
  return abs === root || abs.startsWith(root + path.sep);
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

  const meta = await sharp(buffer, { failOn: "none" }).metadata();

  // Store the untouched original (cheap — no decode), then derive the two
  // variants with FRESH pipelines, SEQUENTIALLY. Fresh pipelines let libvips
  // shrink-on-load for JPEGs, and one-at-a-time keeps only a single decode in
  // flight — far lower peak memory than cloning a fully-decoded, rotated base
  // and resizing twice in parallel (which OOM'd on large photos).
  await fs.writeFile(path.join(absDir, originalName), buffer);

  await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(WEB_MAX, WEB_MAX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(absDir, webName));

  await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(THUMB_MAX, THUMB_MAX, { fit: "cover" })
    .webp({ quality: 70 })
    .toFile(path.join(absDir, thumbName));

  return {
    pathOriginal: path.join(relDir, originalName),
    pathWeb: path.join(relDir, webName),
    pathThumb: path.join(relDir, thumbName),
    contentHash,
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}
