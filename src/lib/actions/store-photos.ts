import "server-only";

import { config } from "@/lib/config";
import { sniffImageMime } from "@/lib/image-format";
import { remainingMediaQuotaBytes } from "@/lib/media";

/** MIME types we accept for photo capture/upload (UI hint only). */
export const ACCEPTED_IMAGE = /^image\/(jpe?g|png|webp|heic|heif)$/i;

/**
 * Make an attacker-controlled filename safe to interpolate into a log line:
 * drop CR/LF and control characters (which forge log entries — CWE-117) and
 * bound the length so an oversized name can't flood the log.
 */
export function sanitizeForLog(value: string, maxLen = 128): string {
  const stripped = value.replace(/[\u0000-\u001f\u007f]/g, "?");
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + "…" : stripped;
}

/**
 * Process + persist a batch of uploaded image files via the given `store`
 * callback. Skips empty/unsupported files, and logs-and-continues on a bad
 * photo so one failure never sinks the whole save. Returns how many stored.
 *
 * Admission is decided on the SNIFFED content type (the bytes sharp decodes),
 * never the client `File.type`, which is forgeable — otherwise svg/gif/tiff
 * bytes reach libvips behind an image-only allowlist. The sniffed MIME is what
 * we hand `store`, so the persisted extension matches the real content.
 *
 * The app has no auth in front of the capture forms, so the batch is bounded
 * three ways: a per-request file count, a per-file byte cap enforced from
 * `size` (before the file is ever buffered), and the DATA_DIR media quota.
 */
export async function storePhotoFiles(
  files: File[],
  context: string,
  store: (buffer: Buffer, mimeType: string) => Promise<void>,
): Promise<number> {
  const batch = files.slice(0, config.uploads.maxFilesPerRequest);
  if (batch.length < files.length) {
    console.warn(
      `[capture] ignored ${files.length - batch.length} extra photo(s) for ${context}: over the ${config.uploads.maxFilesPerRequest}-file per-request cap`,
    );
  }

  // Budget for this batch, charged from the originals; the derived web/thumb
  // variants are far smaller and are picked up by the next request's re-check.
  let budget = await remainingMediaQuotaBytes();

  let stored = 0;
  for (const file of batch) {
    if (file.size === 0) continue;
    if (file.size > config.uploads.maxFileBytes) {
      console.warn(
        `[capture] rejected photo "${sanitizeForLog(file.name)}" for ${context}: ${file.size} bytes is over the ${config.uploads.maxFileBytes}-byte cap`,
      );
      continue;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = sniffImageMime(buffer);
      if (!mimeType) continue;
      if (file.size > budget) {
        console.warn(
          `[capture] rejected photo "${sanitizeForLog(file.name)}" for ${context}: media storage quota exhausted`,
        );
        break;
      }
      await store(buffer, mimeType);
      budget -= file.size;
      stored += 1;
    } catch (err) {
      console.error(
        `[capture] could not process photo "${sanitizeForLog(file.name)}" ` +
          `(${sanitizeForLog(file.type, 64)}, ${file.size} bytes) for ${context}:`,
        err,
      );
    }
  }
  return stored;
}
